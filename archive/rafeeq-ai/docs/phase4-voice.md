# Phase 4 — Voice-first

Competition build (Create AI Agents Championship, *Best Personal AI Agent*) — Phase 4 of 6.
Scope of this phase: the agent stops demanding a keyboard. You tap (later: wake word),
speak a Saudi-dialect goal, the agent answers **out loud** while the plan card is still
on screen — and the first spoken sentence must beat the **3-second** budget on the
target device (Infinix GT 30). Everything here ships in v0.17.0, runs 100 % offline,
and passes the full suite (`npm run check`, 94 suites / 1706 tests).

## What was built

### 1. Streaming sentence segmentation — `src/speech/sentenceStream.ts`

The spoken reply cannot wait for the whole answer: the TTS queue is fed **sentence by
sentence while the answer is still generating**. `SentenceStreamer` consumes raw deltas
and emits each sentence the moment its terminator arrives, Arabic-aware:

- Terminators: `.` `؟` `?` `!` `؛` (the Arabic semicolon is a real pause; the Arabic
  comma `،` is too shallow and never cuts).
- **Digit-suspect dots are held one token**: a dot run that reaches the buffer edge with
  digits before it may be a decimal (`3.5`, `٢٠٢٦.١١`) or a list marker — the cut waits
  for the next token instead of splitting a number. `\p{Nd}` (not `\d`) so
  Arabic-Indic digits count as digits.
- List markers (`1.` `12.` `١.`) never become sentences; they fold into the next one.
- Newlines are boundaries when the next line is structural (heading, bullet, quote) —
  and the cut always advances past the newline (a stalled scan is worse than a plain cut).
- A fragment with **no letters/digits** (a stray `..` tail that streamed in after its
  sentence already cut) is dropped, never uttered.
- `MAX_PENDING_CHARS = 200`: a terminator-less answer still reaches the TTS, cut at the
  last word boundary.

### 2. The spoken-reply queue — `src/store/voiceOutStore.ts`

One session-scoped queue on top of the platform TTS engine (same engine the chat's
speaker button uses — no audio, no text, nothing leaves the phone):

- `begin()` opens the session (aborting anything still playing), `pushToken()` streams
  answer deltas into it, `speakNow()` queues composed texts (the plan announcement),
  `flushPending()` emits the tail when the answer lands, `abort()` stops and discards.
- **A dead session never speaks**: every push API is gated on the session flag, so
  deltas from an aborted run (the engine promise can outlive the cancel) stay silent;
  a monotonic session token invalidates stale utterance callbacks.
- `speakAnswer()` = non-streamed whole-text path (fallback answers), tail included.

### 3. The plan announcement — `planAckForSpeech()` in `src/store/agentStore.ts`

While the plan card renders, the user hears a short acknowledgment: step count, the
first step in the agent's own words, and the honest promise that anything that changes
data stops for confirmation first. It is deliberately the first sentence of the session
— the one the <3 s budget is measured against.

### 4. The latency budget, measured — `src/speech/latency.ts`

One meter per voice session records six stages: `recorded → transcribed → goalSent →
planShown → firstSentenceSpoken → answered`, and reports the two competition numbers:

| Number | Meaning | Target |
| --- | --- | --- |
| `timeToFirstSentenceMs` | end of speech → TTS received sentence 1 | < 3000 ms on the Infinix GT 30 |
| `totalMs` | end of speech → complete spoken answer | reported, no target |

Mic marks land in `voiceStore` (`recorded`/`transcribed`), agent marks in `agentStore`
(`goalSent`/`planShown`/`firstSentenceSpoken`/`answered`). A fresh recording session
resets the meter (no bleed from the last session); a **typed** goal starts its own
clean session via the mic-handoff check below.

### 5. The mic → agent handoff — `voiceStore.lastTranscriptAt` + `voiceHandoffFresh()`

A goal sent right after a transcription keeps the mic's latency marks so the report
covers the whole pipeline (speech → plan → spoken answer). A typed goal — or a
transcript left in the draft for over a minute — resets first. Deterministic, 60 s
window, table-tested.

### 6. The Saudi-dialect whisper path — `src/models/catalog.ts` + `src/models/localImport.ts`

- Catalog voice models: `whisper-tiny` (latency default, 75 MB) and **`whisper-small`**
  (accuracy step-up, 244 M params, 465 MB) — both multilingual, transcription language
  `auto`.
- **The Saudi-dialect fine-tune** (`oddadmix/whisper-small-arabic-dialectal-v2`,
  Apache-2.0) arrives through **local import**: a picked `.bin` file is fingerprinted
  (SHA-256), registered as a voice model with a `local://` URL and
  **`voiceLanguage: 'ar'`** pinned for transcription — detection on a dialect clip
  wastes a decode pass and occasionally misfires.
- The mic uses the model chosen on the models screen (**Use for mic** / *Active for
  mic* chip); the catalog tiny model is the fallback. Deleting a voice model releases
  the whisper context and clears the selection.

#### Conversion recipe (dialectal fine-tune → whisper.cpp ggml)

The fine-tune ships as HF weights, whisper.rn needs whisper.cpp ggml. One-time
conversion on a workstation:

```bash
git clone https://github.com/ggml-org/whisper.cpp && cd whisper.cpp
python3 -m pip install transformers torch
# Convert the fine-tune (openai/whisper-small architecture) to f16 ggml:
python3 models/convert-h5-to-ggml.py \
  <path-to-oddadmix-whisper-small-arabic-dialectal-v2> \
  ../whisper.cpp  openai/whisper-small
# (optional) quantize for a smaller footprint on the device:
./build/bin/quantize ggml-small-dialectal-f16.bin ggml-small-dialectal-q5_1.bin q5_1
```

The produced `.bin` is copied to the phone and imported (Models → Import from device).
The import accepts `.bin` explicitly for this path; everything else still rejects.

### 7. WER scoring for the Saudi evaluation — `src/speech/wer.ts`

The Phase-5 evaluation needs a word-error-rate that treats two transcriptions of the
same words as equal even when they disagree on diacritics, alef seats, ta-marbuta,
Arabic-Indic digits or punctuation:

- `normalizeWordsForEval()`: diacritics + tatweel stripped, `أإآٱ → ا`, `ى → ي`,
  `ة → ه`, `ؤ → و`, `ئ → ي`, Arabic-Indic/extended digits → ASCII, punctuation →
  spaces, lower-cased tokens.
- `werDetails()` — word-level Levenshtein **with backtrace**, reporting
  S/D/I separately so the report can say *how* the model failed, not just how much.
- `corpusWer()` — total errors ÷ total reference words over the sample set; empty
  references are unscored (null), never a fake zero.

## Tests

New suites, all table-driven and clock-injected:

- `sentenceStream.test.ts` (15) — Arabic terminators, decimal/list-marker traps,
  structural lines, overflow, fold/reset, streamed-vs-whole equivalence.
- `voiceOut.test.ts` (8) — streamed sentences, first-sentence latency mark, flush,
  abort discards pending + silences stale deltas, composed texts, language pick.
- `voiceLatency.test.ts` (7) — the two competition numbers, out-of-order marks,
  incomplete sessions report nulls, reset.
- `wer.test.ts` (15) — Arabic normalization table, S/D/I accounting, corpus aggregation.
- `planAck.test.ts` (5) — the announcement's three pieces, single/plural, <3 s shape.
- `voice.test.ts` (+8) — language pinning (`ar` vs `auto`), `lastTranscriptAt`,
  handoff freshness, meter reset per session, whisper-small catalog entry.
- `agentStore.test.ts` (+2) — plan announcement + streamed answer reach the speech
  queue without a chat-TTS replay; a fallback answer is spoken despite never streaming.
- `localImport.test.ts` (+6) — `.bin` voice imports: kind, GGML quant tag,
  `voice-local:` id, `voiceLanguage: 'ar'`.

## Known limits & next steps

- Wake-word/hands-free entry is tap-to-talk today; the wake-word listener is Phase 5
  scope (battery budget needs a real-device measurement first).
- WER numbers for the dialectal fine-tune are **not claimed** until the ≥100-sample
  Saudi eval set runs on-device (Phase 5) — the scoring code is ready, the samples
  are not yet collected.
- The `<3 s` target is engineered for (streaming segmentation + plan announcement
  first) but the number is **not claimed** until the target-device measurements of
  Phase 5; the meter exists precisely so the claim is measured, not guessed.
- The conversion recipe above is the documented path; the converted `.bin` and its
  SHA-256 land in the eval report once produced.
