package com.wakil.agent.extra

import android.os.Build
import android.os.Environment
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** The agent's access to the phone's shared storage (/sdcard: Download, DCIM, Documents…). */
object PhoneFiles {
    val root: File get() = Environment.getExternalStorageDirectory()

    fun hasAccess(): Boolean = Build.VERSION.SDK_INT < 30 || Environment.isExternalStorageManager()

    // /sdcard appears only as a user-path normalizer (the agent may receive paths in that legacy form);
    // all real I/O goes through Environment.getExternalStorageDirectory() below.
    @Suppress("SdCardPath")
    fun resolve(path: String): File {
        val p = path.trim().removePrefix("/sdcard").removePrefix("/storage/emulated/0").trimStart('/')
        val f = File(root, p).canonicalFile
        require(f.path.startsWith(root.canonicalPath)) { "path is outside phone storage" }
        return f
    }

    fun run(action: String, path: String, content: String?, to: String?, limit: Int): String {
        if (!hasAccess()) return "ERROR: Wakil has no 'All files access'. Ask the user to enable it in Wakil Settings → ملفات الهاتف."
        val f = resolve(path.ifBlank { "/" })
        val fmt = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US)
        return when (action) {
            "list" -> {
                val kids = f.listFiles() ?: return "ERROR: not a folder: ${f.path}"
                kids.sortedWith(compareBy({ !it.isDirectory }, { it.name.lowercase() })).take(300).joinToString("\n") {
                    if (it.isDirectory) "[dir] ${it.name}/" else "${it.name}  ${human(it.length())}  ${fmt.format(Date(it.lastModified()))}"
                }.ifEmpty { "(empty folder)" }
            }
            "read" -> {
                if (!f.isFile) return "ERROR: no such file"
                if (f.length() > 2_000_000) return "ERROR: file too large to read as text (${human(f.length())})"
                val t = f.readText(); if (t.length > limit) t.take(limit) + "\n…[truncated]" else t
            }
            "write" -> { f.parentFile?.mkdirs(); f.writeText(content ?: ""); "Wrote ${f.path} (${(content ?: "").length} chars)" }
            "mkdir" -> { f.mkdirs(); "Created ${f.path}" }
            "delete" -> if (f.exists() && (if (f.isDirectory) f.deleteRecursively() else f.delete())) "Deleted ${f.path}" else "ERROR: could not delete"
            "move", "copy" -> {
                val dst = resolve(to ?: return "ERROR: missing \"to\"")
                dst.parentFile?.mkdirs()
                if (action == "copy") { f.copyRecursively(dst, overwrite = true); "Copied to ${dst.path}" }
                else if (f.renameTo(dst)) "Moved to ${dst.path}" else "ERROR: move failed"
            }
            "find" -> {
                val q = (content ?: "").lowercase()
                f.walkTopDown().maxDepth(6).filter { it.isFile && it.name.lowercase().contains(q) }.take(100)
                    .joinToString("\n") { it.path.removePrefix(root.path) + "  " + human(it.length()) }.ifEmpty { "nothing found" }
            }
            "info" -> "${f.path} | ${if (f.isDirectory) "folder" else human(f.length())} | ${fmt.format(Date(f.lastModified()))}"
            else -> "ERROR: action must be list|read|write|mkdir|delete|move|copy|find|info"
        }
    }

    fun human(b: Long): String = when {
        b >= 1L shl 30 -> String.format(Locale.US, "%.1f GB", b / (1L shl 30).toDouble())
        b >= 1L shl 20 -> String.format(Locale.US, "%.1f MB", b / (1L shl 20).toDouble())
        b >= 1024 -> "${b / 1024} KB"
        else -> "$b B"
    }
}
