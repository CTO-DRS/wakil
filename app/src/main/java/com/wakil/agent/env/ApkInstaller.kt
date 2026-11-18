package com.wakil.agent.env

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File

/** Opens Android's installer for an APK built inside the Linux env. */
object ApkInstaller {
    /** Returns null on success, or an Arabic error message. */
    fun install(ctx: Context, apk: File): String? {
        if (!apk.isFile) return "الملف غير موجود: ${apk.name}"
        if (!ctx.packageManager.canRequestPackageInstalls()) {
            ctx.startActivity(
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.packageName))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            return "فعّل «السماح من هذا المصدر» لوكيل ثم اضغط تثبيت مرة ثانية."
        }
        val dir = File(ctx.cacheDir, "apks").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() }
        val copy = File(dir, apk.name)
        apk.copyTo(copy, overwrite = true)
        val uri = FileProvider.getUriForFile(ctx, ctx.packageName + ".apks", copy)
        ctx.startActivity(
            Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        return null
    }
}
