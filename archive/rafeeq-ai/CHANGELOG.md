# Changelog

All notable changes to **Rafeeq AI** are documented in this file. The format loosely follows [Keep a Changelog](https://keepachangelog.com/) and versions follow [SemVer](https://semver.org/).

## [0.23.1] — 2026-11-12

The measure lab stops lying about time. The reported failure: start the S5 briefing session, follow its own protocol (ask the morning briefing — which means leaving the screen — then let it sleep), come back, stop — and the summary said «المدة 0:00» from a single row. Three real defects, fixed at the root.

### Fixed

- **The sampler moved out of the screen** (`src/measure/controller.ts`, new) — an app-level driver owns the 30 s cadence while a session runs, on any screen, so leaving the measure screen (S5's first protocol step) no longer kills sampling. It reconciles on every foreground return and app start: an in-window session gets its due sample, a session past its declared 30-minute deadline is auto-finished **at the deadline itself** (never a later wall time) with a notification. Nothing samples in the background — every row is still a real `readNow()` taken while the app is foregrounded.
- **Duration is wall-clock honest** (`src/measure/session.ts`) — `computeSessionSummary` takes the stored `startedAt → endedAt` span; a 30-real-minute session reports 30:00 even when the screen-off stretch left few rows. The new `coveragePct` (row span ÷ wall duration) is shown in the summary, with an explicit low-coverage note when the rows cover less than half the session — the gap is disclosed, never hidden.
- **A lone reading can no longer score «0 % drain, pass»** — the battery verdict now demands two real readings and a last reading that reaches the session end (within a 5-minute slack); sessions whose app died early get «—» instead of a fake pass. The CSV gains `wall_start`/`wall_end` lines so exported tables carry the wall span.

### Tests

- `measureSession.test.ts` — wall-duration + coverage pinned (including the reported lone-row S5 case), the end-reading rule, CSV wall lines. `measureStore.test.ts` — summary from stored wall span; killed-after-one-row session still reports 1,800 s. `measureController.test.ts` (new) — deadline math, due/not-due cadence, auto-finish at the deadline with honest summary.

## [0.23.0] — 2026-11-11

The smart onboarding: nine honest steps from a cold install to a personalized assistant — welcome, language & appearance, goals, dynamic follow-up questions, a recommendation engine, model selection, a permissions center, personalization and a reviewable summary. Every step writes to the stores the app already reads, every recommendation is built from real device facts, and nothing claims to run that cannot run.

### Added

- **The nine-step wizard** (`src/app/onboarding/` + `src/components/OnboardingShell.tsx`) — a shared shell draws the flow progress («step X of 9») and the skip affordance on every step; the welcome carousel joins it with the same track. Resume is real: each step persists `onboardingStep`, and the welcome screen redirects to it, so killing the app mid-wizard lands exactly where it stopped.
- **Language & appearance step** — Arabic/English with the existing instant i18n + single RTL-reload guard, plus the eight themes and follow-the-device applied live through the appearance store (v0.22's system, now in the first minute).
- **The 13 goals** (`src/onboarding/goals.ts`) — bilingual, glyphed, multi-select, «free use» exclusive; skipped goals stay empty and the engine falls back honestly.
- **Dynamic follow-ups** (`src/onboarding/profile.ts`) — experience, speed/accuracy/balance and answer style always; the «light or advanced models» question appears only when reasoning goals are picked. One question at a time, skip leaves defaults (never fake answers), and everything normalizes through `normalizeProfile` on rehydrate.
- **The recommendation engine** (`src/onboarding/recommendation.ts`) — pure and jest-pinned: all 13 goals map to six tracks, the first picked goal leads, and `pickModel` orders by the user's strength preference then cuts down by the RAM verdict («tight» runs, «insufficient» downgrades) and the free disk when known. It can only ever return the four integrated catalog chat models; image/video goals get the explicit "documented, not runnable on-device yet" note, and the whisper pair rides along as the honest voice companions.
- **The permissions registry** (`src/onboarding/permissions.ts`) — nine permissions Rafeeq's features actually use (notifications, microphone, location, biometric, contacts, calendar, call phone, DND policy, write settings), each with real `check`/`request`/`openPage` IO: expo-notifications, expo-location, PermissionsAndroid, expo-local-authentication, and the RafeeqTools native module's `permissionsStatus` + `openPermissionSettings` for the special-access pages. `usePermissionStates` re-reads on every foreground return, permanent denials route to the exact settings page, and nothing is requested in bulk — ever.
- **Model step rebuilt** (`path.tsx`) — the integrated chat models as size/RAM-badged cards with the engine pick marked; downloading starts the real transfer and records the default, and the wizard continues (the old "complete onboarding here" behavior is gone).
- **Personalization that lands in the model** — `chat/[id].tsx → sendOptions()` appends `styleDirective(profile, lang)` to the winning system prompt on both send and regenerate; the new `settings.animated` switch silences the aurora blobs and the bot's idle loops together with the OS reduced-motion preference; the two reminder switches drive the existing briefing/backup schedulers.
- **The summary** — every choice read live from its store, a per-row «edit» that jumps back to that exact step, then «Start your experience».
- **Settings: First-time setup** — the full Permissions Center (`/permissions`, all nine with status/reason/feature/exact page), «My goals & recommendations» (`/profile`: edit goals and answers, recompute, apply the recommendation to the default model), and «Rerun onboarding» — a dialog, then the wizard again with all data kept and the profile pre-filled.
- **Glyphs** — `LibraryIcons` grows sixteen stroke icons (book, doc, chart, bolt, layers, shield, grid, spark, bell, location, finger, contacts, calendar, phone, moon, gear) in the same hand-drawn language.
- **Bilingual copy** — i18n grows 143 keys per language (878 = 878, en/ar parity verified by the QA script; the dynamic `permissions.item.*`, `permissions.state.*` and `onboarding.reason.*` families are pinned by tests).

### Changed

- `OnboardingStep` widened to the nine-step flow (legacy persisted values still resolve); `settingsStore` persists the new `animated` flag.
- `src/onboarding/paths.ts` retired — the light/balanced/strong grouping is superseded by the goal-driven engine (its tests moved to the engine suite).

### Tests

- `__tests__/onboarding.test.ts`, `__tests__/onboardingRecommendation.test.ts`, `__tests__/onboardingPermissions.test.ts` — the step flow and resume, goals normalization, dynamic questions, engine mapping/priority/RAM-disk downgrades (pinned byte math) and honesty invariants, registry integrity with bilingual copy for all item and state keys, and the style-directive strings in both languages. Gate at delivery: tsc clean, eslint `--max-warnings=0` clean, jest `--ci` **85 suites / 1,340 tests green**, `qa_i18n.js` I18N CLEAN, `qa_routes.py` ALL ROUTES RESOLVE. Details in `docs/phase6-onboarding.md`.

## [0.22.0] — 2026-11-10

The arcade leaves, the appearance system arrives, and the Models tab grows a real library. A comprehensive UI/UX pass over the whole app: every screen now paints from one theme contract, the games section (2048, snake, gomoku, sudoku, memory, leaderboards, badges, the daily arcade, the sound module and their reminders) is fully removed with its plumbing retired cleanly, and the Models tab gains a documented model library beside the downloader.

### Added

- **Themes & Appearance** (`src/app/appearance.tsx`, `src/store/appearanceStore.ts`, `src/theme/themes.ts`) — eight built-in themes (Dark, Light, Premium Dark, Futuristic Glass, Glassmorphism, Cyberpunk, Neon, Minimal) plus a follow-the-device mode; every theme fills the same `Palette` contract the app already reads, so switching repaints every screen at once with zero per-screen work.
- **Custom colors with a live preview** — four overridable slots (primary, secondary→accent, background, card) with curated preset swatches, hex input with validation, and a preview card that renders a real slice of the app (bubbles, button, chip) with the pending colors before Apply commits them. Everything persists locally (`rafeeq.appearance.v1`) and re-validates on rehydration.
- **Launcher icon designs** — seven alternate adaptive icons (midnight, gold, glass, cyber, neon, mono, sunset) applied through activity aliases: the `withLauncherIcons` config plugin declares one alias per design (classic starts enabled), `RafeeqToolsModule.setLauncherIcon` flips them in the one safe order — enable the target *before* disabling the rest, so the launcher is never icon-less — and the picker shows generated thumbnails with the status re-synced from the OS on every focus. The manifest transform is idempotent and tested.
- **The model library** (`src/models/library/`) — twelve task categories (text & chat, STT, TTS, image, video, audio, image editing, image understanding, coding, 3D, translation, research) over `src/models/library/data.ts`: 42 real, publicly documented models with bilingual metadata — developer, license as the official page states it, I/O types, requirements, expected quality, limits, and a cost line that never invents prices. Two availability states keep it honest: **integrated** entries (the four GGUF chat models, the two Whisper voices, the built-in Saudi TTS) map to real download ids and real actions; **catalog** entries state plainly on their detail page that they are documentation-only, no fake runtimes or fake thumbnails.
- **Models tab redesign** — a "Model library" section above the download manager: free-text search across the whole registry (Arabic-normalized: hamza/alef/ta-marbuta/alef-maqsura variants stop hiding results) and one card per category (glyph, description, live model count). Category lists and full detail pages live at `models-category/[catId]` and `model/[id]`; integrated entries get real "download now / select & start" buttons wired to the same model and voice stores the tab already uses, plus the official page link everywhere.

### Changed

- **Games retired** — the entire `src/game/` tree, the game screens and components, the `rafeeq-sound` module, and their tests are gone. The shared reminder plumbing moved to `src/utils/reminderSchedule.ts` (the briefing, backup and trial-diary reminders keep working unchanged), the statscard mascot lives on in `src/utils/statscard/` for the usage-stats share card, and the backup format stays games-free and forward/backward compatible.
- The theme entry point (`src/theme/index.ts`) now dresses the theme-independent tokens (type, radii, motion) with the resolved palette from the appearance store; the splash follows the active theme so a themed cold start never flashes the wrong colors.

### Removed

- The games tab, all six games, leaderboards/badges/daily-arcade stores, the score-card pipeline and the sound-cues module — with every route, component and test that only they used.

## [0.21.0] — 2026-11-09

Models that never disappear. A device report — downloads frozen at "جارٍ التنزيل" and models gone after every update install — turned into two guarantees: model files move out of the app's internal storage into the shared **Download/Rafeeq** folder (which survives APK updates, uninstall/reinstall, "Clear data" and the aggressive cleaners Transsion phones ship), and a stalled transfer can no longer hang the UI forever. The install path itself was audited and is clean: the signing certificate is byte-identical across every release since v0.1.0, the package id and versionCode never moved backwards, and `Paths.document` is `context.filesDir` — so the only way models were lost was the data directory dying with the install, and that is now engineered away.

### Added

- **Public model storage** (`src/models/modelStorage.ts` pure decisions + `src/models/publicStorage.ts` IO) — when Android 11+ "All files access" is granted (one-time, via Settings — never silently), the models root becomes `Download/Rafeeq/`; otherwise the app behaves exactly as before. The root decision, the migration plan (missing-or-size-mismatch moves) and the stall predicate are pure and tested; the transport override plugs into the existing path pipeline (`expoTransport.setModelsRootOverride`) so downloads, hashing, imports and the native fastdl all follow automatically.
- **Safe migration** — two-pass, failure-proof: pass one copies and verifies every known model file into staging names; pass two (only when *all* copies verified) moves them into place and retires the internal originals. Any failure cleans the staging copies and keeps the internal root — a half-done migration can never look like a finished one, and no model file is ever deleted before its verified copy exists.
- **The stall watchdog** (`src/models/downloadManager.ts`) — a transfer silent past 45 s (dead socket, background kill that spared the JS thread) is auto-paused with its resume state preserved and flagged `autoResume`, instead of freezing the progress bar forever. A hashing heartbeat keeps the clock warm while a multi-GB file hashes (no network progress exists there by design), so hashing is never mistaken for a stall.
- **Auto-resume at startup** — downloads the *app* interrupted (a kill, a watchdog fire) resume themselves on the next launch from their saved/sidecar state; a deliberate user pause never does (`autoResume` distinguishes the two, `syncWithDisk` now splits the 'downloading' vs 'paused' restart paths accordingly).
- **Storage UI** — the Models screen grows the one-time "protect your models" banner (shown until the grant exists, refreshed on focus) and a "saved in Download/Rafeeq" chip once protected; Settings grows the "Keep models in Downloads" switch and the update-hygiene line: *install updates over the app without removing it — models, chats and settings stay saved*.
- **Native plumbing** (`modules/expo-rafeeq-tools/`) — `allFilesAccessStatus()`, `openAllFilesAccessSettings()` (app-specific All-files-access screen with a generic fallback) and `publicDownloadsDir()`; the manifest declares `MANAGE_EXTERNAL_STORAGE`, which the grant screen consumes.
- **Tests** (`__tests__/modelStorage.test.ts`, extended `__tests__/downloadManager.test.ts` and the modelStore block) — the root-decision matrix, migration plans, stall boundaries (fires exactly at the window), auto-pause with resume state, no-pause-while-flowing, the hashing heartbeat beating the watchdog, user pauses staying non-auto, and the store's interrupted-vs-user-pause split.

### Changed

- Version bumped to 0.21.0 (versionCode 22). `Paths.document` is pinned in comments to its ExpoModules `context.filesDir` source, and the model-storage docs note the public-root contract.

## [0.20.0] — 2026-11-09

Rafeeq learns to measure itself: the Phase-5 protocols stop being paper. The battery/heat/RAM sessions run as a one-tap in-app lab on the target device — a new native probe reads battery level, temperature, instantaneous power, app PSS, thermal status and charging state, the JS layer owns the cadence so the whole protocol stays pure and testable, the pre-declared acceptance gates evaluate from real rows, and the CSV export fills the results tables the docs kept as templates. The 10-user × 1-week trial gets its diary inside the app too — counters only, never content, SUS built in, nightly reminder, participant-owned CSV export. Post-Phase-6 hardening for the competition build (Create AI Agents Championship, Best Personal AI Agent).

### Added

- **The native measure probe** (`modules/rafeeq-measure/`) — one `readNow()` call returns one on-device sample: battery %, battery temperature (°C), instantaneous power (µA·µV → mW), this process's PSS (KB), the thermal status string (verbatim, API 29+), charging state and device model. Read-only; every unavailable surface degrades to null, never a crash; the JS bridge keeps the module optional like every other one.
- **The measure lab** (`src/app/measure.tsx`, `src/measure/session.ts`, `src/store/measureStore.ts`) — the five protocol sessions (idle / chat / agent tasks / voice-first / briefing+idle) with the docs' pre-declared gates (S1 < 2 %, S4 ≤ 8 %, ≤ 40 °C, ≤ 3.0 GB PSS, unplugged) evaluated per session from real rows; a live probe card, per-session summaries, and a CSV export in the exact shape the results tables paste from. Battery verdicts are withheld on too-short sessions instead of guessed.
- **The trial diary** (`src/app/trial-diary.tsx`, `src/trial/diary.ts`, `src/store/trialStore.ts`) — the nightly counters-only form (tried / completed / rephrased / wrong / minutes / voice / one word), the standard SUS questionnaire with canonical scoring (odd statements positive, even negative, sum × 2.5), the weekly metrics (completion rate, user-experienced misfire rate, confirmation-card coverage, time-on-task trend), a nightly 21:30 reminder riding the same reminder-sync contract as briefing and backup, and a counters-only CSV the participant shares if and when they choose.
- **Tests** (`__tests__/measureSession.test.ts`, `__tests__/measureStore.test.ts`, `__tests__/trialDiary.test.ts`) — gate logic, sample normalization, CSV shapes, SUS vectors (100 / 50 / 87.5), week aggregation, and the stores' bounds and caps.

### Fixed

- **A wall-clock leak in `reminders.list`** (`src/agent/reminders.ts`) — the "upcoming" filter read the raw `Date.now()` while the tool's `ToolContext` carries an injected clock, so the fixture suite silently emptied its shelf the day the real calendar crossed the fixture date (surfaced on 2026-11-09, one day after v0.19.0's green run). `summarizeReminders` now takes `nowMs` (defaulting to the real clock) and the tool passes `ctx.now()` — deterministic where determinism is promised.

### Changed

- Settings grows a **Measurements & trial** section pointing at both screens; `docs/phase5-device-measurements.md` and `docs/phase5-user-trial.md` now name the in-app lab/diary as the primary measurement path (the adb script and the paper diary remain the fallbacks).
- Version bumped to 0.20.0 (versionCode 21).

## [0.19.0] — 2026-11-08

The submission package: all four English competition deliverables are committed under `docs/competition/` and attached as release assets. Every number in them is either measured in this repository or explicitly marked as pending measurement with pre-declared gates — the same evidence discipline the product preaches is the discipline the pitch practices. Phase 6 of the competition build (Create AI Agents Championship, Best Personal AI Agent).

### Added

- **Pitch deck** (`docs/competition/Rafeeq-Pitch-Deck.pptx`) — 10 slides in the required order: problem, who it serves, solution (agent loop), live demo, privacy-as-architecture, measured results with the honesty band, business model, roadmap, team & ask. Bilingual brand touches (رفيق) over an English narrative.
- **Measured results summary** (`docs/competition/Rafeeq-Results-Summary.pdf`) — one page: the 110-task eval through the real loop (success 1.0 · misfire 0 · confirmation compliance 1.0, scripted harness), 1,742 tests / 96 suites, ≤1 min prayer-time deviation vs published Riyadh tables, the 5-candidate Q4_K_M benchmark table with its pre-declared decision rule, and the full pending-measurement register.
- **Business model** (`docs/competition/Rafeeq-Business-Model.pdf`) — one page: free core → premium skill packs → B2B licensing (telcos, OEMs, data-residency-bound programs), with pricing explicitly declared unmeasured.
- **Demo video script** (`docs/competition/Rafeeq-Demo-Video-Script.docx`) — 2-minute shot list + voice-over: five real tasks in airplane mode from the eval-suite families (reminder, alarm, briefing, WhatsApp draft, torch + brightness), with production notes that forbid filming unmeasured claims.
- **Deliverables index** (`docs/competition/README.md`) — what each artifact claims and which repo doc backs it.

### Changed

- Version bumped to 0.19.0 (versionCode 20); CI builds the signed APK for this tag as the finals-ready artifact.

## [0.18.0] — 2026-11-08

Rafeeq learns to prove itself: the evaluation suite grows from 20 to 110 real Saudi-Arabic tasks covering all 29 tools, a full-loop harness scores success rate, misfire rate and per-task latency through the real agent loop (and re-proves the confirmation invariant on every run), the agent's plan and confirmation cards become screen-reader-grade with arguments spoken as words instead of JSON, and the battery/RAM/heat measurements plus the 10-user × 1-week trial get reproducible protocols. Phase 5 of the competition build (Create AI Agents Championship, Best Personal AI Agent).

### Added

- **The Phase-5 evaluation suite** (`src/agent/eval/tasks.ts`) — 110 tasks, 96 Saudi Arabic + 14 English controls, every registered tool covered at least twice: the championship's example goals verbatim («ذكّرني أتصل على أبوي بعد العصر»), dialect-first varied phrasings per tool family, multi-tool combinations, and a typed intent taxonomy with a risk-mapping test (read-only intents may only plan read-only tools; cancel/forget/complete intents must plan a mutating one).
- **The full-loop evaluation harness** (`src/agent/eval/harness.ts`) — every task runs through the real `AgentRunner` against an in-memory registry (scripted native bridge, seeded shelves, every side effect recorded): **task success rate** (plan valid, expected tools executed in order, nothing failed, answer produced), **misfire rate** (a mutating tool the task never asked for actually ran — extra read-only calls cost accuracy, never safety), **per-task latency** (mean/p95 on a deterministic injected clock), plus the hard invariant re-proven per run: every executed mutating step showed its confirmation card first. Aggregate rollups per intent and per tool; `formatEvalReport()` renders the table for the report.
- **Screen-reader-grade agent surfaces** (`src/components/agent/a11y.ts`, `AgentPanel.tsx`) — the confirmation card speaks a per-tool sentence with arguments rendered as words («يضبط منبهًا على الساعة 4:50» — never raw JSON) closed by the risk line; step rows speak number, title, risk, live status and plan inclusion with checkbox semantics; the goal is a header, the header and confirmation card are live regions (polite/assertive), the raw-args line hides from screen readers, approve/skip/run carry labels and hints, rows hit 44 dp. 31 new i18n keys per language, enforced by a test that translates through the real ar/en bundles (a missing key fails CI).
- **The device measurement kit** (`scripts/device_measure.sh`, `docs/phase5-device-measurements.md`) — an adb sampler (level, temperature, instantaneous power, app PSS, thermal status every 30 s) and the five-session protocol (idle / chat / agent tasks / voice-first / briefing+idle) run in airplane mode, with pre-declared acceptance gates (≤ 8 % drain per voice session, ≤ 40 °C, ≤ 3.0 GB PSS, zero network calls) and results tables that stay templates until the real runs fill them.
- **The user-trial protocol** (`docs/phase5-user-trial.md`) — ten participants × one week on their own phones: consent and privacy text (counters only, never content, one-tap wipe at the end), a deliberate recruitment mix (elderly, TalkBack user, shift worker, student, small-business owner), a 2-minute daily diary, end-of-week SUS, and the metrics it yields — user-experienced misfires reported side by side with the model-side eval numbers.
- **The phase report** (`docs/phase5-quality.md`) — what was built and the competition criterion each piece serves, files changed, test results, and the honest limits (model-side success/WER numbers and the measurement tables land after the trial week on the Infinix GT 30).

### Changed

- The plan-only benchmark (`__tests__/agentBenchmark.test.ts`) runs against the full 29-tool registry, matching the grown suite.
- `Button` (`src/components/ui.tsx`) passes `accessibilityHint` through to the underlying pressable.

## [0.17.0] — 2026-11-08

Rafeeq learns to answer out loud: a Saudi-dialect goal becomes a spoken reply that starts while the answer is still generating, the plan is announced over the plan card, the first spoken sentence is engineered to beat the 3-second budget on the target device, and the whole voice pipeline is metered so the number is measured, never guessed. The Saudi-dialect whisper fine-tune now imports as a first-class voice model with Arabic pinned for transcription, and the WER scoring the evaluation will need is ready with the Arabic normalization it depends on. Phase 4 of the competition build (Create AI Agents Championship, Best Personal AI Agent).

### Added

- **Streaming sentence segmentation** (`src/speech/sentenceStream.ts`) — the spoken reply is fed to TTS sentence by sentence while the answer is still generating. Arabic-aware: `؟ ! ؛` and the full stop cut; the Arabic comma never does; digits-suspect dots (`3.5`, `٢٠٢٦.١١` — `\p{Nd}`, not `\d`) are held one token instead of splitting a number; list markers (`1.` `١.`) fold into the next sentence; a fragment with no words (a stray `..` tail) is dropped, never uttered; a terminator-less answer still speaks, cut at the last word boundary past 200 chars.
- **The spoken-reply queue** (`src/store/voiceOutStore.ts`) — one session-scoped queue over the platform TTS engine (the same one the chat speaker button uses): `begin`/`pushToken`/`speakNow`/`flushPending`/`abort`, with a session flag and a monotonic token so a dead session never speaks and stale deltas from an aborted run stay silent. The plan announcement (`planAckForSpeech` in `agentStore`) is the first sentence the user hears — step count, the first step in the agent's own words, and the promise that data-changing steps stop for confirmation first.
- **The voice latency budget, measured** (`src/speech/latency.ts`) — six marks per voice session (`recorded → transcribed → goalSent → planShown → firstSentenceSpoken → answered`) reporting the two competition numbers: **time to the first spoken sentence** (the <3 s target on the Infinix GT 30) and the total pipeline time. Mic marks land in `voiceStore`; a fresh recording resets the meter, and a typed goal starts its own clean session through the mic→agent handoff check (`voiceHandoffFresh`, 60 s window).
- **The Saudi-dialect whisper path** — the catalog grows a `whisper-small` accuracy step-up (244 M params, 465 MB) beside `whisper-tiny`; local import now accepts **`.bin`** whisper.cpp voice models (SHA-256 fingerprinted, `local://` registered, `voiceLanguage: 'ar'` pinned so transcription never wastes a detect pass on the dialect fine-tune `oddadmix/whisper-small-arabic-dialectal-v2`, Apache-2.0). The mic transcribes with the model chosen on the models screen (**Use for mic** / *Active for mic*); the catalog tiny model is the fallback; deleting a voice model releases the context and clears the selection. The conversion recipe (HF fine-tune → ggml, optional quantize) is documented in `docs/phase4-voice.md`.
- **WER scoring with Arabic normalization** (`src/speech/wer.ts`) — word-error-rate for the Phase-5 evaluation: diacritics and tatweel stripped, alef seats unified, ta-marbuta/hamza seats normalized, Arabic-Indic digits to ASCII, punctuation to spaces; word-level Levenshtein **with backtrace** reporting substitutions/deletions/insertions separately, plus corpus aggregation where empty references are unscored (null), never a fake zero.
- **A fallback answer is still spoken** — when the model cannot compose an answer (timeout/error), the deterministic fallback reaches the speech queue too: the finalize pass compares the answer with what actually streamed and speaks the difference, so a voice session never ends in silence. The chat-side auto-speak is skipped for voice-out sessions (`silentSpeak`) so the reply is never replayed from the top.
- **Phase-4 documentation** (`docs/phase4-voice.md`) — the segmentation rules, the queue's session semantics, the latency budget, the conversion recipe, and the honest limits (wake-word and the real-device numbers are Phase-5 scope; nothing is claimed before it is measured).

## [0.16.0] — 2026-11-08

Rafeeq stops forgetting: it now keeps a long-term memory of your preferences, people and routines — every record readable, editable and deletable by you — retrieves it on-device with Arabic-aware lexical ranking (an embedding engine rides the same contract), composes a morning briefing from today's calendar, reminders, prayer times and tasks, and nudges you with chips computed from local data only, with one switch to turn the whole thing off. Phase 3 of the competition build (Create AI Agents Championship, Best Personal AI Agent).

### Added

- **The memory shelf** (`src/agent/memory.ts`) — up to 300 records of four kinds (`preference`, `person`, `routine`, `fact`), KV-backed like notes and todos, never leaving the phone. Saving the same fact again refreshes the record instead of stacking copies; over-long text is capped, not rejected. The new `/memory` screen lists every record with its kind and provenance (`Rafeeq learned this` / `You wrote this`), one-tap edit and delete, and a **Forget everything** wipe — user-owned memory is the competition's data-protection rule made real.
- **Four new agent tools** (`src/agent/tools/memory.ts`, `tools/briefing.ts`) — `memory.save` and `memory.forget` behind the confirmation card (a vague forget that matches several memories refuses and lists them instead of guessing), `memory.search` read-only with ids for `memory.forget`, and `briefing.today` — «وش عندي اليوم؟» in one step. The registry grows from 25 to 29 tools; the catalog still renders under 6.5 KB per prompt, enforced by test.
- **On-device retrieval** (`src/agent/retrieval.ts`) — an Arabic-aware lexical engine (diacritics, alef/ta-marbuta/yeh unification, Arabic-Indic digits, Saudi-colloquial stopwords, light prefix stripping so «الشغل» finds «شغلي») merged with a pure cosine embedding ranking behind one `EmbeddingClient` contract; retrieval always works and degrades silently to lexical when no embedding model is loaded. The loop takes an optional `knownContext` hook: the top-3 matching memories are injected into the plan and answer prompts, so plans can lean on what Rafeeq already knows.
- **The morning briefing** (`src/agent/briefing.ts` + `tools/briefing.ts` + `briefingReminder.ts`) — a pure composition over today's calendar events, today's user reminders (overdue flagged honestly), the remaining prayer times (GPS fix → Riyadh, tz-aware rendering) and open tasks (overdue → due-today → undated, capped at five). One repeating daily notification reconciled with the settings (07:00 default); `briefingForSpeech` renders the same sections as natural sentences for the offline Saudi TTS.
- **Proactive suggestions** (`src/agent/suggest.ts` + `src/hooks/useAgentSuggestions.ts`) — five deterministic rules over local data only (overdue tasks, a prayer inside 30 minutes, today's events, tasks due tonight, today's reminders), capped at three chips above the composer; tapping fills the composer for review — the agent still plans and asks approval before acting. The `agentSuggestions` switch computes nothing when off.
- **The Agent settings section** — briefing switch with an hour/minute stepper, the suggestions switch, a Manage-what-Rafeeq-remembers entry, and a live memory count. New persisted settings: `briefingEnabled`, `briefingTime`, `briefingReminderId`, `agentSuggestions`.
- **Phase-3 documentation** (`docs/phase3-memory.md`) — the architecture, the retrieval method, the privacy accounting, and the deferred decisions (the embedding-model hookup rides the Phase-5 device benchmarks so the RAM choice is measured, not guessed).

## [0.15.0] — 2026-11-08

The agent learns to touch the phone itself: twenty-one new tools take it out of the notepad and into the dialer, the clock, the calendar and the notification shade — every one of them still local, still behind the confirmation card when it changes anything, and every failure still explained in the user's own Arabic. Phase 2 of the competition build (Create AI Agents Championship, Best Personal AI Agent).

### Added

- **A native phone-tools module** (`modules/expo-rafeeq-tools`, Kotlin) — one Expo module holding the whole Phase-2 device surface: contact search over the device's own contacts database; dialing (`ACTION_CALL` when the permission is granted, the pre-filled dialer otherwise); SMS and WhatsApp drafts that open with the text ready and **always leave the send button to the user**; alarms and timers through the device clock app; calendar reads via the Instances table (recurring events expand correctly), event creation and event moves through the calendar provider; the torch, Do Not Disturb, screen brightness and the Android 10+ connectivity settings panel. Every method resolves a structured result instead of throwing — `{ok, code}` codes like `PERMISSION_CONTACTS` or `NEED_POLICY_ACCESS` are translated once, into honest Arabic observations the agent can speak.
- **Twenty-one new agent tools** (`src/agent/tools/`) — `contacts.search`, `contacts.call`, `messages.sms_draft`, `messages.whatsapp_draft`, `alarms.set`, `timers.set`, `calendar.events`, `calendar.create`, `calendar.move`, `device.torch`, `device.dnd`, `device.brightness`, `device.wifi_panel`, `reminders.create`, `reminders.list`, `reminders.cancel`, `todos.add`, `todos.list`, `todos.complete`, `prayer.times`, `prayer.reminders_set`. Every argument passes through pure normalizers first (`tools/normalize.ts`): Arabic-Indic digits become ASCII, phone numbers shed spaces/dashes/zero-width characters, local ISO timestamps (`2026-11-09T08:30`, seconds optional, `T` or space, Arabic digits accepted) are parsed with a round-trip check that rejects impossible months, timer lengths are clamped to 5 s–24 h, and quote/backslash/control characters are stripped from every free-text field so the grammar's string rules and reality always agree. The registry grows from four tools to twenty-five; the catalog still renders under ~6.5 KB per prompt, enforced by test.
- **Reminders as a real capability** — `reminders.create` takes exactly one time form (ISO or minutes-from-now; both or neither is a specific error the model can fix), rides expo-notifications DATE triggers behind the injectable `AgentReminderIO`, lists pending reminders with ids, and cancels by id. The flagship competition sentence — «ذكّرني أتصل على أبوي بعد العصر» — is now a confirmed, scheduled, honest-to-goodness notification.
- **Offline prayer times** (`src/agent/prayer.ts`) — a pure solar-position implementation of the Umm al-Qura convention (Fajr 18.5°, Isha = Maghrib + 90 min, Shafi'i Asr), zero network, one lat/lng pair in, six Date objects out. The location chain is device GPS (non-prompting — if the permission isn't already granted the tool never interrupts the run) → named Saudi city (12 cities with Arabic aliases) → Riyadh. `prayer.times` reports today or any day this week; `prayer.reminders_set` schedules the next five prayers as one-shot notifications and replaces its own previous reminders so they never stack. The Riyadh fixtures for 2026-11-01/08/20 land within a minute of the published tables (±5 min tolerance documented against the spread between published implementations).
- **Local todos** (`src/agent/todos.ts`) — the second mutating shelf beside the notes: add with an optional due time, list open items with their ids, complete by id, capped at 200, KV-backed and never leaving the phone.
- **Phase-2 documentation** (`docs/phase2-phone-tools.md`) — the tool table with permissions and risk classes, the permission strategy (confirmation card first, runtime permission at use, structured failure codes), the prayer-time method and its validation, and the Android-version notes (Wi-Fi panel on 10+, DND policy access, write-settings).

## [0.14.0] — 2026-11-07

Rafeeq stops being only a chat app and becomes an agent: a goal spoken or typed in Saudi Arabic becomes a visible plan, the plan calls on-device tools, anything that changes data stops for an explicit confirmation card first — and every plan and tool call is forced through a grammar so a small local model simply cannot emit broken JSON. Phase 1 of the competition build (Create AI Agents Championship, Best Personal AI Agent).

### Added

- **The agent loop** (`src/agent/loop.ts`) — understand → plan → approve → execute → observe → answer. The plan is proposed by the model, shown on a card the user can edit (tap any step to drop or restore it) and cancelled outright; read-only steps run directly, mutating steps wait for a per-step confirmation card showing the tool and its arguments; each tool result becomes an observation that feeds the next step and the final answer, and the answer always lands in the conversation as a normal assistant message. Every stage is bounded — max 6 plan steps, max 8 executed steps, a 14-call LLM budget, a per-call and per-tool wall-clock budget, an overall deadline and exactly one retry per structured call — so the loop can never spin forever, and a deterministic fallback answer is composed from the observations whenever the model cannot.
- **Grammar-constrained decoding** (`src/agent/grammar.ts`) — hand-built GBNF generators for the plan envelope and per-tool call envelopes, passed to llama.rn's grammar-based sampling on every structured call. Strings exclude quotes/backslashes/control characters (Arabic arguments never need them), enums become literal alternations, required arguments are locked in order and optional ones appear at most once — malformed tool calls are impossible at the sampler level, and a strict validator (`schema.ts`) still re-checks types, required and unknown keys before any tool runs.
- **Phase-1 tools** — `time.now`, `device.model_info` (read-only) and `notes.create`, `notes.list`: local notes are the first mutating capability, stored in the on-device KV shelf (200-note cap, over-long fields capped not rejected), gated behind the confirmation card, and the registry/confirmation policy/catalog rendering are all pure and table-driven tested. Phase 2 grows this registry with the native Kotlin tools (alarms, reminders, calendar, contacts…).
- **Agent mode in the chat composer** — a compass toggle switches the composer into agent mode (goal placeholder, explanation banner, and the plan card mounted above the composer). The session shows live per-step statuses (pending / awaiting approval / running / done / failed / skipped), the mutating badge on every risky step, the confirmation card with a JSON preview of the arguments, and the final answer; a second goal is refused while one runs, and cancelling lands a polite note in the conversation. Fully bilingual (ar/en), accessibility-labelled, RTL-native.
- **The model benchmark** — a 20-task golden set of real Saudi Arabic goals (plus four English controls) in `src/agent/eval/tasks.ts`, a harness (`benchmark.ts`) that scores each candidate on plan-JSON validity, ordered tool-choice accuracy and plan latency (mean/p95) through the very same plan prompt and grammar the loop uses, and `docs/agent-model-benchmark.md` documenting the five Q4_K_M candidates for the 8 GB target device, the decision rule, the on-device procedure and the licenses. CI validates the harness arithmetic against scripted models; the device table lands with the Phase-5 report.

## [0.13.0] — 2026-11-07

The arcade learns to account for itself and to mind the calendar: one unified stats panel for every game, a monthly nudge to export a fresh backup, a champion who foresees your threats before they form, and a marathon ritual that renews itself every Monday.

### Added

- **Unified games stats** — a new panel under the badge shelf totals the whole arcade: **play hours and finished rounds** per game plus the grand totals, and two **play curves** — gomoku and memory daily minutes over the last fourteen days, zero-filled, oldest left, drawn as SVG polylines with legend chips and a clear button. Every game store now feeds a capped on-device log (`rafeeq.game.stats.v1`): time slices accrue from each action and tick (a backgrounded gap never bills more than a minute), and one marker lands per finished round — 2048 boards, snake deaths and race finishes, memory clears, sudoku solves, five-in-a-rows, hot-seat wins included. The whole panel is pure aggregation (`summarizeGameStats`, `gameDailyMinutes`, `curvePoints`), table-driven tested, and nothing ever leaves the phone.
- **Scheduled backup reminder** — a month (thirty days) after the last **full** export, one local notification — «حان وقت النسخ الاحتياطي» — nudges the user to export a fresh one, firing an hour after a sync first notices the overdue stamp and then holding a **cooldown week** so an ignored nudge never stacks. The Settings data card shows the age of the last full export («آخر نسخة كاملة: قبل {{days}} يوماً»), turns red while overdue, and carries a switch (on by default, permission-checked without prompting); a fresh full export restarts the clock and retires the pending notice. The rules are one pure planner (`backupReminderPlan` + `syncBackupReminder`) over the same injectable `ReminderIO` the daily reminder rides, fully table-driven tested; a device that never exported stays quiet until its first export starts the clock.
- **Champion five-in-a-row** — solo play grows a third level, «بطل 15×15»: the roomiest board yet against the strongest opponent, which keeps every expert reflex (immediate wins, open fours and open threes answered before they grow) and adds two of its own — it **builds** its own open fours and threes when nothing demands defense, and when it cannot build it **forecasts**: `forecastThreatCell` finds the cell the player is about to turn into an open-ended line and occupies it *before the threat ever forms*. Champion wins keep their own leaderboard shelf and light their own career badge — the shelf is now **ten**, with the champion chip drawn gold with navy stones on every share card — and v4 saves migrate with a fresh deal of the matching size.
- **Weekly marathon ritual** — the marathon card grows a weekly challenge: the ISO week (`2026-W45`) seeds a deterministic deal, so every device — and every retry, since «لعبة جديدة» replays the same board all week — starts from the exact same three foods and rival positions, a date seed stretched to a seven-day rhythm like the daily puzzle's. Weekly rounds post to the week's own leaderboard shelf (`snake.marathon.week.2026-W45`) that resets itself every Monday with the fresh deal, the card shows the running week, this week's best and a start button, and v5 saves migrate knowing nothing of the ritual yet.

## [0.12.0] — 2026-11-07

The marathon begins and the progress follows you: an endurance run with two rivals and three foods on the same 20×20 arena, the archive's weekly average riding every streak card as a line of documented times, two more career badges on the now-full nine-tile shelf, and the whole arcade progress — archive and badges alike — travelling inside the full backup file.

### Added

- **Snake marathon mode** — the race card grows a third switcher stop: «ماراثون» keeps the roomy 20×20 arena but turns the run into an endurance contest — **three foods** live on the board at once and **two rivals** race the player for them, each hunting the food nearest to its own head so the pack spreads out instead of stacking on one cell. Both rivals share the selected strength — the hesitating «متعثّر» stumbles on its turns (per-rival stall flags, never two pauses in a row) and the intercepting «محترف» commits instantly — and a food eaten by anyone respawns immediately, so the shelf never drops below three until the board itself fills. The marathon asks for the double target: **two hundred points** crowns a winner; a death ends the round and a same-tick pile-up goes to the higher score. The pure engine rides the race's own `advance` primitive generalized to a food shelf, every rival streaks and stalls under the injected `rand` (fully table-driven tested), wins post to their own shelves — `snake.marathon` and `snake.marathon.pro` — the fifty-point margin badge reads the leading rival, and v4 saves migrate from the race-only world with a fresh deal.
- **Archive statistics — the weekly average and the time-evolution line** — the streak share card grows an archive block: the last seven days' documented best times drawn as a line across the card (a gap breaks the line at an untimed day, the week's fastest day lights gold when it stands alone), with the weekly average printed under it in the language-neutral `AVG mm:ss` form — the 5×7 bitmap font learned the colon, V and G for the occasion. A timed day lifts the medal panel, badge row and week trail to make room; with nothing documented the classic card keeps its old layout pixel for pixel. The archive card itself now shows the weekly summary too — «متوسط الأسبوع» beside the week's best time — from the same pure `weeklyArchiveStats` aggregation: only timed days join the series, so an untouched week reads as an empty stat, never a zero average.
- **Two more career badges — the shelf is now nine** — «سلسلة جوموكو ٧ أيام» lights when the device falls on seven consecutive days: a solo win on any level extends the win-day calendar (the gomoku store grew `lastWinDayKey`/`winDayStreak`/`bestWinDayStreak` in v3, sharing the daily puzzle's streak-after rule), a lost game never breaks the run and only a day without a win does; «عشرة ألغاز بلا أخطاء» lights on the tenth lifetime mistake-free daily solve — the badges store grew the flawless counter in v2, replays never feed it, and the first badge lights at one exactly as before. Both ride every share card as their own chip (a green ten, a violet stone-diagonal seven), the shelf wraps into its third full row of three, and archive replays still touch neither record.
- **Arcade progress inside the full backup** — the full export grows to **formatVersion 3** with an `arcade` block: the daily-puzzle archive with every documented time, the earned badge shelf with its dates, the lifetime flawless-solve count and the gomoku win-day calendar. The importer merges instead of replacing: badges join the shelf and never un-earn (a badge present on both keeps its earlier, true first-light date), the archive merges day by day — the faster best time, the fewer best mistakes, the higher attempt count, the earlier first solve — the flawless counter takes the higher count, and the win-day calendar keeps the fresher history and the higher record. Every merge rule is a pure, table-driven planner (`planBadgeImport`, `mergeDailyArchive`, `mergeGomokuWinDays`), a half-broken block still restores what it can, older files import exactly as before, and the restore dialog reports «استُعيد تقدّم الألعاب: الأرشيف والشارات» when the file carried the block.

## [0.11.0] — 2026-11-07

The race grows teeth and the archive grows memory: two rival strengths on a roomier snake arena, the last seven days of daily puzzles kept with their documented times, four more career badges on the shelf, and a reminder polite enough to stay quiet when you have already solved the day.

### Added

- **Snake race difficulty levels + a 20×20 arena** — the race card grows a rival-level switcher: «متعثّر» (the struggler) chases the food greedily but stumbles on every turn, pausing one tick before committing to a new heading — and never two pauses in a row, so it can never freeze; «محترف» (the pro) weighs the player's head equally with the food, arcs across the road between you and the meal, and commits instantly. The race itself moves to a roomy 20×20 board (the classic solo run keeps its 15×15), each strength posts to its own leaderboard shelf — `snake.race` and `snake.race.pro` — so records stay honest, and switching levels deals a fresh race. The stalling rule lives in the pure engine: a persisted `rivalHesitated` flag makes every tick deterministic under the injected `rand`, fully table-driven tested.
- **Daily puzzle archive — replay the last seven days** — the daily 16-square puzzle grows an archive card: one row per day for the last seven, each with its documented solve time (the archived best), an attempt counter once you replay, and a «إعادة لعب» button. A replay deals that day's puzzle into its own session with its own clock — the live day's board, progress and mistakes stay untouched behind it — and solving it files the time into the archive only: no streak, no leaderboard, no badges, ever. The first solve of every day (from this version on) lands in the archive automatically, and `ensureToday` clears a stale replay at the midnight rollover.
- **Four more career badges** — the shelf grows from three to seven: «فوز جوموكو: عادي» for your first five-in-a-row win on the classic 9×9 board, «فوز جوموكو: خبير» for the first on the expert 13×13, «ذاكرة مثالية» for clearing a memory board without a single failed try (perfect games are `moves === matchedPairs`, zero new state), and «سباق بفارق ٥٠» for winning a snake race by fifty points or more — on either rival strength. Each keeps its earned-on date, never un-earns, and rides every share card as its own chip: a stone diagonal on violet for the classic win, gold on navy for the expert one, a cyan matched pair for the perfect memory, an orange 50 for the dominant race. The shelf now wraps into rows of three.
- **Smart reminder** — the daily «سلسلتك تنتظرك» notice learns manners: solve the day's puzzle *before* its scheduled time and today's occurrence is muted automatically — the sync cancels the repeating trigger and re-arms the next two days as one-shots, so the streak notice only ever fires when the streak is actually waiting. Solve after it fired, and nothing changes. The whole decision is a pure plan resolver (`off` / `repeat` / `mute-today`) over the schedule settings and the solve state, applied by one `syncSmartReminder` entry point that every caller shares — the Settings switch, the solve moment, and the app start — so exactly one schedule shape exists at a time (ids are stored as a list now, migrated from v1). The reminder also records the IANA zone it was scheduled under and re-syncs on every start: a timezone move re-anchors the schedule to your local hour automatically, and an automatic sync checks permissions without ever prompting.

## [0.10.0] — 2026-11-07

The arcade learns to celebrate a career: achievement badges that ride on every share card, a rival snake that races you for the same food, the usage dashboard sharing itself as art, and a daily nudge that keeps your streak alive.

### Added

- **Achievements and badges** — three career badges light up in a new shelf under the arcade: «First 2048» for building the 2048 tile on any board, «Flawless puzzle» for solving a daily 16-square puzzle with zero mistakes, and «30-day streak» for thirty straight solved days. Each badge keeps the date it was earned on, never un-earns, and — the point of the shelf — rides on every share card: the score and streak cards now draw the earned chips (the gold 2048 tile, the green check, the violet 30-flame) under the medal podium, language-neutral as always.
- **Snake race against the device** — the snake grows a mode switcher: «Classic» keeps the walls-and-tail run, and «Race the device» drops an automated rival snake onto the same board chasing the same food. The rival is the gomoku opponent's architecture on the snake grid — a pure, deterministic turn picker that never reverses into its neck, avoids its own body and steers by food distance with `rand` breaking exact ties. One shared food, first to 100 points wins, a death ends the round (a same-tick double death goes to the higher score), the rival renders in the danger tone with its own score box, and race rounds post to their own leaderboard shelf.
- **Share the usage stats as an image** — the model-usage dashboard gains a «Share stats» button that renders the same 720×960 raster family as the game cards: Rafeeq bot up top, three big number columns (runs / tokens / models), the activity bars for the dashboard's current 7- or 30-day span with the peak day lit, edge dates under the chart and the brand footer. Model names stay off the raster — the share sheet carries the words — and the whole flow rides the same injectable write-then-share pipeline with zero new dependencies.
- **Daily puzzle reminder** — a new switch in Settings → Games schedules one repeating local notification, «Your streak is waiting!», at a time you pick with two small steppers (hour 0–23, minute in 5-step). Every change re-syncs the schedule (cancel first, then schedule, so times never stack), a denied permission surfaces a quiet notice pointing at system settings, and the scheduling rules live in a pure, table-driven module with the platform behind an injectable IO — powered by the official expo-notifications package.

## [0.9.0] — 2026-11-07

The daily rituals get clocks and bragging rights: a timer on the 16-square puzzle, a streak card that shares like the badges board, a 2048 run seeded by the date, a harder 6×6 board, an activity chart for the stats panel, and a five-in-a-row opponent that hunts your threats.

### Added

- **Daily puzzle timer + share your streak as an image** — the daily 16-square puzzle now carries a run clock: it starts at your first touch, ticks beside the streak in `mm:ss`, freezes on the solve and prints the final time on the win banner (the clock survives tab switches and restarts like everything else). Next to it, a «Share streak» button renders the streak variant of the badges card — same Rafeeq mascot, glass badge and three-medal panel, with a flame in the badge, the solve streak as the headline, medals lit by milestones (bronze from day 1, silver at 3, gold at 7) and the seven-dot week trail under the podium — then hands it to the system share sheet. Language-neutral digits and badges only, exactly like the score card.
- **Daily 2048 — one board, every device** — the 2048 card grows a mode switcher: free play and «Daily run». The daily run seeds a deterministic deal from the local date (salted away from the sudoku seed), so every device starts the day from the exact same two tiles on the classic 4×4 board; the run's final score posts once to its own leaderboard shelf and a fresh challenge deals itself at local midnight.
- **6×6 Expert level** — free play adds a third, cramped 6×6 board whose target tile is 8192: more room to breathe, a much longer road to the win banner. Bests stay per level (classic / advanced / expert), and v2 saves migrate to the new per-level best automatically.
- **Usage activity chart** — the model-usage dashboard gains a small histogram: daily engine runs drawn as columns over the last 7 or 30 days (a tap flips the span), zero-filled, local-midnight aligned, with the window's total and the first/last dates under the bars. Same on-device numbers, now with a shape.
- **Five-in-a-row difficulty levels** — solo play picks between «Normal 9×9» and «Expert 13×13»: the expert board is roomier and the expert opponent is meaner — it still takes its own win and blocks yours first, but it now also answers your open fours and gapped threes before they grow into unstoppable threats, blocking toward its own builds where it can. Expert wins keep their own leaderboard so each level's streak record stays honest; duo mode keeps the classic 9×9.

## [0.8.0] — 2026-11-07

The arcade learns to sing, five-in-a-row gains a second player, the daily 16-square puzzle arrives, and the Models screen finally answers "how much have I actually used my models?".

### Added

- **Game sound effects** — every game now speaks in little synth tones: a dry click on each move and stone, a rising blip on every 2048 merge and memory match, a pip when the snake eats, a soft tick on card flips, a low buzz on wrong sudoku fills, a three-note fanfare on wins and a falling sigh on game over. The tones are synthesized on the fly by a new in-repo local module (sine sweeps through a static AudioTrack) — no sound assets and zero new npm dependencies — and played on a background thread so the game never stutters. A master switch lives in Settings → Games, and a small per-cue quiet gap keeps rapid taps crisp instead of piling into a buzz.
- **Two-player five-in-a-row on one device** — a mode switcher above the board: «Versus device» keeps the classic solo game against the on-device opponent, and «Two players» turns the same 9×9 board hot-seat, alternating black and white between two humans sharing the screen. Duo adds no opponent reply, either side's five wins (black and white each get their own banner), the solo streak and leaderboard are left untouched so records keep their meaning, and switching modes deals a fresh board.
- **Daily 16-square puzzle** — the mini sudoku grows a «Daily puzzle» tab: one seeded 4×4 deal per local day, identical on every device, with a persisted day streak, a longest-streak record and a seven-dot week trail showing which days you solved. Solving extends the streak, posts the run to its own leaderboard shelf, and re-solving the same day never double counts. At local midnight the next puzzle deals itself.
- **Model usage stats dashboard** — a new panel at the bottom of the Models screen: every finished engine run is logged on-device with the model that produced it, the tokens it generated and how long it took — chat replies, extra variants, smart replies and auto summaries alike. The dashboard totals runs, tokens and distinct models, breaks them down busiest-first with a human name per row and a last-used date, and one tap wipes the log. Nothing ever leaves the phone.

## [0.7.0] — 2026-11-07

The arcade grows to five games with settings of its own, scores become shareable art, and managing the model list gets faster.

### Added

- **Sudoku and Five-in-a-row join the arcade** — mini Sudoku (4×4, 2×2 boxes) deals unique-solution puzzles: tap a cell, tap a number, and a correct fill jumps to the next blank while a wrong one counts as a mistake and glows red; each solve posts 100 − 10×mistakes to the leaderboard. Five-in-a-row (gomoku) plays an on-device opponent on a 9×9 board that takes an immediate win, blocks yours, then weighs open lines with a center bias; wins build a persistent streak on the leaderboard. Both follow the house bar: pure table-driven engines, persisted boards, haptics, accessible controls.
- **Share your score as an image** — a share button on every game renders a 720×960 card with the Rafeeq bot mascot, the game's icon, the run score in big digits, the all-time best, and a three-medal badge panel that lights the podium place the result earned. The card is drawn by a tiny pure raster (bitmap digits, procedural mascot) and encoded to PNG with zero new dependencies — no camera, no native modules — then handed to the system share sheet. Language-neutral by design: numbers and badges only, so the same card reads in Arabic and English.
- **Game settings** — a new Games section in Settings: snake speed (calm / normal / fast), memory grid size (4×3, 4×4, 5×4 — the deal re-shuffles into the new layout), and a master switch that hides the games section on the Models screen entirely.

### Improved

- **Filter the model catalog** — five quick chips above the catalog: All, Small (under 1 GiB), Medium (1–2 GiB), Large (over 2 GiB), and "Fits my phone", which keeps the models whose runtime RAM estimate stays inside the device's free memory (when the OS reports it).
- **Delete several models at once** — a select mode adds a checkbox to every model card (catalog, voice, custom); the selected rows are sorted into unload → remove-entry → delete-file steps, the loaded engine and the voice model release safely first, and a confirmation names how many rows will be removed.

## [0.6.0] — 2026-11-07

The waiting room becomes an arcade: three games to play while a model downloads, plus a faster way to get models in the first place.

### Added

- **Import a model from your device** — a new card on the Models screen opens the system document picker for any `.gguf` saved anywhere on the phone (Downloads, USB copies, other apps). The import validates extension and size, stages the copy through a `.part` file that can never clobber a running download, renames clashes to `name (2).gguf`, checks a 200 MB disk margin before any bytes move, then streams SHA-256 in 1 MiB chunks and refuses duplicates by digest. Imported models register as regular custom models (synthetic `local://` url) so dedupe, full backups and the download log keep working untouched.
- **Snake and Memory join 2048 while you wait** — the game card is now a small arcade with a tab switcher: classic Snake (swipe or arrow pad, a queue that catches two fast turns, pause / resume, food grows the snake, walls and tail end the run), and Memory pairs (tap two cards per try, a failed pair lingers a beat before flipping back, fewest-moves record). Same bar as the original: pure table-driven engines, boards that survive tab switches and restarts, haptics, and accessible controls.
- **Difficulty levels for 2048** — the classic 4×4 board is joined by a roomier 5×5 whose target tile is 4096. Best scores are tracked per level, switching deals a fresh board, and existing v1 saves migrate automatically to the new per-level format.
- **Local leaderboard** — every finished run posts its final score to an on-device top-5 per game and level (2048 classic, 2048 big, snake). Nothing ever leaves the phone.
- **«Come back and play» when a download completes** — finishing a download while you are away from the Models tab pops a themed notice ("Download complete — come back and play!") naming the ready model; if you are already watching the games, a success banner appears inside the card instead and the games stay visible until you dismiss them, with a success haptic marking the moment. Both paths stay quiet for a model they already celebrated.

## [0.5.0] — 2026-11-06

Three headline features land in this release, alongside the themed dialog system and several chat upgrades.

### Added

- **Multi-variant reply switcher** — after a completed reply, the layers button prepares up to two extra complete drafts of the same reply (2–3 variants total). Flip between them with wrap-around prev/next chevrons and a `1/3` counter, preview each draft inside the bubble with per-variant token stats, and keep the winner with an explicit **Keep** action. Navigating never touches storage, and copy / speak / the long-press menu all follow the previewed text.
- **Summarizing conversation memory** — long conversations no longer hit the context wall: everything the window must forget is distilled into a rolling summary stored on the conversation (SQLite schema v11) and re-read on every later turn inside the system prompt. Summaries regenerate automatically once ≥8 new turns fall out of the window, roll the previous summary forward, and surface read-only in the conversation details sheet. Toggle in Settings → Auto summary (on by default; travels in full backups).
- **Smart reply choices** — after each finished turn the engine drafts 3 short candidate user replies, shown as tappable chips above the composer with refresh and hide controls.
- **Focus mode** — a calm full-screen reading surface for the streaming / last reply with auto-follow, stop-while-generating, an exit pill and a token-count footer.
- **One-tap quick actions** — copy / speak / regenerate icons directly under assistant replies, plus a persisted download & version log at the bottom of the Models screen.
- **Themed dialog system** — every native `Alert.alert` was replaced by an in-app glass bottom-sheet dialog queue (FIFO) in the glass design language, with colored tone-aware icons on action rows.

### Security

- Fixed all three Dependabot advisories — all confined to dev tooling (eslint / Expo CLI / jest dependency chains), not runtime app code:
  - **minimatch** GHSA-g3hv-75wg-m249 (moderate, DoS via glob-parts amplification) → pinned to 11.0.1
  - **glob** GHSA-3g3m-2fjr-6pw4 (moderate, AbortSignal cancellation bypass) → pinned to 14.0.2
  - **deepmerge** GHSA-gcqx-w48m-w2h4 (low, prototype pollution, no patched release yet) → pinned back to the safe 4.1.1
- `npm audit` now reports **0 vulnerabilities**.

### Notes

- SQLite migrations to schema v11 run automatically on first launch after the update; no action needed.
- Auto summary is enabled by default and can be turned off in Settings.

## Older releases

- **0.4.0** — 2026-11-06: fast multi-connection model downloads (parallel byte ranges, pause / resume, SHA-256 verified, foreground-service notifications).
- **0.3.1** — 2026-11-06: CI test stability fix.
- **0.3.0** — 2026-11-06: CI 16 KB alignment check refinement.
- **0.2.0** — 2026-11-04: futuristic redesign, Rafeeq mascot, first-run onboarding.
- **0.1.0** — 2026-11-04: initial release.

---

<div dir="rtl">

# سجل التغييرات

توثَّق هنا جميع التغييرات المهمة في **رفيق AI**.

## [0.19.0] — 2026-11-08

حزمة الترشح: المخرجات الإنجليزية الأربع للبطولة مُلتزمة الآن في `docs/competition/` ومرفقة بأصول الإصدار. كل رقم فيها إمّا مُقاس في هذا المستودع أو معلَنٌ صراحةً بأنه بانتظار القياس ببوابات مُصرَّح بها سلفًا — نفس انضباط الأدلة الذي يَعِظ به المنتج هو الذي تمارسه العروض. المرحلة 6 من بناء البطولة (Create AI Agents Championship — أفضل وكيل ذكاء اصطناعي شخصي).

### إضافات

- **عرض التقديم** (`docs/competition/Rafeeq-Pitch-Deck.pptx`) — عشر شرائح بالترتيب المطلوب: المشكلة، لمن نخدم، الحل (حلقة الوكيل)، العرض الحي، الخصوصية كمعمارية، النتائج المُقاسة مع شريط الأمانة، نموذج العمل، خارطة الطريق، الفريق والطلب.
- **ملخص النتائج المُقاسة** (`docs/competition/Rafeeq-Results-Summary.pdf`) — صفحة واحدة: تقييم 110 مهام عبر الحلقة الحقيقية (نجاح 1.0 · إطلاق ناري خاطئ 0 · التزام التأكيد 1.0 عبر المحاكاة النصية)، و1,742 اختبارًا في 96 حزمة، وانحراف أوقات الصلاة ≤ دقيقة واحدة مقابل جداول الرياض المنشورة، وجدول مقارنة الخمسة نماذج Q4_K_M بقاعدته المُصرَّح بها سلفًا، وسجل القياسات المعلَّقة كاملًا.
- **نموذج العمل** (`docs/competition/Rafeeq-Business-Model.pdf`) — صفحة واحدة: نواة مجانية ← حِزم مهارات مدفوعة ← ترخيص B2B (شركات الاتصالات، المصنّعون، البرامج المقيدة بإقامة البيانات)، مع إعلان صريح أن التسعير غير مُقاس بعد.
- **سيناريو فيديو العرض** (`docs/competition/Rafeeq-Demo-Video-Script.docx`) — قائمة لقطات لدقيقتين + تعليق صوتي: خمس مهام حقيقية في وضع الطيران من عائلات حزمة التقييم (تذكير، منبه، إحاطة صباحية، مسودة واتساب، الكشاف والإضاءة)، مع ملاحظات إنتاج تمنع تصوير أرقام غير مُقاسة.

### تغييرات

- رُفعت النسخة إلى 0.19.0 (versionCode 20)؛ وسيبني CI حزمة APK الموقّعة لهذا الوسم كأنجازٍ جاهز للنهائيات.

## [0.17.0] — 2026-11-08

يتعلم رفيق أن يجيب بصوته: هدفٌ باللهجة السعودية يتحوّل إلى ردٍ منطوق يبدأ **بينما الجواب ما زال يتولّد**، والخطة تُعلَن صوتيًا فوق بطاقة الخطة، وأول جملة منطوقة مهندَسة لتبلغ قبل ثانيتين وثلاث على الجهاز الهدف، وخط الصوت كله يُقاس بمقياس جلسة حتى لا يُدَّعي رقمٌ قبل أن يُقاس. كذلك أصبح الضبط الدقيق لـ whisper باللهجة السعودية نموذج صوت بمقام أول مع تثبيت العربية للتفريغ، وجُهّزت مسجّلة WER بالتطبيع العربي الذي يعتمد عليه التقييم. المرحلة 4 من بناء البطولة (Create AI Agents Championship — أفضل وكيل ذكاء اصطناعي شخصي).

### إضافات

- **تقسيم الجُمل أثناء البث** (`src/speech/sentenceStream.ts`) — يصل الرد المنطوق إلى محرك النطق جملةً جملة بينما الجواب يتولّد. واعٍ بالعربية: `؟ ! ؛` والنقطة تقطع، والفاصلة العربية لا تقطع؛ النقطة المشبوهة بالأرقام (`3.5`، `٢٠٢٦.١١` — عبر `\p{Nd}` لا `\d`) تُؤجَّل رمزًا واحدًا بدل شطر الرقم؛ علامات التعداد (`1.` `١.`) تُطوى في الجملة التالية؛ والشظية بلا كلمات (ذيل `..` شارد) تُسقط ولا تُنطق أبدًا؛ والجواب بلا نقطة نهاية يُنطق أيضًا مقتطعًا عند آخر حدود كلمة بعد 200 حرف.
- **طابور الرد المنطوق** (`src/store/voiceOutStore.ts`) — طابور واحد لكل جلسة فوق محرك النطق النظامي (نفسه زر مكبر المحادثة): `begin`/`pushToken`/`speakNow`/`flushPending`/`abort`، مع راية جلسة ورقم جلسة تصاعدي فلا تنطق جلسة ميتة أبدًا ولا تصل بقايا بثٍّ لجلسة أُلغيت. وإعلان الخطة (`planAckForSpeech`) هو أول جملة يسمعها المستخدم: عدد الخطوات، والخطوة الأولى بكلمات الوكيل نفسها، ووعدٌ بأن أي خطوة تغيّر البيانات تتوقف للتأكيد أولًا.
- **ميزانية زمن الصوت، مقيسة** (`src/speech/latency.ts`) — ست علامات لكل جلسة صوتية (`recorded → transcribed → goalSent → planShown → firstSentenceSpoken → answered`) تُبلّغ رقمي البطولة: **الزمن إلى أول جملة منطوقة** (هدف <3 ثوانٍ على Infinix GT 30) والزمن الكامل للمسار. علامات الميكروفون في `voiceStore`، والجلسة الجديدة تصفّر المقياس، والهدف المكتوب يبدأ جلسة نظيفة عبر فحص تسليم الميكروفون (`voiceHandoffFresh`، نافذة 60 ثانية).
- **مسار whisper باللهجة السعودية** — يضيف الكتالوج `whisper-small` (244 مليون معامل، 465 ميغابايت) بجانب `whisper-tiny`؛ والاستيراد المحلي يقبل الآن نماذج الصوت بصيغة **`.bin`** (ببصمة SHA-256، وتسجيل `local://`، وتثبيت `voiceLanguage: 'ar'` فلا يضيّع التفريغ جولة اكتشاف لغة على الضبط الدقيق `oddadmix/whisper-small-arabic-dialectal-v2` برخصة Apache-2.0). والميكروفون يفرّغ بالنموذج المختار من شاشة النماذج (**استخدم للميكروفون** / شارة *نشط للميكروفون*)، وtiny الافتراضي عند غياب الاختيار، وحذف نموذج صوت يحرر السياق ويصفّر الاختيار. وصفة التحويل (أوزان HF → ggml مع تكميم اختياري) موثقة في `docs/phase4-voice.md`.
- **مسجّلة WER بتطبيع عربي** (`src/speech/wer.ts`) — معدل خطأ الكلمات لتقييم المرحلة 5: تشكيل وتطويل يُسقطان، ومقاعد الألف توحَّد، والة والهمزات تُطبَّع، والأرقام العربية-الهندية إلى ASCII، والترقيم إلى فراغات؛ مسافة ليڤنشتاين على مستوى الكلمة **مع تتبع خلفي** يفصل الإبدال/الحذف/الإضافة، وتجميع للمجموعة حيث المرجع الفارغ غير قابل للتقييم (null) ولا يُزوَّر بصفر.
- **الجواب الاحتياطي يُنطق أيضًا** — حين يعجز النموذج عن صياغة جواب (مهلة أو خطأ) يصل الجواب الاحتياطي الحتمي إلى طابور النطق كذلك: تمريرة الإنهاء تقارن الجواب بما بُثّ فعلًا وتنطق الفرق، فلا تنتهي جلسة صوتية بالصمت أبدًا. والنطق التلقائي في المحادثة يتجاوز جلسات voice-out (`silentSpeak`) فلا يُعاد تشغيل الرد من أوله.
- **توثيق المرحلة 4** (`docs/phase4-voice.md`) — قواعد التقسيم، ودلالات طابور الجلسة، وميزانية الزمن، ووصفة التحويل، والحدود الصادقة (كلمة الإيقاظ وأرقام الجهاز الحقيقي من نطاق المرحلة 5؛ ولا يُدّعى شيء قبل قياسه).

## [0.9.0] — 2026-11-07

تحصل الطقوس اليومية على مؤقتات وحقوق تفاهر: مؤقت للغز الـ١٦ مربعًا، وبطاقة سلسلة تُشارَك مثل لوحة الشارات، وجولة 2048 مزروعة بتاريخ اليوم، ولوح 6×6 أصعب، ومنحنى نشاط في لوحة الإحصاءات، وخصم «خمسة على التوالي» يطارد تهديداتك.

### إضافات

- **مؤقت اللغز اليومي + مشاركة سلسلتك كصورة** — يحمل لغز الـ١٦ مربعًا اليومي الآن ساعة جولة: تبدأ عند أول لمسة، وتنبض بجانب السلسلة بصيغة `mm:ss`، وتتجمّد عند الحل ويُطبع الوقت النهائي على لافتة الفوز (وتنجو الساعة من تبديل التبويبات وإعادة التشغيل كأي شيء آخر). وبجانبها زر «مشاركة السلسلة» يولّد نسخة السلسلة من بطاقة الشارات — تميمة رفيق نفسها والإطار الزجاجي نفسه ولوحة الميداليات الثلاث نفسها، مع لهب في الإطار، وسلسلة الأيام عنوانًا رئيسيًا، وميداليات تُضيء حسب المحطات (برونزية من اليوم الأول، وفضية عند ٣، وذهبية عند ٧)، ومسار الأسبوع بسبع نقاط تحت منصة التتويج — ثم تسلّمها لورقة المشاركة النظامية. أرقام وشارات محايدة اللغة فقط، تمامًا كبطاقة النتيجة.
- **2048 اليومي — لوح واحد لكل الأجهزة** — تكتسب بطاقة 2048 مبدّل أطوار: لعبة حرة و«تحدي اليوم». يزترع تحدي اليوم بدايةً حتمية من التاريخ المحلي (بملح يبعده عن بذرة السودوكو)، فيبدأ كل جهاز يومه من البلاطتين نفسهما على اللوح الكلاسيكي 4×4؛ وتُسجَّل النتيجة النهائية مرة واحدة على رفّها في لوحة الصدارة، ويتجدّد التحدي تلقائيًا عند منتصف الليل المحلي.
- **مستوى الخبير 6×6** — تضيف اللعبة الحرة لوحًا ثالثًا ضيّقًا 6×6 بلاطة الهدف 8192: مساحة أوسع للتنفّس، وطريق أطول بكثير إلى لافتة الفوز. تبقى الأفضل لكل مستوى (كلاسيكي / متقدم / خبير)، وتهاجر حفظات v2 تلقائيًا إلى صيغة الأفضل لكل مستوى.
- **منحنى النشاط في الإحصاءات** — تكتسب لوحة إحصاءات استخدام النماذج مدرّجًا صغيرًا: مرات التشغيل اليومية بأعمدة على مدى آخر ٧ أو ٣٠ يومًا (نقرة تبدّل المدى)، مع تعبئة صفرية للأيام الهادئة، ومحاذاة منتصف الليل المحلي، وإجمالي النافذة وتاريخي البداية والنهاية تحت الأعمدة. الأرقام نفسها على الجهاز، والآن بشكل مرئي.
- **مستويا صعوبة «خمسة على التوالي»** — يختار اللاعب الفردي بين «عادي 9×9» و«خبير 13×13»: لوح الخبير أرحب، وخصمه أشرس — ما يزال يلتقط فوزه ويمنع فوك أولًا، لكنه يصبح يجيب أيضًا على الرباعيات المفتوحة والثلاثيات المتقطّعة قبل أن تتحول إلى تهديدات لا تُوقف، ويوجّه منعه نحو بناءاته هو متى أمكن. لانتصارات الخبير لوحة صدارة خاصتها لتبقى سجل كل مستوى صادقًا؛ ويحتفظ طور اللاعبين باللوح الكلاسيكي 9×9.

## [0.8.0] — 2026-11-07

تتعلم الصالة الغناء، ويكتسب «خمسة على التوالي» لاعبًا ثانيًا، ويصل لغز الـ١٦ مربعًا اليومي، وتجيب شاشة النماذج أخيرًا عن سؤال «كم استخدمت نماذجي فعلًا؟».

### أُضيفت

- **مؤثرات صوتية للألعاب** — تتكلم كل لعبة الآن بنغمات صغيرة مولَّدة: نقرة جافة لكل حركة وحجرة، ونبضة صاعدة عند كل دمج في 2048 ومطابقة في الذاكرة، وبيب سريع عندما يأكل الثعبان، وطرفة ناعمة عند قلب البطاقات، وهامر منخفض عند الخطأ في السودوكو، ونغمة ثلاثية عند الفوز وتنهيد هابطة عند النهاية. تُولَّد النغمات لحظيًا بوحدة محلية جديدة داخل المستودع (موجات جيبية عبر AudioTrack ساكن) — بلا ملفات صوت وبلا أي اعتماد npm جديد — وتُشغَّل على خيط خلفي حتى لا تتلعثم اللعبة. ومفتاح رئيسي في الإعدادات → الألعاب، مع فاصل صمت صغير لكل نغمة يُبقي النقرات السريعة حادة لا متكدسة.
- **خمسة على التوالي للاعبين على جهاز واحد** — مبدّل وضع فوق اللوح: «ضد الجهاز» هي اللعبة الفردية الكلاسيكية ضد الخصم المحلي، و«لاعبان على الجهاز» تحوّل اللوح 9×9 نفسه إلى تبادل مباشر يتناوب فيه الأسود والأبيض بين شخصين على شاشة واحدة. في وضع اللاعبين لا ردّ من خصم، وخمسة أي طرف تفوز (لكل من الأسود والأبيض لافتته)، وسلسلة الفرد ولوحة الصدارة لا تُلمسان حفاظًا على معنى الأرقام القياسية، وتبديل الوضع يوزّع لوحًا جديدًا.
- **لغز يومي بـ١٦ مربعًا** — يكتسب السودوكو المصغّر تبويب «لغز اليوم»: توزيع واحد مبذور 4×4 لكل يوم محلي متطابق على كل الأجهزة، مع سلسلة أيام محفوظة، ورقم قياسي لأطول سلسلة، ومسار أسبوعي من سبع نقاط يعرض أيام الحل. الحل يُمدّد السلسلة ويسجّل الجولة في رفّ خاص بلوحة الصدارة، وإعادة حل اليوم نفسه لا تُحتسب مرتين، وعند منتصف الليل المحلي يوزّع اللغز التالي نفسه.
- **لوحة إحصاءات استخدام النماذج** — لوحة جديدة أسفل شاشة النماذج: كل تشغيل مكتمل للمحرك يُسجَّل على الجهاز بالنموذج الذي أنتجه وعدد الرموز التي ولّدها وطول مدته — الردود والمتغيرات الإضافية والردود الذكية والملخصات التلقائية كلها. تجمع اللوحة مرات التشغيل والرموز والنماذج المستخدمة، وتفصّلها الأنشط أولًا باسم بشري لكل صف وتاريخ آخر استخدام، ومسح السجل بنقرة واحدة. لا شيء يغادر الهاتف أبدًا.

## [0.7.0] — 2026-11-07

تتوسع الصالة إلى خمس ألعاب بإعدادات خاصة بها، وتصبح النتائج صورة قابلة للمشاركة، وتصبح إدارة قائمة النماذج أسرع.

### أُضيفت

- **سودوكو وخمسة على التوالي ينضمان إلى الصالة** — سودوكو مصغّر (4×4 بمربعات 2×2) يوزّع ألغازًا ذات حل فريد: انقر خلية ثم رقماً، فيقفز التعبئة الصحيحة إلى الفراغ التالي بينما يُحصى الخطأ ويحمرّ؛ وكل حل يسجّل 100 − 10×الأخطاء في لوحة الصدارة. وخمسة على التوالي (غوموكو) تلعب ضد خصم على الجهاز في لوح 9×9 يلتقط فوزه الفوري ثم يمنع فوزك ثم يوازن الخطوط المفتوحة مع ميل للمركز؛ والانتصارات تبني سلسلة محفوظة في لوحة الصدارة. وكلاهما بالمستوى ذاته: محركات نقية مُختبرة جدوليًا، لوحات محفوظة، اهتزازات، وأدوات تحكم وصولية.
- **شارك نتيجتك كصورة** — زر مشاركة في كل لعبة يولّد بطاقة 720×960 بتميمة رفيق، وأيقونة اللعبة، ونتيجة الجولة بأرقام كبيرة، والأفضل على الإطلاق، ولوحة شارات بثلاث ميداليات تُضيء المكان على منصة التتويج الذي حقّقته النتيجة. تُرسم البطاقة براستر نقي صغير (أرقام نقطية وتميمة إجرائية) وتُشفَّر PNG دون أي اعتماد جديد — بلا كاميرا وبلا وحدات أصلية — ثم تُسلَّم لورقة المشاركة النظامية. محايدة اللغة تصميمًا: أرقام وشارات فقط، فتُقرأ البطاقة نفسها بالعربية والإنجليزية.
- **إعدادات الألعاب** — قسم «الألعاب» الجديد في الإعدادات: سرعة الثعبان (هادئة / عادية / سريعة)، وحجم شبكة الذاكرة (4×3، 4×4، 5×4 — تُعاد عملية التوزيع على المخطط الجديد)، ومفتاح رئيسي يخفي قسم الألعاب كلياً من شاشة النماذج.

### تحسّن

- **فلترة كتالوج النماذج** — خمس رقائق سريعة فوق الكتالوج: الكل، صغيرة (أقل من 1GiB)، متوسطة (1–2GiB)، كبيرة (أكثر من 2GiB)، و«تناسب جهازي» التي تبقي النماذج التي لا يتجاوز تقدير ذاكرتها التشغيلية الذاكرة المتاحة بالهاتف (عندما يبلّغ عنها النظام).
- **حذف عدة نماذج دفعة واحدة** — وضع تحديد يضيف دائرة اختيار لكل بطاقة نموذج (الكتالوج والصوتي والمخصص)؛ وتُصنَّف الصفوف المحددة إلى خطوات: تفريغ ← إزالة إدخال ← حذف ملف، مع تفريغ المحرك المحمّل ونموذج الصوت بأمان أولًا، وتأكيد يذكر عدد الصفوف التي ستُزال.

## [0.6.0] — 2026-11-07

تتحول غرفة الانتظار إلى صالة ألعاب: ثلاث ألعاب أثناء تنزيل النموذج، وطريقة أسرع لإدخال النماذج من الأساس.

### أُضيفت

- **استيراد نموذج من جهازك** — بطاقة جديدة في شاشة النماذج تفتح منتقي ملفات النظام لأي ملف `.gguf` محفوظ في أي مكان بالهاتف (التنزيلات، نسخ USB، تطبيقات أخرى). يتحقق الاستيراد من الامتداد والحجم، وينسخ عبر ملف `.part` مرحلي لا يمكنه أن يحطّم تنزيلًا جاريًا أبدًا، ويعيد تسمية التعارضات إلى «الاسم (2).gguf»، ويفحص هامش 200MB من القرص قبل تحريك أي بايت، ثم يجري SHA-256 على أجزاء 1MiB ويرفض المكررات بالبصمة. تُسجَّل النماذج المستوردة كنماذج مخصصة عادية (رابط اصطناعي `local://`) فيبقى إزالة التكرار والنسخ الاحتياطية الكاملة وسجل التنزيلات يعمل كما هي.
- **الثعبان والذاكرة ينضمان إلى 2048 أثناء الانتظار** — أصبحت بطاقة اللعبة صالة مصغّرة بمبدّل تبويبات: ثعبان كلاسيكي (سحب أو لوحة أسهم، طابور يلتقط تمريرتين متتاليتين، إيقاف / استئناف، الطعام ينمّي الثعبان، والجدار والذيل ينهيان الجولة)، ولعبة ذاكرة (اقلب بطاقتين في كل محاولة، يبقى الزوج الفاشل ظاهرًا لحظة قبل انقلابه، ورقم قياسي لأقل عدد محاولات). بالمستوى نفسه: محركات نقية مُختبرة جدوليًا، لوحات تصمد أمام تبديل التبويبات وإعادة التشغيل، اهتزازات، وأدوات تحكم وصولية.
- **مستويات صعوبة لـ2048** — اللوحة الكلاسيكية 4×4 تنضم إليها لوحة أرحب 5×5 هدفها بلاطة 4096. أفضل نتيجة لكل مستوى، وتوزيع جديد عند التبديل، وتحفوظات v1 القديمة تُرحَّل تلقائيًا إلى صيغة أفضل النتائج لكل مستوى.
- **لوحة صدارة محلية** — كل جولة مكتملة تسجّل نتيجتها النهائية في قائمة أفضل ٥ على الجهاز لكل لعبة ومستوى (2048 كلاسيكي، 2048 كبير، الثعبان). لا شيء يغادر الهاتف أبدًا.
- **إشعار «عُد للعب» عند اكتمال التنزيل** — إتمام تنزيل وأنت بعيد عن تبويب النماذج يُظهر إشعارًا منسّقًا («اكتمل التنزيل — عُد للعب!») يذكر اسم النموذج الجاهز؛ وإن كنت تشاهد الألعاب فتظهر لافتة نجاح داخل البطاقة بدلًا منه وتبقى الألعاب ظاهرة حتى تخفيها، مع اهتزاز نجاح يختم اللحظة. وكلا المسارين يصمتان عن نموذج احتفلا به سابقًا.

## [0.5.0] — 2026-11-06

ثلاث ميزات رئيسية في هذا الإصدار، إلى جانب نظام الحوارات المُنسّق وعدة تحسينات للمحادثة.

### أُضيفت

- **مبدّل الردود المتعددة** — بعد اكتمال رد المساعد يُحضِّر زر الطبقات نسختين إضافيتين كاملتين من الرد نفسه (٢–٣ صيغ إجمالًا). تنقّل بينها بأسهم دائرية وعدّاد «١/٣»، وعاين كل صيغة داخل الفقاعة مع إحصاء رموز لكل صيغة، واحتفظ بالأفضل عبر زر «احتفاظ» صريح. التنقّل وحده لا يلمس المحفوظات، وتتبع النسخ والنطق وقائمة الضغط الطويل النص المعروض.
- **ذاكرة المحادثة التلخيصية** — المحادثات الطويلة لم تعد تصطدم بحد السياق: كل ما يجب أن تنساه النافذة يُقطَّر في ملخص متجدد يُخزَّن على المحادثة (مخطط SQLite v11) ويُعاد قراءته في كل دورة لاحقة داخل رسالة النظام. يُعاد توليد الملخصات تلقائيًا متى خرجت ٨ أدوار جديدة أو أكثر من النافذة، مع ترحيل الملخص السابق، وتظهر للقراءة فقط في لوحة تفاصيل المحادثة. مفتاح التشغيل في الإعدادات ← الملخص التلقائي (مفعّل افتراضيًا وينتقل ضمن النسخ الاحتياطية الكاملة).
- **اقتراحات ردود ذكية** — بعد كل دورة مكتملة يصوغ المحرك ٣ ردود قصيرة مقترحة من جانب المستخدم، تظهر كرقائق قابلة للنقر فوق حقل الإدخال مع تحديث وإخفاء.
- **وضع التركيز** — سطح قراءة هادئ بملء الشاشة للرد الجاري أو الأخير، مع تتبع تلقائي للبث، وإيقاف أثناء التوليد، وزر خروج، وعدّاد رموز.
- **إجراءات سريعة بنقرة واحدة** — أيقونات نسخ / نطق / إعادة توليد أسفل ردود المساعد مباشرة، مع سجل تنزيلات وإصدارات دائم أسفل شاشة النماذج.
- **نظام حوارات مُنسّق** — استُبدلت كل نوافذ `Alert.alert` الأصلية بصفّ حوارات زجاجي داخل التطبيق (FIFO) بلغة التصميم الزجاجية، مع أيقونات ملوّنة حسب النبرة على صفوف الأزرار.

### الأمان

- إصلاح الثغرات الثلاث التي رصدها Dependabot — كلها محصورة في أدوات التطوير (سلاسل eslint / Expo CLI / jest) وليست في كود التطبيق:
  - **minimatch** ‏GHSA-g3hv-75wg-m249 (متوسطة، حجب خدمة عبر تضخيم أجزاء glob) ← تثبيت 11.0.1
  - **glob** ‏GHSA-3g3m-2fjr-6pw4 (متوسطة، تجاوز إلغاء AbortSignal) ← تثبيت 14.0.2
  - **deepmerge** ‏GHSA-gcqx-w48m-w2h4 (منخفضة، تلوث النموذج الأولي بلا إصدار مُصلَح بعد) ← الرجوع إلى النسخة الآمنة 4.1.1
- يُبلغ `npm audit` الآن عن **صفر ثغرات**.

### ملاحظات

- تُنفَّذ ترقيات SQLite إلى المخطط v11 تلقائيًا عند أول تشغيل بعد التحديث؛ لا حاجة لأي إجراء.
- الملخص التلقائي مفعّل افتراضيًا ويمكن إيقافه من الإعدادات.

## الإصدارات الأقدم

- **0.4.0** — 2026-11-06: تنزيل نماذج سريع متعدد الاتصالات (نطاقات بايت متوازية، إيقاف / استئناف، تحقق SHA-256، إشعارات خدمة أمامية).
- **0.3.1** — 2026-11-06: إصلاح ثبات اختبارات CI.
- **0.3.0** — 2026-11-06: تحسين فحص محاذاة 16KB في CI.
- **0.2.0** — 2026-11-04: إعادة تصميم مستقبلية، وتميمة رفيق، وتهيئة أول تشغيل.
- **0.1.0** — 2026-11-04: الإصدار الأول.

</div>
