package com.wakil.agent.agent

/**
 * Turns the model's partial (still streaming) reply into something presentable.
 * The agent protocol makes every reply a JSON object, so showing the raw stream would show
 * `{"tool": "run_shell", "args": {...` or `{"final": "...`. Pure function; unit-tested.
 */
sealed class StreamView {
    /** Nothing worth showing yet (empty, `{`, open <think> block). */
    data object Pending : StreamView()
    /** Human-readable answer text (from a `final` value, or plain prose if the model ignored the format). */
    data class Answer(val text: String) : StreamView()
    /** The model is writing a tool call. [tool] may be empty until the name is complete. */
    data class Tool(val tool: String, val argsPreview: String) : StreamView()

    companion object {
        private val TOOL_KEY = Regex("\"(?:tool|name|function)\"\\s*:\\s*\"([^\"]*)(\")?")
        private val FINAL_KEY = Regex("\"final\"\\s*:\\s*\"")
        private val ARGS_KEY = Regex("\"(?:args|arguments|parameters)\"\\s*:\\s*")

        fun of(raw: String): StreamView {
            var s = raw.replace(Regex("(?s)<think>.*?</think>"), "")
            if (s.contains("<think>")) return Pending                // still thinking
            s = s.replace(Regex("(?s)^.*?</think>"), "")            // template opened <think> for us
            s = s.trimStart().removePrefix("```json").removePrefix("```").trimStart()
            if (s.isEmpty()) return Pending
            if (!s.startsWith("{")) return Answer(s.trimEnd().removeSuffix("```").trimEnd())

            FINAL_KEY.find(s)?.let { m ->
                val text = unescapePartial(s.substring(m.range.last + 1))
                return if (text.isBlank()) Pending else Answer(text)
            }
            TOOL_KEY.find(s)?.let { m ->
                val name = if (m.groupValues[2].isNotEmpty()) m.groupValues[1] else ""
                val args = ARGS_KEY.find(s)?.let { a -> s.substring(a.range.last + 1) } ?: ""
                return Tool(name, args.replace(Regex("\\s+"), " ").trim().removeSuffix("}").trim().take(140))
            }
            return Pending
        }

        /** Reads a JSON string body that may be cut off mid-stream; stops at the closing quote. */
        fun unescapePartial(body: String): String {
            val sb = StringBuilder()
            var i = 0
            while (i < body.length) {
                val c = body[i]
                if (c == '"') break
                if (c == '\\') {
                    if (i + 1 >= body.length) break
                    when (val n = body[i + 1]) {
                        'n' -> sb.append('\n')
                        't' -> sb.append('\t')
                        'r' -> {}
                        '"' -> sb.append('"')
                        '\\' -> sb.append('\\')
                        '/' -> sb.append('/')
                        'u' -> {
                            if (i + 6 > body.length) break
                            body.substring(i + 2, i + 6).toIntOrNull(16)?.let { sb.append(it.toChar()) }
                            i += 4
                        }
                        else -> sb.append(n)
                    }
                    i += 2; continue
                }
                sb.append(c); i++
            }
            return sb.toString()
        }
    }
}
