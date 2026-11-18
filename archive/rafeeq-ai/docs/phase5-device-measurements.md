# Phase 5 — Device measurements (battery / RAM / heat)

Competition build (Create AI Agents Championship, *Best Personal AI Agent*) — Phase 5 of 6.
The Validate criterion scores **measurable impact**, so the agent's resource cost is
measured on the actual target device, not estimated. This document is the protocol and
the results template. **Every result cell is filled from a real `device_measure.sh`
run during the trial week — no number here is invented.**

- Target device: **Infinix GT 30** (arm64, 8 GB RAM, Android), the device the judges'
  demo runs on.
- Tool (primary): the **in-app measure lab** (*Settings → Measurements & trial → Measure lab*) — the same protocol, no computer needed; rows persist on the device and export as the CSV pasted below.
- Tool (fallback): [`scripts/device_measure.sh`](../scripts/device_measure.sh) (adb sampler, offline).
- App under test: `com.drsai.rafeeq` v0.18.0+.

### In-app lab behavior (v0.23.1)

- A session runs its declared 30 minutes **wall-clock** and auto-finishes at that
  deadline (with a notification) — leaving the screen no longer matters, because
  the sampler is owned by an app-level driver, not by the lab screen.
- Rows are sampled every 30 s **while the app is foregrounded**; a screen-off
  stretch (S5's own protocol) necessarily shows as a sampling gap. The summary
  therefore shows the honest wall duration **plus the row coverage %**, with an
  explicit low-coverage note under 50 % — never a fake «0:00» from thin rows.
- The battery-drain verdict requires two real readings whose last one reaches the
  session end (5-minute slack); an app killed early gets «—», not a fake pass.
- For S5's screen-off rows specifically, the adb sampler remains the source of
  truth: it records from outside the phone while the screen is off; the in-app
  lab covers the foregrounded sessions (S1–S4) fully and S5's wall span + coverage.

## Protocol

Run each session below **while the sampler records** (`./device_measure.sh <label> 1800 30`),
in airplane mode so the "100 % offline" claim is exercised simultaneously:

| # | Session | What the user does for 30 min | What we expect to hold |
| --- | --- | --- | --- |
| S1 | Idle | App open, agent mode on, no task | RAM stable, battery < 2 %/30 min |
| S2 | Chat | 10 chat turns with the loaded model | RAM bounded (model + KV cache) |
| S3 | Agent tasks | 10 plan→approve→run agent tasks (mixed tools) | ≤ S2 + tool overhead |
| S4 | Voice-first | 10 spoken goals (mic → whisper → plan → spoken reply) | first sentence < 3 s (Phase-4 meter) |
| S5 | Briefing + idle week-sim | morning briefing, then 30 min screen-off | no wake storms, no battery drain |

For each session record: battery level %, battery temperature (°C), instantaneous
power (mW, negative = discharging), app PSS (KB), thermal status string.

## Results — filled during the trial week

> ⚠️ Template until the Infinix GT 30 runs are recorded. Do NOT fill from imagination.

### S1 — Idle

| time (s) | battery % | temp °C | power mW | PSS KB |
| --- | --- | --- | --- | --- |
| 0 | _(run)_ | _(run)_ | _(run)_ | _(run)_ |
| 900 | | | | |
| 1800 | | | | |

### S2 — Chat

_(same table shape — paste from the CSV)_

### S3 — Agent tasks

_(same table shape — paste from the CSV)_

### S4 — Voice-first

_(same table shape — plus the Phase-4 latency meter's `timeToFirstSentenceMs` per goal)_

### S5 — Briefing + idle

_(same table shape — paste from the CSV)_

## Acceptance gates

- Battery: ≤ 8 % total drain across one full S4 session (30 min of voice-agent use).
- Heat: battery temperature stays ≤ 40 °C through every session (skin-safe, no throttle cliff).
- RAM: peak PSS ≤ 3.0 GB with the largest selected model loaded (8 GB device budget, system + app headroom).
- Offline: all five sessions run in airplane mode; the app's own logs show zero network calls.

## Known limitations & next steps

- `dumpsys battery` current readings on some Infinix builds self-report while charging;
  sample with the device unplugged and note the charging state per row.
- Thermal status strings vary across Android builds; the raw string is recorded verbatim
  and interpreted only in the report summary, never silently normalized.
- After the trial week, the filled tables + the eval-suite numbers move into the
  one-page results summary (Phase 6 deliverable).
