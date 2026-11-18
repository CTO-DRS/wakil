package com.wakil.agent.ui.code

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight

enum class Lang(val label: String) {
    KOTLIN("Kotlin"), JAVA("Java"), DART("Dart"), JS("JavaScript"), TS("TypeScript"), HTML("HTML"), XML("XML"),
    CSS("CSS"), JSON("JSON"), YAML("YAML"), GRADLE("Gradle"), PYTHON("Python"), SHELL("Shell"), MARKDOWN("Markdown"),
    C("C/C++"), GO("Go"), RUST("Rust"), SWIFT("Swift"), PLAIN("نص");

    companion object {
        fun of(name: String): Lang = when (name.substringAfterLast('.', "").lowercase()) {
            "kt", "kts" -> if (name.endsWith(".gradle.kts")) GRADLE else KOTLIN
            "java" -> JAVA
            "dart" -> DART
            "js", "mjs", "cjs", "jsx" -> JS
            "ts", "tsx" -> TS
            "html", "htm", "vue", "svelte" -> HTML
            "xml", "svg" -> XML
            "css", "scss", "less" -> CSS
            "json", "arb" -> JSON
            "yml", "yaml" -> YAML
            "gradle" -> GRADLE
            "py" -> PYTHON
            "sh", "bash", "zsh" -> SHELL
            "md", "markdown" -> MARKDOWN
            "c", "h", "cpp", "cc", "hpp" -> C
            "go" -> GO
            "rs" -> RUST
            "swift" -> SWIFT
            else -> if (name == "Dockerfile" || name == "Makefile") SHELL else PLAIN
        }
    }
}

/** Jarvis-flavoured code palette. */
object CodeColors {
    val Text = Color(0xFFD7E3F4)
    val Keyword = Color(0xFFC792EA)
    val Type = Color(0xFF7FDBFF)
    val Str = Color(0xFFA5E887)
    val Num = Color(0xFFFFB86C)
    val Comment = Color(0xFF5C6F8E)
    val Annotation = Color(0xFFFFE14D)
    val Tag = Color(0xFFFF6B9A)
    val Attr = Color(0xFFFFB86C)
    val Func = Color(0xFF82AAFF)
    val Prop = Color(0xFF7FDBFF)
    val Punct = Color(0xFF8A9BB5)
    val LineNo = Color(0xFF3D4B63)
}

object Keywords {
    private val js = "async await break case catch class const continue debugger default delete do else export extends false finally for from function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while with yield".split(' ')
    private val ts = js + "interface type enum implements private public protected readonly abstract declare namespace keyof as is any unknown never number string boolean".split(' ')
    val map: Map<Lang, List<String>> = mapOf(
        Lang.KOTLIN to "as break class continue do else false for fun if in interface is null object package return super this throw true try typealias typeof val var when while by catch constructor delegate dynamic field file finally get import init param property receiver set setparam where actual abstract annotation companion const crossinline data enum expect external final infix inline inner internal lateinit noinline open operator out override private protected public reified sealed suspend tailrec vararg it".split(' '),
        Lang.JAVA to "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null var record yield".split(' '),
        Lang.DART to "abstract as assert async await break case catch class const continue covariant default deferred do dynamic else enum export extends extension external factory false final finally for Function get hide if implements import in interface is late library mixin new null on operator part required rethrow return sealed set show static super switch sync this throw true try typedef var void when while with yield base".split(' '),
        Lang.JS to js, Lang.TS to ts,
        Lang.PYTHON to "False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield self print".split(' '),
        Lang.SHELL to "if then else elif fi for while do done case esac in function return export local echo exit set unset cd source".split(' '),
        Lang.GRADLE to "plugins id version apply android dependencies implementation api testImplementation compileOnly namespace compileSdk minSdk targetSdk defaultConfig buildTypes release debug repositories google mavenCentral true false def task".split(' '),
        Lang.C to "auto break case char const continue default do double else enum extern float for goto if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while class namespace template typename public private protected virtual override new delete nullptr true false bool include define".split(' '),
        Lang.GO to "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var nil true false".split(' '),
        Lang.RUST to "as async await break const continue crate else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while".split(' '),
        Lang.SWIFT to "class deinit enum extension func import init let protocol struct subscript typealias var break case continue default defer do else fallthrough for guard if in repeat return switch where while as catch false is nil self super throw throws true try".split(' '),
        Lang.CSS to "display flex grid position absolute relative fixed color background margin padding border width height font-size font-weight align-items justify-content gap transition transform opacity none auto important media".split(' '),
        Lang.YAML to "true false null on name runs-on steps uses with run jobs env".split(' '),
        Lang.HTML to "div span p a img button input form section header footer main nav ul li h1 h2 h3 script style link meta head body html class id href src".split(' '),
    )

    /** Snippets offered by autocomplete: label to text ($0 marks the caret). */
    val snippets: Map<Lang, List<Pair<String, String>>> = mapOf(
        Lang.KOTLIN to listOf("fun" to "fun name() {\n    $0\n}", "if" to "if ($0) {\n}", "for" to "for (i in 0 until n) {\n    $0\n}", "when" to "when ($0) {\n    else -> {}\n}"),
        Lang.JAVA to listOf("main" to "public static void main(String[] args) {\n    $0\n}", "for" to "for (int i = 0; i < n; i++) {\n    $0\n}", "sout" to "System.out.println($0);", "if" to "if ($0) {\n}"),
        Lang.DART to listOf("stless" to "class $0 extends StatelessWidget {\n  const MyWidget({super.key});\n\n  @override\n  Widget build(BuildContext context) {\n    return const Placeholder();\n  }\n}", "for" to "for (var i = 0; i < n; i++) {\n  $0\n}", "print" to "print($0);"),
        Lang.JS to listOf("fn" to "function name($0) {\n}", "arrow" to "const name = ($0) => {\n};", "log" to "console.log($0);", "qs" to "document.querySelector('$0')"),
        Lang.TS to listOf("log" to "console.log($0);", "interface" to "interface Name {\n  $0\n}"),
        Lang.HTML to listOf("html5" to "<!DOCTYPE html>\n<html lang=\"ar\" dir=\"rtl\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n  <title>$0</title>\n</head>\n<body>\n</body>\n</html>", "div" to "<div>$0</div>", "button" to "<button>$0</button>"),
        Lang.CSS to listOf("flexc" to "display: flex;\nalign-items: center;\njustify-content: center;$0", "media" to "@media (max-width: 600px) {\n  $0\n}"),
        Lang.PYTHON to listOf("def" to "def name($0):\n    pass", "main" to "if __name__ == \"__main__\":\n    $0"),
    )
}

/** Fast single-pass tokenizer good enough for live highlighting. */
object Highlighter {
    private const val MAX = 60_000

    fun highlight(text: String, lang: Lang): AnnotatedString {
        if (lang == Lang.PLAIN || text.length > MAX) return AnnotatedString(text)
        val b = AnnotatedString.Builder(text)
        val kw = Keywords.map[lang].orEmpty().toHashSet()
        fun span(s: Int, e: Int, c: Color, bold: Boolean = false, italic: Boolean = false) =
            b.addStyle(SpanStyle(color = c, fontWeight = if (bold) FontWeight.SemiBold else null, fontStyle = if (italic) FontStyle.Italic else null), s, e)

        when (lang) {
            Lang.HTML, Lang.XML -> markup(text, ::span)
            Lang.MARKDOWN -> markdown(text, ::span)
            else -> code(text, lang, kw, ::span)
        }
        return b.toAnnotatedString()
    }

    private fun lineComment(lang: Lang) = when (lang) {
        Lang.PYTHON, Lang.SHELL, Lang.YAML -> "#"
        Lang.CSS, Lang.JSON -> null
        else -> "//"
    }

    private fun code(t: String, lang: Lang, kw: Set<String>, span: (Int, Int, Color, Boolean, Boolean) -> Unit) {
        val lc = lineComment(lang)
        val blockComments = lang !in setOf(Lang.PYTHON, Lang.SHELL, Lang.YAML, Lang.JSON)
        var i = 0; val n = t.length
        var lineStart = true
        while (i < n) {
            val c = t[i]
            // comments
            if (lc != null && t.startsWith(lc, i)) {
                val e = t.indexOf('\n', i).let { if (it < 0) n else it }
                span(i, e, CodeColors.Comment, false, true); i = e; continue
            }
            if (blockComments && t.startsWith("/*", i)) {
                val e = t.indexOf("*/", i + 2).let { if (it < 0) n else it + 2 }
                span(i, e, CodeColors.Comment, false, true); i = e; continue
            }
            // strings
            if (c == '"' || c == '\'' || c == '`') {
                val triple = t.startsWith("\"\"\"", i) || t.startsWith("'''", i)
                var j = i + if (triple) 3 else 1
                while (j < n) {
                    if (t[j] == '\\') { j += 2; continue }
                    if (triple) { if (t.startsWith(t.substring(i, i + 3), j)) { j += 3; break } }
                    else if (t[j] == c) { j++; break } else if (t[j] == '\n' && c != '`') break
                    j++
                }
                val e = j.coerceAtMost(n)
                // JSON / YAML keys
                val isKey = (lang == Lang.JSON) && t.indexOf(':', e).let { k -> k >= 0 && t.substring(e, k).isBlank() }
                span(i, e, if (isKey) CodeColors.Prop else CodeColors.Str, false, false); i = e; continue
            }
            // numbers
            if (c.isDigit() && (i == 0 || !t[i - 1].isLetterOrDigit() && t[i - 1] != '_')) {
                var j = i + 1
                while (j < n && (t[j].isLetterOrDigit() || t[j] == '.' || t[j] == '_')) j++
                if (lang != Lang.CSS || true) span(i, j, CodeColors.Num, false, false); i = j; continue
            }
            // annotations / decorators
            if (c == '@' && i + 1 < n && t[i + 1].isLetter() && lang != Lang.CSS) {
                var j = i + 1; while (j < n && (t[j].isLetterOrDigit() || t[j] == '_' || t[j] == '.')) j++
                span(i, j, CodeColors.Annotation, false, false); i = j; continue
            }
            // css selectors / at-rules / properties
            if (lang == Lang.CSS) {
                if (c == '#' || c == '.') {
                    var j = i + 1; while (j < n && (t[j].isLetterOrDigit() || t[j] == '-' || t[j] == '_')) j++
                    if (j > i + 1 && !t[i + 1].isDigit()) { span(i, j, CodeColors.Tag, false, false); i = j; continue }
                }
                if (c.isLetter() || c == '-') {
                    var j = i; while (j < n && (t[j].isLetterOrDigit() || t[j] == '-')) j++
                    var k = j; while (k < n && (t[k] == ' ' || t[k] == '\t')) k++
                    val prop = k < n && t[k] == ':' && t.lastIndexOf('{', i) > t.lastIndexOf('}', i)
                    span(i, j, if (prop) CodeColors.Prop else if (t.lastIndexOf('{', i) > t.lastIndexOf('}', i)) CodeColors.Text else CodeColors.Tag, false, false)
                    i = j; continue
                }
            }
            // YAML keys
            if (lang == Lang.YAML && lineStart && (c.isLetter() || c == '-' || c == '_')) {
                var j = i; while (j < n && t[j] != ':' && t[j] != '\n' && t[j] != '#') j++
                if (j < n && t[j] == ':') { span(i, j, CodeColors.Prop, false, false); i = j; lineStart = false; continue }
            }
            // identifiers
            if (c.isLetter() || c == '_' || c == '$') {
                var j = i + 1; while (j < n && (t[j].isLetterOrDigit() || t[j] == '_' || t[j] == '$')) j++
                val w = t.substring(i, j)
                var k = j; while (k < n && t[k] == ' ') k++
                when {
                    w in kw -> span(i, j, CodeColors.Keyword, true, false)
                    k < n && t[k] == '(' -> span(i, j, CodeColors.Func, false, false)
                    w[0].isUpperCase() -> span(i, j, CodeColors.Type, false, false)
                }
                i = j; lineStart = false; continue
            }
            if (c == '\n') lineStart = true
            else if (c != ' ' && c != '\t') {
                lineStart = false
                if ("{}()[];,.:=<>+-*/!&|?".indexOf(c) >= 0) span(i, i + 1, CodeColors.Punct, false, false)
            }
            i++
        }
    }

    private fun markup(t: String, span: (Int, Int, Color, Boolean, Boolean) -> Unit) {
        var i = 0; val n = t.length
        while (i < n) {
            if (t.startsWith("<!--", i)) {
                val e = t.indexOf("-->", i).let { if (it < 0) n else it + 3 }
                span(i, e, CodeColors.Comment, false, true); i = e; continue
            }
            if (t[i] == '<') {
                // embedded <script>/<style>: colour as code
                val tagEnd = t.indexOf('>', i).let { if (it < 0) n else it }
                var j = i + 1; if (j < n && (t[j] == '/' || t[j] == '!' || t[j] == '?')) j++
                val ns = j; while (j < n && (t[j].isLetterOrDigit() || t[j] == '-' || t[j] == ':' || t[j] == '_' || t[j] == '.')) j++
                span(i, j, CodeColors.Tag, true, false)
                val tag = t.substring(ns, j).lowercase()
                while (j < tagEnd) {
                    val c = t[j]
                    if (c == '"' || c == '\'') {
                        val e = t.indexOf(c, j + 1).let { if (it < 0 || it > tagEnd) tagEnd else it + 1 }
                        span(j, e, CodeColors.Str, false, false); j = e; continue
                    }
                    if (c.isLetter() || c == '@' || c == ':') {
                        var k = j; while (k < tagEnd && t[k] != '=' && t[k] != ' ' && t[k] != '\n' && t[k] != '/') k++
                        span(j, k, CodeColors.Attr, false, false); j = k; continue
                    }
                    j++
                }
                if (tagEnd < n) span(tagEnd, tagEnd + 1, CodeColors.Tag, true, false)
                i = tagEnd + 1
                if ((tag == "script" || tag == "style") && t[ns - 1] != '/') {
                    val close = t.indexOf("</$tag", i, ignoreCase = true).let { if (it < 0) n else it }
                    val inner = t.substring(i, close)
                    val sub = highlight(inner, if (tag == "script") Lang.JS else Lang.CSS)
                    sub.spanStyles.forEach { s -> span(i + s.start, i + s.end, s.item.color, s.item.fontWeight != null, s.item.fontStyle != null) }
                    i = close
                }
                continue
            }
            if (t[i] == '&') {
                val e = t.indexOf(';', i).let { if (it < 0 || it - i > 10) i + 1 else it + 1 }
                span(i, e, CodeColors.Num, false, false); i = e; continue
            }
            i++
        }
    }

    private fun markdown(t: String, span: (Int, Int, Color, Boolean, Boolean) -> Unit) {
        var pos = 0
        var fence = false
        for (line in t.split('\n')) {
            val e = pos + line.length
            val tr = line.trimStart()
            when {
                tr.startsWith("```") -> { span(pos, e, CodeColors.Comment, false, false); fence = !fence }
                fence -> span(pos, e, CodeColors.Str, false, false)
                tr.startsWith("#") -> span(pos, e, CodeColors.Keyword, true, false)
                tr.startsWith("- ") || tr.startsWith("* ") || tr.startsWith("> ") -> span(pos, pos + line.indexOf(tr) + 2, CodeColors.Tag, true, false)
            }
            if (!fence) Regex("`[^`]+`").findAll(line).forEach { span(pos + it.range.first, pos + it.range.last + 1, CodeColors.Str, false, false) }
            pos = e + 1
        }
    }
}
