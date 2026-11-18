package com.drsai.assistant.data.repository

import com.drsai.assistant.data.db.ChatDao
import com.drsai.assistant.data.db.ConversationEntity
import com.drsai.assistant.data.db.MessageEntity
import com.drsai.assistant.domain.model.ChatRole
import com.drsai.assistant.domain.model.Conversation
import com.drsai.assistant.domain.model.Message
import com.drsai.assistant.domain.repository.ChatRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class RoomChatRepository(private val dao: ChatDao) : ChatRepository {
    override fun conversations(): Flow<List<Conversation>> =
        dao.conversations().map { list -> list.map { it.toDomain() } }

    override fun messages(conversationId: Long): Flow<List<Message>> =
        dao.messages(conversationId).map { list -> list.map { it.toDomain() } }

    override suspend fun messagesOnce(conversationId: Long): List<Message> =
        dao.messagesOnce(conversationId).map { it.toDomain() }

    override suspend fun createConversation(title: String): Long {
        val now = System.currentTimeMillis()
        return dao.insertConversation(ConversationEntity(title = title, createdAt = now, updatedAt = now))
    }

    override suspend fun addMessage(conversationId: Long, role: ChatRole, content: String): Long {
        val now = System.currentTimeMillis()
        val id = dao.insertMessage(
            MessageEntity(conversationId = conversationId, role = role.wire, content = content, createdAt = now),
        )
        dao.touchConversation(conversationId, now)
        return id
    }

    override suspend fun updateMessage(messageId: Long, content: String) = dao.updateMessage(messageId, content)

    override suspend fun deleteConversation(conversationId: Long) = dao.deleteConversation(conversationId)
}

private fun ConversationEntity.toDomain() = Conversation(id, title, createdAt, updatedAt)
private fun MessageEntity.toDomain() = Message(id, conversationId, ChatRole.fromWire(role), content, createdAt)
