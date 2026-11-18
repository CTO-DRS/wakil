package com.wakil.agent.llm

import android.content.Context
import com.wakil.agent.Prefs
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

data class Msg(val role: String, val content: String)

sealed class LlmState {
    data object Empty : LlmState()
    data class Loading(val name: String) : LlmState()
    data class Ready(val name: String, val nCtx: Int) : LlmState()
    data class Error(val message: String) : LlmState()
}

class LlmException(msg: String) : Exception(msg)

/** Unified chat backend: local llama.cpp model or optional OpenAI-compatible endpoint. */
class LlmManager(private val ctx: Context, private val prefs: Prefs, private val scope: CoroutineScope) {
    @OptIn(ExperimentalCoroutinesApi::class)
    private val llamaDispatcher = Dispatchers.IO.limitedParallelism(1)
    private var handle: Long = 0
    private val _state = MutableStateFlow<LlmState>(LlmState.Empty)
    val state: StateFlow<LlmState> = _state
    @Volatile private var cancelRequested = false
    private var cacheFile: File? = null
    private var cacheSaved = false

    /** Share of speculated tokens the model accepted, 0..1, or null before any. */
    fun lookupRate(): Float? = if (handle == 0L) null else LlamaNative.lookupRate(handle).takeIf { it >= 0 }?.let { it / 1000f }

    private fun saveKv() {
        val f = cacheFile ?: return
        if (handle == 0L) return
        runCatching { f.parentFile?.mkdirs(); f.parentFile?.listFiles()?.filter { it != f }?.forEach { it.delete() }; LlamaNative.saveCache(handle, f.path) }
    }

    init {
        val last = prefs.lastModelRef
        if (prefs.autoLoadModel && last != null && (ExtModels.isContentRef(last) || File(last).exists())) scope.launch { runCatching { load(last) } }
    }

    /** Hybrid mode: true while the current task runs on the cloud model. */
    @Volatile var escalated = false
    val hybrid get() = prefs.backend == "hybrid"
    val remoteConfigured get() = prefs.openAiBaseUrl.isNotBlank()
    val usingRemote get() = prefs.backend == "openai" ||
        (hybrid && remoteConfigured && (escalated || handle == 0L))

    fun isReady(): Boolean = when {
        prefs.backend == "openai" -> remoteConfigured
        hybrid -> handle != 0L || remoteConfigured
        else -> handle != 0L
    }

    /**
     * Load a model by ref: a path inside Wakil's storage, or a content:// URI to a file that stays
     * in the phone's own storage (instant import, no copy). SAF documents are streamed to llama.cpp
     * through /proc/self/fd/<n>: we hold the descriptor open while llama.cpp opens the same inode
     * itself, so multi-GB models start in seconds without duplicating them into app storage.
     */
    suspend fun load(ref: String) = withContext(llamaDispatcher) {
        if (ExtModels.isContentRef(ref)) {
            var pfd: android.os.ParcelFileDescriptor? = null
            try {
                pfd = ctx.contentResolver.openFileDescriptor(android.net.Uri.parse(ref), "r")
                if (pfd == null) {
                    _state.value = LlmState.Error("تعذّر فتح النموذج من ذاكرة الهاتف (ربما نُقل أو حُذف الملف) — استورد النسخة الاحتياطية مرة أخرى أو انسخه إلى التطبيق.")
                    return@withContext
                }
                loadCore(ref, "/proc/self/fd/" + pfd.fd, displayNameFor(ref))
            } catch (e: Exception) {
                _state.value = LlmState.Error("تعذّر فتح النموذج من ذاكرة الهاتف: ${e.message ?: e}")
            } finally {
                runCatching { pfd?.close() }
            }
        } else {
            if (!File(ref).exists()) {
                _state.value = LlmState.Error("ملف النموذج غير موجود (ربما حُذف) — استورده أو نزّله مرة أخرى.")
                return@withContext
            }
            loadCore(ref, ref, File(ref).name)
        }
    }

    /** Real document name for a content:// ref: Wakil's remembered list first, then the provider. */
    private fun displayNameFor(ref: String): String {
        val uri = android.net.Uri.parse(ref)
        runCatching {
            ctx.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst()) c.getString(0)?.takeIf { it.isNotBlank() }?.let { return ExtModels.normalizeName(it) }
            }
        }
        return "model.gguf"
    }

    private fun loadCore(ref: String, path: String, name: String) {
        _state.value = LlmState.Loading(name)
        if (!LlamaNative.ensureLoaded()) {
            _state.value = LlmState.Error("تعذر تحميل مكتبة llama: ${LlamaNative.loadError}")
            return
        }
        if (handle != 0L) { LlamaNative.freeModel(handle); handle = 0 }
        val h = LlamaNative.loadModel(path, prefs.nCtx, prefs.effectiveThreads, prefs.gpuLayers)
        if (h == 0L) {
            _state.value = LlmState.Error("فشل تحميل النموذج (ملف تالف أو ذاكرة غير كافية): $name")
        } else {
            handle = h
            prefs.lastModelRef = ref
            LlamaNative.setLookup(h, if (prefs.fastLookup) 8 else 0)
            cacheFile = File(ctx.cacheDir, "kv/" + name + "-" + File(path).length() + "-" + LlamaNative.contextSize(h) + ".kv")
            cacheSaved = false
            // Restore the saved system prompt so the first reply doesn't re-read the long tool prompt.
            runCatching { if (cacheFile!!.exists() && LlamaNative.loadCache(h, cacheFile!!.path) == 0) cacheFile!!.delete() }
            _state.value = LlmState.Ready(name, LlamaNative.contextSize(h))
        }
    }

    suspend fun unload() = withContext(llamaDispatcher) {
        if (handle != 0L) { saveKv(); LlamaNative.freeModel(handle); handle = 0 }
        _state.value = LlmState.Empty
    }

    fun cancel() {
        cancelRequested = true
        if (handle != 0L) LlamaNative.abort(handle)
    }

    /** Streams the assistant reply for [messages]; returns the full text. */
    suspend fun chat(messages: List<Msg>, onDelta: (String) -> Unit): String {
        cancelRequested = false
        return if (usingRemote) chatRemote(messages, onDelta) else chatLocal(messages, onDelta)
    }

    private val modelName get() = ((_state.value as? LlmState.Ready)?.name ?: "").lowercase()

    private fun formatLocal(messages: List<Msg>): ByteArray {
        val n = modelName
        // Gemma 4 uses new turn tokens that this llama.cpp's built-in templates don't know yet.
        if (n.contains("gemma-4") || n.contains("gemma4")) return PromptFormats.gemma4(messages).toByteArray()
        val base = formatBuiltin(messages)
        // Qwen3 / Qwen3.5 think by default; an empty think block makes them answer directly (same as enable_thinking=false).
        return if (PromptFormats.needsNoThink(n, prefs.thinking)) base + PromptFormats.NO_THINK.toByteArray() else base
    }

    private fun formatBuiltin(messages: List<Msg>): ByteArray {
        val roles = messages.map { it.role.toByteArray() }.toTypedArray()
        val contents = messages.map { it.content.toByteArray() }.toTypedArray()
        return LlamaNative.applyTemplate(handle, roles, contents, true)
            ?: throw LlmException("تعذر تطبيق قالب المحادثة")
    }

    private suspend fun chatLocal(messages: List<Msg>, onDelta: (String) -> Unit): String = withContext(llamaDispatcher) {
        if (handle == 0L) throw LlmException("لا يوجد نموذج محمّل. افتح صفحة النماذج وحمّل نموذجاً.")
        val nCtx = LlamaNative.contextSize(handle)
        val maxNew = prefs.maxNewTokens.coerceAtMost(nCtx / 2)
        // Trim history (keep system + latest messages) until the prompt fits.
        var msgs = messages
        var prompt = formatLocal(msgs)
        while (LlamaNative.countTokens(handle, prompt) + maxNew > nCtx) {
            msgs = shrink(msgs) ?: throw LlmException("الرسالة أطول من سياق النموذج ($nCtx)")
            prompt = formatLocal(msgs)
        }
        val sb = StringBuilder()
        val rc = LlamaNative.generate(handle, prompt, maxNew, prefs.temperature, 0.9f) { bytes ->
            val s = String(bytes, Charsets.UTF_8)
            sb.append(s)
            onDelta(s)
            !cancelRequested && !PromptFormats.hitStop(sb)
        }
        if (rc < 0) throw LlmException("خطأ في التوليد (code $rc)")
        if (!cacheSaved) { cacheSaved = true; saveKv() }
        PromptFormats.clean(sb.toString())
    }

    data class Bench(val promptTps: Double, val genTps: Double, val tokens: Int)

    /** Speed test on the loaded local model: prompt reading and generation speed in tokens per second. */
    suspend fun benchmark(): Bench = withContext(llamaDispatcher) {
        if (handle == 0L) throw LlmException("حمّل نموذجاً أولاً")
        LlamaNative.resetCache(handle)
        val prompt = formatLocal(listOf(Msg("user", "اكتب فقرة من خمس جمل عن أهمية الذكاء الاصطناعي في الحياة اليومية.")))
        val nPrompt = LlamaNative.countTokens(handle, prompt)
        val t0 = System.nanoTime(); var tFirst = 0L; var n = 0
        cancelRequested = false
        val rc = LlamaNative.generate(handle, prompt, 96, 0.7f, 0.9f) { _ ->
            if (tFirst == 0L) tFirst = System.nanoTime()
            n++; !cancelRequested
        }
        val t1 = System.nanoTime()
        LlamaNative.resetCache(handle)
        if (rc < 0) throw LlmException("خطأ في الاختبار (code $rc)")
        val gen = maxOf(rc, n)
        val pp = nPrompt / ((tFirst - t0).coerceAtLeast(1) / 1e9)
        val tg = (gen - 1).coerceAtLeast(1) / ((t1 - tFirst).coerceAtLeast(1) / 1e9)
        Bench(pp, tg, gen)
    }

    /** Drops or truncates the oldest non-system message; null when nothing left to drop. */
    private fun shrink(msgs: List<Msg>): List<Msg>? {
        val sys = msgs.takeWhile { it.role == "system" }
        val rest = msgs.drop(sys.size)
        if (rest.size > 1) return sys + rest.drop(1)
        val only = rest.firstOrNull() ?: return null
        if (only.content.length < 200) return null
        return sys + Msg(only.role, only.content.takeLast(only.content.length / 2))
    }

    private suspend fun chatRemote(messages: List<Msg>, onDelta: (String) -> Unit): String = withContext(Dispatchers.IO) {
        val base = prefs.openAiBaseUrl.trimEnd('/')
        val conn = URL("$base/chat/completions").openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.connectTimeout = 30_000
        conn.readTimeout = 180_000
        conn.doOutput = true
        conn.setRequestProperty("Content-Type", "application/json")
        conn.setRequestProperty("Accept", "text/event-stream")
        if (prefs.openAiKey.isNotBlank()) conn.setRequestProperty("Authorization", "Bearer ${prefs.openAiKey}")
        val body = JSONObject()
            .put("model", prefs.openAiModel)
            .put("stream", true)
            .put("temperature", prefs.temperature.toDouble())
            .put("messages", JSONArray().apply {
                messages.forEach { put(JSONObject().put("role", it.role).put("content", it.content)) }
            })
        conn.outputStream.use { it.write(body.toString().toByteArray()) }
        val code = conn.responseCode
        if (code !in 200..299) {
            val err = conn.errorStream?.bufferedReader()?.readText()?.take(500)
            throw LlmException("خطأ من الخادم $code: $err")
        }
        val sb = StringBuilder()
        conn.inputStream.bufferedReader().use { r ->
            while (true) {
                if (cancelRequested) break
                val line = r.readLine() ?: break
                if (!line.startsWith("data:")) continue
                val data = line.removePrefix("data:").trim()
                if (data == "[DONE]") break
                val delta = runCatching {
                    JSONObject(data).getJSONArray("choices").getJSONObject(0)
                        .optJSONObject("delta")?.optString("content", "") ?: ""
                }.getOrDefault("")
                if (delta.isNotEmpty() && delta != "null") { sb.append(delta); onDelta(delta) }
            }
        }
        conn.disconnect()
        sb.toString()
    }
}
