package com.wakil.agent.llm

/** Chat formats handled in Kotlin for models newer than the bundled llama.cpp templates. */
object PromptFormats {
    const val NO_THINK = "<think>\n\n</think>\n\n"
    private val STOPS = listOf("<turn|>", "<|turn>", "<|im_end|>", "<end_of_turn>")

    /** Gemma 4: <|turn>system/user/model ... <turn|> (BOS is added by the tokenizer). */
    fun gemma4(messages: List<Msg>): String = buildString {
        for (m in messages) {
            val role = when (m.role) { "assistant" -> "model"; "system" -> "system"; else -> "user" }
            append("<|turn>").append(role).append('\n').append(m.content.trim()).append("<turn|>\n")
        }
        append("<|turn>model\n")
    }

    fun needsNoThink(modelName: String, thinking: Boolean): Boolean {
        if (thinking) return false
        val n = modelName.lowercase()
        if (n.contains("deepseek") || n.contains("2507") || n.contains("coder")) return false
        return n.contains("qwen3")
    }

    /** True once the text ends with an end-of-turn marker that the tokenizer printed as text. */
    fun hitStop(sb: CharSequence): Boolean {
        val tail = sb.takeLast(16).toString()
        return STOPS.any { tail.contains(it) }
    }

    fun clean(text: String): String {
        var t = text
        for (s in STOPS) t = t.replace(s, "")
        return t.replace(Regex("(?s)<\\|channel>.*?<channel\\|>"), "")
    }
}
