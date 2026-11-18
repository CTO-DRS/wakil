# Rafeeq AI

Private, on-device AI assistant for Android by **DRS AI**. Models run locally via [llama.rn](https://github.com/mybigday/llama.rn) — chats never leave the phone. Arabic-first UI (RTL) with English support.

## Features

- Fully offline chat with local GGUF models (llama.rn), Arabic-first RTL UI with English.
- **Agent core (v0.14.0):** a goal in Saudi Arabic becomes a visible, editable plan — the agent plans with grammar-constrained decoding (GBNF over llama.rn), calls on-device tools, stops for an explicit confirmation card before anything that changes data, runs with hard limits (max steps, LLM-call budget, per-call and whole-run timeouts) and answers from observed results only. Toggle agent mode with the compass button in the composer; see `docs/agent-model-benchmark.md` for the tool-calling model selection.
- **Phone tools (v0.15.0):** the agent acts on the device itself — contacts search and calls, SMS/WhatsApp drafts (the send button always stays with you), clock-app alarms and timers, calendar read/create/move, one-shot reminders with ids, a local todo shelf, torch / Do Not Disturb / brightness / connectivity-panel shortcuts, and offline Umm al-Qura prayer times with prayer reminders — 21 new tools behind one Kotlin module (`modules/expo-rafeeq-tools`), every mutation still confirmation-gated, every failure explained in Arabic; details in `docs/phase2-phone-tools.md`.
- **Fast download (v0.4.0):** models download over 1-8 parallel connections (default 4) through a local native module (`modules/rafeeq-fastdl`): redirects are resolved first, byte ranges are written straight into one preallocated `.part` file, idle connections steal half of the largest remaining range, progress is saved to a JSON sidecar so pause, resume and resume after the app is killed continue where they stopped, and a foreground-service notification keeps downloads running in the background. Servers without range support fall back to a single stream. Live speed and time left show on the model card; Settings > Downloads has the toggle and connection count. SHA-256 is still verified after every download.

## Development

```bash
npm ci
npm run check        # tsc + eslint + jest
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
```

Release signing reads `RAFEEQ_KEYSTORE_PATH`, `RAFEEQ_KEYSTORE_PASSWORD`, `RAFEEQ_KEY_ALIAS` and `RAFEEQ_KEY_PASSWORD` from the environment (see `plugins/withReleaseSigning.js`). CI builds a signed APK via `.github/workflows/android-apk.yml`.

Stack: Expo SDK 58 · React Native 0.88 · llama.rn 0.12.9.

---

<div dir="rtl">

# رفيق AI

مساعد ذكاء اصطناعي خاص يعمل بالكامل على جهازك الأندرويد، من تطوير **DRS AI**. تعمل النماذج محليًا عبر llama.rn، فلا تغادر محادثاتك هاتفك أبدًا. الواجهة عربية أولًا (من اليمين إلى اليسار) مع دعم اللغة الإنجليزية.

## الميزات

- محادثة دون إنترنت بنماذج GGUF محلية، وواجهة عربية أولًا مع الإنجليزية.
- **نواة الوكيل (الإصدار 0.14.0):** الهدف بالعربية السعودية يتحول إلى خطة ظاهرة قابلة للتعديل — يخطّط الوكيل بتقييد النحو (GBNF عبر llama.rn)، ويستدعي أدوات على الجهاز، ويتوقف عند بطاقة موافقة صريحة قبل أي إجراء يغيّر بياناتك، ويعمل بحدود صارمة (حد الخطوات، ميزانية استدعاءات النموذج، مهلة لكل استدعاء وللمهمة كلها)، ويجيب من النتائج الملاحظة فقط. شغّل وضع الوكيل من زر البوصلة في شريط الكتابة، وتفاصيل اختيار نموذج استدعاء الأدوات في `docs/agent-model-benchmark.md`.
- **أدوات الهاتف (الإصدار 0.15.0):** الوكيل يلمس الجهاز نفسه — البحث في جهات الاتصال والمكالمات، مسوّدات الرسائل وواتساب (زر الإرسال يبقى بيدك دائمًا)، المنبه والمؤقت عبر تطبيق الساعة، قراءة التقويم وإضافة ونقل الأحداث، تنبيهات بوقت محدد مع أرقامها، قائمة مهام محلية، اختصارات المصباح وعدم الإزعاج والسطوع ولوحة الشبكة، ومواقيت الصلاة بطريقة أم القرى دون إنترنت مع تذكيرات الصلوات — 21 أداة جديدة خلف وحدة Kotlin واحدة (`modules/expo-rafeeq-tools`)، كل إجراء يغيّر البيانات ما زال خلف بطاقة موافقة، وكل فشل يُشرح بالعربية؛ التفاصيل في `docs/phase2-phone-tools.md`.
- **التنزيل السريع (الإصدار 0.4.0):** تُنزَّل النماذج عبر 1 إلى 8 اتصالات متوازية (4 افتراضيًا) مثل برامج إدارة التنزيل، تُكتب مباشرة في ملف `.part` واحد، مع إيقاف مؤقت واستئناف حتى بعد إغلاق التطبيق، واستمرار في الخلفية مع إشعار للتقدم. تظهر السرعة والوقت المتبقي على بطاقة النموذج، ويُضبط من الإعدادات > التنزيلات. يبقى التحقق بـ SHA-256 بعد كل تنزيل.

## التطوير

- `npm ci` لتثبيت الحزم
- `npm run check` لفحص الأنواع والتنسيق والاختبارات
- يُبنى ملف APK موقَّع تلقائيًا عبر GitHub Actions.

</div>

---

Copyright (c) 2026 DRS AI. All rights reserved. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
