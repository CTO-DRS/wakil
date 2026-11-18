// Copyright (c) 2026 DRS AI. All rights reserved.
import { MemoryChatRepository } from '../src/db/repository';
import type { CompletionOptions, CompletionResult, EngineMessage, LlmEngine } from '../src/llm/engine';
import { setChatRepository, useChatStore } from '../src/store/chatStore';
import { setEngine } from '../src/store/llmStore';
import {
  chunkForSpeech,
  detectSpeechLanguage,
  pickVoice,
  stripMarkdownForSpeech,
  type SpeakOpts,
  type SpeechEngine,
  type SpeechVoiceInfo,
} from '../src/speech/tts';
import { DEFAULT_SETTINGS, useSettingsStore } from '../src/store/settingsStore';
import { setTtsEngine, useTtsStore } from '../src/store/ttsStore';

/** Drains pending microtasks so store callbacks (getVoices.then) have run. */
const tick = async () => {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
};

describe('stripMarkdownForSpeech', () => {
  it('drops fenced code blocks entirely', () => {
    expect(stripMarkdownForSpeech('قبل\n```py\nprint(1)\n```\nبعد')).toBe('قبل بعد');
  });

  it('unwraps inline code, bold, italic and strikethrough', () => {
    expect(stripMarkdownForSpeech('هذا `كود` و **عريض** و *مائل* و ~~محذوف~~')).toBe('هذا كود و عريض و مائل و محذوف');
  });

  it('keeps link text and drops images and bare URLs', () => {
    expect(stripMarkdownForSpeech('[موقعنا](https://example.com) و ![صورة](x.png) و https://raw.io')).toBe(
      'موقعنا و و',
    );
  });

  it('removes headings, bullets, quotes, rules and HTML tags', () => {
    const md = '## عنوان\n- بند أول\n> اقتباس\n---\n<div>وسم</div>\n1. أولاً';
    expect(stripMarkdownForSpeech(md)).toBe('عنوان بند أول اقتباس وسم أولاً');
  });

  it('flattens tables to their cell text', () => {
    const md = '| أ | ب |\n| --- | --- |\n| 1 | 2 |';
    expect(stripMarkdownForSpeech(md)).toBe('أ ب 1 2');
  });

  it('collapses all whitespace and keeps Arabic intact', () => {
    expect(stripMarkdownForSpeech('مرحباً\n\nبك   في\tرفيق')).toBe('مرحباً بك في رفيق');
  });

  it('returns empty for markdown-only content', () => {
    expect(stripMarkdownForSpeech('```\n\n```')).toBe('');
  });
});

describe('chunkForSpeech', () => {
  it('returns a single chunk when under the limit', () => {
    expect(chunkForSpeech('سطر واحد', 100)).toEqual(['سطر واحد']);
  });

  it('returns no chunks for empty text', () => {
    expect(chunkForSpeech('   ', 100)).toEqual([]);
  });

  it('word-packs long text without exceeding the limit', () => {
    const words = Array.from({ length: 500 }, (_, i) => `كلمة${i}`);
    const text = words.join(' ');
    const chunks = chunkForSpeech(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      const single = !c.includes(' ');
      expect(single || c.length <= 100).toBe(true);
    }
    expect(chunks.join(' ')).toBe(text);
  });

  it('keeps a lone oversized word in its own chunk', () => {
    const long = 'x'.repeat(120);
    expect(chunkForSpeech(`قصير ${long}`, 100)).toEqual(['قصير', long]);
  });
});

describe('detectSpeechLanguage', () => {
  it('detects Arabic script regardless of the UI language', () => {
    expect(detectSpeechLanguage('مرحبا بك', 'en')).toBe('ar');
    expect(detectSpeechLanguage('Hello مرحبا', 'en')).toBe('ar');
  });

  it('falls back to the UI language for non-Arabic text', () => {
    expect(detectSpeechLanguage('Hello there', 'en')).toBe('en');
    expect(detectSpeechLanguage('Hello there', 'ar')).toBe('ar');
  });
});

describe('pickVoice', () => {
  const voices: SpeechVoiceInfo[] = [
    { identifier: 'en-us-default', language: 'en-US', quality: 'Default' },
    { identifier: 'ar-sa-default', language: 'ar-SA', quality: 'Default' },
    { identifier: 'ar-eg-enhanced', language: 'ar-EG', quality: 'Enhanced' },
  ];

  it('matches the base language and prefers Enhanced quality', () => {
    expect(pickVoice(voices, 'ar')).toBe('ar-eg-enhanced');
    expect(pickVoice(voices, 'ar-SA')).toBe('ar-eg-enhanced');
    expect(pickVoice(voices, 'en')).toBe('en-us-default');
  });

  it('returns null when no voice matches', () => {
    expect(pickVoice(voices, 'fr')).toBeNull();
    expect(pickVoice([], 'ar')).toBeNull();
  });
});

class FakeSpeechEngine implements SpeechEngine {
  calls: { text: string; opts: SpeakOpts }[] = [];
  stopCount = 0;
  voices: SpeechVoiceInfo[] = [];

  speak(text: string, opts: SpeakOpts) {
    this.calls.push({ text, opts });
  }

  async stop() {
    this.stopCount += 1;
  }

  async getVoices() {
    return this.voices;
  }

  /** Completes the single outstanding utterance (tests with one chunk). */
  finishLast() {
    this.calls[this.calls.length - 1]?.opts.onDone?.();
  }

  failLast() {
    this.calls[this.calls.length - 1]?.opts.onError?.();
  }
}

const speakState = () => useTtsStore.getState();

describe('ttsStore', () => {
  let fake: FakeSpeechEngine;
  beforeEach(() => {
    fake = new FakeSpeechEngine();
    setTtsEngine(fake);
    useTtsStore.setState({ status: 'idle', messageId: null });
    useSettingsStore.setState({ ...DEFAULT_SETTINGS });
  });

  it('speaks stripped text with the detected Arabic language', async () => {
    speakState().speak('m1', '**مرحبا** بك');
    await tick();
    expect(speakState().status).toBe('speaking');
    expect(speakState().messageId).toBe('m1');
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.text).toBe('مرحبا بك');
    expect(fake.calls[0]!.opts.language).toBe('ar');
  });

  it('falls back to the UI language when the reply is not Arabic', async () => {
    useSettingsStore.setState({ language: 'en' });
    speakState().speak('m1', 'Plain English reply');
    await tick();
    expect(fake.calls[0]!.opts.language).toBe('en');
  });

  it('picks a matching device voice when one exists', async () => {
    fake.voices = [{ identifier: 'ar-voice', language: 'ar-SA', quality: 'Enhanced' }];
    speakState().speak('m1', 'مرحبا');
    await tick();
    expect(fake.calls[0]!.opts.voice).toBe('ar-voice');
  });

  it('returns to idle once every chunk finishes', async () => {
    // ~9k chars: crosses the 3800-char utterance limit into several chunks.
    const long = Array.from({ length: 2000 }, (_, i) => `w${i}`).join(' ');
    speakState().speak('m1', long);
    await tick();
    expect(fake.calls.length).toBeGreaterThan(1);
    expect(speakState().status).toBe('speaking');
    for (const c of fake.calls) c.opts.onDone?.();
    expect(speakState().status).toBe('idle');
    expect(speakState().messageId).toBeNull();
  });

  it('treats an errored utterance as finished', async () => {
    speakState().speak('m1', 'مرحبا');
    await tick();
    fake.failLast();
    expect(speakState().status).toBe('idle');
  });

  it('stop() resets the state and interrupts the engine', async () => {
    speakState().speak('m1', 'مرحبا');
    await tick();
    await speakState().stop();
    expect(speakState().status).toBe('idle');
    // speak() interrupts whatever was playing (1) + the explicit stop (2).
    expect(fake.stopCount).toBe(2);
  });

  it('ignores stale completion callbacks after a stop', async () => {
    speakState().speak('m1', 'مرحبا');
    await tick();
    await speakState().stop();
    fake.finishLast(); // late native callback from the cancelled utterance
    expect(speakState().status).toBe('idle');
  });

  it('toggle stops the playing message and switches to another', async () => {
    speakState().toggle('m1', 'مرحبا');
    await tick();
    speakState().toggle('m1', 'مرحبا'); // same message -> stop
    expect(speakState().status).toBe('idle');
    // initial speak's interrupt (1) + the toggle's stop (2).
    expect(fake.stopCount).toBe(2);

    speakState().toggle('m2', 'Hello'); // new message -> speaks
    await tick();
    expect(speakState().status).toBe('speaking');
    expect(speakState().messageId).toBe('m2');
  });

  it('is a no-op when stripping leaves nothing to say', () => {
    speakState().speak('m1', '```\n```');
    expect(speakState().status).toBe('idle');
    expect(fake.calls).toHaveLength(0);
  });
});

class FakeLlm implements LlmEngine {
  loaded = true;
  reply = 'ردّ **جاهز** للاختبار';
  async load() {}
  isLoaded() {
    return this.loaded;
  }
  async complete(_m: EngineMessage[], _o: CompletionOptions, onToken: (t: string) => void): Promise<CompletionResult> {
    onToken(this.reply);
    return { text: this.reply, tokensPerSecond: 10, tokenCount: null, stoppedByUser: false };
  }
  async stop() {}
  async release() {}
}

describe('auto-speak (chatStore -> ttsStore)', () => {
  let fake: FakeSpeechEngine;
  beforeEach(() => {
    fake = new FakeSpeechEngine();
    setTtsEngine(fake);
    setChatRepository(new MemoryChatRepository());
    setEngine(new FakeLlm());
    useTtsStore.setState({ status: 'idle', messageId: null });
    useSettingsStore.setState({ ...DEFAULT_SETTINGS, autoSpeak: false });
  });

  it('speaks the completed reply when the setting is on', async () => {
    useSettingsStore.setState({ autoSpeak: true });
    await useChatStore.getState().sendMessage('مرحبا', {
      systemPrompt: 'SYS',
      temperature: 0.5,
      contextSize: 2048,
      maxTokens: 128,
      modelId: 'm',
      fallbackTitle: 'New',
    });
    await tick();
    const assistant = useChatStore.getState().messages.find((m) => m.role === 'assistant');
    expect(assistant).toBeTruthy();
    expect(speakState().status).toBe('speaking');
    expect(speakState().messageId).toBe(assistant!.id);
    expect(fake.calls[0]!.text).toBe('ردّ جاهز للاختبار');
  });

  it('stays silent when the setting is off', async () => {
    await useChatStore.getState().sendMessage('مرحبا', {
      systemPrompt: 'SYS',
      temperature: 0.5,
      contextSize: 2048,
      maxTokens: 128,
      modelId: 'm',
      fallbackTitle: 'New',
    });
    await tick();
    expect(speakState().status).toBe('idle');
    expect(fake.calls).toHaveLength(0);
  });
});
