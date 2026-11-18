# Building Wakil (وكيل)

## Layout
- `app/src/main/cpp/` — JNI bridge (`wakil_llama.cpp`) + CMake that pulls in llama.cpp, and `wakil_pty.c` (PTY helper).
- `app/src/main/jniLibs/arm64-v8a/` — prebuilt native libs packaged into the APK:
  - `libwakil_llama.so` — built by `scripts/build-native.sh` (llama.cpp tag **b12374**, commit 9183a552e5fd), CPU-only baseline.
  - `libwakil_llama_i8mm.so` — same, fast armv8.6/i8mm CPU kernels **+ Vulkan backend** (GGML_VULKAN=ON): ~1450
    precompiled SPIR-V shaders embedded (~38MB). Host needs: `glslc` on PATH (build shaderc — Debian/Ubuntu apt
    has no glslc binary), SPIRV-Headers cmake config (`spirv-headers` deb, auto-detected), and a Vulkan-Headers
    checkout at `~/host-tools/Vulkan-Headers` for `vulkan/vulkan.hpp` (the NDK sysroot ships C headers only).
    `scripts/build-native.sh` also shims glslc so the coopmat2/bfloat16/fp4/fp8 shader variants (NVIDIA-only or
    unused) are skipped — saves ~4MB per variant. GPU offload stays opt-in at runtime (`Prefs.gpuLayers`, default 0).
  - `libwakil_pty.so` — built by `scripts/build-pty.sh` (one C file, bionic `openpty()` from libc, API 23+).
    Host-verifiable: `gcc scripts/pty_host_test.c app/src/main/cpp/wakil_pty.c -I<jdk>/include -I<jdk>/include/linux -pthread`
    runs a fake-JNI smoke test (spawn → prompt → echo → resize → exit 0 → kill → 128+SIGKILL).
  - `libproot.so`, `libproot-loader.so`, `libtalloc.so`, `libandroid-shmem.so` — from Termux packages
    (`proot_5.1.107.102_aarch64.deb`, `libtalloc_2.5.0_aarch64.deb`, `libandroid-shmem_0.7_aarch64.deb`),
    renamed to `lib*.so` so the package manager extracts them into `nativeLibraryDir` (exec-able under W^X),
    with `patchelf --remove-rpath` and `--replace-needed libtalloc.so.2 libtalloc.so` on proot,
    `--set-soname libtalloc.so` on talloc. `extractNativeLibs=true` / `useLegacyPackaging=true`.
- `app/src/main/java/com/wakil/agent/` — Kotlin/Compose app:
  - `llm/` llama JNI wrapper, local/remote (OpenAI-compatible) backends, model download/import.
  - `env/LinuxEnv.kt` Alpine rootfs install + proot runner (`-0 --link2symlink --kill-on-exit`, `env -i` inside guest); `env/PtySession.kt` + `env/PtyNative.kt` run the same proot argv under a real PTY (interactive terminal).
  - `agent/` agent loop, JSON tool-call parser, tools, per-tool Allow/Ask/Deny, approval notification.
  - `access/` AccessibilityService (read screen, tap, type, scroll, back, home).
  - `priv/` Shizuku (`sys_shell`, reflection on `Shizuku.newProcess`) and optional `su` (`root_shell`).
  - `service/` ref-counted foreground service (specialUse) + wake lock.

## Steps
```sh
scripts/fetch-deps.sh
export NDK_ROOT=/path/to/android-ndk-r27c
scripts/build-native.sh
echo "sdk.dir=/path/to/sdk" > local.properties    # needs platforms;android-35 and build-tools;35.0.0
./gradlew assembleDebug testDebugUnitTest
```

### linux-aarch64 build hosts (how v1 was actually built)
Google ships no linux-aarch64 NDK or aapt2. v1 was built on Debian 13 arm64:
- Native: host `clang-19`/`lld` + NDK r27c sysroot via `scripts/hostclang-android-arm64.toolchain.cmake`.
  `CLANG_RESOURCE_DIR` = copy of `$(clang-19 -print-resource-dir)` with the NDK's
  `toolchains/llvm/prebuilt/linux-x86_64/lib/clang/18/lib/linux/*` (compiler-rt builtins, libunwind) copied into `lib/linux/`.
- aapt2: x86_64 aapt2 from build-tools 35.0.0 under `qemu-x86_64` (needs `libc6:amd64`). The wrapper must be
  named `aapt2`: copy `scripts/aapt2-qemu.sh` to `<dir>/aapt2` and pass
  `-Pandroid.aapt2FromMavenOverride=<dir>/aapt2`.
- JDK 17 (Temurin), Gradle 8.11.1, AGP 8.7.3, Kotlin 2.1.0, Compose BOM 2024.12.01.

## v1.1.0 UI ("Jarvis" HUD redesign)
- UI only: `ui/theme/Theme.kt` (palette, IBM Plex Sans Arabic + JetBrains Mono, both OFL, licenses in `assets/licenses/`),
  `ui/components/` (energy orb, aurora background, glass cards, neon switch/segmented/progress ring, floating dock),
  restyled `ChatScreen`, `TerminalScreen`, `ModelsScreen`, `SettingsScreen`, splash + approval dialog in `MainActivity`.
- Text direction follows content (`TextDirection.Content`); code/terminal text is forced LTR (`MonoLtr`).
- Signing: debug builds are signed with the committed `keystore/wakil-debug.keystore` (alias `androiddebugkey`,
  password `android`) so every future build installs over the previous one. v1.0.0 used a throwaway key, so
  1.0.0 -> 1.1.0 needs one uninstall.
- Preview screenshots (Robolectric native graphics, works on linux-aarch64 with Robolectric 4.18):
  `./gradlew :app:testDebugUnitTest -Pwakil.previews=true --tests '*UiPreviews*'` -> `../out/v1.1-previews/*.png`.
  The flag adds the preview test source set and test-only deps; normal builds don't include them.

## v1.2.0 (versionCode 3): onboarding + robot
- `ui/components/Robot.kt`: `WakilRobot` — holographic robot drawn on a Canvas (no assets): helmet, visor eyes with
  blink / power-on flicker, antenna, voice equalizer, bust + projector base, orbit rings, sparks, scanlines clipped to the
  silhouette (no blend modes), `materialize` 0..1 build-up, moods IDLE/TALK/THINK/HAPPY/CELEBRATE, head-only avatar mode.
- `onboarding/OnboardingScreen.kt`: first-run flow (intro → 3 feature pages → one page per permission → ready),
  shown while `Prefs.onboardingDone` is false; replay from Settings.
- `onboarding/Permissions.kt`: notifications (13+), accessibility service (deep link + Android 13 "restricted settings" hint),
  Shizuku (installed / running / permission), battery-optimization exemption (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` added).
  Status is re-read on resume and polled every 1.5 s while a permission page is visible.
- `agent/StreamPreview.kt`: turns the streaming JSON reply into answer text or a "drafting tool" HUD chip (unit-tested).
- Previews now go to `../out/v1.2-previews`.

## v1.3.0 (robot from the icon, sounds, Shizuku guide)
- Robot: `ui/components/Robot.kt` now draws `res/drawable-nodpi/wakil_robot.webp` (cut-out of the icon art, 707×720) and
  `wakil_robot_head.webp` (256², circular avatar) with code effects on top (materialize, lens/shoulder-ring pulse, float, tilt,
  mood aura, orbits, shockwaves/confetti). Cut-out: rembg `isnet-general-use` on a crop of the icon → threshold/close/fill-holes,
  opening + manual keep-polygon to drop the orbit lines, 2px erode, 1.3px feather, isnet alpha in the edge band, bottom/left fades
  (`scripts/assets-gen/robot_cut_*.py`).
- Sounds: `audio/Sfx.kt` (SoundPool, Settings «الأصوات» + volume, silent/vibrate respected). `res/raw/sfx_*.ogg` generated by
  `scripts/assets-gen/sfx_gen.py` (numpy/scipy → Vorbis q2, loudness-normalised with pyloudnorm). `haptic()` plays a matching sound.
- Welcome voice: `res/raw/voice_welcome.ogg` = Piper TTS `ar_JO-kareem-medium` (offline) → rubberband pitch 0.95 → 42 Hz ring-mod,
  comb + short echo (`welcome_voice_robotize.py`). Fallback: Android TTS Locale("ar"), pitch 0.7.
- Shizuku guide: `ui/ShizukuGuideScreen.kt`; text in `ui/ShizukuGuideData.kt` is GENERATED by `scripts/assets-gen/shizuku_guide.py`
  (also writes out/SHIZUKU-GUIDE-ar.md; `shizuku_guide_pdf.py` renders the PDF with WeasyPrint + IBM Plex Sans Arabic).
- Low-RAM build hosts: `-Dorg.gradle.jvmargs=-Xmx1400m -Pkotlin.daemon.jvmargs=-Xmx1000m`; preview test heap is 2g.
