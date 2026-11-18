// Copyright (c) 2026 DRS AI. All rights reserved.
import { CATALOG, VOICE_MODEL_ID, VOICE_MODELS } from '../src/models/catalog';
import { base64ToBytes, bytesToInt16, concatInt16, int16ToFloat32, pcmDurationMs } from '../src/speech/pcm';
import { SAMPLE_RATE, type VoiceRecorder } from '../src/speech/recorder';
import type { WhisperEngine } from '../src/speech/whisper';
import {
  MAX_RECORDING_MS,
  MIN_RECORDING_MS,
  setVoiceClock,
  setVoiceEngine,
  setVoiceRecorder,
  useVoiceStore,
  voiceHandoffFresh,
} from '../src/store/voiceStore';
import { voiceSessionMeter } from '../src/store/voiceOutStore';
import { setDownloadTransport, useModelStore } from '../src/store/modelStore';
import { requestMicPermission } from '../src/utils/voicePermission';
import { FakeTransport } from './fakeTransport';

jest.mock('../src/utils/voicePermission', () => ({
  requestMicPermission: jest.fn(),
}));

const requestPermission = requestMicPermission as jest.Mock;

/** One second of a quiet 16 kHz sine-ish wave: 1 = 1/32768, -1 = -1/32768. */
function silenceSamples(seconds: number): Int16Array {
  return new Int16Array(Math.round(seconds * SAMPLE_RATE)).fill(1);
}

/** Encodes Int16 samples as base64 little-endian chunks (what the native module emits). */
function encodeChunk(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) view.setInt16(i * 2, samples[i]!, true);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    out += alphabet[b0 >> 2]! + alphabet[((b0 & 3) << 4) | (b1 >> 4)]!;
    out += i + 1 < bytes.length ? alphabet[((b1 & 15) << 2) | (b2 >> 6)]! : '=';
    out += i + 2 < bytes.length ? alphabet[b2 & 63]! : '=';
  }
  return out;
}

class FakeRecorder implements VoiceRecorder {
  started = 0;
  stopped = 0;
  reset_ = 0;
  failStart = false;
  failStop = false;
  chunks: Int16Array[] = [];
  async start() {
    if (this.failStart) throw new Error('MIC_BUSY');
    this.started++;
    this.chunks = [silenceSamples(1)];
  }
  stop(): Int16Array {
    this.stopped++;
    if (this.failStop) throw new Error('STOP_FAILED');
    return concatInt16(this.chunks);
  }
  reset() {
    this.reset_++;
    this.chunks = [];
  }
}

class FakeWhisper implements WhisperEngine {
  loaded = false;
  loadError = false;
  transcribeError = false;
  result = 'مرحبا بالعالم';
  lastPcm: Float32Array | null = null;
  lastOpts: { language?: string } | null = null;
  async load() {
    if (this.loadError) throw new Error('LOAD_FAILED');
    this.loaded = true;
  }
  isLoaded() {
    return this.loaded;
  }
  async transcribe(pcm: Float32Array, opts: { language?: string }) {
    if (this.transcribeError) throw new Error('TRANSCRIBE_FAILED');
    this.lastPcm = pcm;
    this.lastOpts = opts;
    return this.result;
  }
  async release() {
    this.loaded = false;
  }
}

let recorder: FakeRecorder;
let engine: FakeWhisper;
let clockMs: number;

beforeEach(() => {
  jest.clearAllMocks();
  clockMs = 1_000_000;
  setVoiceClock(() => clockMs);
  requestPermission.mockResolvedValue(true);
  recorder = new FakeRecorder();
  engine = new FakeWhisper();
  setVoiceEngine(engine);
  setVoiceRecorder(recorder);
  useVoiceStore.setState({ status: 'idle', error: null, result: null, loadedModelId: null, startedAt: null, lastTranscriptAt: null });
  voiceSessionMeter.setClock(() => clockMs);
  voiceSessionMeter.reset();
});

afterEach(() => {
  useVoiceStore.getState().cancel();
});

describe('pcm helpers', () => {
  it('decodes base64 including padding and partial tails', () => {
    expect(base64ToBytes('')).toEqual(new Uint8Array(0));
    expect(base64ToBytes('AQID')).toEqual(new Uint8Array([1, 2, 3]));
    expect(base64ToBytes('AA==')).toEqual(new Uint8Array([0]));
    expect(base64ToBytes('AQI=')).toEqual(new Uint8Array([1, 2]));
    expect(base64ToBytes('AQID\n')).toEqual(new Uint8Array([1, 2, 3])); // whitespace tolerated
  });

  it('round-trips little-endian int16 samples through base64', () => {
    const samples = Int16Array.from([-32768, -1, 0, 1, 32767]);
    const decoded = bytesToInt16(base64ToBytes(encodeChunk(samples)));
    expect(Array.from(decoded)).toEqual(Array.from(samples));
  });

  it('trims a trailing odd byte instead of misreading it', () => {
    expect(Array.from(bytesToInt16(new Uint8Array([1, 0, 2, 0, 7])))).toEqual([1, 2]);
  });

  it('concatenates chunks in order', () => {
    const out = concatInt16([Int16Array.from([1, 2]), new Int16Array(0), Int16Array.from([3])]);
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });

  it('scales int16 into the float32 range whisper expects', () => {
    const out = int16ToFloat32(Int16Array.from([-32768, 0, 32767]));
    expect(out[0]).toBeCloseTo(-1, 5);
    expect(out[1]).toBe(0);
    expect(out[2]).toBeCloseTo(32767 / 32768, 5);
  });

  it('computes duration and guards a zero sample rate', () => {
    expect(pcmDurationMs(SAMPLE_RATE, SAMPLE_RATE)).toBe(1000);
    expect(pcmDurationMs(160, SAMPLE_RATE)).toBe(10);
    expect(pcmDurationMs(100, 0)).toBe(0);
  });
});

describe('voiceStore', () => {
  it('reports NO_VOICE_MODEL without a downloaded model file', async () => {
    await useVoiceStore.getState().toggle({ id: VOICE_MODEL_ID, path: null });
    expect(useVoiceStore.getState().error).toBe('NO_VOICE_MODEL');
    expect(useVoiceStore.getState().status).toBe('idle');
    expect(recorder.started).toBe(0);
  });

  it('starts recording: loads the engine, asks permission, starts the mic', async () => {
    engine.loaded = false;
    await useVoiceStore.getState().toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    expect(engine.loaded).toBe(true);
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(recorder.started).toBe(1);
    expect(useVoiceStore.getState().status).toBe('recording');
    expect(useVoiceStore.getState().loadedModelId).toBe(VOICE_MODEL_ID);
    expect(useVoiceStore.getState().startedAt).not.toBeNull();
  });

  it('reuses a loaded engine for the same model instead of reloading', async () => {
    const load = jest.spyOn(engine, 'load');
    await useVoiceStore.getState().toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    useVoiceStore.getState().cancel();
    await useVoiceStore.getState().toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('stops on the second press and delivers the transcription', async () => {
    const store = useVoiceStore.getState();
    await store.toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    clockMs += 2000; // a real (non-stray) recording
    await useVoiceStore.getState().toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    expect(recorder.stopped).toBe(1);
    expect(useVoiceStore.getState().status).toBe('idle');
    expect(useVoiceStore.getState().result).toBe('مرحبا بالعالم');
    expect(useVoiceStore.getState().error).toBeNull();
    // 1 s of near-silence samples scaled into [-1, 1].
    expect(engine.lastPcm?.length).toBe(SAMPLE_RATE);
    expect(engine.lastPcm![0]).toBeCloseTo(1 / 32768, 5);
  });

  it('ignores extra presses while loading or transcribing', async () => {
    const store = useVoiceStore.getState();
    await store.toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    // While recording a press stops; simulate a slow transcription via a pending promise.
    let release!: (text: string) => void;
    engine.transcribe = () => new Promise<string>((res) => (release = res));
    clockMs += 2000;
    const stopping = useVoiceStore.getState().toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    const second = await useVoiceStore.getState().toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    expect(second).toBeUndefined();
    release('تم');
    await stopping;
    expect(useVoiceStore.getState().result).toBe('تم');
  });

  it('reports PERMISSION_DENIED and stays idle', async () => {
    requestPermission.mockResolvedValue(false);
    await useVoiceStore.getState().toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    expect(useVoiceStore.getState().status).toBe('idle');
    expect(useVoiceStore.getState().error).toBe('PERMISSION_DENIED');
    expect(recorder.started).toBe(0);
  });

  it('reports MIC_FAILED when the mic cannot start', async () => {
    recorder.failStart = true;
    await useVoiceStore.getState().toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    expect(useVoiceStore.getState().error).toBe('MIC_FAILED');
    expect(useVoiceStore.getState().status).toBe('idle');
  });

  it('reports MIC_FAILED when the engine fails to load', async () => {
    engine.loadError = true;
    await useVoiceStore.getState().toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    expect(useVoiceStore.getState().error).toBe('MIC_FAILED');
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('rejects a stray tap shorter than the minimum duration', async () => {
    recorder.chunks = [new Int16Array(4)]; // ~0.25 ms of audio
    const store = useVoiceStore.getState();
    await store.toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    await useVoiceStore.getState().toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    expect(useVoiceStore.getState().error).toBe('TOO_SHORT');
    expect(useVoiceStore.getState().result).toBeNull();
    expect(engine.lastPcm).toBeNull();
  });

  it('reports EMPTY when the model recognizes nothing', async () => {
    engine.result = '';
    const store = useVoiceStore.getState();
    await store.toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    clockMs += 2000;
    await useVoiceStore.getState().toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    expect(useVoiceStore.getState().error).toBe('EMPTY');
  });

  it('reports TRANSCRIBE_FAILED when the engine throws', async () => {
    engine.transcribeError = true;
    const store = useVoiceStore.getState();
    await store.toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    clockMs += 2000;
    await useVoiceStore.getState().toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    expect(useVoiceStore.getState().error).toBe('TRANSCRIBE_FAILED');
  });

  it('cancel drops the session without transcribing', async () => {
    await useVoiceStore.getState().toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    useVoiceStore.getState().cancel();
    expect(useVoiceStore.getState().status).toBe('idle');
    expect(recorder.stopped).toBe(0);
    expect(engine.lastPcm).toBeNull();
  });

  it('auto-stops at the recording cap and still transcribes', async () => {
    jest.useFakeTimers();
    try {
      await useVoiceStore.getState().toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
      clockMs += MAX_RECORDING_MS + 10; // the clock runs past the cap
      jest.advanceTimersByTime(MAX_RECORDING_MS + 1);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(recorder.stopped).toBe(1);
      expect(useVoiceStore.getState().status).toBe('idle');
      expect(useVoiceStore.getState().result).toBe('مرحبا بالعالم');
    } finally {
      jest.useRealTimers();
    }
  });

  it('consume clears result and error for the next session', async () => {
    const store = useVoiceStore.getState();
    await store.toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    await useVoiceStore.getState().toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    useVoiceStore.getState().consume();
    expect(useVoiceStore.getState().result).toBeNull();
    expect(useVoiceStore.getState().error).toBeNull();
  });

  it('release forgets the loaded model and resets state', async () => {
    await useVoiceStore.getState().toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    await useVoiceStore.getState().release();
    expect(useVoiceStore.getState().status).toBe('idle');
    expect(useVoiceStore.getState().loadedModelId).toBeNull();
    expect(engine.loaded).toBe(false);
  });

  it('pins the transcription language to the model entry (Saudi dialectal fine-tune wants ar)', async () => {
    const store = useVoiceStore.getState();
    await store.toggle({ id: 'dialectal', path: '/data/dialectal.bin', language: 'ar' });
    clockMs += 2000;
    await useVoiceStore.getState().toggle({ id: 'dialectal', path: '/data/dialectal.bin', language: 'ar' });
    expect(engine.lastOpts).toEqual({ language: 'ar' });
  });

  it('lets multilingual models detect (no language hint → auto)', async () => {
    const store = useVoiceStore.getState();
    await store.toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    clockMs += 2000;
    await useVoiceStore.getState().toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    expect(engine.lastOpts).toEqual({ language: 'auto' });
  });

  it('stamps lastTranscriptAt on success only, and the handoff stays fresh only while the clock is near it', async () => {
    expect(voiceHandoffFresh()).toBe(false);
    const store = useVoiceStore.getState();
    await store.toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    clockMs += 2000;
    await useVoiceStore.getState().toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    expect(useVoiceStore.getState().lastTranscriptAt).toBe(clockMs);
    expect(voiceHandoffFresh()).toBe(true); // 0 ms elapsed since the stamp
    clockMs += 61_000;
    expect(voiceHandoffFresh()).toBe(false); // stale transcript left in the draft
  });

  it('does not stamp lastTranscriptAt on EMPTY or failure', async () => {
    engine.result = '';
    const store = useVoiceStore.getState();
    await store.toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    clockMs += 2000;
    await useVoiceStore.getState().toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    expect(useVoiceStore.getState().lastTranscriptAt).toBeNull();
  });

  it('a fresh recording session resets the latency meter (no bleed from the last session)', async () => {
    voiceSessionMeter.mark('recorded');
    voiceSessionMeter.mark('transcribed');
    await useVoiceStore.getState().toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    expect(voiceSessionMeter.has('recorded')).toBe(false);
    expect(voiceSessionMeter.has('transcribed')).toBe(false);
  });

  it('the mic flow lands the latency marks: recorded → transcribed', async () => {
    const store = useVoiceStore.getState();
    await store.toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    clockMs += 2500;
    await useVoiceStore.getState().toggle({ id: VOICE_MODEL_ID, path: '/data/ggml-tiny.bin' });
    const report = voiceSessionMeter.report();
    expect(report.timeToFirstSentenceMs).toBeNull(); // the agent never ran
    expect(report.msFromRecorded.transcribed).toBe(0); // transcribe resolved instantly on the same clock tick
  });
});

describe('voice model in the model store', () => {
  it('is part of allModels with download metadata', () => {
    expect(VOICE_MODELS).toHaveLength(2);
    const voice = useModelStore.getState().getModel(VOICE_MODEL_ID);
    expect(voice?.source).toBe('voice');
    expect(voice?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(voice?.sizeBytes).toBe(77691713);
    expect(voice?.url).toContain('huggingface.co/ggerganov/whisper.cpp');
  });

  it('catalog ships a small accuracy step-up without a language pin', () => {
    const small = useModelStore.getState().getModel('whisper-small');
    expect(small?.source).toBe('voice');
    expect(small?.params).toBe('244M');
    expect(small?.sizeBytes).toBe(487601967);
    expect(small?.sha256).toMatch(/^[0-9a-f]{64}$/);
    // Multilingual: no pinned language — detection decides.
    expect(small?.voiceLanguage).toBeUndefined();
    expect(VOICE_MODEL_ID).toBe('whisper-tiny');
  });

  it('never leaks into the LLM picker even when downloaded', () => {
    setDownloadTransport(new FakeTransport());
    const store = useModelStore.getState();
    store.applyPatch(VOICE_MODEL_ID, { status: 'downloaded' });
    expect(store.downloadedModels().some((m) => m.source === 'voice')).toBe(false);
    expect(store.downloadedModels()).toHaveLength(0);
    // LLM catalog entries remain untouched by the voice filter.
    store.applyPatch(CATALOG[0]!.id, { status: 'downloaded' });
    expect(store.downloadedModels().map((m) => m.id)).toContain(CATALOG[0]!.id);
  });

  it('is excluded from sync-with-disk LLM reconciliation side effects', () => {
    setDownloadTransport(new FakeTransport());
    const store = useModelStore.getState();
    store.applyPatch(VOICE_MODEL_ID, { status: 'paused', resumeState: { x: 1 } });
    store.syncWithDisk();
    // The voice file state reconciles like any model file (paused without a real part file).
    expect(store.fileState(VOICE_MODEL_ID).status).toBe('paused');
  });
});

describe('recording guardrails', () => {
  it('cap and minimum are sane for a 60 s session at 16 kHz', () => {
    expect(MAX_RECORDING_MS).toBe(60_000);
    expect(MIN_RECORDING_MS).toBeLessThan(MAX_RECORDING_MS / 2);
    expect(SAMPLE_RATE).toBe(16000);
  });
});
