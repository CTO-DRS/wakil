package com.wakil.agent.llm

/**
 * Hybrid mode: decides when a task is too hard for the small on-phone model and should go to the
 * cloud model (OpenAI-compatible key in Settings). Everything else stays local and private.
 */
object Router {
    private val hardWords = listOf(
        "ابن", "ابني", "برمج", "برمجة", "كود", "تطبيق", "مشروع", "سكربت", "سكريبت", "موقع", "صفح",
        "حلل", "تحليل", "ترجم", "لخص", "خطة", "صمم", "اصلح", "أصلح", "خطأ في", "github", "جيت",
        "code", "app", "build", "script", "debug", "refactor", "python", "kotlin", "java", "html"
    )

    fun isHard(text: String, fullAccess: Boolean = false): Boolean {
        if (fullAccess) return true
        if (text.length > 350) return true
        val t = text.lowercase()
        return hardWords.any { t.contains(it) }
    }
}
