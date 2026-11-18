package com.drsai.assistant.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drsai.assistant.di.AppContainer
import com.drsai.assistant.domain.model.ChatRole
import com.drsai.assistant.domain.model.ChatTurn
import com.drsai.assistant.domain.model.GenerationParams
import com.drsai.assistant.domain.model.Message
import com.drsai.assistant.domain.usecase.Persona
import com.drsai.assistant.domain.usecase.ReasoningParser
import com.drsai.assistant.domain.usecase.TitleMaker
import com.drsai.assistant.llm.EngineConfig
import com.drsai.assistant.llm.EngineState
import com.drsai.assistant.voice.SentenceStreamer
import com.drsai.assistant.domain.model.AppSettings
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** The reply being generated: visible answer plus (hidden by default) reasoning. */
data class Streaming(
    val messageId: Long,
    val text: String,
    val reasoning: String = "",
    val thinking: Boolean = false,
)

@OptIn(ExperimentalCoroutinesApi::class)
class ChatViewModel(private val c: AppContainer, initialConversationId: Long) : ViewModel() {
    private val conversationId = MutableStateFlow(initialConversationId.takeIf { it > 0 })

    val messages: StateFlow<List<Message>> = conversationId
        .flatMapLatest { id -> if (id == null) flowOf(emptyList()) else c.chatRepository.messages(id) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _streaming = MutableStateFlow<Streaming?>(null)
    val streaming: StateFlow<Streaming?> = _streaming.asStateFlow()

    /** Reasoning of replies generated in this session (not persisted; history keeps answers only). */
    private val _reasoning = MutableStateFlow<Map<Long, String>>(emptyMap())
    val reasoning: StateFlow<Map<Long, String>> = _reasoning.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    val engineState: StateFlow<EngineState> = c.llmEngine.state

    /** Auto-read setting (persisted) and the message currently being spoken. */
    val autoRead: StateFlow<Boolean> = c.settingsRepository.settings
        .map { it.autoRead }
        .stateIn(viewModelScope, SharingStarted.Eagerly, AppSettings().autoRead)
    val speakingId: StateFlow<Long?> = c.textToSpeech.speakingId
    val voiceAvailable: Boolean get() = c.textToSpeech.isAvailable

    /** Shown when the user asks for speech before the voice is downloaded. */
    private val _voiceMissing = MutableStateFlow(false)
    val voiceMissing: StateFlow<Boolean> = _voiceMissing.asStateFlow()

    private var generation: Job? = null
    val isGenerating get() = generation?.isActive == true

    init {
        viewModelScope.launch { ensureModelLoaded() }
        viewModelScope.launch {
            if (c.settingsRepository.settings.first().autoRead) c.textToSpeech.prepare()
        }
    }

    fun toggleAutoRead() {
        val on = !autoRead.value
        if (on && !c.textToSpeech.isAvailable) {
            _voiceMissing.value = true
            return
        }
        if (!on) c.textToSpeech.stop() else c.textToSpeech.prepare()
        viewModelScope.launch { c.settingsRepository.setAutoRead(on) }
    }

    /** Per-message play / stop. */
    fun toggleSpeak(message: Message) {
        if (speakingId.value == message.id) {
            c.textToSpeech.stop()
            return
        }
        if (!c.textToSpeech.isAvailable) {
            _voiceMissing.value = true
            return
        }
        c.textToSpeech.speak(message.id, message.content)
    }

    fun stopSpeaking() = c.textToSpeech.stop()

    fun dismissVoiceMissing() { _voiceMissing.value = false }

    private suspend fun ensureModelLoaded(): Boolean {
        val spec = c.models.selected.value
        val repo = c.models.repository(spec.id)
        if (!repo.isModelReady()) return false
        val settings = c.settingsRepository.settings.first()
        val cores = Runtime.getRuntime().availableProcessors()
        val config = EngineConfig(
            contextSize = settings.contextSize,
            threads = (cores - 2).coerceIn(2, 4),
            promptFormat = spec.promptFormat,
        )
        val path = repo.modelFile().absolutePath
        if (c.llmEngine.loadedConfig == config && c.llmEngine.loadedModelPath == path &&
            c.llmEngine.state.value !is EngineState.Unloaded
        ) return true
        return try {
            c.llmEngine.load(path, config)
            true
        } catch (e: Exception) {
            _error.value = e.message ?: "load failed"
            false
        }
    }

    fun clearError() { _error.value = null }

    fun send(text: String) {
        val prompt = text.trim()
        if (prompt.isEmpty() || isGenerating) return
        c.textToSpeech.stop() // a new message interrupts whatever is being read
        generation = viewModelScope.launch {
            val convId = conversationId.value
                ?: c.chatRepository.createConversation(TitleMaker.fromFirstMessage(prompt)).also {
                    conversationId.value = it
                }
            c.chatRepository.addMessage(convId, ChatRole.USER, prompt)
            if (!ensureModelLoaded()) return@launch

            val history = c.chatRepository.messagesOnce(convId)
            val turns = buildList {
                add(ChatTurn(ChatRole.SYSTEM, Persona.SYSTEM_PROMPT_AR))
                history.filter { it.content.isNotBlank() }.forEach { add(ChatTurn(it.role, it.content)) }
            }
            val replyId = c.chatRepository.addMessage(convId, ChatRole.ASSISTANT, "")
            val settings = c.settingsRepository.settings.first()
            val reasons = c.llmEngine.loadedConfig?.promptFormat?.opensReasoning == true
            val params = GenerationParams(
                temperature = settings.temperature,
                // reasoning models spend part of the budget thinking
                maxNewTokens = if (reasons) 1536 else 1024,
            )
            val sb = StringBuilder()
            var speaking = false
            // Read the answer aloud sentence by sentence while it streams (reasoning stays hidden).
            val readAloud = settings.autoRead && c.textToSpeech.isAvailable
            val sentences = SentenceStreamer()
            if (readAloud) c.textToSpeech.begin(replyId)
            _streaming.value = Streaming(replyId, "", thinking = reasons)
            c.avatar.onThinking()
            try {
                c.llmEngine.generate(turns, params).collect { piece ->
                    sb.append(piece)
                    val parsed = ReasoningParser.parse(sb.toString(), startsInReasoning = reasons)
                    if (!speaking && parsed.answer.isNotEmpty()) {
                        speaking = true
                        c.avatar.onSpeaking(null)
                    }
                    _streaming.value = Streaming(replyId, parsed.answer, parsed.reasoning, parsed.inReasoning)
                    if (readAloud && !parsed.inReasoning) {
                        sentences.feed(parsed.answer).forEach { c.textToSpeech.add(replyId, it) }
                    }
                }
            } catch (e: Exception) {
                if (e !is kotlinx.coroutines.CancellationException) _error.value = e.message
            } finally {
                withContext(NonCancellable) {
                    val parsed = ReasoningParser.parse(sb.toString(), startsInReasoning = reasons, final = true)
                    if (parsed.reasoning.isNotEmpty()) _reasoning.value = _reasoning.value + (replyId to parsed.reasoning)
                    if (readAloud) {
                        sentences.finish(parsed.answer).forEach { c.textToSpeech.add(replyId, it) }
                        c.textToSpeech.end(replyId)
                    }
                    c.chatRepository.updateMessage(replyId, parsed.answer)
                    _streaming.value = null
                    c.avatar.onIdle()
                }
            }
        }
    }

    /** The stop button ends generation and any speech. */
    fun stop() {
        c.llmEngine.stop()
        c.textToSpeech.stop()
    }
}
