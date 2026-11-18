package com.drsai.assistant.domain.usecase

import com.drsai.assistant.domain.model.ChatRole
import com.drsai.assistant.domain.model.ChatTurn
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatMlFormatterTest {

    private val start = "<" + "|im_start|>"
    private val end = "<" + "|im_end|>"

    @Test
    fun formatsTurnsWithAssistantPrefix() {
        val turns = listOf(
            ChatTurn(ChatRole.SYSTEM, "sys"),
            ChatTurn(ChatRole.USER, "مرحبا"),
        )
        val expected =
            "${start}system\nsys$end\n" +
                "${start}user\nمرحبا$end\n" +
                "${start}assistant\n"
        assertEquals(expected, ChatMlFormatter.format(turns))
    }

    @Test
    fun omitsAssistantPrefixWhenAsked() {
        val turns = listOf(ChatTurn(ChatRole.USER, "hi"), ChatTurn(ChatRole.ASSISTANT, "hello"))
        val out = ChatMlFormatter.format(turns, addAssistantPrefix = false)
        assertEquals("${start}user\nhi$end\n${start}assistant\nhello$end\n", out)
    }

    @Test
    fun emptyTurnsGiveOnlyPrefix() {
        assertEquals("${start}assistant\n", ChatMlFormatter.format(emptyList()))
        assertEquals("", ChatMlFormatter.format(emptyList(), addAssistantPrefix = false))
    }

    @Test
    fun usesWireRoleNames() {
        val out = ChatMlFormatter.format(ChatRole.entries.map { ChatTurn(it, "x") }, false)
        for (r in ChatRole.entries) assertTrue(out.contains("$start${r.wire}\n"))
    }
}
