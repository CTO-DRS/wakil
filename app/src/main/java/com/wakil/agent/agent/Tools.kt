package com.wakil.agent.agent

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.view.WindowManager
import com.wakil.agent.Prefs
import com.wakil.agent.access.WakilAccessibilityService
import com.wakil.agent.env.LinuxEnv
import com.wakil.agent.priv.RootShell
import com.wakil.agent.priv.ShizukuShell
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject
import com.wakil.agent.github.Templates

data class ToolSpec(val name: String, val signature: String, val description: String)

/** Executes agent tools. Every call here has already passed the permission check. */
class Tools(private val ctx: Context, private val prefs: Prefs, private val env: LinuxEnv) {

    val all = listOf(
        ToolSpec("run_shell", """{"cmd": string, "timeout": int seconds (optional)}""",
            "Run a shell command in the built-in Alpine Linux (you are root there). Install software with `apk add <pkg>` (e.g. apk add python3 nodejs npm git nmap curl). Non-interactive only."),
        ToolSpec("write_file", """{"path": string, "content": string}""", "Write a text file inside the Linux env (relative paths are under /root)."),
        ToolSpec("read_file", """{"path": string}""", "Read a text file (or list a directory) inside the Linux env."),
        ToolSpec("install_apk", """{"path": string}""", "Open the Android installer for an APK inside the Linux env (e.g. one built with `wakil-apk build`)."),
        ToolSpec("gh_repos", "{}", "List the user's GitHub repositories (needs GitHub linked in the GitHub tab)."),
        ToolSpec("gh_read", """{"repo": "owner/name", "path": string}""", "Read a file or list a folder (path \"\" = root) in a GitHub repo."),
        ToolSpec("gh_write", """{"repo": "owner/name", "path": string, "content": string, "message": string (optional)}""",
            "Create or overwrite a file in a GitHub repo (one commit). Commits trigger the cloud APK build."),
        ToolSpec("gh_tree", """{"repo": "owner/name"}""", "List every file path in a GitHub repo (recursive)."),
        ToolSpec("gh_create", """{"template": "android-kotlin|android-java|flutter|web|nextjs", "name": "repo-name", "app_name": string, "private": true}""",
            "Create a new GitHub repo from a ready template (already builds an APK). Returns owner/name."),
        ToolSpec("gh_write_files", """{"repo": "owner/name", "files": [{"path": string, "content": string}], "message": string}""",
            "Create/overwrite several files in ONE commit (preferred over many gh_write calls). Use content \"__DELETE__\" to delete a file."),
        ToolSpec("gh_build_wait", """{"repo": "owner/name"}""",
            "Build the APK in the cloud and WAIT until it finishes (a few minutes). Returns success, or the failed step and the error log to fix."),
        ToolSpec("gh_build", """{"repo": "owner/name"}""", "Start the GitHub Actions APK build now (adds Wakil's build workflow if the repo has none)."),
        ToolSpec("gh_runs", """{"repo": "owner/name"}""", "Latest cloud builds with status; for a failed build also returns the error log tail."),
        ToolSpec("gh_install", """{"repo": "owner/name"}""", "Download the APK from the latest successful build and open the Android installer."),
        ToolSpec("web_search", """{"query": string}""", "Search the internet (DuckDuckGo). Returns titles, links and snippets. Use for current facts, docs, error messages."),
        ToolSpec("web_fetch", """{"url": string}""", "Open a web page or API URL and return its readable text."),
        ToolSpec("calc", """{"expression": string}""",
            "Exact arithmetic and math - always use this instead of computing in your head. Supports + - * / % ^, parentheses, sqrt abs round floor ceil ln log exp sin cos tan asin acos atan deg min max, constants pi and e, Western and Arabic-Indic digits."),
        ToolSpec("datetime", """{"op": "now|add|diff|format", "date": string, "days|hours|minutes|months|years|weeks": int, "from": string, "to": string, "pattern": string}""",
            "Date/time math: now (current local time), add (days/hours/minutes/months/years/weeks to a date), diff (days or time between two dates), format (reformat a date, e.g. pattern \"EEEE\" for the weekday). Accepts yyyy-MM-dd, yyyy-MM-dd HH:mm, dd/MM/yyyy, epoch, today/tomorrow/yesterday. Use for any calendar question."),
        ToolSpec("http_request", """{"url": string, "method": "GET|POST|PUT|DELETE|PATCH|HEAD", "headers": {json object}, "body": string, "timeout": int seconds}""",
            "Full HTTP request to any API with custom method, headers and body. JSON responses are pretty-printed, HTML is returned as text. Prefer web_fetch for simple page reads; use this to call or debug APIs."),
        ToolSpec("plan", """{"steps": [string], "current": int (0-based step now in progress; steps.length = all done)}""",
            "Show the user your step-by-step plan for a multi-step task, and update progress as you go."),
        ToolSpec("memory_save", """{"note": string}""", "Remember a lasting fact about the user or their projects (preferences, names, repo names). Saved across chats."),
        ToolSpec("memory_delete", """{"id": int}""", "Forget a saved memory note by its #id."),
        ToolSpec("schedule_task", """{"prompt": string, "at": "HH:MM" (or "in_minutes": int), "repeat": "none|hourly|daily|every:<minutes>|on:charging|on:wifi|on:boot", "title": string}""",
            "Schedule yourself to run a prompt later automatically (reminders, daily reports, periodic checks). repeat on:charging / on:wifi / on:boot runs it each time the phone starts charging, joins Wi-Fi, or turns on (no time needed). The result is sent as a notification."),
        ToolSpec("read_document", """{"path": string}""", "Read the text of a document on the phone (PDF, DOCX, PPTX, XLSX, ODT, EPUB, HTML, TXT…). Path relative to /sdcard or absolute."),
        ToolSpec("run_shortcut", """{"name": string}""", "List the user's saved shortcuts (name empty) or get the prompt of one by name."),
        ToolSpec("save_shortcut", """{"title": string, "prompt": string}""", "Save a reusable one-tap shortcut (a prompt the user can run later from Settings or the home screen)."),
        ToolSpec("list_tasks", "{}", "List scheduled automations."),
        ToolSpec("cancel_task", """{"id": int}""", "Cancel a scheduled automation."),
        ToolSpec("device_info", "{}", "Phone status: date/time, model, Android version, battery, RAM, storage, network."),
        ToolSpec("clipboard_get", "{}", "Read the clipboard text."),
        ToolSpec("clipboard_set", """{"text": string}""", "Copy text to the clipboard."),
        ToolSpec("notify", """{"title": string, "text": string}""", "Show a notification to the user."),
        ToolSpec("phone_files", """{"action": "list|read|write|mkdir|delete|move|copy|find|info", "path": string (e.g. "Download"), "content": string (write text / find query), "to": string (move/copy)}""",
            "Files on the phone's own storage (/sdcard: Download, DCIM, Documents, Pictures…). Needs 'All files access'."),
        ToolSpec("phone_permissions", "{}", "Status of every phone-tool permission (contacts, calls, calendar, DND policy, write settings). Call this before contacts/calendar/device tools to know what is possible."),
        ToolSpec("open_settings", """{"target": "dnd|write_settings|app"}""", "Open the special-permission screen for Do Not Disturb policy access, system write settings, or the app details page. Use it after a NEED_* permission error so the user can grant the permission themselves."),
        ToolSpec("contacts_search", """{"query": string, "limit": int (optional, default 10, max 20)}""", "Search the phone's contacts by name or number. Returns name — phone lines."),
        ToolSpec("call_number", """{"phone": string}""", "Start a call when CALL_PHONE is granted; otherwise opens the dialer pre-filled and the user presses call."),
        ToolSpec("draft_sms", """{"phone": string (optional), "body": string}""", "Open the SMS app with a ready draft — the user always presses send."),
        ToolSpec("draft_whatsapp", """{"text": string, "phone": string (optional)}""", "Open WhatsApp with a ready message (optionally to a phone number) — the user always presses send."),
        ToolSpec("set_alarm", """{"hour": int, "minute": int, "label": string (optional)}""", "Set a device alarm through the clock app (hour 0-23, minute 0-59)."),
        ToolSpec("set_timer", """{"seconds": int, "label": string (optional)}""", "Set a device timer through the clock app (5 seconds to 24 hours)."),
        ToolSpec("calendar_create", """{"title": string, "start": "yyyy-MM-dd HH:mm" or epoch ms, "end": same format (optional), "all_day": bool (optional), "notes": string (optional)}""", "Create a calendar event. Needs READ + WRITE_CALENDAR."),
        ToolSpec("calendar_list", """{"days": int (optional, default 7, max 60), "limit": int (optional, max 20)}""", "List upcoming calendar events from now (recurring events expanded)."),
        ToolSpec("calendar_move", """{"event_id": long, "start": "yyyy-MM-dd HH:mm" or epoch ms, "end": same format (optional)}""", "Move an existing calendar event to a new start (and optionally end) time."),
        ToolSpec("torch", """{"on": bool}""", "Turn the camera flash torch on or off."),
        ToolSpec("dnd", """{"on": bool}""", "Turn Do Not Disturb on or off (needs DND policy access the user grants once via open_settings)."),
        ToolSpec("brightness", """{"value": int}""", "Set screen brightness 1-255 (needs write-settings permission via open_settings)."),
        ToolSpec("prayer_times", """{"city": string (optional, e.g. riyadh or جدة), "lat": double (optional), "lng": double (optional), "day_offset": int (optional 0-7)}""", "Prayer times fully offline by the Umm al-Qura method for a named Saudi city, explicit coordinates, or Riyadh by default; day_offset 0 = today."),
        ToolSpec("list_apps", """{"filter": string (optional)}""", "List installed launchable Android apps (label and package)."),
        ToolSpec("open_app", """{"name": string}""", "Open an Android app by package name or by its label."),
        ToolSpec("read_screen", "{}", "Get a text summary of what is on the phone screen: elements with label, type, center x,y."),
        ToolSpec("ocr_screen", "{}", "Read the text visible on the screen with OCR (Arabic + English), with center x,y of each line for tap_xy. Use when read_screen shows few or no labels (images, games, custom apps)."),
        ToolSpec("ocr_image", """{"path": string}""", "Read the text in a photo or image file on the phone (JPG/PNG/WEBP) with OCR. Path relative to /sdcard or absolute."),
        ToolSpec("tap_text", """{"text": string}""", "Tap the on-screen element whose text/description matches."),
        ToolSpec("tap_xy", """{"x": int, "y": int}""", "Tap the screen at pixel coordinates (use centers from read_screen)."),
        ToolSpec("type_text", """{"text": string}""", "Type text into the focused (or first) text field."),
        ToolSpec("scroll", """{"direction": "up"|"down"|"left"|"right"}""", "Scroll the current screen."),
        ToolSpec("back", "{}", "Press the Android Back button."),
        ToolSpec("home", "{}", "Go to the home screen."),
        ToolSpec("sys_shell", """{"cmd": string}""",
            "Run an Android system shell command with ADB-shell privileges via Shizuku: pm install/uninstall/grant, am start, input tap/swipe/text/keyevent, screencap -p /sdcard/x.png, settings put, cmd, dumpsys, etc."),
        ToolSpec("root_shell", """{"cmd": string}""", "Run a command as real root via su (only on rooted devices)."),
    )

    /** Set by the agent controller to show the plan checklist in the chat. */
    var onPlan: ((List<String>, Int) -> Unit)? = null
    private val app get() = com.wakil.agent.WakilApp.instance

    val screenTools = setOf("read_screen", "tap_text", "tap_xy", "type_text", "scroll", "back", "home")

    private val a11y get() = WakilAccessibilityService.instance
    private val shizukuOn get() = prefs.shizukuEnabled && ShizukuShell.isReady
    private val shizukuForScreen get() = shizukuOn && prefs.preferShizukuForScreen

    fun isAvailable(name: String): Boolean = when (name) {
        "sys_shell" -> shizukuOn
        "root_shell" -> prefs.rootEnabled && RootShell.available
        in screenTools -> a11y != null || shizukuOn
        "ocr_screen" -> (a11y != null && android.os.Build.VERSION.SDK_INT >= 30) || shizukuOn
        "run_shell", "write_file", "read_file", "install_apk" -> env.isReady
        "gh_repos", "gh_read", "gh_write", "gh_build", "gh_runs", "gh_install", "gh_tree", "gh_write_files", "gh_build_wait" -> com.wakil.agent.WakilApp.instance.github.connected
        else -> true
    }

    fun statusLine(): String = buildString {
        append("Android ${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT}), device ${Build.MANUFACTURER} ${Build.MODEL}, screen ${screenSize().let { "${it.first}x${it.second}" }}. ")
        append("Linux env: ${if (env.isReady) "ready" else "NOT installed"}. ")
        append("Accessibility: ${if (a11y != null) "on" else "off"}. ")
        append("Shizuku: ${if (shizukuOn) "on (uid ${ShizukuShell.serverUid()})" else "off"}. ")
        append("Root(su): ${if (prefs.rootEnabled && RootShell.available) "available" else "not available"}.")
    }

    private suspend fun ghTool(name: String, args: JSONObject, limit: Int): String {
        val m = com.wakil.agent.WakilApp.instance.github
        val api = m.api
        if (name == "gh_create") {
            val t = Templates.all.firstOrNull { it.id == args.optString("template") } ?: Templates.all.first()
            val rn = args.optString("name").ifBlank { "my-app" }.replace(Regex("[^A-Za-z0-9._-]"), "-")
            val r = m.createProject(t, rn, args.optString("app_name").ifBlank { rn }, args.optBoolean("private", true))
            return "Created ${r.full} from template ${t.id}. The first cloud build has started. Files:\n" +
                runCatching { api.tree(r.full, r.defaultBranch).joinToString("\n") { it.first } }.getOrDefault("")
        }
        if (name == "gh_repos") return api.repos().joinToString("\n") { "${it.full}${if (it.private) " (private)" else ""} ${it.language}" }.ifEmpty { "(no repos)" }
        val full = args.optString("repo").trim().removePrefix("https://github.com/").trimEnd('/')
        if (!full.contains('/')) return "ERROR: repo must be owner/name"
        val repo = api.getRepo(full)
        return when (name) {
            "gh_read" -> {
                val path = args.optString("path").trim('/')
                val entries = runCatching { api.list(full, path) }.getOrNull()
                if (!entries.isNullOrEmpty() && (path.isEmpty() || entries.size != 1 || entries[0].path != path))
                    entries.joinToString("\n") { (if (it.isDir) "[dir] " else "") + it.path }
                else api.read(full, path).let { f -> f.text?.let { com.wakil.agent.env.LinuxEnv.truncate(it, limit) } ?: "(binary file, ${f.size} bytes)" }
            }
            "gh_write" -> {
                val path = args.optString("path").trim('/')
                val sha = runCatching { api.read(full, path).sha }.getOrNull()
                api.write(full, path, args.optString("content"), sha, args.optString("message").ifBlank { "✏️ $path (وكيل)" })
                m.watchNext(repo)
                "Committed $path to $full. A cloud build starts automatically if the repo has a push-triggered workflow."
            }
            "gh_tree" -> com.wakil.agent.env.LinuxEnv.truncate(
                api.tree(full, repo.defaultBranch).joinToString("\n") { "${it.first} (${it.second} B)" }.ifEmpty { "(empty repo)" }, limit)
            "gh_write_files" -> {
                val arr = args.optJSONArray("files") ?: return "ERROR: files must be an array of {path, content}"
                val files = LinkedHashMap<String, String?>()
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    val p = o.optString("path").trim('/')
                    if (p.isEmpty() || p.contains("..")) return "ERROR: bad path at index $i"
                    val c = o.optString("content")
                    files[p] = if (c == "__DELETE__") null else c
                }
                api.pushFilesOrDelete(full, repo.defaultBranch, files, args.optString("message").ifBlank { "🤖 تعديل ${files.size} ملف (وكيل)" })
                "Committed ${files.size} file(s) to $full: ${files.keys.joinToString(", ")}"
            }
            "gh_build_wait" -> {
                val wf = m.buildWorkflow(repo) ?: run {
                    val d = m.detect(repo) ?: return "ERROR: unknown project type"
                    m.addBuild(repo, d.first, d.second); m.buildWorkflow(repo)
                } ?: return "ERROR: could not set up the build workflow"
                val r = m.buildAndWait(repo, wf, onProgress = { })
                if (r.ok) "BUILD SUCCEEDED (#${r.number}). The APK is ready: call gh_install to install it."
                else {
                    val sb = StringBuilder("BUILD FAILED (#${r.number}, ${r.conclusion}).\n")
                    api.jobs(full, r.id).firstOrNull { it.conclusion == "failure" }?.let { j ->
                        sb.append("Failed step: ").append(j.steps.firstOrNull { it.conclusion == "failure" }?.name ?: "?").append("\n")
                        sb.append(runCatching { m.errorDigest(full, j.id) }.getOrDefault("(log unavailable)"))
                    }
                    com.wakil.agent.env.LinuxEnv.truncate(sb.toString(), limit)
                }
            }
            "gh_build" -> {
                var wf = m.buildWorkflow(repo)
                if (wf == null) {
                    val d = m.detect(repo) ?: return "ERROR: unknown project type (no pubspec.yaml, build.gradle, package.json or index.html)"
                    m.addBuild(repo, d.first, d.second)
                    return "Added Wakil's APK workflow (${d.first}) and the first build started." + (d.third?.let { " Note: $it" } ?: "")
                }
                m.buildNow(repo, wf)
                "Build dispatched (${wf.name}). It takes a few minutes; check with gh_runs."
            }
            "gh_runs" -> {
                val runs = api.runs(full, 5)
                if (runs.isEmpty()) return "No builds yet."
                val sb = StringBuilder()
                runs.forEach { sb.append("#${it.number} ${it.status}${if (it.conclusion.isNotEmpty()) "/" + it.conclusion else ""} ${it.title} (${it.created})\n") }
                val last = runs.first()
                if (!last.active && !last.ok && last.conclusion == "failure") {
                    api.jobs(full, last.id).firstOrNull { it.conclusion == "failure" }?.let { j ->
                        sb.append("\nFailed step: ").append(j.steps.firstOrNull { it.conclusion == "failure" }?.name ?: "?").append("\nLog tail:\n")
                        sb.append(runCatching { api.jobLogTail(full, j.id, 60) }.getOrDefault("(log unavailable)"))
                    }
                }
                com.wakil.agent.env.LinuxEnv.truncate(sb.toString(), limit)
            }
            "gh_install" -> {
                val run = api.runs(full, 15).firstOrNull { it.ok } ?: return "ERROR: no successful build yet"
                m.installFromRun(repo, run.id) {}?.let { "ERROR: $it" } ?: "Installer opened for build #${run.number}. The user confirms on screen."
            }
            else -> "ERROR: unknown tool"
        }
    }

    fun screenSize(): Pair<Int, Int> {
        return if (Build.VERSION.SDK_INT >= 30) {
            val b = ctx.getSystemService(WindowManager::class.java).maximumWindowMetrics.bounds
            b.width() to b.height()
        } else {
            val dm = ctx.resources.displayMetrics; dm.widthPixels to dm.heightPixels
        }
    }

    suspend fun execute(name: String, args: JSONObject): String {
        val limit = prefs.outputLimit
        return when (name) {
            "run_shell" -> {
                val cmd = args.optString("cmd").ifBlank { args.optString("command") }
                if (cmd.isBlank()) return "ERROR: missing cmd"
                val t = args.optInt("timeout", prefs.shellTimeoutSec).coerceIn(5, 3600)
                val r = env.run(cmd, t, limit)
                formatShell(r.exitCode, r.output, r.timedOut, t)
            }
            "write_file" -> runCatching { env.writeFile(args.getString("path"), args.optString("content")) }.getOrElse { "ERROR: $it" }
            "read_file" -> runCatching { env.readFile(args.getString("path"), limit) }.getOrElse { "ERROR: $it" }
            "gh_repos", "gh_read", "gh_write", "gh_build", "gh_runs", "gh_install", "gh_tree", "gh_create", "gh_write_files", "gh_build_wait" ->
                runCatching { ghTool(name, args, limit) }.getOrElse { "ERROR: ${it.message}" }
            "web_search" -> com.wakil.agent.extra.WebTools.search(args.optString("query").ifBlank { args.optString("q") })
            "web_fetch" -> com.wakil.agent.extra.WebTools.fetch(args.getString("url"), limit)
            "calc" -> com.wakil.agent.extra.Calc.run(args.optString("expression").ifBlank { args.optString("expr") })
            "datetime" -> runCatching { com.wakil.agent.extra.DateMath.op(args) }.getOrElse { "ERROR: ${it.message}" }
            "http_request" -> withContext(Dispatchers.IO) {
                runCatching {
                    val hdrs = LinkedHashMap<String, String>()
                    args.optJSONObject("headers")?.let { h -> for (k in h.keys()) h.optString(k).takeIf { it.isNotEmpty() }?.let { hdrs[k] = it } }
                    com.wakil.agent.extra.WebTools.request(
                        args.getString("url"), args.optString("method", "GET"), hdrs,
                        args.optString("body").takeIf { args.has("body") && it.isNotEmpty() },
                        args.optInt("timeout", 20).coerceIn(5, 60), limit,
                    )
                }.getOrElse { "ERROR: ${it.message ?: it}" }
            }
            "plan" -> {
                val a = args.optJSONArray("steps")
                val steps = if (a == null) emptyList() else (0 until a.length()).map { a.optString(it) }.filter { it.isNotBlank() }
                onPlan?.invoke(steps, args.optInt("current", 0))
                "Plan shown to the user (${steps.size} steps). Continue with the work."
            }
            "memory_save" -> { val n = app.memory.add(args.optString("note")); "Saved as memory #${n.id}." }
            "memory_delete" -> if (app.memory.remove(args.optInt("id", -1))) "Deleted." else "ERROR: no memory with that id."
            "read_document" -> withContext(Dispatchers.IO) {
                val raw = args.optString("path").trim()
                val f = if (raw.startsWith("/")) java.io.File(raw) else java.io.File(android.os.Environment.getExternalStorageDirectory(), raw)
                if (!f.isFile) "ERROR: file not found: ${f.path}"
                else runCatching { com.wakil.agent.extra.DocReader.read(ctx, f, minOf(limit, 40_000)) }.getOrElse { "ERROR: ${it.message}" }
            }
            "run_shortcut" -> {
                val n = args.optString("name").trim()
                val all = app.shortcuts.items.value
                if (n.isBlank()) all.joinToString("\n") { "- ${it.title}: ${it.prompt.take(100)}" }.ifBlank { "No shortcuts." }
                else all.firstOrNull { it.title.contains(n, true) }?.let { "Shortcut \"${it.title}\": do this now -> ${it.prompt}" } ?: "ERROR: no shortcut named $n"
            }
            "save_shortcut" -> app.shortcuts.add(args.optString("title"), args.getString("prompt")).let { "Saved shortcut #${it.id} \"${it.title}\"." }
            "schedule_task" -> {
                val rep = com.wakil.agent.extra.Scheduler.normRepeat(args.optString("repeat", "none"))
                val at = (if (rep.startsWith("on:")) System.currentTimeMillis() else null) ?: com.wakil.agent.extra.Scheduler.parseWhen(args.optString("at").ifBlank { null },
                    if (args.has("in_minutes")) args.optInt("in_minutes") else null)
                    ?: return "ERROR: give \"at\": \"HH:MM\" (24h) or \"in_minutes\": N"
                val t = app.scheduler.add(args.getString("prompt"), at, args.optString("repeat", "none"), args.optString("title"))
                val whenStr = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.US).format(java.util.Date(t.nextAt))
                "Scheduled task #${t.id} at $whenStr, repeat=${t.repeat}." + if (!app.scheduler.canExact()) " (Exact alarms are off for Wakil, so it may run a few minutes late.)" else ""
            }
            "list_tasks" -> app.scheduler.tasks.value.takeIf { it.isNotEmpty() }?.joinToString("\n") {
                "#${it.id} ${it.title} | next ${java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.US).format(java.util.Date(it.nextAt))} | ${it.repeat} | ${it.prompt.take(120)}"
            } ?: "No scheduled tasks."
            "cancel_task" -> if (app.scheduler.cancel(args.optInt("id", -1))) "Cancelled." else "ERROR: no task with that id."
            "device_info" -> com.wakil.agent.extra.DeviceTools.info(ctx)
            "clipboard_get" -> withContext(Dispatchers.Main) { com.wakil.agent.extra.DeviceTools.clipboardGet(ctx) }
            "clipboard_set" -> withContext(Dispatchers.Main) { com.wakil.agent.extra.DeviceTools.clipboardSet(ctx, args.optString("text")) }
            "notify" -> { com.wakil.agent.extra.Scheduler.notify(ctx, args.optString("title", "وكيل"), args.optString("text"), 9200 + (System.currentTimeMillis() % 500).toInt()); "Notification shown." }
            "phone_files" -> withContext(Dispatchers.IO) {
                com.wakil.agent.extra.PhoneFiles.run(args.optString("action", "list"), args.optString("path"),
                    args.optString("content").takeIf { args.has("content") } ?: args.optString("query").takeIf { args.has("query") },
                    args.optString("to").ifBlank { null }, limit)
            }
            "list_apps" -> listApps(args.optString("filter"))
            "install_apk" -> {
                val f = runCatching { env.hostFile(args.optString("path")) }.getOrElse { return "ERROR: $it" }
                withContext(Dispatchers.Main) { com.wakil.agent.env.ApkInstaller.install(ctx, f) }
                    ?.let { "ERROR: $it" } ?: "Android installer opened for ${f.name}. The user confirms the install on screen."
            }
            "open_app" -> openApp(args.optString("name").ifBlank { args.optString("package") })
            "read_screen" -> readScreen().let { r -> if (onWakil()) SELF_NOTE + "\n" + r else r }
            "ocr_screen" -> if (onWakil()) SELF_BLOCK else ocrScreen()
            "ocr_image" -> withContext(Dispatchers.IO) {
                val raw = args.optString("path").trim()
                val f = if (raw.startsWith("/")) java.io.File(raw) else java.io.File(android.os.Environment.getExternalStorageDirectory(), raw)
                if (!f.isFile) "ERROR: file not found: ${f.path}"
                else {
                    com.wakil.agent.extra.Ocr.ensure(ctx)?.let { return@withContext "ERROR: $it" }
                    val bmp = android.graphics.BitmapFactory.decodeFile(f.path) ?: return@withContext "ERROR: not an image: ${f.name}"
                    runCatching { com.wakil.agent.extra.Ocr.text(ctx, bmp).ifBlank { "(no text found)" }.take(minOf(limit, 20_000)) }.getOrElse { "ERROR: OCR failed: ${it.message}" }
                }
            }
            "tap_text" -> if (onWakil()) SELF_BLOCK else tapText(args.optString("text")).let { r ->
                if (r.startsWith("ERROR: text not found")) ocrTap(args.optString("text")) ?: r else r }
            "tap_xy" -> if (onWakil()) SELF_BLOCK else tapXY(args.optInt("x", -1), args.optInt("y", -1))
            "type_text" -> if (onWakil()) SELF_BLOCK else typeText(args.optString("text"))
            "scroll" -> scroll(args.optString("direction", "down"))
            "back" -> key(4, "back") { a11y?.back() }
            "home" -> key(3, "home") { a11y?.home() }
            "sys_shell" -> {
                val r = ShizukuShell.exec(args.optString("cmd"), prefs.shellTimeoutSec, limit)
                formatShell(r.exitCode, r.output, r.timedOut, prefs.shellTimeoutSec)
            }
            "root_shell" -> {
                val r = RootShell.exec(args.optString("cmd"), prefs.shellTimeoutSec, limit)
                formatShell(r.exitCode, r.output, r.timedOut, prefs.shellTimeoutSec)
            }
            "phone_permissions" -> com.wakil.agent.extra.PhoneTools.permissionsStatus(ctx)
            "open_settings" -> withContext(Dispatchers.Main) { com.wakil.agent.extra.PhoneTools.openPermissionSettings(ctx, args.optString("target", "app")) }
            "contacts_search" -> withContext(Dispatchers.IO) { com.wakil.agent.extra.PhoneTools.contactsSearch(ctx, args.optString("query"), args.optInt("limit", 10)) }
            "call_number" -> withContext(Dispatchers.Main) { com.wakil.agent.extra.PhoneTools.callNumber(ctx, args.optString("phone")) }
            "draft_sms" -> withContext(Dispatchers.Main) { com.wakil.agent.extra.PhoneTools.draftSms(ctx, args.optString("phone").takeIf { args.has("phone") }, args.optString("body")) }
            "draft_whatsapp" -> withContext(Dispatchers.Main) { com.wakil.agent.extra.PhoneTools.draftWhatsApp(ctx, args.optString("text"), args.optString("phone").takeIf { args.has("phone") }) }
            "set_alarm" -> withContext(Dispatchers.Main) { com.wakil.agent.extra.PhoneTools.setAlarm(ctx, args.optInt("hour", -1), args.optInt("minute", -1), args.optString("label").takeIf { args.has("label") }) }
            "set_timer" -> withContext(Dispatchers.Main) { com.wakil.agent.extra.PhoneTools.setTimer(ctx, args.optInt("seconds", -1), args.optString("label").takeIf { args.has("label") }) }
            "calendar_create" -> {
                val start = com.wakil.agent.extra.PhoneTools.parseWhen(args.optString("start"))
                    ?: return "ERROR: bad start — use \"yyyy-MM-dd HH:mm\" or epoch ms"
                val end = com.wakil.agent.extra.PhoneTools.parseWhen(args.optString("end"))
                if (args.has("end") && end == null) return "ERROR: bad end"
                com.wakil.agent.extra.PhoneTools.calendarCreate(ctx, args.optString("title"), start, end,
                    args.optBoolean("all_day", false), args.optString("notes").takeIf { args.has("notes") })
            }
            "calendar_list" -> withContext(Dispatchers.IO) { com.wakil.agent.extra.PhoneTools.calendarList(ctx, args.optInt("days", 7), args.optInt("limit", 10)) }
            "calendar_move" -> {
                val start = com.wakil.agent.extra.PhoneTools.parseWhen(args.optString("start"))
                    ?: return "ERROR: bad start — use \"yyyy-MM-dd HH:mm\" or epoch ms"
                val end = com.wakil.agent.extra.PhoneTools.parseWhen(args.optString("end"))
                if (args.has("end") && end == null) return "ERROR: bad end"
                com.wakil.agent.extra.PhoneTools.calendarMove(ctx, args.optLong("event_id", -1), start, end)
            }
            "torch" -> withContext(Dispatchers.Main) { com.wakil.agent.extra.PhoneTools.torch(ctx, args.optBoolean("on", false)) }
            "dnd" -> withContext(Dispatchers.Main) { com.wakil.agent.extra.PhoneTools.dnd(ctx, args.optBoolean("on", false)) }
            "brightness" -> withContext(Dispatchers.Main) { com.wakil.agent.extra.PhoneTools.brightness(ctx, args.optInt("value", -1)) }
            "prayer_times" -> prayerTool(args)
            else -> "ERROR: unknown tool $name"
        }
    }

    private fun formatShell(code: Int, out: String, timedOut: Boolean, t: Int) =
        (if (timedOut) "[timed out after ${t}s]\n" else "[exit $code]\n") + out.ifBlank { "(no output)" }

    /** prayer_times tool: named Saudi city → explicit coordinates → Riyadh default, Umm al-Qura method, fully offline. */
    private fun prayerTool(args: JSONObject): String {
        val cityArg = args.optString("city").takeIf { args.has("city") && it.isNotBlank() }
        val named = com.wakil.agent.extra.PrayerTimes.resolveCity(cityArg)
        if (cityArg != null && named == null) {
            return "ERROR: unknown city \"$cityArg\" — supported: " +
                com.wakil.agent.extra.PrayerTimes.SAUDI_CITIES.keys.joinToString(", ")
        }
        val coords = named?.coords
            ?: if (args.has("lat") && args.has("lng"))
                com.wakil.agent.extra.PrayerTimes.Coords(args.optDouble("lat"), args.optDouble("lng"),
                    java.util.TimeZone.getDefault().rawOffset / 3_600_000.0)
            else com.wakil.agent.extra.PrayerTimes.SAUDI_CITIES.getValue(com.wakil.agent.extra.PrayerTimes.DEFAULT_CITY)
        val display = named?.let { com.wakil.agent.extra.PrayerTimes.CITY_NAMES_AR[it.key] ?: it.key }
            ?: if (args.has("lat")) "إحداثياتك" else "الرياض"
        val offset = args.optInt("day_offset", 0).coerceIn(0, 7)
        val date = java.time.LocalDate.now().plusDays(offset.toLong())
        val dayLabel = if (offset == 0) "اليوم" else "بعد $offset يوم"
        return "مواقيت $display ($dayLabel) — ${com.wakil.agent.extra.PrayerTimes.renderArabic(date, coords)}، طريقة أم القرى."
    }

    private suspend fun sh(cmd: String, limit: Int = 4000) = ShizukuShell.exec(cmd, 30, limit)

    private suspend fun listApps(filter: String): String = withContext(Dispatchers.IO) {
        val pm = ctx.packageManager
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val apps = pm.queryIntentActivities(intent, 0)
            .map { it.loadLabel(pm).toString() to it.activityInfo.packageName }
            .distinctBy { it.second }
            .filter { filter.isBlank() || it.first.contains(filter, true) || it.second.contains(filter, true) }
            .sortedBy { it.first.lowercase() }
        if (apps.isEmpty()) "no apps match" else apps.take(200).joinToString("\n") { "${it.first} | ${it.second}" }
    }

    private suspend fun openApp(name: String): String {
        if (name.isBlank()) return "ERROR: missing name"
        val pm = ctx.packageManager
        val pkg = if (runCatching { pm.getPackageInfo(name, 0) }.isSuccess) name else {
            val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
            val list = pm.queryIntentActivities(intent, 0).map { it.loadLabel(pm).toString() to it.activityInfo.packageName }
            (list.firstOrNull { it.first.equals(name, true) } ?: list.firstOrNull { it.first.contains(name, true) })?.second
        } ?: return "ERROR: no app matches \"$name\" (use list_apps)"
        if (shizukuOn) {
            val r = sh("monkey -p $pkg -c android.intent.category.LAUNCHER 1")
            if (r.exitCode == 0) { delay(1200); return "opened $pkg (via Shizuku)" }
        }
        val launch = pm.getLaunchIntentForPackage(pkg) ?: return "ERROR: $pkg has no launcher activity"
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return runCatching { ctx.startActivity(launch); delay(1200); "opened $pkg" }.getOrElse { "ERROR: $it" }
    }

    private suspend fun screenBitmap(): android.graphics.Bitmap? {
        a11y?.screenshot()?.let { return it }
        if (shizukuOn) {
            val f = "/data/local/tmp/wakil_ocr.png"
            sh("screencap -p $f && chmod 644 $f")
            val r = sh("base64 $f | tr -d '\\n'", 30_000_000)
            return runCatching { val b = android.util.Base64.decode(r.output.trim(), 0); android.graphics.BitmapFactory.decodeByteArray(b, 0, b.size) }.getOrNull()
        }
        return null
    }

    private suspend fun ocrLines(): Pair<List<com.wakil.agent.extra.Ocr.Line>?, String?> = withContext(Dispatchers.IO) {
        com.wakil.agent.extra.Ocr.ensure(ctx)?.let { return@withContext null to it }
        val bmp = screenBitmap() ?: return@withContext null to "could not capture the screen (needs Android 11+ with the accessibility service, or Shizuku)"
        runCatching { com.wakil.agent.extra.Ocr.lines(ctx, bmp) to null }.getOrElse { null to "OCR failed: ${it.message}" }
    }

    private suspend fun ocrScreen(): String {
        val (lines, err) = ocrLines()
        if (lines == null) return "ERROR: $err"
        if (lines.isEmpty()) return "OCR found no readable text on screen."
        return "OCR text on screen (${lines.size} lines; text | center x,y):\n" + com.wakil.agent.extra.Ocr.format(lines)
    }

    /** tap_text fallback: find the text with OCR and tap its center. Null when OCR can't help. */
    private suspend fun ocrTap(text: String): String? {
        if (text.isBlank()) return null
        val (lines, _) = ocrLines()
        if (lines.isNullOrEmpty()) return null
        val best = lines.maxByOrNull { com.wakil.agent.access.TextMatch.score(text, it.text) } ?: return null
        if (com.wakil.agent.access.TextMatch.score(text, best.text) < 0.6) return null
        val x = best.box.centerX(); val y = best.box.centerY()
        val ok = a11y?.tap(x, y) ?: (sh("input tap $x $y").exitCode == 0)
        return if (ok) "tapped \"${best.text}\" at $x,$y (found with OCR)" else null
    }

    /** True when the phone is showing Wakil itself, so screen tools would only poke at this chat. */
    private fun onWakil(): Boolean = a11y?.activePackage() == ctx.packageName

    private val SELF_NOTE = "NOTE: the screen shows Wakil itself (this chat), not another app. Do not tap here. " +
        "For battery/RAM/storage/network/time use device_info. To control another app call open_app first."
    private val SELF_BLOCK = "ERROR: blocked, the screen is Wakil's own chat. Tapping here would only move around inside Wakil. " +
        "For phone status call device_info; to work in another app call open_app first, then read_screen."

    private fun noScreenControl() =
        "ERROR: screen control unavailable. Enable the Wakil accessibility service (Settings > Accessibility) or Shizuku."

    private suspend fun readScreen(): String {
        a11y?.let { return it.readScreen() }
        if (shizukuOn) {
            val nodes = dumpUi() ?: return "ERROR: uiautomator dump failed"
            return "${nodes.size} elements (label | center x,y | flags):\n" +
                nodes.take(150).mapIndexed { i, n -> "[$i] \"${n.label}\" | ${n.x},${n.y} | ${if (n.clickable) "click" else ""}" }.joinToString("\n")
        }
        return noScreenControl()
    }

    data class DumpNode(val label: String, val x: Int, val y: Int, val clickable: Boolean)

    private suspend fun dumpUi(): List<DumpNode>? {
        val r = sh("uiautomator dump /data/local/tmp/wakil_ui.xml >/dev/null 2>&1; cat /data/local/tmp/wakil_ui.xml", 2_000_000)
        val xml = r.output
        if (!xml.contains("<node")) return null
        val nodeRe = Regex("<node [^>]*>")
        fun attr(s: String, a: String) = Regex("""\b$a="([^"]*)"""").find(s)?.groupValues?.get(1)
            ?.replace("&amp;", "&")?.replace("&lt;", "<")?.replace("&gt;", ">")?.replace("&quot;", "\"")?.replace("&#10;", " ") ?: ""
        val boundsRe = Regex("""\[(\d+),(\d+)]\[(\d+),(\d+)]""")
        return nodeRe.findAll(xml).mapNotNull { m ->
            val s = m.value
            val label = attr(s, "text").ifBlank { attr(s, "content-desc") }
            val clickable = attr(s, "clickable") == "true"
            if (label.isBlank() && !clickable) return@mapNotNull null
            val b = boundsRe.find(attr(s, "bounds")) ?: return@mapNotNull null
            val (x1, y1, x2, y2) = b.destructured
            DumpNode(label.take(80), (x1.toInt() + x2.toInt()) / 2, (y1.toInt() + y2.toInt()) / 2, clickable)
        }.toList()
    }

    private suspend fun tapText(text: String): String {
        if (text.isBlank()) return "ERROR: missing text"
        a11y?.let { return it.tapText(text) }
        if (shizukuOn) {
            val nodes = dumpUi() ?: return "ERROR: uiautomator dump failed"
            val n = nodes.firstOrNull { it.label.equals(text, true) } ?: nodes.firstOrNull { it.label.contains(text, true) }
                ?: return "ERROR: text not found on screen: $text"
            sh("input tap ${n.x} ${n.y}")
            return "tapped \"$text\" at ${n.x},${n.y} (via Shizuku)"
        }
        return noScreenControl()
    }

    private suspend fun tapXY(x: Int, y: Int): String {
        if (x < 0 || y < 0) return "ERROR: x and y required"
        if (shizukuForScreen) {
            val r = sh("input tap $x $y"); if (r.exitCode == 0) return "tapped $x,$y (via Shizuku)"
        }
        a11y?.let { return if (it.tap(x, y)) "tapped $x,$y" else "ERROR: tap gesture failed" }
        return noScreenControl()
    }

    private suspend fun typeText(text: String): String {
        val ascii = text.all { it.code in 0x20..0x7e }
        if (shizukuForScreen && ascii) {
            val escaped = text.replace("'", "'\\''").replace(" ", "%s")
            val r = sh("input text '$escaped'"); if (r.exitCode == 0) return "typed text (via Shizuku)"
        }
        a11y?.let { return it.typeText(text) }
        if (shizukuOn && !ascii) return "ERROR: non-ASCII text (e.g. Arabic) needs the accessibility service; `input text` only supports ASCII"
        if (shizukuOn) {
            val r = sh("input text '${text.replace("'", "'\\''").replace(" ", "%s")}'")
            return if (r.exitCode == 0) "typed text (via Shizuku)" else "ERROR: ${r.output}"
        }
        return noScreenControl()
    }

    private suspend fun scroll(direction: String): String {
        if (shizukuForScreen) {
            val (w, h) = screenSize(); val cx = w / 2; val cy = h / 2
            val c = when (direction.lowercase()) {
                "down" -> "input swipe $cx ${h * 3 / 4} $cx ${h / 4} 350"
                "up" -> "input swipe $cx ${h / 4} $cx ${h * 3 / 4} 350"
                "left" -> "input swipe ${w / 5} $cy ${w * 4 / 5} $cy 350"
                "right" -> "input swipe ${w * 4 / 5} $cy ${w / 5} $cy 350"
                else -> return "ERROR: direction must be up/down/left/right"
            }
            if (sh(c).exitCode == 0) return "scrolled $direction (via Shizuku)"
        }
        a11y?.let { return it.scroll(direction) }
        return noScreenControl()
    }

    private suspend fun key(code: Int, label: String, fallback: () -> Boolean?): String {
        if (shizukuForScreen && sh("input keyevent $code").exitCode == 0) return "pressed $label (via Shizuku)"
        val ok = fallback() ?: return noScreenControl()
        return if (ok) "pressed $label" else "ERROR: $label failed"
    }
}
