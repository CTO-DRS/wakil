package com.wakil.agent.code

import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import com.wakil.agent.github.BuildKind
import com.wakil.agent.github.Templates
import com.wakil.agent.ui.code.EditorLogic
import com.wakil.agent.ui.code.Highlighter
import com.wakil.agent.ui.code.Lang
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class EditorLogicTest {
    private fun type(before: String, caret: Int, ch: Char, lang: Lang = Lang.KOTLIN): TextFieldValue {
        val old = TextFieldValue(before, TextRange(caret))
        val new = TextFieldValue(before.substring(0, caret) + ch + before.substring(caret), TextRange(caret + 1))
        return EditorLogic.process(old, new, lang)
    }

    @Test fun autoIndentInsideBraces() {
        val r = type("fun a() {}", 9, '\n')
        assertEquals("fun a() {\n    \n}", r.text)
        assertEquals(14, r.selection.start)
    }

    @Test fun keepsIndent() {
        val r = type("    val x = 1", 13, '\n')
        assertEquals("    val x = 1\n    ", r.text)
    }

    @Test fun dartUsesTwoSpaces() {
        val r = type("void main() {}", 13, '\n', Lang.DART)
        assertEquals("void main() {\n  \n}", r.text)
    }

    @Test fun pairsBrackets() {
        val r = type("x", 1, '(')
        assertEquals("x()", r.text); assertEquals(2, r.selection.start)
        val r2 = EditorLogic.process(r, TextFieldValue("x())", TextRange(3)), Lang.KOTLIN)
        assertEquals("x()", r2.text); assertEquals(3, r2.selection.start)
    }

    @Test fun pythonColonIndents() {
        val r = type("if x:", 5, '\n', Lang.PYTHON)
        assertEquals("if x:\n    ", r.text)
    }

    @Test fun completionReplacesPrefix() {
        val v = TextFieldValue("val te", TextRange(6))
        assertEquals("te", EditorLogic.currentWord(v))
        val r = EditorLogic.applyCompletion(v, "te", "textView")
        assertEquals("val textView", r.text)
        val s = EditorLogic.suggest("fu", Lang.KOTLIN, setOf("function1"))
        assertTrue(s.any { it.label == "fun" })
    }

    @Test fun snippetCaret() {
        val r = EditorLogic.insert(TextFieldValue("  ", TextRange(2)), "if (\$0) {\n}")
        assertEquals("  if () {\n  }", r.text); assertEquals(6, r.selection.start)
    }

    @Test fun highlighterSpansAllLanguages() {
        val samples = mapOf(
            Lang.KOTLIN to "class A { fun b() = \"s\" // c\n}", Lang.JAVA to "public class A { int x = 5; }",
            Lang.DART to "void main() { print('hi'); }", Lang.JS to "const a = `x`; /* c */",
            Lang.HTML to "<div class=\"a\"><script>let x = 1;</script><style>.a{color:red}</style></div>",
            Lang.CSS to ".a { color: red; }", Lang.JSON to "{\"a\": 1}", Lang.YAML to "name: x # c\non:\n  push:",
            Lang.MARKDOWN to "# T\n```\ncode\n```", Lang.PYTHON to "def f(): return 'x' # c",
        )
        samples.forEach { (l, t) ->
            val a = Highlighter.highlight(t, l)
            assertEquals(t, a.text)
            assertTrue("no spans for $l", a.spanStyles.isNotEmpty())
            a.spanStyles.forEach { assertTrue(it.start in 0..t.length && it.end in it.start..t.length) }
        }
        // unterminated strings and comments must not crash
        listOf("\"abc", "/* x", "'", "<a href=\"", "<!-- x").forEach { Highlighter.highlight(it, Lang.HTML); Highlighter.highlight(it, Lang.JS) }
    }

    @Test fun templateNamesAndDetect() {
        val n = Templates.names("تطبيقي", "My-Cool App")
        assertEquals("com.wakil.mycoolapp", n.pkg); assertEquals("my_cool_app", n.dart); assertEquals("my-cool-app", n.npm)
        assertEquals("com.wakil.app1", Templates.names("", "1").pkg)
        assertEquals(BuildKind.FLUTTER, Templates.detect(setOf("pubspec.yaml", "lib"), null, null)!!.first)
        assertEquals(BuildKind.ANDROID, Templates.detect(setOf("settings.gradle.kts", "app"), null, null)!!.first)
        assertEquals("out", Templates.detect(setOf("package.json", "next.config.mjs"), "{}", "output: 'export'")!!.second)
        assertEquals(".", Templates.detect(setOf("index.html", "style.css"), null, null)!!.second)
        assertEquals("dist", Templates.detect(setOf("package.json", "vite.config.ts"), "{}", null)!!.second)
        assertEquals(null, Templates.detect(setOf("README.md"), null, null))
    }

    @Test fun templatePathsAndRendering() {
        val n = Templates.names("تطبيقي", "my-app")
        assertEquals("app/src/main/java/com/wakil/myapp/MainActivity.kt", Templates.repoPath("app/src/main/java/PKGPATH/MainActivity.kt", n))
        assertEquals(".wakil/debug.keystore.b64", Templates.repoPath("dot-wakil/debug.keystore.b64", n))
        assertEquals(".gitignore", Templates.repoPath("gitignore", n))
        assertEquals("www/app.js", Templates.repoPath("www/app.js", n))
        // every placeholder in every asset gets replaced, and GitHub expressions survive
        val root = java.io.File("src/main/assets/gh-templates")
        root.walkTopDown().filter { it.isFile }.forEach { f ->
            val out = Templates.render(f.readText(), n, "www")
            assertTrue("placeholder left in $f", !out.contains("@@"))
            if (f.name.endsWith(".yml")) assertTrue(out.contains("\${{ github.ref }}"))
        }
        root.walkTopDown().forEach { assertTrue("aapt would drop $it", !it.name.startsWith("_") && !it.name.startsWith(".")) }
    }
}
