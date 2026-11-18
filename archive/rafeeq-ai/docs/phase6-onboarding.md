# Phase 6 — Smart Onboarding & Adaptive UX (v0.23.0)

The first-run journey: from a cold install to a personalized, working assistant in
nine honest steps. Every step writes to the same stores the rest of the app reads;
nothing here is a mock-up, and nothing claims to run that cannot run.

## The nine steps

| # | Step (`onboardingStep`) | Screen | What it really does |
| --- | --- | --- | --- |
| 1 | `welcome` | `app/onboarding/index.tsx` | Three-slide carousel with the interactive RafeeqBot + flow progress bar. Skip jumps to language. |
| 2 | `language` | `language.tsx` | Arabic/English (instant i18n + RTL/LTR reload) **and** the appearance picker: «system» + the eight themes, applied live through `appearanceStore`. |
| 3 | `goals` | `goals.tsx` | The 13 goals (multi-select, `free` exclusive). Skipped goals stay empty — the engine falls back to the default chat track. |
| 4 | `profile` | `profile.tsx` | One question at a time: experience, speed/accuracy/balance, answer style — plus the conditional «light or advanced» question only when reasoning goals are picked. Skip leaves defaults, never fake answers. |
| 5 | `recommend` | `recommend.tsx` | The engine verdict: track, primary/secondary goals, the recommended integrated model, the reasons, the voice companions, and the honest visual note when image/video goals were picked. |
| 6 | `path` | `path.tsx` | Every integrated chat model, RAM/disk-checked against this device, with the engine pick marked. Downloading starts the real transfer and records the default. |
| 7 | `permissions` | `onboarding/permissions.tsx` | The core four (notifications, microphone, location, biometric): status read from the OS, request per tap, exact settings page on denial, refreshed on every foreground return. |
| 8 | `personalize` | `personalize.tsx` | Real switches: answer style, response character, spoken replies (`autoSpeak`), decorative motion (`animated`), morning briefing, backup reminder — with an inline notifications grant when the switches need it. |
| 9 | `summary` | `summary.tsx` | Live read of every choice, per-row «edit» jumping back to that step, then «Start your experience» → `completeOnboarding`. |

## Architecture

- **`src/onboarding/goals.ts`** — the 13 goals, bilingual labels, `normalizeGoals`
  (dedupe, unknown-drop, `free` exclusivity), `wantsReasoning` (drives the
  conditional question).
- **`src/onboarding/profile.ts`** — profile types + `followUpQuestions(goals)`
  (dynamic, ordered) + `styleDirective`/`applyStyleDirective` (the chat
  integration, pure and pinned by tests).
- **`src/onboarding/recommendation.ts`** — the engine: `GOAL_TRACKS` (all 13
  goals mapped), `pickModel` (strength order from the profile, cut down by the
  RAM verdict — «tight» counts, «insufficient» downgrades — then by disk when
  known), `recommend` (track + model + reasons + honesty notes). It can only
  ever return `CATALOG` ids.
- **`src/onboarding/permissions.ts`** — the registry: 9 permissions, each with
  real `check`/`request`/`openPage` IO (expo-notifications, expo-location,
  PermissionsAndroid, expo-local-authentication, and the RafeeqTools native
  module's `permissionsStatus`/`openPermissionSettings` for the special-access
  pages). `usePermissionStates` re-reads on every foreground return.
- **`src/store/profileStore.ts`** — persisted profile (`rafeeq.profile.v1`),
  normalizing `merge`, and a derived recommendation that is invalidated whenever
  any input changes.

### Integrations that make it real

- **Chat**: `chat/[id].tsx → sendOptions()` appends `styleDirective(profile, lang)`
  to the winning system prompt — the personalization follows both sending and
  regenerating, without touching conversation personas.
- **Motion**: `AuroraBackground` and `RafeeqBot` honor the new `settings.animated`
  switch together with the OS reduced-motion preference.
- **Settings**: a «First-time setup» section — Permissions Center (`/permissions`),
  My goals (`/profile`, recompute + apply the recommendation to the default model),
  and «Rerun onboarding» (a dialog; `resetOnboarding` flips the gate and keeps
  every chat, model and setting).
- **RTL**: the language step reuses `applyLayoutDirection` + the single
  RTL-reload guard; the persisted step resumes after the reload.

### Adaptive behavior

- First run: `onboardingCompleted=false` gates the whole tabs stack behind the
  wizard (root `Stack.Protected`, unchanged from v0.21).
- Resume: every step persists `onboardingStep`; the welcome screen redirects to
  it — kill the app mid-wizard and you land exactly where you left.
- Re-run: keeps data, pre-fills the goals editor from `profileStore`.
- Existing users: `onboardingCompleted=true` survives the update; the wizard
  never reappears on its own.

## Honest availability (unchanged contract)

- Integrated & downloadable: 4 GGUF chat models, 2 Whisper voices, the built-in
  Saudi TTS.
- Documented-only: image/video/3D and every other catalog entry — the
  recommendation says so plainly instead of promising a download.
- Permissions the app never uses (camera, SMS, files beyond the picker, …) are
  simply absent from the registry — no permission theater.

## Tests

- `__tests__/onboarding.test.ts` — the step flow, goals normalization, dynamic
  questions, profile store invalidation, style directive strings (ar/en).
- `__tests__/onboardingRecommendation.test.ts` — mapping, priority, RAM/disk
  downgrades (pinned byte math), honesty invariants, alternates order,
  ReasonKey i18n coverage.
- `__tests__/onboardingPermissions.test.ts` — registry integrity, bilingual
  copy for all 9×3 item keys and 5 state keys, no-runtime-request for the
  special-access set, `readAllPermissionStates` never throwing.

Gate at delivery: `tsc --noEmit` clean, `eslint --max-warnings=0` clean,
`jest --ci` **85 suites / 1,340 tests green**, `qa_i18n.js` I18N CLEAN
(878 = 878 keys), `qa_routes.py` ALL ROUTES RESOLVE.
