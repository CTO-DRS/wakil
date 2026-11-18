package com.drsai.assistant.domain.repository

import com.drsai.assistant.domain.model.AppSettings
import com.drsai.assistant.domain.model.ChatRole
import com.drsai.assistant.domain.model.Conversation
import com.drsai.assistant.domain.model.DownloadState
import com.drsai.assistant.domain.model.Message
import com.drsai.assistant.domain.model.ModelSpec
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import java.io.File

interface ChatRepository {
    fun conversations(): Flow<List<Conversation>>
    fun messages(conversationId: Long): Flow<List<Message>>
    suspend fun messagesOnce(conversationId: Long): List<Message>
    suspend fun createConversation(title: String): Long
    suspend fun addMessage(conversationId: Long, role: ChatRole, content: String): Long
    suspend fun updateMessage(messageId: Long, content: String)
    suspend fun deleteConversation(conversationId: Long)
}

interface SettingsRepository {
    val settings: Flow<AppSettings>
    suspend fun setTemperature(value: Float)
    suspend fun setContextSize(value: Int)
    suspend fun setAutoRead(value: Boolean)
    suspend fun setTtsSpeed(value: Float)
}

interface ModelRepository {
    val spec: ModelSpec
    val downloadState: StateFlow<DownloadState>
    fun modelFile(): File
    fun isModelReady(): Boolean
    fun freeBytes(): Long
    fun startDownload()
    fun pauseDownload()
    suspend fun deleteModel()
}

/** The catalog of downloadable models and which one is used for chat (persisted). */
interface ModelSelection {
    val catalog: List<ModelSpec>
    val selected: StateFlow<ModelSpec>
    fun repository(id: String): ModelRepository
    fun selectedRepository(): ModelRepository
    fun select(id: String)
}
