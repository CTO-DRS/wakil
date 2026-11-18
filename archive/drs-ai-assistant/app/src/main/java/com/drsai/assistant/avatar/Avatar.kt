package com.drsai.assistant.avatar

import com.drsai.assistant.voice.Viseme
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/*
 * v0.3 placeholder: animated 2D character that moves and lip-syncs while talking.
 * The chat screen reports what the assistant is doing; a renderer observes [state].
 */

sealed interface AvatarState {
    data object Idle : AvatarState
    data object Listening : AvatarState
    data object Thinking : AvatarState
    data class Speaking(val viseme: Viseme?) : AvatarState
}

interface AvatarController {
    val state: StateFlow<AvatarState>
    fun onListening()
    fun onThinking()
    fun onSpeaking(viseme: Viseme?)
    fun onIdle()
}

/** Default controller: tracks state so a future renderer can plug in without changes. */
class StateOnlyAvatarController : AvatarController {
    private val _state = MutableStateFlow<AvatarState>(AvatarState.Idle)
    override val state: StateFlow<AvatarState> = _state.asStateFlow()
    override fun onListening() { _state.value = AvatarState.Listening }
    override fun onThinking() { _state.value = AvatarState.Thinking }
    override fun onSpeaking(viseme: Viseme?) { _state.value = AvatarState.Speaking(viseme) }
    override fun onIdle() { _state.value = AvatarState.Idle }
}
