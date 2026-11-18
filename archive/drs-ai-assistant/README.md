# DRS AI — مساعد ذكي على جوالك

<div dir="rtl">

## بالعربي

**DRS** مساعد محادثة ذكي يعمل **بالكامل على جوالك بدون إنترنت**. محادثاتك تبقى على جهازك ولا تُرسل لأي خادم.

### المزايا
- واجهة عربية أولًا (من اليمين لليسار) مع دعم الإنجليزية.
- نموذجان يعملان محليًا عبر llama.cpp وتختار بينهما:
  - **Jais‑3‑0.9B** من Inception / IFM (مُوصى به للعربية، حوالي 635 ميجابايت). نموذج «يفكّر» قبل الرد، والتفكير مخفي ويمكن عرضه بلمسة.
  - **Qwen2.5‑1.5B‑Instruct** (متعدد اللغات، حوالي 1.1 جيجابايت).
- يُحمَّل النموذج المختار مرة واحدة ويُتحقق منه بـ SHA‑256، وبعدها يشتغل بدون إنترنت. من الإعدادات تقدر تحمّل أو تبدّل أو تحذف أي نموذج.
- حفظ سجل المحادثات على الجهاز.
- متوافق مع صفحات الذاكرة 16 كيلوبايت (Android 15+).

### المتطلبات
- أندرويد 8.0 (API 26) أو أحدث، معالج arm64‑v8a.
- يُفضّل 4 جيجابايت رام أو أكثر، ومساحة فاضية 1 جيجابايت تقريبًا لـ Jais‑3 أو 1.5 جيجابايت لـ Qwen.

### التثبيت
نزّل ملف `DRS-AI-0.2.0-arm64.apk` من صفحة **Releases** وثبّته على جوالك.

### البناء من المصدر
```bash
git clone --recurse-submodules https://github.com/CTO-DRS/DRS-AI-Assistant.git
cd drsai-assistant
./gradlew assembleRelease
```
يحتاج JDK 17 و Android SDK 36 و NDK 27.2.12479018 و CMake 3.31.6.

### الترخيص
درس برنامج حر ومفتوح المصدر بترخيص **GPL-3.0-or-later** (من الإصدار 0.3.0؛ الإصدارات حتى 0.2.0 كانت MIT)، لأن محوّل النطق العربي مشتق من بيانات espeak-ng المرخّصة بـ GPL-3.0. llama.cpp و ONNX Runtime مرخّصان بـ MIT، ونماذج Jais‑3 و Qwen2.5 و Nabra-Saudi-7M مرخّصة بـ Apache‑2.0 ولا تُضمَّن في التطبيق بل تتحمّل عند الطلب. التفاصيل في `LICENSE` و `NOTICE` وفي شاشة «التراخيص» داخل التطبيق.

</div>

---

## English

**DRS** is an AI chat assistant that runs **entirely on your phone, offline**. Conversations stay on the device and are never sent to a server.

### Features
- Arabic-first (RTL) interface with English support.
- Two on-device models via llama.cpp (JNI, arm64-v8a), chosen at onboarding and switchable in Settings:
  - **Jais-3-0.9B** by Inception / IFM (recommended for Arabic, ~635 MB, K2 Horizon architecture). It is a reasoning model; its thinking is hidden from the reply and can be expanded on tap.
  - **Qwen2.5-1.5B-Instruct** (multilingual, ~1.1 GB).
- The chosen model is downloaded once and verified by SHA-256; after that the app works offline. Settings can download, switch, pause/resume and delete each model.
- On-device chat history.
- 16 KB page-size compatible native libraries (Android 15+).

### Requirements
- Android 8.0 (API 26)+, arm64-v8a device.
- 4 GB RAM or more recommended, ~1 GB free storage for Jais-3 (~1.5 GB for Qwen).

### Install
Download `DRS-AI-0.2.0-arm64.apk` from the **Releases** page and install it.

### Build from source
```bash
git clone --recurse-submodules https://github.com/CTO-DRS/DRS-AI-Assistant.git
cd drsai-assistant
./gradlew testReleaseUnitTest assembleRelease
```
Requires JDK 17, Android SDK platform 36, build-tools 36.0.0, NDK 27.2.12479018 and CMake 3.31.6.
Release signing reads `DRS_KEYSTORE_PATH`, `DRS_KEYSTORE_PASSWORD`, `DRS_KEY_ALIAS` and `DRS_KEY_PASSWORD` from the environment; without them the release build is signed with the debug key.

CI (`.github/workflows/android.yml`) runs unit tests, builds the release APK, checks 16 KB alignment and publishes release `v<versionName>` (read from `app/build.gradle.kts`) on every push to `main`. Repository secrets: `DRS_KEYSTORE_BASE64`, `DRS_KEYSTORE_PASSWORD`, `DRS_KEY_ALIAS`, `DRS_KEY_PASSWORD`.

### License
GPL-3.0-or-later since 0.3.0 (releases up to 0.2.0 were MIT) — see `LICENSE`. The Arabic G2P (`voice/g2p/ArabicG2p.kt`, `assets/nabra_lexicon.tsv.gz`, `assets/nabra_numbers.tsv`) is derived from espeak-ng's GPL-3.0 Arabic data. llama.cpp and ONNX Runtime are MIT; Jais-3-0.9B, Qwen2.5-1.5B-Instruct and the Nabra-Saudi-7M voice are Apache-2.0 and are downloaded at runtime, not bundled. See `NOTICE` and the in-app Licenses screen.
