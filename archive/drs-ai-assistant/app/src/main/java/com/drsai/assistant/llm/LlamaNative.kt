package com.drsai.assistant.llm

/** Thin JNI surface over llama.cpp (see app/src/main/cpp/drsai_llm.cpp). */
internal object LlamaNative {
    @Volatile
    private var initialised = false

    fun ensureLoaded() {
        if (initialised) return
        synchronized(this) {
            if (initialised) return
            System.loadLibrary("drsai_llm")
            nativeInit()
            initialised = true
        }
    }

    external fun nativeInit()
    external fun nativeLoad(path: String, contextSize: Int, threads: Int): Long
    external fun nativeFree(handle: Long)
    external fun nativeContextSize(handle: Long): Int
    external fun nativeChatTemplate(handle: Long): String?
    external fun nativeApplyTemplate(
        handle: Long,
        roles: Array<String>,
        contents: Array<String>,
        addAssistant: Boolean,
    ): String?
    external fun nativeTokenCount(handle: Long, text: String): Int
    external fun nativeBeginCompletion(
        handle: Long,
        prompt: String,
        temperature: Float,
        topP: Float,
        topK: Int,
        repeatPenalty: Float,
        seed: Int,
    ): Int
    external fun nativeNextToken(handle: Long): ByteArray?
    external fun nativeResetCache(handle: Long)
}
