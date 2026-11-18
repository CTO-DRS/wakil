# مساعد OS — Capacitor 8 (مكتمل داخل الحزمة)

هذا التطبيق الآن **مكتفٍ ذاتياً** داخل حزمة DRS AI Suite: جذر مشروع Capacitor في هذا
المجلد، وحزمة الأندرويد (التي كانت مستودعاً مستقلاً باسم `mosaed-os-android`) في
المجلد الفرعي [`android/`](android/).

> المستودع الأصلي كان يحتوي على جزء الأندرويد فقط، ويفترض وضعَه كمجلد `android/`
> داخل مشروع Capacitor/Next.js خارجي. هنا أُنشئ جذر المشروع الناقص
> (`package.json` + `capacitor.config.ts` + `www/`) حتى يعمل دون أي مجلد خارجي.

## المواصفات (كما في المستودع الأصلي)

| العنصر | القيمة |
|---|---|
| معرّف التطبيق | `com.mosaedos.app` |
| الإصدار | 1.2.0 (versionCode 4) |
| Capacitor | 8.6.2 |
| Gradle | 8.14.3 |
| compileSdk / targetSdk | 36 |
| minSdk | 24 (أندرويد 7.0) |

## البناء

```bash
cd apps/mosaed-os

# 1) تثبيت اعتماديات Capacitor (core, android, cli + الإضافات الخمس)
npm install

# 2) وضع مخرجات واجهة الويب في مجلد www/ (يوجد index.html افتراضي جاهز)
#    ثم مزامنة الويب مع الأندرويد (تنشئ capacitor-cordova-android-plugins وassets)
npm run sync

# 3) بناء حزمة الإصدار الموقّعة
npm run build:apk
# أو: cd android && ./gradlew assembleRelease
```

## التوقيع

ملفات التوقيع الأصلية محفوظة كما هي داخل `android/`:

- `android/mosaed-release.jks` — مفتاح التوقيع
- `android/keystore.properties` — إعدادات المفتاح (كلمات المرور والاسم المستعار)

`android/app/build.gradle` يقرأهما تلقائياً وينتج حزمة موقّعة بنفس توقيع الإصدارات
المنشورة — **لا تحذفهما ولا تفقدهما**، فبدونهما لا يمكن إصدار تحديث قابل للتثبيت
فوق النسخ الحالية. وهما مخصصان لمستودع خاص؛ إن كانت نسختك من الحزمة ستُنشر
عامّة فانقلهما إلى GitHub Secrets أولاً (انظر `docs/BUILD.md`).

## البنية

```
apps/mosaed-os/
├── package.json           # جذر Capacitor (أُنشئ أثناء الدمج)
├── capacitor.config.ts    # appId/appName/webDir مطابقة للحزمة
├── www/                   # حزمة الويب (placeholder جاهز للبناء)
└── android/               # حزمة الأندرويد الأصلية كما وردت (تعديل: لا شيء)
    ├── app/               # MainActivity + الموارد + المانيفست
    ├── build.gradle       # إعدادات Gradle الجذر
    ├── settings.gradle    # يطبّق capacitor.settings.gradle من ../node_modules
    ├── variables.gradle   # إصدارات المكتبات
    ├── mosaed-release.jks # مفتاح توقيع الحزمة (سري)
    └── keystore.properties# كلمات مرور التوقيع (سري)
```

ملاحظة: `android/capacitor.settings.gradle` يشير إلى `../node_modules` أي مجلد
`apps/mosaed-os/node_modules` — وهذا يعمل تلقائياً مع الترتيب الجديد دون تعديل.
