package com.drsai.assistant.llm

import com.drsai.assistant.domain.model.ChatTurn
import com.drsai.assistant.domain.model.GenerationParams
import com.drsai.assistant.domain.model.PromptFormat
import com.drsai.assistant.domain.usecase.ChatMlFormatter
import com.drsai.assistant.domain.usecase.ContextWindow
import com.drsai.assistant.domain.usecase.Jais3Formatter
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class LlmException(message: String) : Exception(message)

/**
 * llama.cpp-backed engine. Every native call runs on one dedicated thread, so the
 * native session never sees concurrent access.
 */
class LlamaCppEngine : LlmEngine {
    private val dispatcher = Executors.newSingleThreadExecutor { r ->
        Thread(r, "drs-llm").apply { isDaemon = true }
    }.asCoroutineDispatcher()

    private val _state = MutableStateFlow<EngineState>(EngineState.Unloaded)
    override val state: StateFlow<EngineState> = _state.asStateFlow()

    @Volatile private var handle = 0L
    @Volatile override var loadedConfig: EngineConfig? = null
        private set
    @Volatile private var loadedPath: String? = null
    override val loadedModelPath: String? get() = loadedPath
    private val stopRequested = AtomicBoolean(false)

    override suspend fun load(modelPath: String, config: EngineConfig) = withContext(dispatcher) {
        if (handle != 0L && loadedPath == modelPath && loadedConfig == config) return@withContext
        releaseLocked()
        _state.value = EngineState.Loading
        try {
            LlamaNative.ensureLoaded()
        } catch (t: Throwable) {
            _state.value = EngineState.Error("native library: ${t.message}")
            throw LlmException("Native library failed to load")
        }
        val h = LlamaNative.nativeLoad(modelPath, config.contextSize, config.threads)
        if (h == 0L) {
            _state.value = EngineState.Error("model load failed")
            throw LlmException("Model failed to load")
        }
        handle = h
        loadedPath = modelPath
        loadedConfig = config
        _state.value = EngineState.Ready(modelPath, LlamaNative.nativeContextSize(h))
    }

    override suspend fun unload() = withContext(dispatcher) { releaseLocked() }

    private fun releaseLocked() {
        if (handle != 0L) LlamaNative.nativeFree(handle)
        handle = 0L
        loadedPath = null
        loadedConfig = null
        _state.value = EngineState.Unloaded
    }

    override fun stop() {
        stopRequested.set(true)
    }

    override fun generate(turns: List<ChatTurn>, params: GenerationParams): Flow<String> = flow {
        val h = handle
        if (h == 0L) throw LlmException("Model not loaded")
        stopRequested.set(false)
        val ready = _state.value
        _state.value = EngineState.Generating
        try {
            val nCtx = LlamaNative.nativeContextSize(h)
            val reserve = minOf(params.maxNewTokens, nCtx / 3)
            val fitted = ContextWindow.trim(turns, nCtx - reserve) { t ->
                LlamaNative.nativeTokenCount(h, format(h, t))
            }
            val prompt = format(h, fitted)
            val n = LlamaNative.nativeBeginCompletion(
                h, prompt, params.temperature, params.topP, params.topK, params.repeatPenalty, params.seed,
            )
            if (n < 0) throw LlmException("Prompt evaluation failed ($n)")

            val utf8 = Utf8Accumulator()
            var produced = 0
            while (produced < params.maxNewTokens && !stopRequested.get()) {
                currentCoroutineContext().ensureActive()
                val bytes = LlamaNative.nativeNextToken(h) ?: break
                produced++
                val text = utf8.push(bytes)
                if (text.isNotEmpty()) emit(text)
            }
            val tail = utf8.flush()
            if (tail.isNotEmpty()) emit(tail)
        } finally {
            _state.value = if (handle != 0L) {
                (ready as? EngineState.Ready) ?: EngineState.Ready(loadedPath.orEmpty(), LlamaNative.nativeContextSize(h))
            } else EngineState.Unloaded
        }
    }.flowOn(dispatcher)

    private fun format(h: Long, turns: List<ChatTurn>): String {
        if (loadedConfig?.promptFormat == PromptFormat.JAIS3) return Jais3Formatter.format(turns)
        val roles = Array(turns.size) { turns[it].role.wire }
        val contents = Array(turns.size) { turns[it].content }
        return LlamaNative.nativeApplyTemplate(h, roles, contents, true) ?: ChatMlFormatter.format(turns)
    }
}
