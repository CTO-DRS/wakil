# Phase 3 — Memory & Personalization

Competition build (Create AI Agents Championship, *Best Personal AI Agent*) — Phase 3 of 6.
Scope of this phase: the agent stops being stateless. It remembers what matters about
you, retrieves it on-device, briefs you every morning, and nudges you only from data
that is already on the phone. Everything in this document describes code that ships in
v0.16.0, runs 100 % offline, and passes the full suite (`npm run check`, 89 suites /
1634 tests).

## What was built

### 1. Long-term memory — `src/agent/memory.ts`

A KV-backed shelf (`rafeeq.agent.memory.v1`, zustand persist over `expo-sqlite/kv-store`)
holding up to **300 records** of four kinds: `preference`, `person`, `routine`, `fact`.

```ts
interface MemoryRecord {
  id: string;            // m_<base36 time>_<rand>
  kind: MemoryKind;
  text: string;          // ≤ 500 chars, capped not rejected
  source: 'agent' | 'user';
  createdAt: number; updatedAt: number;
}
```

Design rules that matter for the judges' *data-protection* criterion:

- **User-owned**: the memory screen (`src/app/memory.tsx`, route `/memory`) lists every
  record with kind + provenance (`Rafeeq learned this` / `You wrote this`), and every
  record can be edited or deleted; **Forget everything** wipes the shelf in one tap.
  Privacy is an architecture here, not a claim.
- **Dedupe by collapsed text**: saving the same fact again refreshes the existing
  record (id survives, kind/source/stamp update) instead of stacking copies — the
  small model cannot be trusted not to repeat itself.
- **Over-long input is capped, not rejected** — a rejected save would fail a whole
  plan step; the shelf stays tidy either way.

### 2. On-device retrieval — `src/agent/retrieval.ts`

Two engines behind one ranking contract; the lexical engine is the floor, the
embedding engine the ceiling:

1. **Lexical (always available, deterministic).** Arabic-aware normalization (strips
   diacritics `\u064B-\u065F` + tatweel, unifies alef forms `أإآٱ→ا`, yeh `ى→ي`,
   ta-marbuta `ة→ه`, hamza carriers, Arabic-Indic digits → ASCII), a Saudi-colloquial
   stopword list («وش», «عندي», «ابغى»…), light prefix stripping (`ال/وال/بال/لل/و/ب/ف/ل/ك`,
   only when ≥ 3 chars remain), and a weighted overlap score (1.0 exact stem hit,
   0.5 prefix hit, normalized by query length).
2. **Embedding (when a model is loaded).** Pure cosine ranking
   (`rankByEmbedding`/`cosineSimilarity`) plus an `EmbeddingClient` interface; the
   llama.rn embedding API (verified present in llama.rn 0.12.9:
   `context.embedding(text, params?)`) is the intended provider. The merged entry
   point `retrieveRelevant()` runs lexical first, layers embedding on top when a
   client answers, keeps the best score per record, and **degrades silently to
   lexical** when the client fails or is absent — retrieval never blocks a run.

**Planner injection.** `AgentRunner` takes an optional `knownContext(goal)` hook
(`agentStore.knownContextForGoal`): the top-3 lexically-matched memories are rendered
as bounded lines (`- [preference] أحب القهوة بعد الفجر`) into both the plan prompt and
the answer prompt (`buildPlanMessages` / `buildAnswerMessages` gained an optional
context parameter — all previous call sites are unchanged and byte-identical without
context). So «رتّب لي الصبح» can lean on a stored morning routine without the user
repeating it.

**Chat history.** The chat side already carries FTS5 search (`searchMessages`) and a
rolling conversation summary; memory search covers the agent's own shelf. Wiring the
embedding index over chat history is deliberately deferred to Phase 5 device
validation: re-embedding on every message needs an on-device RAM/latency budget
measured against the GT 30 first (see *Deferred* below).

### 3. The morning briefing — `src/agent/briefing.ts` + `src/agent/tools/briefing.ts`

`composeBriefing()` is a pure composition over four local sources:

| Section | Source | Rule |
| --- | --- | --- |
| Events | native calendar (`calendarListUpcoming(1, 20)`, non-prompting) | today only, sorted by start; all-day heuristic (local midnight + no end) |
| Reminders | local reminders shelf, `tag: 'user'` only | today + overdue; overdue ones are flagged **متأخر** — an agent that hides lateness is lying politely |
| Prayer times | `upcomingPrayerTimes(now, coords)` — GPS fix (if permission already granted) → Riyadh default, same chain as `prayer.times` | remaining today + tomorrow's Fajr, tz-aware rendering (`formatPrayerClock`, day labels in the prayer timezone) |
| Tasks | local todos shelf | open only; overdue → due-today → undated → later, capped at 5, overdue flagged **متأخرة** |

The tool `briefing.today` (read-only, no arguments) is registered on the main
registry, so «وش عندي اليوم؟» is one plan step. Every dependency is injectable
(`now`, `getLocation`, `listEvents`, `getReminders`, `getTodos`) — tests run without a
device, and any calendar/GPS failure simply leaves the section out.

**Delivery.** `briefingReminder.ts` reconciles one repeating DAILY notification with
the settings (cancel-old → schedule-new, the same flow as the backup reminder on
the shared sync plumbing in `utils/reminderSchedule.ts`; denied permission surfaces once, politely). The notification text is a
short static invitation — the live briefing is composed when the user opens the app,
where it can be spoken with the existing offline Saudi TTS (`briefingForSpeech()`
renders the same sections as natural sentences for the speech engine).

### 4. Proactive suggestions — `src/agent/suggest.ts` + `src/hooks/useAgentSuggestions.ts`

Five deterministic rules over local data only, priority-ordered, capped at **3**
chips (a wall of nudges is spam; the agent must never nag):

| Priority | Rule | Chip |
| --- | --- | --- |
| 20 | overdue open task | «أرني المهام المتأخرة ورتّبها» |
| 18 | prayer inside 30 min | «متى أذان العصر؟» |
| 16 | today's calendar has events | «وش عندي اليوم؟» |
| 14 | task due before tonight | «وش المطلوب مني اليوم؟» |
| 12 | user reminder lands today | «وش تذكيرات اليوم؟» |

The chips render above the composer while agent mode is on (tap → fills the composer
for review — the agent still plans and asks approval before acting). The hook
refreshes every 60 s while visible; GPS is non-prompting and calendar reads never ask
for anything. **The off switch** is `agentSuggestions` in the settings store — when
off, the hook computes nothing and renders nothing (the return value is the switch).

### 5. Tools added to the registry (25 → 29)

| Tool | Class | Arguments | Behavior |
| --- | --- | --- | --- |
| `memory.save` | mutating → confirmation card | `text` (req), `kind` enum | normalize → dedupe → upsert; honest Arabic observation |
| `memory.forget` | mutating → confirmation card | `query` (req) | exact id → delete; close text → delete **only when exactly one match**, otherwise refuses and lists the candidates (a vague forget is how agents delete the wrong thing) |
| `memory.search` | read-only | `query` (req) | lexical ranking over the shelf, ids included for `memory.forget` |
| `briefing.today` | read-only | — | the composed briefing |

Catalog budget held: 29 lines, each < 200 chars, whole catalog < 6.5 KB in both
locales (enforced by test). `ToolCategory` gained `memory`.

### 6. Settings

New **Agent** section in Settings (`settings.tsx`): the briefing switch + an
hour/minute stepper (the shared `Stepper` in `components/ui`), the proactive-suggestions
switch, a **Manage what Rafeeq remembers** button (→ `/memory`), and a live memory
count. New persisted settings: `briefingEnabled` (default on, 07:00),
`briefingTime`, `briefingReminderId`, `agentSuggestions` (default on).

## Privacy accounting (for the Validate criterion)

- Memory, notes, todos, reminders: on-device KV (SQLite), never synced, never leaving
  the phone; fully user-editable/deletable; **Forget everything** in one tap.
- Briefing + suggestions: composed from local stores and a non-prompting GPS fix;
  zero network calls; no telemetry anywhere in the feature set.
- The only network the app ever touches remains the user-initiated model download
  (and none of Phase 3 touches it).

## Tests

93 new table-driven tests across six suites, all without native modules:

- `agentMemory.test.ts` — normalize/kind coercion/dedupe/cap/CRUD/summary/context rendering.
- `agentRetrieval.test.ts` — Arabic normalization cases, stopword/prefix tokenization,
  lexical ranking (prefix matching «الشغل» → «شغلي»), cosine table, embedding ranking,
  merged two-engine retrieval incl. client-failure fallback.
- `agentMemoryTools.test.ts` — save/dedupe/forget-by-id/forget-by-text/
  ambiguous-forget refusal/honest misses, ar+en observations.
- `agentBriefing.test.ts` + `agentBriefingTool.test.ts` — section composition,
  overdue flags, tomorrow labels (tz-aware), todo ordering + cap, injected-deps run,
  failing-calendar/GPS survival, English form, read-only policy.
- `agentSuggest.test.ts` — every rule, the 30-minute prayer window, tomorrow
  exclusion, prayer-tagged reminder exclusion, the 3-chip cap with priority order.
- `agentPlannerContext.test.ts` — plan/answer context injection, empty-context
  byte-equality, `knownContextForGoal` retrieval, and **loop e2e**: memory injected
  into real prompts, `memory.save` behind the confirmation card (approve → record
  written with source `agent`; decline → step skipped, shelf untouched).

Catalog guardrails updated in `agentAllTools.test.ts` (29 tools, risk table,
catalog size).

## Known limits / deferred

- **Embedding model hookup** — the ranking layer is fully wired; loading an actual
  embedding GGUF (candidate: EmbeddingGemma-300m, multilingual incl. Arabic, ~300 M
  params) needs a second llama.rn context whose RAM cost must be measured on the
  GT 30 alongside the chat model — scheduled with the Phase 5 device benchmarks so
  the choice is empirical, not guessed. Until then retrieval runs on the lexical
  engine, which the evaluation set exercises.
- **Chat-history embedding index** — same reason; `searchMessages` (FTS5) covers
  lexical chat retrieval today.
- **Briefing notification body** — static invitation text (Android scheduled
  notifications carry fixed content); the live composition + TTS happens in-app.
- Suggestions refresh on a 60 s timer while the chat screen is open; no background
  scheduler computes them (by design — zero work when the app is closed).

## Next: Phase 4 — Voice-first

Hands-free loop (tap/wake → speak → voice reply + plan card), the
`oddadmix/whisper-small-arabic-dialectal-v2` checkpoint converted to quantized
whisper.cpp GGUF with Saudi-sample WER measurement, and the < 3 s first-sentence
budget on the GT 30.
