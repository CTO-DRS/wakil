// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Streaming sentence segmentation for the voice-first reply: the agent's answer
 * is generated token by token, and the first spoken sentence must leave the TTS
 * engine before the rest of the answer even exists. This streamer consumes raw
 * deltas and emits each complete sentence the moment its terminator arrives —
 * Arabic-aware (؟ ! ؛ and the Arabic full stop), immune to the classic traps
 * (decimals like 3.5, ellipses, list numbering like «1.») so a cut never lands
 * mid-thought.
 */

/** Characters that end a spoken sentence. The Arabic semicolon ؛ is a real pause; the Arabic comma ، is not (too shallow). */
const TERMINATORS = new Set(['.', '؟', '?', '!', '؛', ';']);

/** A line starting with one of these is structural (markdown); the newline before it is a boundary. Arabic-Indic numbering counts too. */
const STRUCTURAL_LINE = /^\s*(#{1,6}\s+|[-*+]\s+|\p{Nd}+[.)]\s+|>\s+)/u;

/** When the pending text exceeds this without any terminator, cut at the last word boundary. */
const MAX_PENDING_CHARS = 200;

/** A sentence that is nothing but a list marker («1.» / «١.») is folded into the next sentence, never spoken alone. */
const ONLY_LIST_MARKER = /^\s*(\p{Nd}{1,2}[.)]|[-*+>])$/u;

export class SentenceStreamer {
  private buf = '';
  private foldMarker = '';

  /** Appends a delta and returns every sentence that just became complete, in order. */
  feed(delta: string): string[] {
    this.buf += delta;
    const out: string[] = [];
    for (;;) {
      const idx = this.cutIndex();
      if (idx < 0) break;
      this.emitTo(out, idx);
    }
    if (this.buf.length > MAX_PENDING_CHARS) {
      const idx = this.overflowIndex();
      if (idx > 0) this.emitTo(out, idx);
    }
    return out;
  }

  /** Emits whatever is still pending; null when nothing worth speaking remains. */
  flush(): string | null {
    const rest = (this.foldMarker + this.buf).trim();
    this.buf = '';
    this.foldMarker = '';
    return rest || null;
  }

  /** Test/observability hook: text held back waiting for a terminator. */
  pending(): string {
    return this.foldMarker + this.buf;
  }

  private emitTo(out: string[], idx: number) {
    const raw = this.buf.slice(0, idx);
    this.buf = this.buf.slice(idx);
    const sentence = `${this.foldMarker}${raw}`.trim();
    this.foldMarker = '';
    // A fragment with no words — a stray «..» or «؟!» tail that streamed in
    // after its sentence already cut — is never spoken: drop it. The pause it
    // carries is already implied by the terminator that ended the last
    // sentence, and a TTS utterance of bare punctuation is noise.
    if (sentence && /[\p{L}\p{N}]/u.test(sentence)) out.push(sentence);
  }

  /**
   * Index just past the next sentence boundary inside the buffer, or -1.
   * A terminator counts unless it sits between digits (decimals, dates like
   * ٢٠٢٦.١١) or belongs to a list marker («1.», «12.»). A newline counts when
   * the next line is structural (heading, bullet, quote) — and the cut always
   * advances past the newline itself, or the next scan would hit the same
   * newline again and never move.
   */
  private cutIndex(): number {
    for (let i = 0; i < this.buf.length; i++) {
      const ch = this.buf[i]!;
      if (ch === '\n') {
        const nextLine = this.buf.slice(i + 1);
        if (STRUCTURAL_LINE.test(nextLine) || nextLine.trim().length === 0) return i + 1;
        continue;
      }
      if (!TERMINATORS.has(ch)) continue;
      // Consume the whole run of terminators («...», «؟!») as one boundary.
      let end = i + 1;
      while (end < this.buf.length && TERMINATORS.has(this.buf[end]!)) end++;
      if (this.isListMarkerDot(i)) {
        i = end - 1; // resume scanning after the run; not a sentence end
        continue;
      }
      // A dot run that reaches the buffer edge with a digit right before it is
      // UNDECIDED: the next token may turn it into a decimal («٢٠٢٦.١١»، «3.5»)
      // or a list marker. Hold it for one token instead of cutting mid-number.
      if (end === this.buf.length && ch === '.' && /\p{Nd}/u.test(this.buf[i - 1] ?? '')) return -1;
      return end;
    }
    return -1;
  }

  /**
   * True when the terminator at `i` is the dot of a list marker or a decimal:
   * the previous character is a digit (or the dot opens a run like «1.») and
   * the digit run starts at a line beginning, or the next character is a digit.
   * \p{Nd} (not \d) so Arabic-Indic digits — ٣.٥، ٢٠٢٦.١١ — count as digits too.
   */
  private isListMarkerDot(i: number): boolean {
    const prev = i > 0 ? this.buf[i - 1]! : '';
    const next = this.buf[i + 1] ?? '';
    if (/\p{Nd}/u.test(next)) return true; // decimal: 3.5، ٣.٥، ٢٠٢٦.١١
    if (!/\p{Nd}/u.test(prev)) return false;
    // Walk back over the digit run; a marker is a digit run at line start.
    let j = i - 1;
    while (j >= 0 && /\p{Nd}/u.test(this.buf[j]!)) j--;
    const atLineStart = j < 0 || this.buf[j] === '\n';
    return atLineStart && i - (j + 1) <= 2; // «1.» «12.» «١.»، never «2026.»
  }

  /** Last word boundary at or before MAX_PENDING_CHARS; hard cut as a last resort. */
  private overflowIndex(): number {
    const window = this.buf.slice(0, MAX_PENDING_CHARS);
    const space = window.lastIndexOf(' ');
    return space > 0 ? space + 1 : MAX_PENDING_CHARS;
  }

  /** Folds an unfinished fragment back (used when a session restarts mid-answer). */
  reset(foldMarker = '') {
    this.foldMarker = ONLY_LIST_MARKER.test(foldMarker.trim()) ? foldMarker.trim() : '';
    this.buf = '';
  }
}

/**
 * The first spoken sentence of an answer, given the full answer text — the
 * non-streaming path (deterministic fallback answers, tests) uses this so both
 * paths produce the same segmentation.
 */
export function firstSpokenSentence(text: string): string | null {
  const s = new SentenceStreamer();
  const parts = s.feed(text);
  if (parts.length > 0) return parts[0]!;
  return s.flush();
}
