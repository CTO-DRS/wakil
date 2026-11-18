package com.wakil.agent.extra

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CalcTest {

    private fun eval(s: String) = Calc.eval(s)

    @Test
    fun `basic arithmetic`() {
        assertEquals(7.0, eval("3 + 4"), 1e-9)
        assertEquals(20.0, eval("4 * 5"), 1e-9)
        assertEquals(3.5, eval("7 / 2"), 1e-9)
        assertEquals(1.0, eval("7 % 2"), 1e-9)
        assertEquals(-5.0, eval("-5"), 1e-9)
        assertEquals(-5.0, eval("2 - 7"), 1e-9)
    }

    @Test
    fun `precedence and parentheses`() {
        assertEquals(14.0, eval("2 + 3 * 4"), 1e-9)
        assertEquals(20.0, eval("(2 + 3) * 4"), 1e-9)
        assertEquals(9.0, eval("(2+3)*(4-1)/2+1.5"), 1e-9)
        assertEquals(3.0, eval("1 + 2 ^ 1"), 1e-9)
        assertEquals(512.0, eval("2 ^ 3 ^ 2"), 1e-9)  // right-associative
        assertEquals(8.0, eval("2^3"), 1e-9)
    }

    @Test
    fun `functions and constants`() {
        assertEquals(5.0, eval("sqrt(25)"), 1e-9)
        assertEquals(3.0, eval("abs(0 - 3)"), 1e-9)
        assertEquals(4.0, eval("round(3.6)"), 1e-9)
        assertEquals(3.0, eval("floor(3.9)"), 1e-9)
        assertEquals(4.0, eval("ceil(3.1)"), 1e-9)
        assertEquals(2.0, eval("min(2, 5, 7)"), 1e-9)
        assertEquals(7.0, eval("max(2, 5, 7)"), 1e-9)
        assertEquals(Math.PI, eval("pi"), 1e-12)
        assertEquals(Math.E, eval("e"), 1e-12)
        assertEquals(2.0, eval("ln(e * e)"), 1e-9)
        assertEquals(2.0, eval("log(100)"), 1e-9)
        assertEquals(0.5, eval("sin(deg(30))"), 1e-9)
        assertEquals(1.0, eval("cos(0)"), 1e-9)
        assertEquals(1.0, eval("exp(0)"), 1e-9)
    }

    @Test
    fun `arabic digits and unicode operators`() {
        assertEquals(7.0, eval("٣ + ٤"), 1e-9)
        assertEquals(12.0, eval("٣ × ٤"), 1e-9)
        assertEquals(2.0, eval("٤ ÷ ٢"), 1e-9)
        assertEquals(1000.0, eval("1,000"), 1e-9)
        assertEquals(1024.0, eval("٢ ^ ١٠"), 1e-9)
    }

    @Test
    fun `run returns formatted string`() {
        assertTrue(Calc.run("2 + 2").contains("4"))
        assertTrue(Calc.run("10 / 4").contains("2.5"))
        assertTrue(Calc.run("1/0").startsWith("ERROR"))
        assertTrue(Calc.run("(2 + 3").startsWith("ERROR"))
        assertTrue(Calc.run("sqrt(x)").startsWith("ERROR"))
        assertTrue(Calc.run("").startsWith("ERROR"))
        assertTrue(Calc.run("foo(2)").startsWith("ERROR"))
    }

    @Test
    fun `format drops trailing zeros`() {
        assertEquals("4", Calc.format(4.0))
        assertEquals("2.5", Calc.format(2.5))
        assertEquals("0.1", Calc.format(0.1 + 0.2 - 0.2))
    }
}
