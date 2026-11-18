package com.wakil.agent.agent

import com.wakil.agent.ToolPolicy
import com.wakil.agent.WakilApp
import com.wakil.agent.llm.Msg
import com.wakil.agent.service.AgentForegroundService
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicLong

enum class ItemKind { USER, ASSISTANT, TOOL_CALL, TOOL_RESULT, ERROR, INFO }

data class ChatItem(val id: Long, val kind: ItemKind, val text: String, val title: String = "")

enum class Approval { ONCE, ALWAYS, DENY }

/** The agent's visible checklist: steps and the index of the step in progress (== size when done). */
data class AgentPlan(val steps: List<String>, val current: Int)

data class ChatMeta(val id: String, val title: String, val updated: Long)

data class ApprovalRequest(val tool: String, val argsPreview: String, val result: CompletableDeferred<Approval>)

sealed class Parsed {
    data class Final(val text: String) : Parsed()
    data class Call(val tool: String, val args: JSONObject) : Parsed()
}

/** The agent loop: LLM -> JSON tool call -> permission -> execute -> feed result back. */
class AgentController(private val app: WakilApp) {
    private val ids = AtomicLong(0)
    private val _items = MutableStateFlow<List<ChatItem>>(emptyList())
    val items: StateFlow<List<ChatItem>> = _items
    private val _running = MutableStateFlow(false)
    val running: StateFlow<Boolean> = _running
    private val _streaming = MutableStateFlow("")
    val streaming: StateFlow<String> = _streaming
    private val _approval = MutableStateFlow<ApprovalRequest?>(null)
    val approval: StateFlow<ApprovalRequest?> = _approval

    private val history = mutableListOf<Msg>()
    private var job: Job? = null
    val tools by lazy { Tools(app, app.prefs, app.env).also { t -> t.onPlan = { st, cur -> _plan.value = if (st.isEmpty()) null else AgentPlan(st, cur.coerceIn(0, st.size)) } } }
    private val _plan = MutableStateFlow<AgentPlan?>(null)
    val plan: StateFlow<AgentPlan?> = _plan
    @Volatile private var notifyNext = false

    private val chatsDir = java.io.File(app.filesDir, "chats").apply { mkdirs() }
    private var chatId: String = app.prefs.currentChat.ifBlank { newId() }
    private val store get() = java.io.File(chatsDir, "$chatId.json")
    private val _chats = MutableStateFlow<List<ChatMeta>>(emptyList())
    val chats: StateFlow<List<ChatMeta>> = _chats
    val currentChatId get() = chatId
    /** Text shared into Wakil from another app, waiting in the input box. */
    val pendingInput = MutableStateFlow<String?>(null)
    /** Set when the widget, wake word or a shortcut asks to open hands-free voice conversation. */
    val voiceChatRequest = MutableStateFlow(false)
    /** Set by the widget's text box to focus the chat input. */
    val focusInputRequest = MutableStateFlow(false)
    private fun newId() = java.text.SimpleDateFormat("yyyyMMdd-HHmmss", java.util.Locale.US).format(java.util.Date()) + "-" + (100..999).random()
    @Volatile private var speakNext = false

    init {
        // v2.1 and older kept one chat in chat.json: move it into the chats folder.
        val legacy = java.io.File(app.filesDir, "chat.json")
        if (legacy.exists()) runCatching { legacy.copyTo(store, overwrite = false); legacy.delete() }
        app.prefs.currentChat = chatId
        restore(); refreshChats()
    }

    private fun refreshChats() {
        _chats.value = (chatsDir.listFiles { f -> f.name.endsWith(".json") } ?: emptyArray()).mapNotNull { f ->
            runCatching {
                val o = JSONObject(f.readText())
                ChatMeta(f.nameWithoutExtension, o.optString("title").ifBlank { "محادثة" }, f.lastModified())
            }.getOrNull()
        }.sortedByDescending { it.updated }
    }

    /** Starts an empty conversation; the current one stays saved in the list. */
    fun newChat() {
        if (_running.value) return
        persist()
        chatId = newId(); app.prefs.currentChat = chatId
        history.clear(); _plan.value = null; _items.value = emptyList()
        refreshChats()
    }

    fun openChat(id: String) {
        if (_running.value || id == chatId) return
        persist()
        chatId = id; app.prefs.currentChat = id
        history.clear(); _plan.value = null; _items.value = emptyList()
        restore(); refreshChats()
    }

    fun deleteChat(id: String) {
        if (id == chatId) { clear(); return }
        java.io.File(chatsDir, "$id.json").delete(); refreshChats()
    }

    private fun add(kind: ItemKind, text: String, title: String = "") {
        _items.value = _items.value + ChatItem(ids.incrementAndGet(), kind, text, title)
        if (kind == ItemKind.ASSISTANT && notifyNext) {
            notifyNext = false
            com.wakil.agent.extra.Scheduler.notify(app, "وكيل أنهى مهمة مجدولة", text)
        }
        if (kind == ItemKind.ASSISTANT && (speakNext || app.prefs.speakReplies)) com.wakil.agent.audio.Speech.speak(text)
        persist()
    }

    /** Saves the visible chat and the model's history so they survive closing the app. */
    @Synchronized private fun persist() {
        if (!app.prefs.saveChats) return
        runCatching {
            if (_items.value.isEmpty()) return
            val o = JSONObject()
            o.put("title", (_items.value.firstOrNull { it.kind == ItemKind.USER }?.text ?: "محادثة").replace(Regex("\\s+"), " ").take(60))
            o.put("items", org.json.JSONArray().apply {
                _items.value.takeLast(300).forEach { put(JSONObject().put("k", it.kind.name).put("t", it.text.take(20000)).put("h", it.title)) }
            })
            o.put("history", org.json.JSONArray().apply {
                history.takeLast(80).forEach { put(JSONObject().put("r", it.role).put("c", it.content.take(20000))) }
            })
            val tmp = java.io.File(store.path + ".tmp"); tmp.writeText(o.toString()); tmp.renameTo(store)
        }
        if (_chats.value.none { it.id == chatId }) refreshChats()
    }

    private fun restore() {
        if (!app.prefs.saveChats || !store.exists()) return
        runCatching {
            val o = JSONObject(store.readText())
            val its = o.optJSONArray("items") ?: org.json.JSONArray()
            _items.value = (0 until its.length()).map { i ->
                val j = its.getJSONObject(i)
                ChatItem(ids.incrementAndGet(), runCatching { ItemKind.valueOf(j.optString("k")) }.getOrDefault(ItemKind.INFO), j.optString("t"), j.optString("h"))
            }
            val h = o.optJSONArray("history") ?: org.json.JSONArray()
            for (i in 0 until h.length()) { val j = h.getJSONObject(i); history += Msg(j.optString("r"), j.optString("c")) }
        }
    }

    fun clear() {
        stop()
        history.clear()
        _plan.value = null
        _items.value = emptyList()
        store.delete()
        refreshChats()
    }

    fun stop() {
        com.wakil.agent.audio.Speech.stop()
        app.llm.cancel()
        _approval.value?.result?.complete(Approval.DENY)
        job?.cancel()
    }

    fun answerApproval(a: Approval) {
        _approval.value?.result?.complete(a)
        _approval.value = null
    }

    fun send(text: String, fromVoice: Boolean = false, notifyResult: Boolean = false) {
        if (_running.value || text.isBlank()) return
        speakNext = fromVoice
        notifyNext = notifyResult
        _plan.value = null
        com.wakil.agent.audio.Speech.stop()
        add(ItemKind.USER, text)
        if (!app.llm.isReady()) {
            add(ItemKind.ERROR, "لا يوجد نموذج جاهز. حمّل نموذجاً من صفحة \"النماذج\" أو فعّل خادم OpenAI-compatible من الإعدادات.")
            return
        }
        history += Msg("user", text)
        job = app.appScope.launch {
            _running.value = true
            AgentForegroundService.acquire(app, "وكيل ينفّذ مهمة…")
            try {
                runLoop()
            } catch (e: kotlinx.coroutines.CancellationException) {
                add(ItemKind.INFO, "تم الإيقاف")
            } catch (e: Exception) {
                add(ItemKind.ERROR, e.message ?: e.toString())
            } finally {
                _plan.value?.let { pl -> if (pl.current < pl.steps.size && _items.value.lastOrNull()?.kind == ItemKind.ASSISTANT) _plan.value = pl.copy(current = pl.steps.size) }
                _streaming.value = ""
                _running.value = false
                persist()
                AgentForegroundService.release(app)
            }
        }
    }

    private suspend fun runLoop() {
        if (!app.llm.isReady()) {
            add(ItemKind.ERROR, "لا يوجد نموذج جاهز. حمّل نموذجاً من صفحة \"النماذج\" أو فعّل خادم OpenAI-compatible من الإعدادات.")
            history.removeLastOrNull()
            return
        }
        val maxSteps = app.prefs.effectiveMaxSteps
        val failed = HashMap<String, Int>(); var errStreak = 0
        app.llm.escalated = false
        if (app.llm.hybrid && app.llm.remoteConfigured) {
            val task = history.lastOrNull { it.role == "user" }?.content.orEmpty()
            if (com.wakil.agent.llm.Router.isHard(task, app.prefs.fullAccess)) {
                app.llm.escalated = true
                add(ItemKind.INFO, "مهمة كبيرة: أستعين بالنموذج السحابي.")
            }
        }
        for (step in 1..maxSteps) {
            compactHistory()
            val msgs = listOf(Msg("system", systemPrompt())) + history
            _streaming.value = ""
            val raw = app.llm.chat(msgs) { d -> _streaming.value += d }
            _streaming.value = ""
            val cleaned = stripThink(raw).trim()
            history += Msg("assistant", cleaned)
            when (val p = parse(cleaned)) {
                is Parsed.Final -> { add(ItemKind.ASSISTANT, p.text); return }
                is Parsed.Call -> {
                    val argsStr = p.args.toString(2).take(1500)
                    add(ItemKind.TOOL_CALL, argsStr, p.tool)
                    val sig = p.tool + p.args.toString()
                    val result = if ((failed[sig] ?: 0) >= 1)
                        "ERROR: you already made this exact call and it failed. Do not repeat it. Try a different tool or arguments, or reply {\"final\": \"...\"} explaining what blocked you."
                    else guardedExecute(p.tool, p.args)
                    if (result.startsWith("ERROR") || result.startsWith("DENIED")) {
                        failed[sig] = (failed[sig] ?: 0) + 1; errStreak++
                    } else errStreak = 0
                    add(ItemKind.TOOL_RESULT, result, p.tool)
                    history += Msg("user", "TOOL_RESULT (${p.tool}):\n$result\n\nContinue: reply with the next JSON tool call, or {\"final\": \"...\"} if done.")
                    if (errStreak >= 2 && app.llm.hybrid && app.llm.remoteConfigured && !app.llm.escalated) {
                        app.llm.escalated = true
                        add(ItemKind.INFO, "النموذج المحلي تعثّر، أكمل بالنموذج السحابي.")
                        errStreak = 0
                    }
                    if (errStreak >= MAX_ERR_STREAK) {
                        add(ItemKind.INFO, "توقف الوكيل بعد $errStreak محاولات فاشلة متتالية حتى لا يدور في حلقة. جرّب صياغة أوضح أو نموذجاً أكبر.")
                        return
                    }
                }
            }
        }
        add(ItemKind.INFO, "توقف الوكيل: بلغ الحد الأقصى للخطوات ($maxSteps). يمكنك رفعه من الإعدادات أو قول \"تابع\".")
    }

    /**
     * Keeps long autonomous tasks inside the model's context: old tool results are shortened
     * (the newest ones stay whole) and the task's first request is always kept.
     */
    private fun compactHistory() {
        val total = history.sumOf { it.content.length }
        if (total < COMPACT_AT && history.size < 60) return
        val keepWhole = 8
        for (i in 0 until (history.size - keepWhole).coerceAtLeast(0)) {
            val m = history[i]
            if (m.role == "user" && m.content.startsWith("TOOL_RESULT") && m.content.length > 600)
                history[i] = Msg("user", m.content.take(450) + "\n…[older output shortened]")
            else if (m.role == "assistant" && m.content.length > 1500)
                history[i] = Msg("assistant", m.content.take(1200) + "…}")
        }
        // Still too big: drop the oldest exchanges but keep the first user request of this task.
        while (history.sumOf { it.content.length } > COMPACT_AT * 2 && history.size > keepWhole + 2) {
            val firstUser = history.indexOfFirst { it.role == "user" && !it.content.startsWith("TOOL_RESULT") }
            history.removeAt(if (firstUser == 0) 1 else 0)
        }
    }

    private suspend fun guardedExecute(tool: String, args: JSONObject): String {
        val spec = tools.all.firstOrNull { it.name == tool } ?: return "ERROR: unknown tool '$tool'. Available: ${enabledTools().joinToString { it.name }}"
        if (!tools.isAvailable(tool)) return "ERROR: tool '$tool' is not available right now (${tools.statusLine()})"
        when (app.prefs.policy(spec.name)) {
            ToolPolicy.DENY -> return "DENIED: the user has disabled tool '$tool'."
            ToolPolicy.ALLOW -> {}
            ToolPolicy.ASK -> {
                val req = ApprovalRequest(tool, args.toString(2).take(2000), CompletableDeferred())
                _approval.value = req
                ApprovalNotifier.show(app, tool, req.argsPreview)
                val a = try { req.result.await() } finally { ApprovalNotifier.cancel(app) }
                _approval.value = null
                when (a) {
                    Approval.DENY -> return "DENIED: the user rejected this action. Ask what they want instead or try another approach."
                    Approval.ALWAYS -> app.prefs.setPolicy(tool, ToolPolicy.ALLOW)
                    Approval.ONCE -> {}
                }
            }
        }
        return try { tools.execute(tool, args) } catch (e: Exception) { "ERROR: ${e.message ?: e}" }
    }

    private fun enabledTools() = tools.all.filter { app.prefs.policy(it.name) != ToolPolicy.DENY && tools.isAvailable(it.name) }

    private fun systemPrompt(): String = buildString {
        append(
            """
You are Wakil (وكيل), an autonomous AI agent running locally on the user's Android phone.
Always answer in the user's language (Arabic or English). Be concise.

You act by calling tools. To call a tool reply with ONLY one JSON object and nothing else:
{"tool": "<tool name>", "args": { ... }}
When the task is complete, or no tool is needed, reply with ONLY:
{"final": "<your answer to the user>"}

Rules:
- Exactly one JSON object per reply. No markdown, no code fences, no text outside the JSON.
- After each tool call you receive a message starting with TOOL_RESULT. Read it, then decide the next step.
- If a tool fails, try a different approach; do not repeat the exact same failing call.
- Questions about the phone's battery, RAM, storage, network, model or time: call device_info. Never read or tap the screen for these.
- The Wakil chat itself is not a target for screen tools. To act in another app, call open_app first.
- For screen tasks: open_app, then read_screen to see elements, then tap_text / tap_xy / type_text, then read_screen again to verify.
- Never invent tool results. Use "\n" for newlines inside JSON strings.

Available tools:
""".trimStart()
        )
        for (t in enabledTools()) append("- ${t.name} ${t.signature}: ${t.description}\n")
        append("\nDevice status: ${tools.statusLine()}\n")
        append("Now: ${java.text.SimpleDateFormat("yyyy-MM-dd HH:mm EEEE", java.util.Locale.US).format(java.util.Date())}\n")
        append(app.memory.promptBlock())
        append(
            "For tasks with 3+ steps, first call plan with the steps, and call plan again with the new current index as you finish each step. " +
            "Use web_search / web_fetch whenever you need current information, documentation, or to understand an error. " +
            "For ANY arithmetic, math or date/calendar calculation call calc or datetime - never compute numbers in your head. " +
            "To call or debug an HTTP API with custom method/headers/body use http_request. " +
            "When the user tells you a lasting preference or fact, save it with memory_save. " +
            "For reminders or recurring jobs use schedule_task.\n"
        )
        val st = app.llm.state.value
        if (!app.llm.usingRemote && st is com.wakil.agent.llm.LlmState.Ready && st.name.contains("qwen3", true) && !app.prefs.thinking) append("/no_think\n")
        if (tools.isAvailable("run_shell")) append(
            "To make an Android app: run_shell `wakil-apk setup` once (slow, ~450 MB), then `wakil-apk new <Name>` " +
            "(Java project in /root/apps/<Name>: AndroidManifest.xml, res/, src/), edit files with write_file, " +
            "`wakil-apk build /root/apps/<Name>` (timeout 900), then install_apk with the printed .apk path. Java only, no AndroidX/Kotlin.\n"
        )
        if (tools.isAvailable("gh_build")) append(
            "GitHub is linked. To make a real app: gh_create (new repo from a template) or use an existing repo; gh_tree to see all files; " +
            "gh_read to read; gh_write_files to change several files in one commit; then gh_build_wait (builds in the cloud and waits for the result). " +
            "If it fails, read the error log in the result, fix the exact files and lines it names with gh_write_files, and call gh_build_wait again. " +
            "Repeat until it succeeds (up to 6 tries), then gh_install. Supported: Android Kotlin/Java (Gradle), Flutter/Dart, HTML/CSS/JS and Next.js (Capacitor).\n"
        )
        if (app.prefs.customInstructions.isNotBlank()) append("User's standing instructions (always follow):\n${app.prefs.customInstructions.take(2000)}\n")
        if (app.prefs.fullAccess) append(
            "FULL ACCESS MODE: the user granted you full access. Every tool runs without asking. Work autonomously to the end: plan, build, " +
            "test, fix errors yourself and only finish when the task is really done or truly impossible. Do not ask the user for permission.\n"
        )
        if (tools.isAvailable("sys_shell")) append("Prefer sys_shell for Android system operations (pm, am, settings, input).\n")
        append(
            """
Example:
User: what is the kernel version?
Assistant: {"tool": "run_shell", "args": {"cmd": "uname -a"}}
User: TOOL_RESULT (run_shell): [exit 0] Linux localhost 5.15 ...
Assistant: {"final": "Kernel version is 5.15."}
""".trimEnd()
        )
    }

    companion object {
        const val MAX_ERR_STREAK = 5
        const val COMPACT_AT = 24_000
        fun stripThink(s: String): String =
            s.replace(Regex("(?s)<think>.*?</think>"), "").replace(Regex("(?s)^.*?</think>"), "")

        /** Extracts the first balanced JSON object, repairing raw newlines inside strings. */
        fun extractJson(s: String): String? {
            val start = s.indexOf('{'); if (start < 0) return null
            val sb = StringBuilder()
            var depth = 0; var inStr = false; var esc = false
            for (i in start until s.length) {
                val c = s[i]
                if (inStr) {
                    when {
                        esc -> { sb.append(c); esc = false }
                        c == '\\' -> { sb.append(c); esc = true }
                        c == '"' -> { sb.append(c); inStr = false }
                        c == '\n' -> sb.append("\\n")
                        c == '\r' -> {}
                        c == '\t' -> sb.append("\\t")
                        else -> sb.append(c)
                    }
                } else {
                    sb.append(c)
                    when (c) {
                        '"' -> inStr = true
                        '{' -> depth++
                        '}' -> { depth--; if (depth == 0) return sb.toString() }
                    }
                }
            }
            return null
        }

        fun parse(text: String): Parsed {
            val js = extractJson(text) ?: return Parsed.Final(text.ifBlank { "(no answer)" })
            val o = runCatching { JSONObject(js) }.getOrNull() ?: return Parsed.Final(text)
            if (o.has("final")) return Parsed.Final(o.optString("final"))
            val tool = o.optString("tool").ifBlank { o.optString("name") }.ifBlank { o.optString("function") }
            if (tool.isBlank()) return Parsed.Final(text)
            val args = o.optJSONObject("args") ?: o.optJSONObject("arguments") ?: o.optJSONObject("parameters")
                ?: JSONObject(o.toString()).apply { remove("tool"); remove("name") }
            return Parsed.Call(tool, args)
        }
    }
}
