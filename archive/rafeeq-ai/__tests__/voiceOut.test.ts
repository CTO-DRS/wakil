// Copyright (c) 2026 DRS AI. All rights reserved.
import type { SpeechVoiceInfo } from '../src/speech/tts';
import { setVoiceOutEngine, useVoiceOutStore, voiceSessionMeter } from '../src/store/voiceOutStore';
import { useSettingsStore } from '../src/store/settingsStore';

/** A deterministic fake of the platform TTS engine. */
class FakeSpeechEngine {
  spoken: { text: string; lang?: string }[] = [];
  stopCalls = 0;
  blocked = false;
  private resolvers: (() => void)[] = [];
  async getVoices(): Promise<SpeechVoiceInfo[]> {
    return [{ identifier: 'ar-voice', language: 'ar-SA', name: 'Arabic', quality: 100 } as unknown as SpeechVoiceInfo];
  }
  async speak(text: string, opts: { language?: string; onDone?: () => void; onError?: () => void }) {
    this.spoken.push({ text, lang: opts.language });
    if (this.blocked) {
      // Playback never completes until released; the pending counter must hold.
      this.resolvers.push(() => opts.onDone?.());
      return;
    }
    opts.onDone?.();
  }
  async stop() {
    this.stopCalls += 1;
    this.resolvers.splice(0).forEach((r) => r());
  }
  releaseAll() {
    this.resolvers.splice(0).forEach((r) => r());
  }
}

let engine: FakeSpeechEngine;

beforeEach(() => {
  jest.useFakeTimers();
  engine = new FakeSpeechEngine();
  setVoiceOutEngine(engine as never);
  voiceSessionMeter.setClock(() => 1_000_000);
  voiceSessionMeter.reset();
  useSettingsStore.setState({ language: 'ar', autoSpeak: true });
  useVoiceOutStore.getState().abort();
});

afterEach(() => {
  setVoiceOutEngine(null);
  jest.useRealTimers();
});

/** Flushes the microtasks a speak() chain needs to reach the engine. */
async function settle(times = 4) {
  for (let i = 0; i < times; i++) await Promise.resolve();
  jest.runOnlyPendingTimers();
  for (let i = 0; i < times; i++) await Promise.resolve();
}

describe('the voice-out store — streaming answers', () => {
  it('pushToken speaks each sentence the moment its terminator streams in', async () => {
    useVoiceOutStore.getState().begin();
    useVoiceOutStore.getState().pushToken('حاضر، عندي خطوت');
    await settle();
    expect(engine.spoken).toEqual([]); // no terminator yet — nothing spoken
    useVoiceOutStore.getState().pushToken('ين: أولًا نرتب المواعيد.');
    await settle();
    expect(engine.spoken.map((s) => s.text)).toEqual(['حاضر، عندي خطوتين: أولًا نرتب المواعيد.']);
  });

  it('the first spoken sentence lands the latency mark exactly once per session', async () => {
    useVoiceOutStore.getState().begin();
    expect(voiceSessionMeter.get('firstSentenceSpoken')).toBeNull();
    useVoiceOutStore.getState().pushToken('الجملة الأولى.');
    await settle();
    expect(voiceSessionMeter.get('firstSentenceSpoken')).toBe(1_000_000);
    useVoiceOutStore.getState().pushToken('والجملة الثانية؟');
    await settle();
    expect(voiceSessionMeter.get('firstSentenceSpoken')).toBe(1_000_000); // still the first
  });

  it('flushPending emits whatever the streamer still holds', async () => {
    useVoiceOutStore.getState().begin();
    useVoiceOutStore.getState().pushToken('جواب بلا نقطة نهاية');
    await settle();
    expect(engine.spoken).toEqual([]);
    useVoiceOutStore.getState().flushPending();
    await settle();
    expect(engine.spoken.map((s) => s.text)).toEqual(['جواب بلا نقطة نهاية']);
  });

  it('abort stops the engine and discards everything pending', async () => {
    engine.blocked = true; // playback holds until abort releases it
    useVoiceOutStore.getState().begin();
    useVoiceOutStore.getState().pushToken('جملة قيد النطق.');
    await settle();
    expect(useVoiceOutStore.getState().speaking).toBe(true);
    useVoiceOutStore.getState().pushToken('نصف جملة لم تُقل بعد'); // no terminator: stays buffered
    const stopsBefore = engine.stopCalls;
    useVoiceOutStore.getState().abort();
    await settle();
    expect(engine.stopCalls).toBe(stopsBefore + 1); // abort stops the engine exactly once
    expect(useVoiceOutStore.getState().speaking).toBe(false);
    expect(useVoiceOutStore.getState().currentSentence).toBeNull();
    // Stale deltas from the aborted session speak nothing.
    useVoiceOutStore.getState().pushToken('بقايا جلسة ميتة.');
    await settle();
    expect(engine.spoken).toHaveLength(1);
  });
});

describe('the voice-out store — composed texts', () => {
  it('speakNow queues every sentence of a short composed text (the plan announcement)', async () => {
    useVoiceOutStore.getState().begin();
    useVoiceOutStore.getState().speakNow('حاضر، عندي خطوتين: الترتيب أولًا. أي خطوة تغيّر شي بتوقف قبلها.');
    await settle();
    expect(engine.spoken.map((s) => s.text)).toEqual([
      'حاضر، عندي خطوتين: الترتيب أولًا.',
      'أي خطوة تغيّر شي بتوقف قبلها.',
    ]);
  });

  it('speakAnswer speaks a whole non-streamed answer immediately, tail included', async () => {
    useVoiceOutStore.getState().begin();
    useVoiceOutStore.getState().speakAnswer('حاضر، شغّال على طلبك');
    await settle();
    expect(engine.spoken.map((s) => s.text)).toEqual(['حاضر، شغّال على طلبك']);
  });

  it('begin aborts anything still playing before the new session', async () => {
    engine.blocked = true;
    useVoiceOutStore.getState().begin();
    useVoiceOutStore.getState().pushToken('جلسة قديمة ما خلصت.');
    await settle();
    expect(useVoiceOutStore.getState().speaking).toBe(true);
    useVoiceOutStore.getState().begin();
    engine.releaseAll();
    await settle();
    expect(useVoiceOutStore.getState().speaking).toBe(false);
    expect(engine.stopCalls).toBeGreaterThanOrEqual(1);
  });

  it('language follows the spoken text: Arabic for Arabic, settings language otherwise', async () => {
    useVoiceOutStore.getState().begin();
    useVoiceOutStore.getState().speakNow('أهلاً بك.');
    await settle();
    expect(engine.spoken[0]?.lang).toBe('ar');
    useSettingsStore.setState({ language: 'en' });
    useVoiceOutStore.getState().speakNow('All set.');
    await settle();
    expect(engine.spoken[1]?.lang).toBe('en');
  });
});
