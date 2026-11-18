# Changelog

## [0.3.0] — 2026-11-04

- **Offline Saudi-Arabic voice**: DRS reads its replies aloud with Nabra-Saudi-7M (oddadmix, Apache-2.0) running on ONNX Runtime 1.22.0, fully on the device.
  - Sentences are spoken as soon as they are finished while the reply is still streaming; the hidden reasoning, code blocks, markdown, links and emoji are never read.
  - Speaker toggle in the chat top bar (auto-read on/off, remembered), play/stop button on every reply, and a new message or the stop button silences it.
  - Settings → Voice: download the voice (~16 MB, SHA-256 verified, resumable), try it, delete it, and set the speech rate (0.8–1.3).
  - Pure-Kotlin Arabic G2P reproducing the model's espeak-ng training front-end (58/60 reference sentences exact; unit-tested in CI).
- **Open source under GPL-3.0-or-later** (was MIT), because the Arabic G2P data is derived from espeak-ng (GPL-3.0). New in-app "Licenses" screen; `NOTICE` lists every third-party component.
- The APK is larger (ONNX Runtime native library, ~18 MB uncompressed). The voice model itself is not bundled.

## [0.2.0] — 2026-11-04

- New model: **Jais-3-0.9B** (Inception / IFM, Apache-2.0, Q4_K_M, ~635 MB). Recommended default for Arabic; smaller download than Qwen.
- Choose a model during onboarding; in Settings you can download, switch, pause/resume and delete each model. The selected model is remembered (existing v0.1.0 installs keep using Qwen).
- Jais-3 is a reasoning model: its thinking is hidden from the reply (tap "Show reasoning" to peek during the session) and only the answer is saved to chat history. Reasoning effort is set to the template's lowest level for speed.
- SHA-256 verification for every model download, as before.
- CI publishes the release tag from `versionName` instead of a hard-coded version.
- Unit tests for reasoning stripping, the Jais-3 prompt format and the model catalog.

## [0.1.0] — 2026-11-04

- First release: offline Arabic-first chat with Qwen2.5-1.5B-Instruct via llama.cpp (arm64-v8a).
