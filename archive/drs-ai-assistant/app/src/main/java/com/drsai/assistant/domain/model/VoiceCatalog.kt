package com.drsai.assistant.domain.model

/**
 * Offline Saudi-Arabic voice: Nabra-Saudi-7M (oddadmix, Apache-2.0, revision
 * ef45d882f20355767190dffb2a34393ed1df74fa) exported to ONNX with fp16 weights, plus its
 * af_msa style pack. Hosted as release assets of the public CTO-DRS/DRS-AI-Download repo
 * (tag voice-nabra-1) and verified by SHA-256 after download. The G2P lexicon is bundled
 * in the APK assets (small, GPL-3.0-derived from espeak-ng).
 */
object VoiceCatalog {
    private const val BASE = "https://github.com/CTO-DRS/DRS-AI-Download/releases/download/voice-nabra-1/"

    const val SAMPLE_RATE = 24_000
    const val MIN_SPEED = 0.8f
    const val MAX_SPEED = 1.3f
    const val DEFAULT_SPEED = 1.0f

    val MODEL = ModelSpec(
        id = "nabra-saudi-7m-fp16w",
        displayName = "Nabra Saudi 7M",
        fileName = "nabra_saudi_7m_fp16w.onnx",
        url = BASE + "nabra_saudi_7m_fp16w.onnx",
        sizeBytes = 15_767_971L,
        sha256 = "3b0a0c71813f480ba4071a7180c1f9347df9eb5aee3ac42e87d57f1678153574",
        license = "Apache-2.0",
    )

    /** Raw little-endian float32 [510, 256] style vectors. */
    val STYLE = ModelSpec(
        id = "nabra-af-msa",
        displayName = "af_msa voice",
        fileName = "af_msa.bin",
        url = BASE + "af_msa.bin",
        sizeBytes = 522_240L,
        sha256 = "129d447a7c9bdce1d5b6cb5ecb789bbfd9f427b7775131a97dfa5638583b3b92",
        license = "Apache-2.0",
    )

    val FILES: List<ModelSpec> = listOf(MODEL, STYLE)
    val TOTAL_BYTES: Long = FILES.sumOf { it.sizeBytes }

    const val LEXICON_ASSET = "nabra_lexicon.tsv.gz"
    const val NUMBERS_ASSET = "nabra_numbers.tsv"

    fun clampSpeed(v: Float): Float = v.coerceIn(MIN_SPEED, MAX_SPEED)

    /**
     * Combined state of several file downloads, shown as one progress bar.
     * Any failure wins, then active download / verification, then pause.
     */
    fun combine(states: List<DownloadState>, totals: List<Long>): DownloadState {
        if (states.all { it is DownloadState.Completed }) return DownloadState.Completed
        states.firstOrNull { it is DownloadState.Failed }?.let { return it }
        val done = states.indices.sumOf { i ->
            when (val s = states[i]) {
                is DownloadState.Completed -> totals[i]
                is DownloadState.Downloading -> s.downloaded
                is DownloadState.Paused -> s.downloaded
                is DownloadState.Verifying -> totals[i]
                else -> 0L
            }
        }
        val total = totals.sum()
        return when {
            states.any { it is DownloadState.Downloading } -> DownloadState.Downloading(done, total)
            states.any { it is DownloadState.Verifying } -> DownloadState.Verifying
            states.any { it is DownloadState.Paused } || done > 0 -> DownloadState.Paused(done, total)
            else -> DownloadState.NotStarted
        }
    }
}
