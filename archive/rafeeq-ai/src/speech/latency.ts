// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The voice-first latency budget, measured not guessed: one meter per agent
 * session records when each stage completed, and the report turns the marks
 * into the two competition numbers — time to the first spoken sentence (the
 * <3 s target) and time to the complete spoken answer. Pure, clock-injected,
 * table-driven tested.
 */

export type VoiceLatencyStage =
  | 'recorded' // the user stopped talking (mic stop)
  | 'transcribed' // whisper returned the goal text
  | 'goalSent' // the goal entered the agent loop
  | 'planShown' // the plan card appeared
  | 'firstSentenceSpoken' // the TTS engine received sentence 1
  | 'answered'; // the full answer landed

export const VOICE_LATENCY_STAGES: readonly VoiceLatencyStage[] = [
  'recorded',
  'transcribed',
  'goalSent',
  'planShown',
  'firstSentenceSpoken',
  'answered',
];

export type VoiceLatencyReport = {
  /** Wall-clock ms from «recorded» to each later stage; null where a stage never fired. */
  msFromRecorded: Record<VoiceLatencyStage, number | null>;
  /** Wall-clock ms each stage took relative to the previous completed stage. */
  msFromPrevious: Record<VoiceLatencyStage, number | null>;
  /** The competition number: recorded → firstSentenceSpoken; null when incomplete. */
  timeToFirstSentenceMs: number | null;
  /** Complete pipeline: recorded → answered; null when incomplete. */
  totalMs: number | null;
};

export class VoiceLatencyMeter {
  private marks = new Map<VoiceLatencyStage, number>();
  private clock: () => number;

  constructor(clock: () => number = Date.now) {
    this.clock = clock;
  }

  /** Overrides the wall clock (tests) — the shared session meter must follow the test clock. */
  setClock(clock: () => number) {
    this.clock = clock;
  }

  mark(stage: VoiceLatencyStage) {
    this.marks.set(stage, this.clock());
  }

  /** Clears every mark — a fresh voice session must not inherit the last one's numbers. */
  reset() {
    this.marks.clear();
  }

  /** True when the stage was marked in the current session. */
  has(stage: VoiceLatencyStage): boolean {
    return this.marks.has(stage);
  }

  markAt(stage: VoiceLatencyStage, epochMs: number) {
    this.marks.set(stage, epochMs);
  }

  get(stage: VoiceLatencyStage): number | null {
    return this.marks.get(stage) ?? null;
  }

  report(): VoiceLatencyReport {
    const t0 = this.marks.get('recorded') ?? null;
    const msFromRecorded = {} as Record<VoiceLatencyStage, number | null>;
    const msFromPrevious = {} as Record<VoiceLatencyStage, number | null>;
    let prev: number | null = null;
    for (const stage of VOICE_LATENCY_STAGES) {
      const t = this.marks.get(stage) ?? null;
      msFromRecorded[stage] = t !== null && t0 !== null ? Math.max(0, t - t0) : null;
      msFromPrevious[stage] = t !== null && prev !== null ? Math.max(0, t - prev) : null;
      if (t !== null) prev = t;
    }
    const first = this.marks.get('firstSentenceSpoken') ?? null;
    const answered = this.marks.get('answered') ?? null;
    return {
      msFromRecorded,
      msFromPrevious,
      timeToFirstSentenceMs: t0 !== null && first !== null ? Math.max(0, first - t0) : null,
      totalMs: t0 !== null && answered !== null ? Math.max(0, answered - t0) : null,
    };
  }
}
