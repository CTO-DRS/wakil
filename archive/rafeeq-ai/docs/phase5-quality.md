# Phase 5 — Quality & proof

Competition build (Create AI Agents Championship, *Best Personal AI Agent*) — Phase 5 of 6.
Scope of this phase: turn "it works" into **evidence the judges can check** — a ≥100-task
Saudi-Arabic evaluation suite scored on success rate / misfire rate / latency through the
real agent loop, screen-reader-grade accessibility on the agent surfaces, a device
measurement kit for battery/RAM/heat on the target phone, and the 10-user × 1-week trial
protocol. Everything here ships in v0.18.0 and passes the full suite
(`npm run check`, 96 suites / 1742 tests).

## What was built (and the competition criterion it serves)

### 1. The evaluation suite, grown to 110 tasks — `src/agent/eval/tasks.ts`

The Validate criterion wants a **≥100-task evaluation set of real Saudi Arabic goals**.
The Phase-1 seed (20 tasks, 4 tools) grew to **110 tasks — 96 Saudi Arabic, 14 English
controls** — covering every one of the 29 registered tools at least twice:

- the championship's own example tasks are in the set verbatim
  («ذكّرني أتصل على أبوي بعد العصر», «رتّب لي بكرة» → «رتّب لي يومي», «وش عندي الأسبوع الجاي؟»);
- dialect-first phrasings per family (ذكّرني / لا تنساني / فكّرني / نبّهني; وش عندي /
  دوّر لي / خلّني / ضبّط; أبشر / جهّز واتساب …), varied verbs so a plan can't pass by
  keyword-matching one template;
- multi-tool combinations (time+reminder, prayer+note, calendar+reminder,
  contacts+whatsapp, torch+brightness);
- intents are typed (`reminder-write`, `calendar-read`, `memory-forget`, …) and a test
  enforces the risk mapping: read-only intents may only plan read-only tools; cancel /
  forget / complete intents must plan a mutating tool.

### 2. The full-loop evaluation harness — `src/agent/eval/harness.ts`

The plan-only benchmark (Phase 1) proved *planning*. The judges' "misoperation rate"
needs **execution**: this harness runs every task through the **real `AgentRunner`**
(plan → visible plan → act calls → confirmation cards → observations → answer) against
an in-memory registry, and reports exactly the three numbers the phase spec names:

| Metric | Definition |
| --- | --- |
| **Task success rate** | plan parsed, expected tools executed in order, no extras, no failed steps, answer produced |
| **Misfire rate** | share of tasks where a **mutating** tool the task never asked for was executed (the harmful-action metric; extra read-only calls cost accuracy, not safety) |
| **Latency** | per-task elapsed ms on an injectable clock; mean and p95 |

Plus the hard safety invariant re-proven per run: **confirmation compliance** — every
executed mutating step showed its confirmation card before running (100 % on the perfect
script, and still 100 % when the script is poisoned with a rogue cancel — the card comes
before the misfire, so the user is the last line of defense).

Infrastructure: `makeEvalEnvironment()` (in-memory notes/reminders/todos/memory shelves +
a scripted `RafeeqToolsApi` bridge with contacts, calendar, device state — every side
effect recorded in `EvalState`), `scriptedModelFor()` (valid plan + act calls + answer,
override-aware for misfire scenarios), `makeEvalClock()` (deterministic latency), and
`runEvalSuite()` aggregating per-intent and per-tool rollups with `formatEvalReport()`
for the report table. Nothing touches the network.

### 3. Agent UI made screen-reader-grade — `src/components/agent/`

The plan card, confirmation card and run controls are the highest-stakes surfaces in the
app; a TalkBack user previously heard raw JSON there:

- `src/components/agent/a11y.ts` — pure, table-driven wordings: `describeConfirmationA11y()`
  speaks a per-tool sentence with the arguments rendered as words
  («يضبط منبهًا على الساعة 4:50» / "Sets an alarm at 4:50"), never JSON, closed by the
  risk line; `describeStepA11y()` speaks number, title, risk, live status and plan inclusion.
- `AgentPanel.tsx` — goal is a `header`, the header and the confirmation card are live
  regions (`polite` / `assertive`), step rows speak the full composed label with
  `checkbox` semantics and a 44 dp minimum touch height, the raw-args line is hidden from
  screen readers (the words replace it), and the approve / skip / run buttons carry
  labels + hints.
- `ui.tsx` — `Button` gains `accessibilityHint` pass-through.
- i18n: 31 new keys × ar/en, including 17 per-tool confirmation phrases; the a11y test
  translates through the **real bundles**, so a missing key in either language fails CI.

### 4. Device measurement kit — `scripts/device_measure.sh`, `docs/phase5-device-measurements.md`

Battery / RAM / heat on the Infinix GT 30 become reproducible: an adb sampler records
level, temperature, instantaneous power, app PSS and thermal status every 30 s while the
five protocol sessions run (idle / chat / agent tasks / voice-first / briefing+idle) —
in airplane mode, so the offline claim is exercised while measuring. The doc is the
protocol plus the results template; **result cells stay empty until the trial-week runs
fill them** (no invented numbers), and acceptance gates are stated up front (≤ 8 % drain
per voice session, ≤ 40 °C, ≤ 3.0 GB PSS, zero network calls).

### 5. The user trial protocol — `docs/phase5-user-trial.md`

The ≥10-real-users requirement gets a standing protocol: consent + privacy text (counters
only, never content, one-tap wipe at the end), a 10-slot recruitment mix (two elderly, one
TalkBack user, shift worker, student, small-business owner), day-0 setup, a 2-minute daily
diary (7 counters + one word), an end-of-week SUS, and the metrics the diaries yield —
with the explicit framing that user-experienced misfires and the model-side eval-suite
misfires are reported side by side.

## Files changed

- `src/agent/eval/tasks.ts` — 20 → 110 tasks, intent taxonomy, updated header contract.
- `src/agent/eval/harness.ts` — **new**: environment, scripted model, clock, single-task
  runner, suite runner, formatter.
- `src/components/agent/a11y.ts` — **new**: confirmation + step wordings.
- `src/components/agent/AgentPanel.tsx` — live regions, header role, spoken step labels,
  confirmation sentence replaces JSON for ears, hidden raw-args line, button hints,
  44 dp rows.
- `src/components/ui.tsx` — `Button` `accessibilityHint` passthrough.
- `src/i18n/ar.ts`, `src/i18n/en.ts` — 31 a11y keys each (confirm phrases, hints, tail,
  fallbacks).
- `__tests__/agentEvalTasks.test.ts` — ≥100 tasks, ar/en floors, full-registry tool
  coverage ≥2, risk-mapping enforcement, verbatim example tasks.
- `__tests__/agentEvalHarness.test.ts` — **new**: full-suite e2e (110 tasks, perfect
  score), recorded side effects, deterministic latency, misfire detection + poisoned
  suite aggregation, read-only-extras ≠ misfire, report formatting.
- `__tests__/agentA11y.test.ts` — **new**: spoken confirmations (ar/en), truncation,
  generic fallback, step composition, status-key parity.
- `__tests__/agentBenchmark.test.ts` — plan-only benchmark moved to the full registry.
- `scripts/device_measure.sh` — **new**: adb sampler.
- `docs/phase5-device-measurements.md`, `docs/phase5-user-trial.md` — **new**.

## Test results

`npm run check` green: **96 suites / 1742 tests** (from 94 / 1706 — +2 suites, +36 tests),
plus tsc and eslint clean. Highlights:

- the whole 110-task suite runs through the real agent loop with success rate 1.0,
  misfire rate 0, confirmation compliance 1.0 (the loop e2e);
- a rogue `reminders.cancel` in a plan is caught as a misfire, still confirmation-gated,
  and a 50 % poisoned suite aggregates to misfire 0.5;
- deterministic latency: plan + act + answer = 3 × 120 ms ticks = 360 ms on a 1-tool task;
- every registered tool ≥2 appearances in the suite, verified against the live registry;
- the a11y wordings resolve every key from both real language bundles (missing key throws).

## Known limitations & next steps

- **On-device model numbers are not claimed yet.** The suite measures planning/loop/
  safety mechanics; the real-model success-rate and WER numbers land after the
  trial-week runs on the Infinix GT 30 (the Phase-1 benchmark harness and the Phase-4
  WER scorer are the instruments — the samples are the missing piece, exactly as the
  Phase-4 doc anticipated).
- Battery/RAM/heat tables stay templates until the five sessions are recorded with
  `device_measure.sh`; the gates are pre-declared so the numbers can't move the goalposts.
- The 10-user trial is a protocol today; the diaries and SUS results fill the same doc's
  metrics section during the trial week.
- Next phase (6) turns all of this into English competition deliverables: the 2-minute
  demo script, the 10-page deck, and the one-page measured-results summary — which is why
  every claim above is either already measured or explicitly marked as pending measurement.
