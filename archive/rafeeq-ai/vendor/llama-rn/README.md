# vendor/llama-rn — pinned android native libs

`llama-rn-android-jni-libs.tar.gz` is the **upstream-original** Android jniLibs
archive for llama.rn **0.12.9**, checked into the repo so CI never depends on
the flakiness of GitHub's release-asset download endpoint (which returned
sustained 5xx during the v0.19.0 builds — for every repository, including ours).

- sha256: `cda945a7c0ed075a0b028c1c3c6f5b668532eb18b069ecc4793ed7ca6cdb65ac`
  (identical to the pin in llama.rn's own `install/native-artifacts.json` —
  the bytes were captured by the `Fetch llama.rn mirror` workflow, which
  verifies this hash before uploading, and re-verified on checkout)
- provenance: `https://github.com/mybigday/llama.rn/releases/download/v0.12.9/llama-rn-android-jni-libs.tar.gz`
- consumer: `scripts/ci-install-llama-android.js` — it tries the live upstream
  download first (SHA-256 verified), and falls back to this vendored copy when
  the endpoint is down. Nothing is extracted without a hash match.
- layout note: CI builds arm64-v8a only (`app.json` → `expo.android.abiFilters`);
  the archive may carry additional ABIs that gradle simply ignores.

To upgrade llama.rn: bump the dependency, run the install once on a machine
with a healthy endpoint, and replace this archive plus the pins in the script
and in this README from the new `install/native-artifacts.json`.
