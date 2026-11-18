package com.wakil.agent.extra

/**
 * Safe arithmetic evaluator used by the `calc` tool.
 *
 * Small local LLMs are unreliable at multi-step arithmetic; this lets the agent compute
 * exactly instead of "in its head". Pure Kotlin (no eval, no scripting engine), fully
 * unit-tested, no network and no side effects, so it is safe to keep on ALLOW.
 *
 * Supports: + - * / % (modulo) ^ (power), parentheses, unary +/-,
 * constants pi and e, and the functions sqrt, abs, round, floor, ceil, ln, log (base 10),
 * exp, sin, cos, tan, asin, acos, atan, deg (degrees -> radians), rad, min, max.
 * Numbers may use Western or Arabic-Indic digits and × ÷ symbols.
 */
object Calc {

    /** Evaluates an expression and returns the formatted result, or "ERROR: ..." (never throws). */
    fun run(expression: String): String {
        if (expression.isBlank()) return "ERROR: missing expression"
        return try {
            val v = eval(expression)
            if (v.isNaN() || v.isInfinite()) "ERROR: result is not a finite number"
            else "= ${format(v)}"
        } catch (e: Exception) {
            "ERROR: ${e.message ?: e}"
        }
    }

    fun eval(raw: String): Double {
        // Normalize common model spellings and Arabic digits before parsing.
        var s = raw.trim()
        s = s.replace('×', '*').replace('÷', '/').replace('−', '-').replace('–', '-')
        s = s.replace('\u066B', '.')            // Arabic decimal separator
        s = s.replace('\u066C', ' ')            // Arabic thousands separator
        // Strip thousands separators (1,000 -> 1000) only outside function calls,
        // where a comma could legitimately separate arguments (min(100,200)).
        if ('(' !in s) s = s.replace(Regex("(?<=\\d),(?=\\d{3}\\b)"), "")
        s = s.replace(Regex("\\s+"), " ")
        val tokens = Lexer(s).tokenize()
        val p = Parser(tokens)
        val v = p.parseExpr()
        if (!p.atEnd()) throw IllegalArgumentException("unexpected token after expression: ${p.peekText()}")
        return v
    }

    fun format(v: Double): String {
        if (v.isNaN() || v.isInfinite()) return v.toString()
        val rounded = Math.round(v)
        if (Math.abs(v - rounded) < 1e-9 && Math.abs(rounded) < 1e15) return rounded.toString()
        return java.math.BigDecimal(v.toString())
            .setScale(10, java.math.RoundingMode.HALF_UP)
            .stripTrailingZeros()
            .toPlainString()
    }

    // ---- tokenizer ----------------------------------------------------------

    private enum class T { NUM, NAME, OP, LP, RP, COMMA }

    private class Token(val type: T, val text: String, val num: Double = 0.0)

    private class Lexer(private val s: String) {
        private var i = 0
        fun tokenize(): List<Token> {
            val out = mutableListOf<Token>()
            while (i < s.length) {
                val c = s[i]
                when {
                    c.isWhitespace() -> i++
                    c == '(' -> { out += Token(T.LP, "("); i++ }
                    c == ')' -> { out += Token(T.RP, ")"); i++ }
                    c == ',' -> { out += Token(T.COMMA, ","); i++ }
                    c in "+-*/%^" -> { out += Token(T.OP, c.toString()); i++ }
                    c.isDigit() || c == '.' || isArabicDigit(c) -> out += number()
                    c.isLetter() -> out += name()
                    else -> throw IllegalArgumentException("unexpected character '$c' at position ${i + 1}")
                }
            }
            return out
        }

        private fun isArabicDigit(c: Char) = c in '\u0660'..'\u0669'

        private fun number(): Token {
            val sb = StringBuilder()
            while (i < s.length && (s[i].isDigit() || s[i] == '.' || isArabicDigit(s[i]))) {
                sb.append(if (isArabicDigit(s[i])) ('0' + (s[i] - '\u0660')) else s[i]); i++
            }
            val v = sb.toString().toDoubleOrNull() ?: throw IllegalArgumentException("bad number '${sb}'")
            return Token(T.NUM, sb.toString(), v)
        }

        private fun name(): Token {
            val sb = StringBuilder()
            while (i < s.length && (s[i].isLetterOrDigit() || s[i] == '_')) { sb.append(s[i]); i++ }
            return Token(T.NAME, sb.toString().lowercase())
        }
    }

    // ---- parser (recursive descent) ----------------------------------------

    private class Parser(private val t: List<Token>) {
        private var pos = 0
        fun atEnd() = pos >= t.size
        fun peekText(): String = if (atEnd()) "(end)" else t[pos].text
        private fun next(): Token = t[pos++]

        fun parseExpr(): Double {
            var v = parseTerm()
            while (!atEnd() && t[pos].type == T.OP && (t[pos].text == "+" || t[pos].text == "-")) {
                val op = next().text
                val r = parseTerm()
                v = if (op == "+") v + r else v - r
            }
            return v
        }

        private fun parseTerm(): Double {
            var v = parseUnary()
            while (!atEnd() && t[pos].type == T.OP && t[pos].text in setOf("*", "/", "%")) {
                val op = next().text
                val r = parseUnary()
                v = when (op) {
                    "*" -> v * r
                    "/" -> if (r == 0.0) throw IllegalArgumentException("division by zero") else v / r
                    else -> if (r == 0.0) throw IllegalArgumentException("modulo by zero") else v % r
                }
            }
            return v
        }

        private fun parseUnary(): Double =
            if (!atEnd() && t[pos].type == T.OP && (t[pos].text == "-" || t[pos].text == "+")) {
                val op = next().text
                val v = parseUnary()
                if (op == "-") -v else v
            } else parsePower()

        private fun parsePower(): Double {
            val base = parseAtom()
            if (!atEnd() && t[pos].type == T.OP && t[pos].text == "^") {
                next()
                return Math.pow(base, parseUnary())  // right-associative: 2^3^2 = 512
            }
            return base
        }

        private fun parseAtom(): Double {
            val tok = next()
            return when (tok.type) {
                T.NUM -> tok.num
                T.LP -> {
                    val v = parseExpr()
                    expect(T.RP, "expected ')'")
                    v
                }
                T.NAME -> {
                    if (!atEnd() && t[pos].type == T.LP) function(tok.text)
                    else when (tok.text) {
                        "pi" -> Math.PI
                        "e" -> Math.E
                        else -> throw IllegalArgumentException("unknown name '${tok.text}' (functions need parentheses)")
                    }
                }
                else -> throw IllegalArgumentException("unexpected '${tok.text}'")
            }
        }

        private fun expect(type: T, what: String) {
            if (atEnd() || t[pos].type != type) throw IllegalArgumentException(what)
            pos++
        }

        private fun function(name: String): Double {
            expect(T.LP, "expected '(' after $name")
            val args = mutableListOf<Double>()
            if (!atEnd() && t[pos].type != T.RP) {
                args += parseExpr()
                while (!atEnd() && t[pos].type == T.COMMA) { next(); args += parseExpr() }
            }
            expect(T.RP, "expected ')' after $name arguments")
            return apply(name, args)
        }

        private fun apply(name: String, a: List<Double>): Double = when (name) {
            "sqrt" -> { need(name, a, 1); Math.sqrt(a[0]) }
            "abs" -> { need(name, a, 1); Math.abs(a[0]) }
            "round" -> { need(name, a, 1); Math.round(a[0]).toDouble() }
            "floor" -> { need(name, a, 1); Math.floor(a[0]) }
            "ceil" -> { need(name, a, 1); Math.ceil(a[0]) }
            "ln" -> { need(name, a, 1); Math.log(a[0]) }
            "log" -> { need(name, a, 1); Math.log10(a[0]) }
            "exp" -> { need(name, a, 1); Math.exp(a[0]) }
            "sin" -> { need(name, a, 1); Math.sin(a[0]) }
            "cos" -> { need(name, a, 1); Math.cos(a[0]) }
            "tan" -> { need(name, a, 1); Math.tan(a[0]) }
            "asin" -> { need(name, a, 1); Math.asin(a[0]) }
            "acos" -> { need(name, a, 1); Math.acos(a[0]) }
            "atan" -> { need(name, a, 1); Math.atan(a[0]) }
            "deg" -> { need(name, a, 1); Math.toRadians(a[0]) }
            "rad" -> { need(name, a, 1); Math.toDegrees(a[0]) }
            "min" -> { need(name, a, 2, min = true); a.minOrNull()!! }
            "max" -> { need(name, a, 2, min = true); a.maxOrNull()!! }
            else -> throw IllegalArgumentException("unknown function '$name'")
        }

        private fun need(name: String, a: List<Double>, n: Int, min: Boolean = false) {
            val ok = if (min) a.size >= n else a.size == n
            if (!ok) throw IllegalArgumentException("function $name expects ${if (min) "at least " else ""}$n argument(s), got ${a.size}")
        }
    }
}
