package com.wakil.agent.onboarding

import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Accessibility
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.BatteryChargingFull
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.core.app.NotificationManagerCompat
import com.wakil.agent.access.WakilAccessibilityService
import com.wakil.agent.priv.ShizukuShell
import com.wakil.agent.priv.ShizukuStatus
import com.wakil.agent.ui.theme.Neon

/** Only the permissions the app actually uses (see AndroidManifest.xml). No storage / overlay: Wakil doesn't need them. */
enum class PermissionKind(
    val title: String,
    val short: String,
    val why: String,
    val bullets: List<String>,
    val icon: ImageVector,
    val color: Color,
    val optional: Boolean,
) {
    NOTIFICATIONS(
        "الإشعارات", "إشعارات",
        "ليُعلمك وكيل بتقدّم المهام الطويلة ويطلب موافقتك على الإجراءات الحساسة حتى وأنت خارج التطبيق.",
        listOf("طلبات الإذن بأزرار سماح/رفض", "تقدّم تنزيل النماذج وإعداد البيئة", "لا إعلانات ولا رسائل تسويقية"),
        Icons.Filled.NotificationsActive, Neon.Cyan, optional = false,
    ),
    ACCESSIBILITY(
        "خدمة الوصول", "الوصول",
        "تتيح لوكيل قراءة ما على الشاشة والنقر والكتابة والتمرير نيابةً عنك داخل التطبيقات الأخرى.",
        listOf("تُستخدم فقط أثناء تنفيذ مهمة طلبتها", "كل إجراء على الشاشة يطلب موافقتك افتراضياً", "لا يُرسل أي شيء خارج جهازك"),
        Icons.Filled.Accessibility, Neon.Violet, optional = false,
    ),
    SHIZUKU(
        "الوضع المميّز (Shizuku)", "Shizuku",
        "اختياري: يمنح وكيل صلاحيات ADB لتنفيذ أوامر النظام بدون روت، مثل إدارة التطبيقات وتغيير الإعدادات.",
        listOf("تحكّم أسرع وأدق بالشاشة", "تثبيت/إيقاف التطبيقات وتغيير الإعدادات", "يمكنك إيقافه في أي وقت من الإعدادات"),
        Icons.Filled.AdminPanelSettings, Neon.Magenta, optional = true,
    ),
    BATTERY(
        "تشغيل في الخلفية", "البطارية",
        "استثناء وكيل من تحسين البطارية حتى لا يوقف النظام المهام الطويلة وتنزيل النماذج عند إطفاء الشاشة.",
        listOf("يعمل فقط أثناء وجود مهمة جارية", "إشعار دائم يوضّح متى يعمل", "يمكنك التراجع من إعدادات النظام"),
        Icons.Filled.BatteryChargingFull, Neon.Green, optional = false,
    );
}

enum class PermStatus { GRANTED, MISSING, NOT_INSTALLED, NOT_RUNNING }

object WakilPermissions {
    const val SHIZUKU_PKG = "moe.shizuku.privileged.api"
    const val SHIZUKU_URL = "https://github.com/RikkaApps/Shizuku/releases/latest"

    /** Steps shown in onboarding, in order. Notification runtime permission only exists on Android 13+. */
    fun steps(sdk: Int = Build.VERSION.SDK_INT): List<PermissionKind> =
        PermissionKind.entries.filter { it != PermissionKind.NOTIFICATIONS || sdk >= 33 }

    fun status(ctx: Context, kind: PermissionKind): PermStatus = runCatching {
        when (kind) {
            PermissionKind.NOTIFICATIONS ->
                if (NotificationManagerCompat.from(ctx).areNotificationsEnabled()) PermStatus.GRANTED else PermStatus.MISSING
            PermissionKind.ACCESSIBILITY ->
                if (WakilAccessibilityService.instance != null || WakilAccessibilityService.isEnabledInSettings(ctx)) PermStatus.GRANTED else PermStatus.MISSING
            PermissionKind.SHIZUKU -> when (ShizukuShell.refresh()) {
                ShizukuStatus.READY -> PermStatus.GRANTED
                ShizukuStatus.NO_PERMISSION -> PermStatus.MISSING
                ShizukuStatus.UNSUPPORTED -> PermStatus.NOT_RUNNING
                ShizukuStatus.NOT_RUNNING -> if (shizukuInstalled(ctx)) PermStatus.NOT_RUNNING else PermStatus.NOT_INSTALLED
            }
            PermissionKind.BATTERY ->
                if (ctx.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(ctx.packageName)) PermStatus.GRANTED else PermStatus.MISSING
        }
    }.getOrDefault(PermStatus.MISSING)

    fun shizukuInstalled(ctx: Context) = runCatching { ctx.packageManager.getPackageInfo(SHIZUKU_PKG, 0); true }.getOrDefault(false)

    private fun Context.tryStart(vararg intents: Intent): Boolean {
        for (i in intents) {
            try { startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return true } catch (_: ActivityNotFoundException) {} catch (_: SecurityException) {}
        }
        return false
    }

    fun openAppNotificationSettings(ctx: Context) = ctx.tryStart(
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName),
        appDetails(ctx),
    )

    /** Opens the accessibility page, jumping straight to Wakil's service where the OEM supports it. */
    fun openAccessibility(ctx: Context): Boolean {
        val cn = ComponentName(ctx, WakilAccessibilityService::class.java).flattenToString()
        val details = Intent("android.settings.ACCESSIBILITY_DETAILS_SETTINGS").putExtra(Intent.EXTRA_COMPONENT_NAME, cn)
        val highlighted = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            .putExtra(":settings:fragment_args_key", cn)
            .putExtra(":settings:show_fragment_args", Bundle().apply { putString(":settings:fragment_args_key", cn) })
        return if (Build.VERSION.SDK_INT >= 33) ctx.tryStart(details, highlighted) else ctx.tryStart(highlighted)
    }

    /** App info page: on Android 13+ sideloaded apps must "Allow restricted settings" there before enabling accessibility. */
    fun appDetails(ctx: Context) = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}"))
    fun openAppDetails(ctx: Context) = ctx.tryStart(appDetails(ctx))

    fun requestBatteryExemption(ctx: Context) = ctx.tryStart(
        Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${ctx.packageName}")),
        Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
    )

    fun openShizuku(ctx: Context): Boolean {
        val launch = ctx.packageManager.getLaunchIntentForPackage(SHIZUKU_PKG) ?: return false
        return ctx.tryStart(launch)
    }

    fun openUrl(ctx: Context, url: String) = ctx.tryStart(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
}
