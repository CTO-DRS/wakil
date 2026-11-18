package com.drsai.assistant.domain.usecase

import com.drsai.assistant.domain.model.ChatRole
import com.drsai.assistant.domain.model.ChatTurn

object Persona {
    const val NAME = "DRS"

    /** Short Arabic system prompt: warm, Saudi-friendly, private, honest. */
    const val SYSTEM_PROMPT_AR =
        "أنت DRS، مساعد ذكي ودود يعمل بالكامل على جوال المستخدم بدون إنترنت ويحافظ على خصوصيته. " +
            "تكلّم بالعربية بأسلوب سعودي لطيف وقريب، وكن واضحًا ومختصرًا ومفيدًا. " +
            "إذا كتب المستخدم بالإنجليزية فرد عليه بالإنجليزية. " +
            "إذا ما كنت متأكد من الإجابة فقلها بصراحة ولا تخترع معلومات."
}

/** Fallback ChatML formatter used when the GGUF carries no usable chat template. */
object ChatMlFormatter {
    fun format(turns: List<ChatTurn>, addAssistantPrefix: Boolean = true): String = buildString {
        for (t in turns) {
            append("<|im_start|>").append(t.role.wire).append('\n')
            append(t.content).append("<|im_end|>\n")
        }
        if (addAssistantPrefix) append("<|im_start|>assistant\n")
    }
}

/**
 * Keeps the system prompt plus as many of the most recent turns as fit in [budgetTokens].
 * The latest user turn is always kept.
 */
object ContextWindow {
    fun trim(turns: List<ChatTurn>, budgetTokens: Int, countTokens: (List<ChatTurn>) -> Int): List<ChatTurn> {
        if (turns.isEmpty()) return turns
        val system = turns.filter { it.role == ChatRole.SYSTEM }
        val rest = turns.filter { it.role != ChatRole.SYSTEM }.toMutableList()
        var candidate = system + rest
        while (rest.size > 1 && countTokens(candidate) > budgetTokens) {
            rest.removeAt(0)
            // never start the history with a dangling assistant reply
            while (rest.size > 1 && rest.first().role == ChatRole.ASSISTANT) rest.removeAt(0)
            candidate = system + rest
        }
        return candidate
    }
}

object TitleMaker {
    fun fromFirstMessage(text: String, maxChars: Int = 40): String {
        val oneLine = text.trim().replace(Regex("\\s+"), " ")
        return if (oneLine.length <= maxChars) oneLine else oneLine.take(maxChars).trimEnd() + "…"
    }
}
