package com.drsai.assistant.domain.usecase

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReasoningParserTest {

    @Test
    fun plainTextPassesThroughWhenModelDoesNotReason() {
        val p = ReasoningParser.parse("مرحبا! كيف أقدر أساعدك؟", startsInReasoning = false, final = true)
        assertEquals("مرحبا! كيف أقدر أساعدك؟", p.answer)
        assertEquals("", p.reasoning)
        assertFalse(p.inReasoning)
    }

    @Test
    fun prefilledJaisReasoningIsSplitAtClosingTag() {
        val raw = "The user greets me in Arabic.\n</ifm|think_faster>\n\nهلا والله! وش أقدر أسوي لك؟"
        val p = ReasoningParser.parse(raw, startsInReasoning = true, final = true)
        assertEquals("The user greets me in Arabic.", p.reasoning)
        assertEquals("هلا والله! وش أقدر أسوي لك؟", p.answer)
        assertFalse(p.inReasoning)
    }

    @Test
    fun allJaisEffortTagsAreRecognised() {
        for (tag in listOf("ifm|think", "ifm|think_fast", "ifm|think_faster")) {
            val p = ReasoningParser.parse("r</$tag>a", startsInReasoning = true, final = true)
            assertEquals("r", p.reasoning)
            assertEquals("a", p.answer)
        }
    }

    @Test
    fun explicitThinkBlockIsStrippedFromAnswer() {
        val p = ReasoningParser.parse("<think>plan the reply</think>Hello there", startsInReasoning = false, final = true)
        assertEquals("plan the reply", p.reasoning)
        assertEquals("Hello there", p.answer)
    }

    @Test
    fun explicitJaisOpenTagInOutputIsHandled() {
        val p = ReasoningParser.parse("<ifm|think>\nhmm</ifm|think>نعم", startsInReasoning = false, final = true)
        assertEquals("hmm", p.reasoning)
        assertEquals("نعم", p.answer)
    }

    @Test
    fun whileStreamingInsideReasoningAnswerIsEmpty() {
        val p = ReasoningParser.parse("thinking about it", startsInReasoning = true)
        assertEquals("", p.answer)
        assertEquals("thinking about it", p.reasoning)
        assertTrue(p.inReasoning)
    }

    @Test
    fun partialClosingTagIsHeldBackWhileStreaming() {
        val p = ReasoningParser.parse("thinking</ifm|thi", startsInReasoning = true)
        assertEquals("thinking", p.reasoning)
        assertEquals("", p.answer)
        assertTrue(p.inReasoning)
    }

    @Test
    fun partialOpeningTagIsHeldBackInAnswer() {
        val p = ReasoningParser.parse("Hi <thi", startsInReasoning = false)
        assertEquals("Hi", p.answer)
    }

    @Test
    fun lessThanSignThatIsNotATagIsKept() {
        val p = ReasoningParser.parse("3 < 5 and 2 <", startsInReasoning = false, final = true)
        assertEquals("3 < 5 and 2 <", p.answer)
    }

    @Test
    fun streamingSequenceConvergesToFinalSplit() {
        val pieces = listOf("Let", " me", " think", ".</if", "m|think_faster>", "\n\n", "أهلًا", " بك")
        val sb = StringBuilder()
        var last: ParsedReply? = null
        for (piece in pieces) {
            sb.append(piece)
            val p = ReasoningParser.parse(sb.toString(), startsInReasoning = true)
            assertFalse("reasoning must never leak into the answer", p.answer.contains("think"))
            last = p
        }
        assertEquals("أهلًا بك", last!!.answer)
        assertEquals("Let me think.", last.reasoning)
    }

    @Test
    fun unclosedReasoningFallsBackToAnswerWhenFinal() {
        val p = ReasoningParser.parse("the model stopped mid-thought", startsInReasoning = true, final = true)
        assertEquals("the model stopped mid-thought", p.answer)
        assertEquals("", p.reasoning)
        assertFalse(p.inReasoning)
    }

    @Test
    fun emptyReasoningBlockGivesEmptyReasoning() {
        val p = ReasoningParser.parse("\n</ifm|think>Answer", startsInReasoning = true, final = true)
        assertEquals("", p.reasoning)
        assertEquals("Answer", p.answer)
    }

    @Test
    fun strayControlTokensAreRemoved() {
        val raw = "r</ifm|think_faster>Answer" + Jais3Formatter.IM_END
        assertEquals("Answer", ReasoningParser.parse(raw, startsInReasoning = true, final = true).answer)
    }

    @Test
    fun multipleReasoningBlocksAreAllHidden() {
        val p = ReasoningParser.parse("<think>a</think>One <think>b</think>Two", startsInReasoning = false, final = true)
        assertEquals("One Two", p.answer)
        assertTrue(p.reasoning.contains("a") && p.reasoning.contains("b"))
    }

    @Test
    fun partialTagSuffixLengths() {
        assertEquals(0, ReasoningParser.partialTagSuffix("abc"))
        assertEquals(1, ReasoningParser.partialTagSuffix("abc<"))
        assertEquals(6, ReasoningParser.partialTagSuffix("x</ifm|"))
        assertEquals(0, ReasoningParser.partialTagSuffix("x</ifm|think>"))
        assertEquals(0, ReasoningParser.partialTagSuffix("a <b"))
    }
}
