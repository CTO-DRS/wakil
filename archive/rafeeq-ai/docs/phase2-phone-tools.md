# Phase 2 — Phone tools: the agent that acts on the device

Competition context (Create AI Agents Championship, *Best Personal AI Agent*):
a doing agent, not a chatbot. Phase 1 gave Rafeeq the loop, the grammar and
the visible plan. Phase 2 gives it **hands**: twenty-one on-device tools over
contacts, calls, messages, alarms, timers, calendar, notifications, todos and
prayer times — 100 % offline, every state-changing call behind the explicit
confirmation card, on the target device (Infinix GT 30, arm64, 8 GB RAM).

## The tool table

| Tool | Category | Risk | What it does | Permission |
| --- | --- | --- | --- | --- |
| `contacts.search` | communication | read-only | Searches the device contacts DB by name/number fragment | `READ_CONTACTS` |
| `contacts.call` | communication | mutating | Dials immediately (`ACTION_CALL`), or opens the pre-filled dialer when `CALL_PHONE` is missing | `CALL_PHONE` |
| `messages.sms_draft` | communication | mutating | Opens the SMS app with body + recipient pre-filled; **the user always presses send** | none |
| `messages.whatsapp_draft` | communication | mutating | Opens WhatsApp (direct chat via `wa.me` or share); the user presses send | none |
| `alarms.set` | device | mutating | Sets an alarm in the device clock app (`ACTION_SET_ALARM`, skip-UI) | `com.android.alarm.permission.SET_ALARM` |
| `timers.set` | device | mutating | Starts a clock-app timer, 5 s – 24 h | same |
| `calendar.events` | productivity | read-only | Lists upcoming events (Instances table → recurring events expand) | `READ_CALENDAR` |
| `calendar.create` | productivity | mutating | Inserts an event through the calendar provider | `READ_CALENDAR` + `WRITE_CALENDAR` |
| `calendar.move` | productivity | mutating | Updates an event's start/end | same |
| `device.torch` | device | mutating | Toggles the camera flash (`CameraManager.setTorchMode`) | none |
| `device.dnd` | device | mutating | Toggles Do Not Disturb (`setInterruptionFilter`) | `ACCESS_NOTIFICATION_POLICY` (special) |
| `device.brightness` | device | mutating | Sets screen brightness 1–255 | `WRITE_SETTINGS` (special) |
| `device.wifi_panel` | device | mutating | Opens the Android 10+ connectivity settings panel | none |
| `reminders.create` | productivity | mutating | One-shot local notification at an ISO time or in N minutes | `POST_NOTIFICATIONS` |
| `reminders.list` | productivity | read-only | Lists the agent's pending reminders with ids | — |
| `reminders.cancel` | productivity | mutating | Cancels a scheduled reminder by id | — |
| `todos.add` / `todos.list` / `todos.complete` | notes | mutating / read-only / mutating | The on-device task shelf (KV-backed, 200-cap) | — |
| `prayer.times` | time | read-only | Offline prayer times for the device location or a named Saudi city | optional `ACCESS_COARSE_LOCATION` (never prompted mid-run) |
| `prayer.reminders_set` | time | mutating | Schedules the next five prayers as one-shot notifications, replacing its own previous set | `POST_NOTIFICATIONS` |

Plus the four Phase-1 tools (`time.now`, `device.model_info`, `notes.create`,
`notes.list`) — the registry is 25 tools, and the prompt catalog stays under
~6.5 KB in either language (enforced by `__tests__/agentAllTools.test.ts`).

## Architecture

```
goal → plan (grammar) → visible plan card → per step:
  act call (grammar) → pure normalizers (normalize.ts)
    → confirmation card (mutating only, confirmation.ts)
    → RafeeqTools native module (Kotlin) → {ok, code} result
    → localized observation → next step
```

- **One Expo module** (`modules/expo-rafeeq-tools/`) carries the whole native
  surface. Kotlin never throws into JS: every method resolves
  `{ok: boolean, code?: string, ...payload}` and the JS layer owns the single
  translation table (`codeMessage`) so each failure surfaces as an Arabic
  sentence the agent can repeat, not a stack trace.
- **Graceful degradation.** On iOS/web the module lookup returns null and
  every phone tool answers with an honest "Android-only in this build"
  observation; the plan still completes.
- **The grammar/normalizer handshake.** The GBNF string rule forbids quotes,
  backslashes and control characters; `sanitizeGrammarText` enforces the same
  rule on every free-text argument, so what the grammar allows is exactly
  what the native side receives.
- **Pure testable core.** All argument parsing (Arabic-Indic digits, phone
  forms, local ISO timestamps with a round-trip check against JS Date
  rollover, timer bounds) is pure; the native module, the notification
  platform and the location fix ride injectable interfaces.

## Permission strategy (data-protection rule)

1. The **confirmation card** gates every mutating call *before* it runs —
   the user sees tool + arguments and approves per step.
2. Runtime permissions are requested at tool use, never at startup: a denied
   permission becomes a structured code, the tool translates it into an
   instruction («أحتاج إذن جهات الاتصال…»), and for the special permissions
   (DND policy, write-settings) the tool opens the exact settings screen.
3. SMS/WhatsApp are **draft-only**: the native side never presses send.
   The user keeps the final hand on every outbound message.
4. Nothing leaves the phone. The module holds zero network code; the wa.me
   URL is only handed to the WhatsApp app itself.

## Prayer times — method and validation

Pure solar-position math, Umm al-Qura convention (the official Saudi method):
Fajr at −18.5°, Isha = Maghrib + 90 min (always), Asr by the Shafi'i shadow
factor, sunrise/sunset at −0.833°. Input: civil local date + lat/lng + fixed
UTC offset (Saudi Arabia is +3, no DST).

Validated against the published Riyadh tables (timesprayer.com, November
2026, cross-checked with al-habib.info and almosaly.com, which differ between
themselves by a few minutes):

| 2026 | Fajr | Sunrise | Dhuhr | Asr | Maghrib | Isha |
| --- | --- | --- | --- | --- | --- | --- |
| Nov 01 published | 04:40 | 06:00 | 11:36 | 14:49 | 17:13 | 18:43 |
| Nov 01 computed | 04:40 | 06:00 | 11:36 | 14:49 | 17:13 | 18:43 |
| Nov 08 published | 04:44 | 06:04 | 11:37 | 14:46 | 17:09 | 18:39 |
| Nov 08 computed | 04:44 | 06:04 | 11:36 | 14:46 | 17:09 | 18:39 |
| Nov 20 published | 04:51 | 06:12 | 11:38 | 14:43 | 17:05 | 18:35 |
| Nov 20 computed | 04:51 | 06:12 | 11:38 | 14:43 | 17:04 | 18:34 |

Nov 01 matches exactly; the largest difference anywhere is one minute (the
published Dhuhr/Maghrib tables round to the next minute). The test tolerance
is ±5 min to absorb the published-implementations spread. Ordering
invariants hold for all twelve Saudi cities across the year
(`agentPrayer.test.ts`).

## Test coverage (this phase)

- `agentPhoneArgs.test.ts` — 30+ table-driven normalizer cases (Arabic-Indic
  digits, phone forms, ISO variants and impossibles, clamps, sanitization).
- `agentPhoneTools.test.ts` — scripted native module: every tool's happy
  path, every structured failure code, permission-denial translations,
  DND/brightness settings-guidance, the 13-entry risk table, and a grammar
  build for every schema.
- `agentPrayer.test.ts` — published-table fixtures, Umm al-Qura Isha rule,
  city resolution (English + Saudi Arabic spellings), ordering invariants,
  upcoming-prayers window.
- `agentPrayerTools.test.ts` — location chain (GPS fix / fallback / city),
  reminder replace-not-stack, denied-permission honesty, bilingual output.
- `agentTodos.test.ts`, `agentReminders.test.ts` — the two shelves: caps,
  summaries, id round-trips, cancellation, batch scheduling, permission
  denials, bilingual text.
- `agentAllTools.test.ts` — the composed registry: 25 tools, no duplicates,
  confirmation policy over every mutating flag, grammar build for all
  schemas, catalog size budget, a mixed Saudi plan parse, unknown-tool
  rejection.

`npm run check`: TypeScript clean, ESLint 0 warnings, **1541/1541 tests in
82 suites** (was 1419/75 before this phase).

## Limitations and what comes next

- Alarm/timer scheduling is delegated to the device clock app (the
  sanctioned, permission-light path); exact-alarm ownership moves in-app in a
  later hardening pass if the Infinix clock app misbehaves.
- `reminders.create` uses expo-notifications DATE triggers; reboot
  persistence relies on the library's boot receiver and is verified on
  device in the Phase-5 hardware pass.
- Recurring calendar events list correctly (Instances) but a move of a
  recurring instance edits the whole series (provider semantics).
- The saved-prayer-city setting has no UI yet — the tool's `city` argument
  and the Riyadh default carry it until Phase 3 personalization.
- Phase 3 next: long-term memory + on-device retrieval + the morning
  briefing, riding the same registry and confirmation discipline.
