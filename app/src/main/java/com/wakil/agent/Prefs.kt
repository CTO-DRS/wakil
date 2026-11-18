package com.wakil.agent

import android.content.Context
import android.content.SharedPreferences

enum class ToolPolicy { ALLOW, ASK, DENY }

/** All user settings, backed by SharedPreferences. */
class Prefs(ctx: Context) {
    private val sp: SharedPreferences = ctx.getSharedPreferences("wakil", Context.MODE_PRIVATE)

    var backend: String            // "local" | "openai"
        get() = sp.getString("backend", "local")!!
        set(v) = sp.edit().putString("backend", v).apply()
    var openAiBaseUrl: String
        get() = sp.getString("oa_base", "https://api.openai.com/v1")!!
        set(v) = sp.edit().putString("oa_base", v).apply()
    var openAiKey: String
        get() = sp.getString("oa_key", "")!!
        set(v) = sp.edit().putString("oa_key", v).apply()
    var openAiModel: String
        get() = sp.getString("oa_model", "gpt-4o-mini")!!
        set(v) = sp.edit().putString("oa_model", v).apply()

    /** Model to auto-load: a file path inside Wakil or a content:// reference to a phone file (v3.3). */
    var lastModelRef: String?
        get() = sp.getString("last_model_ref", null) ?: sp.getString("last_model", null)
        set(v) { if (v == null) sp.edit().remove("last_model_ref").apply() else sp.edit().putString("last_model_ref", v).apply() }
    var autoLoadModel: Boolean
        get() = sp.getBoolean("auto_load", true)
        set(v) = sp.edit().putBoolean("auto_load", v).apply()
    var nCtx: Int
        get() = sp.getInt("n_ctx", 4096)
        set(v) = sp.edit().putInt("n_ctx", v).apply()
    /** Prompt-lookup speculative decoding (faster when replies repeat text from the context). */
    var fastLookup: Boolean
        get() = sp.getBoolean("fast_lookup", true)
        set(v) = sp.edit().putBoolean("fast_lookup", v).apply()
    /** 0 = automatic (the phone's big cores). Older installs stored 4 by default; v2.7 migrates that to auto. */
    var nThreads: Int
        get() = sp.getInt("n_threads", 0)
        set(v) = sp.edit().putInt("n_threads", v).apply()
    val effectiveThreads: Int get() = nThreads.takeIf { it > 0 } ?: com.wakil.agent.llm.CpuInfo.bestThreads()
    /** Model layers offloaded to the GPU via Vulkan (0 = CPU only, 999 = as many as fit). Takes effect on model reload. */
    var gpuLayers: Int
        get() = sp.getInt("gpu_layers", 0)
        set(v) = sp.edit().putInt("gpu_layers", v).apply()
    init {
        if (!sp.getBoolean("threads_auto_v27", false)) {
            if (sp.getInt("n_threads", 0) == 4) sp.edit().remove("n_threads").apply()
            sp.edit().putBoolean("threads_auto_v27", true).apply()
        }
    }
    /** Let reasoning models (Qwen3/3.5) think before answering: smarter but slower. Off = direct answers. */
    var thinking: Boolean
        get() = sp.getBoolean("thinking", false)
        set(v) = sp.edit().putBoolean("thinking", v).apply()

    var temperature: Float
        get() = sp.getFloat("temp", 0.3f)
        set(v) = sp.edit().putFloat("temp", v).apply()
    var maxNewTokens: Int
        get() = sp.getInt("max_new", 768)
        set(v) = sp.edit().putInt("max_new", v).apply()
    /** Full access: every tool runs without asking and the agent gets many more steps. */
    var fullAccess: Boolean
        get() = sp.getBoolean("full_access", false)
        set(v) = sp.edit().putBoolean("full_access", v).apply()

    val effectiveMaxSteps get() = if (fullAccess) maxOf(maxSteps, 80) else maxSteps

    /** The user's own standing instructions for the agent (persona, language, rules). */
    var customInstructions: String
        get() = sp.getString("custom_instr", "")!!
        set(v) = sp.edit().putString("custom_instr", v).apply()

    var currentChat: String
        get() = sp.getString("current_chat", "")!!
        set(v) = sp.edit().putString("current_chat", v).apply()

    var maxSteps: Int
        get() = sp.getInt("max_steps", 15)
        set(v) = sp.edit().putInt("max_steps", v).apply()
    var shellTimeoutSec: Int
        get() = sp.getInt("shell_timeout", 120)
        set(v) = sp.edit().putInt("shell_timeout", v).apply()
    var outputLimit: Int
        get() = sp.getInt("out_limit", 4000)
        set(v) = sp.edit().putInt("out_limit", v).apply()
    var rootfsUrl: String
        get() = sp.getString("rootfs_url", DEFAULT_ROOTFS_URL)!!
        set(v) = sp.edit().putString("rootfs_url", v).apply()
    var prootNoSeccomp: Boolean
        get() = sp.getBoolean("proot_no_seccomp", false)
        set(v) = sp.edit().putBoolean("proot_no_seccomp", v).apply()
    var shizukuEnabled: Boolean
        get() = sp.getBoolean("shizuku_on", false)
        set(v) = sp.edit().putBoolean("shizuku_on", v).apply()
    var preferShizukuForScreen: Boolean
        get() = sp.getBoolean("shizuku_screen", true)
        set(v) = sp.edit().putBoolean("shizuku_screen", v).apply()
    var rootEnabled: Boolean
        get() = sp.getBoolean("root_on", false)
        set(v) = sp.edit().putBoolean("root_on", v).apply()

    /** Read assistant replies aloud with Android TTS (always; voice-typed requests are read anyway). */
    var speakReplies: Boolean
        get() = sp.getBoolean("speak_replies", false)
        set(v) = sp.edit().putBoolean("speak_replies", v).apply()
    /** Floating bubble over other apps was switched on by the user. */
    var bubbleOn: Boolean
        get() = sp.getBoolean("bubble_on", false)
        set(v) = sp.edit().putBoolean("bubble_on", v).apply()
    /** Keep conversations after the app closes. */
    var saveChats: Boolean
        get() = sp.getBoolean("save_chats", true)
        set(v) = sp.edit().putBoolean("save_chats", v).apply()

    /** First-run onboarding (robot intro + permissions) has been completed or skipped. */
    var onboardingDone: Boolean
        get() = sp.getBoolean("onboarding_done", false)
        set(v) = sp.edit().putBoolean("onboarding_done", v).apply()

    /** UI + robot sound effects (Settings → الأصوات). */
    var soundsEnabled: Boolean
        get() = sp.getBoolean("sounds_on", true)
        set(v) = sp.edit().putBoolean("sounds_on", v).apply()
    var soundVolume: Float
        get() = sp.getFloat("sound_vol", 0.7f)
        set(v) = sp.edit().putFloat("sound_vol", v).apply()
    /** Spoken robotic greeting on the onboarding intro (Settings → صوت الترحيب). */
    var welcomeVoice: Boolean
        get() = sp.getBoolean("welcome_voice", true)
        set(v) = sp.edit().putBoolean("welcome_voice", v).apply()

    /** Stored encrypted with an Android Keystore key; an old plain-text token is migrated on first read. */
    var ghToken: String
        get() {
            sp.getString("gh_token_enc", null)?.let { e -> com.wakil.agent.extra.SecureStore.decrypt(e)?.let { return it } }
            val plain = sp.getString("gh_token", "")!!
            if (plain.isNotEmpty()) com.wakil.agent.extra.SecureStore.encrypt(plain)?.let { e ->
                sp.edit().putString("gh_token_enc", e).remove("gh_token").apply()
            }
            return plain
        }
        set(v) {
            val e = if (v.isEmpty()) null else com.wakil.agent.extra.SecureStore.encrypt(v)
            if (v.isEmpty()) sp.edit().remove("gh_token_enc").remove("gh_token").apply()
            else if (e != null) sp.edit().putString("gh_token_enc", e).remove("gh_token").apply()
            else sp.edit().putString("gh_token", v).apply()
        }

    /** Accent palette id (see Palettes). */
    var theme: String
        get() = sp.getString("theme", "jarvis")!!
        set(v) = sp.edit().putString("theme", v).apply()
    /** Background "يا وكيل" listening (experimental, uses the microphone and battery). */
    var wakeWord: Boolean
        get() = sp.getBoolean("wake_word", false)
        set(v) = sp.edit().putBoolean("wake_word", v).apply()
    /** Offline voice (sherpa-onnx): local speech recognition / local Arabic voice for replies. */
    var offlineAsr: Boolean
        get() = sp.getBoolean("offline_asr", false)
        set(v) = sp.edit().putBoolean("offline_asr", v).apply()
    var offlineTts: Boolean
        get() = sp.getBoolean("offline_tts", false)
        set(v) = sp.edit().putBoolean("offline_tts", v).apply()
    var asrPack: String
        get() = sp.getString("asr_pack", "asr-base")!!
        set(v) = sp.edit().putString("asr_pack", v).apply()
    var ttsPack: String
        get() = sp.getString("tts_pack", "tts-kareem")!!
        set(v) = sp.edit().putString("tts_pack", v).apply()
    var ttsSpeed: Float
        get() = sp.getFloat("tts_speed", 1.0f)
        set(v) = sp.edit().putFloat("tts_speed", v).apply()

    /** Tokens/second measured by the speed test, per model file name. */
    fun benchFor(model: String): String? = sp.getString("bench_$model", null)
    fun setBench(model: String, v: String) = sp.edit().putString("bench_$model", v).apply()

    fun policy(tool: String): ToolPolicy {
        if (fullAccess) return ToolPolicy.ALLOW
        val def = DEFAULT_POLICY[tool] ?: ToolPolicy.ASK
        return runCatching { ToolPolicy.valueOf(sp.getString("pol_$tool", def.name)!!) }.getOrDefault(def)
    }
    fun setPolicy(tool: String, p: ToolPolicy) = sp.edit().putString("pol_$tool", p.name).apply()

    companion object {
        const val DEFAULT_ROOTFS_URL =
            "https://dl-cdn.alpinelinux.org/alpine/v3.24/releases/aarch64/alpine-minirootfs-3.24.4-aarch64.tar.gz"
        // Shell & screen-changing actions default to ASK; read-only tools default to ALLOW.
        val DEFAULT_POLICY = mapOf(
            "run_shell" to ToolPolicy.ASK,
            "write_file" to ToolPolicy.ASK,
            "read_file" to ToolPolicy.ALLOW,
            "gh_repos" to ToolPolicy.ALLOW,
            "gh_read" to ToolPolicy.ALLOW,
            "gh_runs" to ToolPolicy.ALLOW,
            "gh_tree" to ToolPolicy.ALLOW,
            "gh_write" to ToolPolicy.ASK,
            "gh_write_files" to ToolPolicy.ASK,
            "gh_create" to ToolPolicy.ASK,
            "gh_build" to ToolPolicy.ASK,
            "gh_build_wait" to ToolPolicy.ASK,
            "gh_install" to ToolPolicy.ASK,
            "install_apk" to ToolPolicy.ASK,
            "list_apps" to ToolPolicy.ALLOW,
            "web_search" to ToolPolicy.ALLOW,
            "web_fetch" to ToolPolicy.ALLOW,
            "calc" to ToolPolicy.ALLOW,
            "datetime" to ToolPolicy.ALLOW,
            "http_request" to ToolPolicy.ASK,
            "memory_save" to ToolPolicy.ALLOW,
            "memory_delete" to ToolPolicy.ALLOW,
            "plan" to ToolPolicy.ALLOW,
            "device_info" to ToolPolicy.ALLOW,
            "clipboard_get" to ToolPolicy.ASK,
            "clipboard_set" to ToolPolicy.ALLOW,
            "notify" to ToolPolicy.ALLOW,
            "phone_files" to ToolPolicy.ASK,
            "schedule_task" to ToolPolicy.ASK,
            "read_document" to ToolPolicy.ALLOW,
            "run_shortcut" to ToolPolicy.ALLOW,
            "save_shortcut" to ToolPolicy.ASK,
            "list_tasks" to ToolPolicy.ALLOW,
            "cancel_task" to ToolPolicy.ASK,
            "open_app" to ToolPolicy.ASK,
            "read_screen" to ToolPolicy.ASK,
            "ocr_screen" to ToolPolicy.ASK,
            "ocr_image" to ToolPolicy.ALLOW,
            "tap_text" to ToolPolicy.ASK,
            "tap_xy" to ToolPolicy.ASK,
            "type_text" to ToolPolicy.ASK,
            "scroll" to ToolPolicy.ASK,
            "back" to ToolPolicy.ASK,
            "home" to ToolPolicy.ASK,
            "sys_shell" to ToolPolicy.ASK,
            "root_shell" to ToolPolicy.ASK,
        )
    }
}
