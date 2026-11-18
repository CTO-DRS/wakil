// Copyright (c) 2026 DRS AI. All rights reserved.
import { VOICE_LATENCY_STAGES, VoiceLatencyMeter } from '../src/speech/latency';

function meterWithMarks(clock: () => number, marks: Partial<Record<Parameters<VoiceLatencyMeter['mark']>[0], number>>): VoiceLatencyMeter {
  const m = new VoiceLatencyMeter(clock);
  for (const [stage, at] of Object.entries(marks)) m.markAt(stage as never, at!);
  return m;
}

describe('VoiceLatencyMeter', () => {
  it('has exactly the six competition stages in pipeline order', () => {
    expect(VOICE_LATENCY_STAGES).toEqual(['recorded', 'transcribed', 'goalSent', 'planShown', 'firstSentenceSpoken', 'answered']);
  });

  it('reports the two competition numbers: time to the first spoken sentence and the total', () => {
    const m = meterWithMarks(() => 0, {
      recorded: 1_000,
      transcribed: 1_800,
      goalSent: 1_850,
      planShown: 2_600,
      firstSentenceSpoken: 3_700,
      answered: 6_400,
    });
    const r = m.report();
    expect(r.timeToFirstSentenceMs).toBe(2_700); // recorded → first sentence: the <3 s budget
    expect(r.totalMs).toBe(5_400);
    expect(r.msFromRecorded.transcribed).toBe(800);
    expect(r.msFromRecorded.firstSentenceSpoken).toBe(2_700);
    expect(r.msFromPrevious.transcribed).toBe(800); // recorded → transcribed
    expect(r.msFromPrevious.goalSent).toBe(50); // transcribed → goalSent
    expect(r.msFromPrevious.answered).toBe(2_700);
  });

  it('never reports negative gaps when marks arrive out of order', () => {
    const m = meterWithMarks(() => 0, { recorded: 5_000, transcribed: 4_000 });
    const r = m.report();
    expect(r.msFromRecorded.transcribed).toBe(0);
    expect(r.msFromPrevious.transcribed).toBe(0);
    expect(r.timeToFirstSentenceMs).toBeNull();
  });

  it('incomplete sessions report nulls, never fake zeros', () => {
    const m = meterWithMarks(() => 0, { recorded: 1_000, transcribed: 1_500 });
    const r = m.report();
    expect(r.timeToFirstSentenceMs).toBeNull();
    expect(r.totalMs).toBeNull();
    expect(r.msFromRecorded.goalSent).toBeNull();
    expect(r.msFromRecorded.answered).toBeNull();
    expect(r.msFromRecorded.recorded).toBe(0);
  });

  it('a session with no marks at all reports all-null', () => {
    expect(new VoiceLatencyMeter().report().timeToFirstSentenceMs).toBeNull();
    const r = new VoiceLatencyMeter().report();
    for (const stage of VOICE_LATENCY_STAGES) expect(r.msFromRecorded[stage]).toBeNull();
  });

  it('reset clears every mark so a new voice session never inherits old numbers', () => {
    const m = meterWithMarks(() => 0, { recorded: 1_000, transcribed: 1_500, answered: 4_000 });
    m.reset();
    expect(m.has('recorded')).toBe(false);
    expect(m.has('answered')).toBe(false);
    expect(m.report().totalMs).toBeNull();
    m.markAt('recorded', 10_000);
    m.markAt('answered', 11_000);
    expect(m.report().totalMs).toBe(1_000);
  });

  it('mark uses the injected clock; markAt pins an explicit epoch', () => {
    let now = 500;
    const m = new VoiceLatencyMeter(() => now);
    m.mark('recorded');
    now = 900;
    m.mark('transcribed');
    expect(m.report().msFromRecorded.transcribed).toBe(400);
    m.markAt('transcribed', 2_000);
    expect(m.report().msFromRecorded.transcribed).toBe(1_500);
  });
});
