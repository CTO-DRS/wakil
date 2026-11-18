package com.wakil.agent.llm

/** JNI bridge to llama.cpp (see app/src/main/cpp/wakil_llama.cpp). */
object LlamaNative {
    fun interface ByteCallback { fun onBytes(bytes: ByteArray): Boolean }

    @Volatile var loaded = false
        private set
    var loadError: String? = null
        private set
    /** Which native build is in use ("i8mm" fast build or "armv8.2" baseline). */
    var variant: String = "?"
        private set

    fun ensureLoaded(): Boolean {
        if (loaded) return true
        return try {
            // Phones with the i8mm/dotprod extensions (armv8.6, e.g. Dimensity 8350) get the fast build;
            // others fall back to the baseline armv8.2 build.
            variant = if (CpuInfo.hasI8mm() && runCatching { System.loadLibrary("wakil_llama_i8mm") }.isSuccess) "i8mm"
                else { System.loadLibrary("wakil_llama"); "armv8.2" }
            backendInit()
            loaded = true
            true
        } catch (t: Throwable) {
            loadError = t.toString()
            false
        }
    }

    @JvmStatic external fun backendInit()
    @JvmStatic external fun systemInfo(): String
    @JvmStatic external fun loadModel(path: String, nCtx: Int, nThreads: Int, nGpuLayers: Int): Long
    @JvmStatic external fun freeModel(handle: Long)
    @JvmStatic external fun contextSize(handle: Long): Int
    @JvmStatic external fun countTokens(handle: Long, text: ByteArray): Int
    @JvmStatic external fun abort(handle: Long)
    @JvmStatic external fun applyTemplate(handle: Long, roles: Array<ByteArray>, contents: Array<ByteArray>, addAssistant: Boolean): ByteArray?
    @JvmStatic external fun generate(handle: Long, prompt: ByteArray, maxTokens: Int, temp: Float, topP: Float, cb: ByteCallback): Int
    @JvmStatic external fun resetCache(handle: Long)
    @JvmStatic external fun setLookup(handle: Long, n: Int)
    @JvmStatic external fun lookupRate(handle: Long): Int
    @JvmStatic external fun saveCache(handle: Long, path: String): Boolean
    @JvmStatic external fun loadCache(handle: Long, path: String): Int
}
