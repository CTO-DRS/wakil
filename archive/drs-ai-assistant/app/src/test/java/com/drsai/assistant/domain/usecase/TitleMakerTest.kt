package com.drsai.assistant.domain.usecase

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TitleMakerTest {

    @Test
    fun shortTextIsKeptTrimmed() {
        assertEquals("كيف حالك؟", TitleMaker.fromFirstMessage("  كيف حالك؟  "))
    }

    @Test
    fun whitespaceAndNewlinesCollapseToSingleSpaces() {
        assertEquals("hello world again", TitleMaker.fromFirstMessage("hello\n\n world\tagain"))
    }

    @Test
    fun longTextIsCutWithEllipsis() {
        val text = "ا".repeat(60)
        val title = TitleMaker.fromFirstMessage(text)
        assertEquals("ا".repeat(40) + "…", title)
    }

    @Test
    fun exactlyMaxCharsHasNoEllipsis() {
        val text = "b".repeat(40)
        assertEquals(text, TitleMaker.fromFirstMessage(text))
    }

    @Test
    fun trailingSpaceBeforeEllipsisIsRemoved() {
        val title = TitleMaker.fromFirstMessage("abcd efgh ijkl", maxChars = 5)
        assertEquals("abcd…", title)
        assertTrue(title.length <= 6)
    }

    @Test
    fun blankInputGivesEmptyTitle() {
        assertEquals("", TitleMaker.fromFirstMessage("   \n "))
    }
}
