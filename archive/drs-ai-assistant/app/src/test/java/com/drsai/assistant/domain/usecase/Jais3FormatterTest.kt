package com.drsai.assistant.domain.usecase

import com.drsai.assistant.domain.model.ChatRole
import com.drsai.assistant.domain.model.ChatTurn
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class Jais3FormatterTest {
    private val s = Jais3Formatter.IM_START
    private val e = Jais3Formatter.IM_END

    @Test
    fun formatsConversationLikeTheGgufTemplate() {
        val turns = listOf(
            ChatTurn(ChatRole.SYSTEM, "sys"),
            ChatTurn(ChatRole.USER, "مرحبا"),
            ChatTurn(ChatRole.ASSISTANT, "هلا"),
            ChatTurn(ChatRole.USER, "شلونك؟"),
        )
        val expected = Jais3Formatter.BOS +
            "${s}system\nsys$e" +
            "${s}user\nمرحبا$e" +
            "${s}assistant\n<ifm|think>\n</ifm|think>هلا$e" +
            "${s}user\nشلونك؟$e" +
            "${s}assistant\n<ifm|think_faster>\n"
        assertEquals(expected, Jais3Formatter.format(turns))
    }

    @Test
    fun effortSelectsThinkTag() {
        val t = listOf(ChatTurn(ChatRole.USER, "x"))
        assertTrue(Jais3Formatter.format(t, Jais3Formatter.Effort.HIGH).endsWith("assistant\n<ifm|think>\n"))
        assertTrue(Jais3Formatter.format(t, Jais3Formatter.Effort.MEDIUM).endsWith("assistant\n<ifm|think_fast>\n"))
    }

    @Test
    fun noGenerationPromptWhenAsked() {
        val out = Jais3Formatter.format(listOf(ChatTurn(ChatRole.USER, "x")), addGenerationPrompt = false)
        assertEquals(Jais3Formatter.BOS + "${s}user\nx$e", out)
    }
}
