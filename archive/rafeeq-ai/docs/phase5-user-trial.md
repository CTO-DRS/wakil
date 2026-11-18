# Phase 5 — User trial protocol (10 users × 1 week)

Competition build (Create AI Agents Championship, *Best Personal AI Agent*) — Phase 5 of 6.
The Validate criterion asks for **real-user evidence**: ten participants run the agent on
their own Android phone for one working week. This document is the standing protocol the
trial follows; results go into `docs/phase5-quality.md` and the Phase-6 one-pager.

## Ethics & privacy

- **Consent**: each participant signs (or voice-records) the one-paragraph consent below
  before receiving the build. Participation is voluntary and unpaid.
- **Data**: the app is 100 % offline. Nothing the participant says, stores or does leaves
  the device; the diary asks for *counts and minutes*, never content. The researcher
  never reads the participant's notes, reminders or memory shelf.
- **Wipe**: at the end of the week the participant taps *Settings → Wipe my data*; the
  researcher confirms the app reports the wipe and the participant keeps the device.

> Consent text (read aloud, Arabic, then signed):
> «سأستخدم تطبيق رفيق أسبوعًا واحدًا على جهازي. التطبيق لا يرسل أي شيء خارج الجهاز.
> سأكتب يوميًا عدد المهام التي نجحت وفشلت والدقائق التي استغرقها كل نوع، دون كتابة
> محتوى خاص. أستطيع التوقف في أي وقت ومسح بياناتي بزر واحد.»

## Recruitment

Ten participants, deliberate mix (the judges' audience is Saudi/Gulf Arabic-first):

| Slot | Profile | Why |
| --- | --- | --- |
| 1–4 | Working adults 25–45, daily smartphone users | core personal-agent use |
| 5–6 | Adults 55+, larger fonts enabled | accessibility / elderly angle |
| 7 | User who depends on a screen reader (TalkBack) | accessibility proof |
| 8 | Shift worker (reminders/alarms heavy) | scheduling tools |
| 9 | Student (todos, briefing) | study workflows |
| 10 | Small-business owner (contacts/WhatsApp drafts) | communication tools |

Inclusion: Android phone ≥ 6 GB RAM, willing to install the signed APK, Arabic speaker.
The researcher records only: slot, profile, phone model, app version.

## Setup (day 0, ~15 min, in person or on a call)

1. Install the signed release APK (the CI-built artifact, sideloaded).
2. Onboarding: language = Arabic, download the recommended model on Wi-Fi **before**
   leaving (this is the only networked step, done once, user-initiated).
3. Walk through three example tasks together: a reminder, a note, a prayer-time query.
4. Enable the participant's own accessibility need (font scale / TalkBack) now.

## The week

Each participant tries **at least 3 tasks per day** from their own life, covering at
least four tool families over the week (reminders/alarms/timers; notes/todos; calendar;
contacts/messages; prayer times; device settings; memory; briefing).

**Daily diary (2 minutes at night, counters only — no content)** — filled in the app itself (*Settings → Measurements & trial → Trial diary*), which schedules the 21:30 nudge and exports the week as a counters-only CSV when the participant chooses to share it:

| Field | Example answer |
| --- | --- |
| Tasks tried today | 4 |
| … completed end-to-end without a fix | 3 |
| … needed a rephrase/retry | 1 |
| … wrong action done (agent changed something I didn't ask) | 0 |
| Confirmation cards shown before changes | all of them |
| Minutes spent total | 6 |
| Voice used (spoken goal) instead of typing | 2 of 4 |
| One word on how the agent felt | «سريع» |

**End of week (10 min):** SUS-style 10 statements, scored 1–5, plus two open questions
(«وش أكثر شيء أعجبك؟» / «وش الشي اللي ما راح تستخدمه مرة ثانية؟»).

## Metrics this yields (all computed from the diaries)

- **Task completion rate** (participant-reported, cross-checked against the app's local
  usage counters — no content, counts only).
- **Misfire rate as experienced by users** — the Phase-5 eval-suite number is the model's;
  this one is the human's. Both are reported side by side.
- **Confirmation-card coverage**: every state-changing action must have shown a card
  (any "no" is a P0 bug, investigated immediately).
- **Time-on-task trend**: day 1 vs day 7 minutes for the same task family (learning curve).
- **SUS score** (arithmetic mean × 2, standard scoring).

## Known limitations & next steps

- Ten users, one week, one country: this is evidence of demand and usability, not a
  statistical trial. The Phase-6 pitch frames it as such.
- Self-reported counters can drift; the usage-stats screen gives the app-side ground
  truth for runs/tokens to sanity-check the diaries.
- After the trial: fold the numbers into the one-page results summary and the pitch deck's
  Validate slide.
