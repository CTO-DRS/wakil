# مساعد OS — حزمة أندرويد

الكود المصدري الكامل لحزمة أندرويد (Capacitor 8) لتطبيق **مساعد OS** — مساعد ذكي باللغة العربية.

> **مستودع خاص** — يتضمن ملفات التوقيع. لا تشاركه ولا تفعّله للعام.

## المواصفات

| العنصر | القيمة |
|---|---|
| معرّف التطبيق | `com.mosaedos.app` |
| الإصدار | 1.2.0 (versionCode 4) |
| Capacitor | 8.6.2 |
| Gradle | 8.14.3 |
| compileSdk / targetSdk | 36 |
| minSdk | 24 (أندرويد 7.0) |
| الأذونات | الكاميرا، الميكروفون، الإشعارات، الوسائط، الاهتزاز، Bluetooth |

## البناء

هذا المجلد هو جزء `android/` من مشروع Capacitor — يحتاج بيئة الويب حوله:

```bash
# 1) ضع هذا المجلد باسم android داخل مشروع Capacitor/Next.js
# 2) ثبّت الاعتماديات في جذر المشروع
npm install

# 3) مزامنة الويب مع أندرويد (تنشئ capacitor-cordova-android-plugins وملفات assets تلقائياً)
npx cap sync android

# 4) بناء حزمة الإصدار الموقّعة
cd android
./gradlew assembleRelease
```

## التوقيع

ملفات التوقيع موجودة في هذا المستودع الخاص:

- `mosaed-release.jks` — مفتاح التوقيع
- `keystore.properties` — إعدادات المفتاح (كلمات المرور والاسم المستعار)

`app/build.gradle` يقرأهما تلقائياً وينتج حزمة موقّعة بنفس توقيع الإصدارات المنشورة —
**لا تحذفهما ولا تفقدهما**، فبدونهما لا يمكن إصدار تحديث قابل للتثبيت فوق النسخ الحالية.

## البنية

```
android/
├── app/                    # التطبيق الرئيسي (MainActivity + الموارد + المانيفست)
├── build.gradle            # إعدادات Gradle الجذر
├── settings.gradle         # وحدات المشروع + إعدادات Capacitor
├── capacitor.settings.gradle # ربط إضافات Capacitor من node_modules
├── variables.gradle        # إصدارات المكتبات
├── mosaed-release.jks      # مفتاح توقيع الحزمة (سري — للمستودع الخاص فقط)
├── keystore.properties     # كلمات مرور التوقيع (سري — للمستودع الخاص فقط)
└── gradle/wrapper/         # Gradle 8.14.3
```
