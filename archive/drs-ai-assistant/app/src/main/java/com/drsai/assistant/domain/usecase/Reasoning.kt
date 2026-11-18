package com.drsai.assistant.domain.usecase

import com.drsai.assistant.domain.model.ChatRole
import com.drsai.assistant.domain.model.ChatTurn

/**
 * Prompt formatter for Jais-3 (K2 Horizon), mirroring the GGUF's Jinja chat template
 * for plain chat (no tools):
 *
 *   <|begin_of_text|><|ifm|im_start|>system\n…<|ifm|im_end|>
 *   <|ifm|im_start|>user\n…<|ifm|im_end|>
 *   <|ifm|im_start|>assistant\n<ifm|think>\n</ifm|think>…<|ifm|im_end|>   (past replies)
 *   <|ifm|im_start|>assistant\n<ifm|think_faster>\n                       (generation prompt)
 *
 * The template has no switch to turn reasoning off; it only offers reasoning_effort
 * high / medium / low. We use LOW (think_faster) to keep phone latency down, and the
 * reasoning is stripped from the visible reply by [ReasoningParser].
 */
object Jais3Formatter {
    const val BOS = "<|begin_of_text|>"
    const val IM_START = "<|ifm|im_start|>"
    const val IM_END = "<|ifm|im_end|>"

    enum class Effort(val tag: String) {
        HIGH("ifm|think"), MEDIUM("ifm|think_fast"), LOW("ifm|think_faster")
    }

    fun format(
        turns: List<ChatTurn>,
        effort: Effort = Effort.LOW,
        addGenerationPrompt: Boolean = true,
    ): String = buildString {
        append(BOS)
        for (t in turns) {
            when (t.role) {
                ChatRole.SYSTEM, ChatRole.USER ->
                    append(IM_START).append(t.role.wire).append('\n').append(t.content).append(IM_END)
                ChatRole.ASSISTANT ->
                    // History keeps answers only, so past turns carry an empty thinking block,
                    // exactly as the template renders reasoning_content = "".
                    append(IM_START).append("assistant\n<ifm|think>\n</ifm|think>")
                        .append(t.content).append(IM_END)
            }
        }
        if (addGenerationPrompt) append(IM_START).append("assistant\n<").append(effort.tag).append(">\n")
    }
}

/** A model reply split into hidden reasoning and the visible answer. */
data class ParsedReply(
    val reasoning: String,
    val answer: String,
    /** True while the text ends inside an unclosed reasoning block. */
    val inReasoning: Boolean,
)

/**
 * Separates reasoning blocks from the answer. Understands Jais-3 tags
 * (`<ifm|think>`, `<ifm|think_fast>`, `<ifm|think_faster>` and their closers) and the common
 * `<think>…</think>` form. Works on partial (streaming) text: a trailing fragment that could be
 * the start of a tag is held back until the next call.
 */
object ReasoningParser {
    private val OPEN = Regex("<(?:ifm\\|think(?:_fast|_faster)?|think)>")
    private val CLOSE = Regex("</(?:ifm\\|think(?:_fast|_faster)?|think)>")
    private val TAGS = listOf("think", "ifm|think", "ifm|think_fast", "ifm|think_faster")
        .flatMap { listOf("<$it>", "</$it>") }
    private val STRAY = listOf(Jais3Formatter.IM_START, Jais3Formatter.IM_END, Jais3Formatter.BOS)

    /**
     * @param startsInReasoning the prompt already opened a reasoning block (Jais-3 prefill).
     * @param final the generation has ended; nothing is held back and an unclosed block
     *              with no answer falls back to being shown as the answer.
     */
    fun parse(raw: String, startsInReasoning: Boolean, final: Boolean = false): ParsedReply {
        var text = raw
        for (s in STRAY) text = text.replace(s, "")
        val reasoning = StringBuilder()
        val answer = StringBuilder()
        var inReasoning = startsInReasoning
        var pos = 0
        while (pos <= text.length) {
            val m = (if (inReasoning) CLOSE else OPEN).find(text, pos)
            if (m != null) {
                (if (inReasoning) reasoning else answer).append(text, pos, m.range.first)
                pos = m.range.last + 1
                if (inReasoning) reasoning.append('\n')
                inReasoning = !inReasoning
            } else {
                var rest = text.substring(pos)
                if (!final) rest = rest.dropLast(partialTagSuffix(rest))
                (if (inReasoning) reasoning else answer).append(rest)
                break
            }
        }
        var r = reasoning.toString().trim()
        var a = answer.toString().trim()
        if (final && a.isEmpty() && inReasoning) {
            // The model never closed its reasoning (stopped early or the tag was not emitted):
            // show what it wrote rather than an empty bubble.
            a = r
            r = ""
        }
        return ParsedReply(reasoning = r, answer = a, inReasoning = inReasoning && !final)
    }

    /** Length of a trailing fragment that is a proper prefix of a reasoning tag. */
    internal fun partialTagSuffix(s: String): Int {
        val lt = s.lastIndexOf('<')
        if (lt < 0) return 0
        val tail = s.substring(lt)
        return if (TAGS.any { it.length > tail.length && it.startsWith(tail) }) tail.length else 0
    }
}
