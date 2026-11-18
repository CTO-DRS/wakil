package com.drsai.assistant.domain.model

/** How a model's prompt is built. */
enum class PromptFormat(val opensReasoning: Boolean) {
    /** Use the chat template stored in the GGUF (llama.cpp built-ins), ChatML as fallback. */
    GGUF_TEMPLATE(opensReasoning = false),

    /**
     * Jais-3 (K2 Horizon) template, rendered in Kotlin because llama.cpp's built-in template
     * matcher does not know it. The generation prompt always opens a reasoning block.
     */
    JAIS3(opensReasoning = true),
}

/** A downloadable GGUF model. */
data class ModelSpec(
    val id: String,
    val displayName: String,
    val fileName: String,
    val url: String,
    val sizeBytes: Long,
    val sha256: String,
    val license: String,
    val promptFormat: PromptFormat = PromptFormat.GGUF_TEMPLATE,
    val recommended: Boolean = false,
)

object ModelCatalog {
    /**
     * Jais-3-0.9B, Q4_K_M, official GGUF from Inception / IFM (Apache-2.0).
     * Architecture "k2-horizon" (llama.cpp PR #29535). Arabic/English reasoning model.
     * URL pinned to a fixed repository revision; size and SHA-256 taken from the Hub.
     */
    val JAIS3 = ModelSpec(
        id = "jais-3-0.9b-q4_k_m",
        displayName = "Jais-3 0.9B (Q4_K_M)",
        fileName = "Jais-3-0.9B-Q4_K_M.gguf",
        url = "https://huggingface.co/IFM/Jais-3-0.9B-GGUF/resolve/" +
            "7f015af7ba57fc481ea477ff0e106d4cad4eeabb/Jais-3-0.9B-Q4_K_M.gguf",
        sizeBytes = 666_192_384L,
        sha256 = "e56a4b769c397a1fd2620cf1eec94513debb1664092d0dfad4af01083c2ac3b0",
        license = "Apache-2.0",
        promptFormat = PromptFormat.JAIS3,
        recommended = true,
    )

    /**
     * Qwen2.5-1.5B-Instruct, Q4_K_M, official GGUF from the Qwen team (Apache-2.0).
     * URL pinned to a fixed repository revision; size and SHA-256 taken from the Hub.
     */
    val QWEN = ModelSpec(
        id = "qwen2.5-1.5b-instruct-q4_k_m",
        displayName = "Qwen2.5 1.5B Instruct (Q4_K_M)",
        fileName = "qwen2.5-1.5b-instruct-q4_k_m.gguf",
        url = "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/" +
            "91cad51170dc346986eccefdc2dd33a9da36ead9/qwen2.5-1.5b-instruct-q4_k_m.gguf",
        sizeBytes = 1_117_320_736L,
        sha256 = "6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e",
        license = "Apache-2.0",
        promptFormat = PromptFormat.GGUF_TEMPLATE,
    )

    /** Recommended first (smaller download, best Arabic). */
    val ALL: List<ModelSpec> = listOf(JAIS3, QWEN)

    val DEFAULT: ModelSpec = JAIS3

    fun byId(id: String?): ModelSpec? = ALL.firstOrNull { it.id == id }

    /**
     * Which model to use when nothing has been chosen yet: keep a model that is already
     * on the device (e.g. Qwen from v0.1.0), otherwise the recommended default.
     */
    fun initialSelection(savedId: String?, isReady: (ModelSpec) -> Boolean): ModelSpec =
        byId(savedId) ?: ALL.firstOrNull(isReady) ?: DEFAULT
}
