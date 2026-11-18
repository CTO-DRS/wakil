package com.drsai.assistant.llm

import com.drsai.assistant.domain.model.ChatTurn
import com.drsai.assistant.domain.model.GenerationParams
import com.drsai.assistant.domain.model.PromptFormat
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

sealed interface EngineState {
    data object Unloaded : EngineState
    data object Loading : EngineState
    data class Ready(val modelPath: String, val contextSize: Int) : EngineState
    data object Generating : EngineState
    data class Error(val message: String) : EngineState
}

data class EngineConfig(
    val contextSize: Int,
    val threads: Int,
    val promptFormat: PromptFormat = PromptFormat.GGUF_TEMPLATE,
)

/**
 * Abstraction over an on-device language model. v0.1 ships a llama.cpp implementation;
 * the voice (v0.2) and avatar (v0.3) layers consume the token stream through this interface.
 */
interface LlmEngine {
    val state: StateFlow<EngineState>
    val loadedConfig: EngineConfig?
    val loadedModelPath: String?

    suspend fun load(modelPath: String, config: EngineConfig)
    suspend fun unload()

    /** Streams decoded text pieces. Cancelling the collector or calling [stop] ends generation. */
    fun generate(turns: List<ChatTurn>, params: GenerationParams): Flow<String>

    fun stop()
}
