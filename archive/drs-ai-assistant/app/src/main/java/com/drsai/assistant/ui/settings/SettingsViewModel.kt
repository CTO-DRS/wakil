package com.drsai.assistant.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drsai.assistant.di.AppContainer
import com.drsai.assistant.domain.model.AppSettings
import com.drsai.assistant.domain.model.ModelSpec
import com.drsai.assistant.domain.repository.ModelRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class SettingsViewModel(private val c: AppContainer) : ViewModel() {
    val settings: StateFlow<AppSettings> = c.settingsRepository.settings
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AppSettings())

    val catalog: List<ModelSpec> get() = c.models.catalog
    val selected: StateFlow<ModelSpec> = c.models.selected

    fun repository(spec: ModelSpec): ModelRepository = c.models.repository(spec.id)

    /** Id of the model currently being deleted, if any. */
    private val _deleting = MutableStateFlow<String?>(null)
    val deleting: StateFlow<String?> = _deleting.asStateFlow()

    /** Set when the selected model is gone and no other model is on the device. */
    private val _needsOnboarding = MutableStateFlow(false)
    val needsOnboarding: StateFlow<Boolean> = _needsOnboarding.asStateFlow()

    // ---- Voice (offline Saudi TTS)
    val voiceState = c.voicePack.downloadState
    val voiceTotalBytes: Long get() = c.voicePack.totalBytes
    val speakingId = c.textToSpeech.speakingId

    private val _deletingVoice = MutableStateFlow(false)
    val deletingVoice: StateFlow<Boolean> = _deletingVoice.asStateFlow()

    fun startVoiceDownload() = c.voicePack.startDownload()
    fun pauseVoiceDownload() = c.voicePack.pauseDownload()

    fun deleteVoice() {
        if (_deletingVoice.value) return
        _deletingVoice.value = true
        viewModelScope.launch {
            try {
                c.textToSpeech.release()
                c.voicePack.delete()
            } finally {
                _deletingVoice.value = false
            }
        }
    }

    fun setAutoRead(value: Boolean) {
        if (!value) c.textToSpeech.stop()
        viewModelScope.launch { c.settingsRepository.setAutoRead(value) }
    }

    fun setTtsSpeed(value: Float) {
        viewModelScope.launch { c.settingsRepository.setTtsSpeed(value) }
    }

    /** Plays a short sample so the user can hear the voice and the chosen speed. */
    fun toggleSample(text: String) {
        if (c.textToSpeech.speakingId.value == SAMPLE_ID) c.textToSpeech.stop()
        else c.textToSpeech.speak(SAMPLE_ID, text)
    }

    fun setTemperature(value: Float) {
        viewModelScope.launch { c.settingsRepository.setTemperature(value) }
    }

    /** The chat screen reloads the engine with the new context size on its next load check. */
    fun setContextSize(value: Int) {
        viewModelScope.launch { c.settingsRepository.setContextSize(value) }
    }

    /** Only downloaded models can be selected; the chat screen reloads the engine on next use. */
    fun select(spec: ModelSpec) {
        if (!repository(spec).isModelReady()) return
        c.models.select(spec.id)
    }

    fun startDownload(spec: ModelSpec) = repository(spec).startDownload()
    fun pauseDownload(spec: ModelSpec) = repository(spec).pauseDownload()

    fun deleteModel(spec: ModelSpec) {
        if (_deleting.value != null) return
        _deleting.value = spec.id
        viewModelScope.launch {
            try {
                val wasSelected = selected.value.id == spec.id
                if (wasSelected) {
                    c.llmEngine.stop()
                    c.llmEngine.unload()
                }
                repository(spec).deleteModel()
                if (wasSelected) {
                    val other = catalog.firstOrNull { it.id != spec.id && repository(it).isModelReady() }
                    if (other != null) c.models.select(other.id) else _needsOnboarding.value = true
                }
            } finally {
                _deleting.value = null
            }
        }
    }

    companion object {
        const val SAMPLE_ID = -100L
    }
}
