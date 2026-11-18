package com.wakil.agent.llm

import java.io.File

/** Reads the CPU's features and core layout to pick the native build and a good thread count. */
object CpuInfo {
    private val features: Set<String> by lazy {
        runCatching { File("/proc/cpuinfo").readLines() }.getOrDefault(emptyList())
            .filter { it.startsWith("Features") }.flatMap { it.substringAfter(':').trim().split(Regex("\\s+")) }.toSet()
    }

    fun hasI8mm() = "i8mm" in features && "asimddp" in features

    /** Max frequency (kHz) of each core, or empty when unreadable. */
    fun maxFreqs(): List<Int> = (0 until Runtime.getRuntime().availableProcessors()).mapNotNull { i ->
        runCatching { File("/sys/devices/system/cpu/cpu$i/cpufreq/cpuinfo_max_freq").readText().trim().toInt() }.getOrNull()
    }

    /**
     * Threads for llama.cpp: the fast ("big") cores only. Using the slow little cores too makes every
     * step wait for the slowest thread, which is why "more threads" is often slower on phones.
     */
    fun bestThreads(): Int = pickThreads(maxFreqs(), Runtime.getRuntime().availableProcessors())

    fun pickThreads(freqs: List<Int>, cores: Int): Int {
        if (freqs.isEmpty()) return (cores / 2).coerceIn(2, 4)
        val top = freqs.max()
        val big = freqs.count { it >= top * 0.75 }
        return big.coerceIn(2, 6)
    }
}
