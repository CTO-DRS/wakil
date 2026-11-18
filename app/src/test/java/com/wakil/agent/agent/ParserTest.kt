package com.wakil.agent.agent

import com.wakil.agent.env.LinuxEnv
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ParserTest {
    @Test fun toolCall() {
        val p = AgentController.parse("""{"tool": "run_shell", "args": {"cmd": "uname -a"}}""")
        assertTrue(p is Parsed.Call)
        p as Parsed.Call
        assertEquals("run_shell", p.tool)
        assertEquals("uname -a", p.args.getString("cmd"))
    }

    @Test fun finalAnswerArabic() {
        val p = AgentController.parse("""{"final": "تم تثبيت بايثون 3.12"}""")
        assertEquals(Parsed.Final("تم تثبيت بايثون 3.12"), p)
    }

    @Test fun textAroundAndCodeFence() {
        val p = AgentController.parse("Sure!\n```json\n{\"tool\":\"open_app\",\"args\":{\"name\":\"Settings\"}}\n```")
        assertTrue(p is Parsed.Call && p.tool == "open_app")
    }

    @Test fun qwenNativeToolCallFormat() {
        val p = AgentController.parse("<tool_call>\n{\"name\": \"read_screen\", \"arguments\": {}}\n</tool_call>")
        assertTrue(p is Parsed.Call && p.tool == "read_screen")
    }

    @Test fun rawNewlineInsideString() {
        val p = AgentController.parse("{\"tool\": \"write_file\", \"args\": {\"path\": \"a.py\", \"content\": \"print(1)\nprint(2)\"}}")
        p as Parsed.Call
        assertEquals("print(1)\nprint(2)", p.args.getString("content"))
    }

    @Test fun nestedBracesInString() {
        val p = AgentController.parse("""{"tool":"run_shell","args":{"cmd":"echo '{x}' }"}}""")
        p as Parsed.Call
        assertEquals("echo '{x}' }", p.args.getString("cmd"))
    }

    @Test fun plainTextIsFinal() {
        assertEquals(Parsed.Final("مرحباً! كيف أساعدك؟"), AgentController.parse("مرحباً! كيف أساعدك؟"))
    }

    @Test fun thinkStripped() {
        val s = AgentController.stripThink("<think>hmm {\"tool\":\"x\"}</think>\n{\"final\":\"ok\"}")
        assertEquals(Parsed.Final("ok"), AgentController.parse(s))
    }

    @Test fun truncate() {
        val t = LinuxEnv.truncate("a".repeat(10000), 1000)
        assertTrue(t.length < 1100 && t.contains("truncated"))
    }
}
