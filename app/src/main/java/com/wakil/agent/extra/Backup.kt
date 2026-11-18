package com.wakil.agent.extra

import android.content.Context
import android.net.Uri
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

/**
 * Export / import of chats, memory, scheduled tasks, shortcuts and settings as one .zip.
 * The encrypted GitHub token is never exported (it is tied to this phone's keystore anyway).
 */
object Backup {
    private val FILES = listOf("memory.json", "tasks.json", "shortcuts.json", "chat.json")
    private val DIRS = listOf("chats")
    private val PREFS = listOf("wakil.xml")

    fun export(ctx: Context, uri: Uri): Int {
        var n = 0
        ctx.contentResolver.openOutputStream(uri)!!.use { os ->
            ZipOutputStream(os).use { z ->
                fun put(name: String, f: File) { if (f.isFile) { z.putNextEntry(ZipEntry(name)); f.inputStream().use { it.copyTo(z) }; z.closeEntry(); n++ } }
                FILES.forEach { put("files/$it", File(ctx.filesDir, it)) }
                DIRS.forEach { d -> File(ctx.filesDir, d).listFiles()?.forEach { put("files/$d/${it.name}", it) } }
                val sp = File(ctx.applicationInfo.dataDir, "shared_prefs")
                PREFS.forEach { put("prefs/$it", File(sp, it)) }
                z.putNextEntry(ZipEntry("wakil-backup.txt")); z.write("Wakil backup v1\n".toByteArray()); z.closeEntry()
            }
        }
        return n
    }

    /** Restores a backup made by [export]. Returns restored file count; the app should restart afterwards. */
    fun import(ctx: Context, uri: Uri): Int {
        var n = 0; var valid = false
        val staged = mutableListOf<Pair<File, ByteArray>>()
        ctx.contentResolver.openInputStream(uri)!!.use { ins ->
            ZipInputStream(ins).use { z ->
                while (true) {
                    val e = z.nextEntry ?: break
                    val name = e.name
                    if (name == "wakil-backup.txt") { valid = true; continue }
                    if (e.isDirectory || name.contains("..")) continue
                    val target = when {
                        name.startsWith("files/") && (FILES.contains(name.removePrefix("files/")) || DIRS.any { name.startsWith("files/$it/") }) ->
                            File(ctx.filesDir, name.removePrefix("files/"))
                        name.startsWith("prefs/") && PREFS.contains(name.removePrefix("prefs/")) ->
                            File(File(ctx.applicationInfo.dataDir, "shared_prefs"), name.removePrefix("prefs/"))
                        else -> null
                    } ?: continue
                    staged += target to z.readBytes()
                }
            }
        }
        if (!valid) throw IllegalArgumentException("هذا الملف ليس نسخة احتياطية من وكيل")
        staged.forEach { (f, b) -> f.parentFile?.mkdirs(); f.writeBytes(b); n++ }
        return n
    }
}
