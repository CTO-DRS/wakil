import type { CapacitorConfig } from '@capacitor/cli';

/**
 * إعدادات Capacitor لتطبيق «مساعد OS»
 * appId وappName مطابقان لملف android/app/build.gradle وأندرويد مانيفست
 * حتى لا ينشئ cap sync تعارضاً مع الحزمة الموجودة.
 */
const config: CapacitorConfig = {
  appId: 'com.mosaedos.app',
  appName: 'مساعد OS',
  webDir: 'www',
  android: {
    // حزمة الأندرويد موجودة مسبقاً في هذا المستودع ولا تُعاد كتابتها تلقائياً
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false
  },
  server: {
    androidScheme: 'https'
  }
};

export default config;
