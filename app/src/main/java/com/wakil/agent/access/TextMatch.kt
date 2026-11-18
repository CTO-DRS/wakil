package com.wakil.agent.access

/** Forgiving text matching for screen labels (Arabic letter variants, diacritics, case). */
object TextMatch {
    private val diacritics = Regex("[\u064B-\u0652\u0670\u0640]")

    fun norm(s: String): String = s.lowercase()
        .replace(diacritics, "")
        .replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا').replace('ٱ', 'ا')
        .replace('ى', 'ي').replace('ة', 'ه').replace('ؤ', 'و').replace('ئ', 'ي')
        .replace(Regex("\\s+"), " ").trim()

    private fun bigrams(s: String): Set<String> = if (s.length < 2) setOf(s) else (0 until s.length - 1).map { s.substring(it, it + 2) }.toSet()

    fun score(a: String, b: String): Double {
        val x = norm(a); val y = norm(b)
        if (x.isEmpty() || y.isEmpty()) return 0.0
        if (x == y) return 1.0
        if (x.contains(y) || y.contains(x)) return 0.9
        val p = bigrams(x); val q = bigrams(y)
        return 2.0 * p.intersect(q).size / (p.size + q.size)
    }

    fun closest(text: String, labels: List<String>, max: Int): List<String> =
        labels.distinct().map { it to score(text, it) }.sortedByDescending { it.second }
            .take(max).map { it.first.take(40) }
}
