package com.drsai.assistant.ui.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drsai.assistant.di.AppContainer
import com.drsai.assistant.domain.model.Conversation
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class HistoryViewModel(private val c: AppContainer) : ViewModel() {
    /** Conversations, most recently updated first. */
    val conversations: StateFlow<List<Conversation>?> = c.chatRepository.conversations()
        .map { list -> list.sortedByDescending { it.updatedAt } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    fun delete(id: Long) {
        viewModelScope.launch { c.chatRepository.deleteConversation(id) }
    }
}
