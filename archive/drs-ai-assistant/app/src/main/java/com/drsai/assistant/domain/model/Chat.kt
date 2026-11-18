package com.drsai.assistant.domain.model

enum class ChatRole(val wire: String) {
    SYSTEM("system"), USER("user"), ASSISTANT("assistant");

    companion object {
        fun fromWire(value: String): ChatRole = entries.firstOrNull { it.wire == value } ?: USER
    }
}

/** One turn handed to the language model. */
data class ChatTurn(val role: ChatRole, val content: String)

data class Conversation(
    val id: Long,
    val title: String,
    val createdAt: Long,
    val updatedAt: Long,
)

data class Message(
    val id: Long,
    val conversationId: Long,
    val role: ChatRole,
    val content: String,
    val createdAt: Long,
)
