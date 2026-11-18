package com.drsai.assistant.domain.usecase

import com.drsai.assistant.domain.model.ChatRole
import com.drsai.assistant.domain.model.ChatTurn
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ContextWindowTest {

    /** One "token" per character keeps the arithmetic obvious. */
    private val count: (List<ChatTurn>) -> Int = { ts -> ts.sumOf { it.content.length } }

    private fun sys(s: String) = ChatTurn(ChatRole.SYSTEM, s)
    private fun user(s: String) = ChatTurn(ChatRole.USER, s)
    private fun bot(s: String) = ChatTurn(ChatRole.ASSISTANT, s)

    @Test
    fun emptyStaysEmpty() {
        assertTrue(ContextWindow.trim(emptyList(), 10, count).isEmpty())
    }

    @Test
    fun fittingHistoryIsUnchanged() {
        val turns = listOf(sys("s"), user("aa"), bot("bb"), user("cc"))
        assertEquals(turns, ContextWindow.trim(turns, 100, count))
    }

    @Test
    fun dropsOldestTurnsAndKeepsSystem() {
        val turns = listOf(sys("SS"), user("1111"), bot("2222"), user("3333"), bot("4444"), user("5555"))
        // budget fits system + last three turns (2 + 12 = 14)
        val out = ContextWindow.trim(turns, 14, count)
        assertEquals(listOf(sys("SS"), user("3333"), bot("4444"), user("5555")), out)
    }

    @Test
    fun neverStartsHistoryWithAssistantReply() {
        val turns = listOf(sys("S"), user("1111"), bot("2222"), user("3333"), bot("4444"), user("5555"))
        // budget 9 would allow [bot 4444, user 5555] but a dangling assistant reply is dropped too
        val out = ContextWindow.trim(turns, 9, count)
        assertEquals(listOf(sys("S"), user("5555")), out)
        assertEquals(ChatRole.USER, out[1].role)
    }

    @Test
    fun latestUserTurnAlwaysKeptEvenOverBudget() {
        val turns = listOf(sys("SYSTEM"), user("old"), bot("reply"), user("a very long final question"))
        val out = ContextWindow.trim(turns, 1, count)
        assertEquals(listOf(sys("SYSTEM"), user("a very long final question")), out)
    }

    @Test
    fun systemTurnsAreMovedToFront() {
        val turns = listOf(user("u1"), sys("s"), bot("b1"), user("u2"))
        val out = ContextWindow.trim(turns, 100, count)
        assertEquals(listOf(sys("s"), user("u1"), bot("b1"), user("u2")), out)
    }
}
