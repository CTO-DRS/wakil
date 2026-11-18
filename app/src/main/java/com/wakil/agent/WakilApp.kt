package com.wakil.agent

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import com.wakil.agent.agent.AgentController
import com.wakil.agent.env.LinuxEnv
import com.wakil.agent.llm.LlmManager
import com.wakil.agent.llm.ModelManager
import com.wakil.agent.priv.ShizukuShell
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class WakilApp : Application() {
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    lateinit var prefs: Prefs
    lateinit var llm: LlmManager
    lateinit var models: ModelManager
    lateinit var env: LinuxEnv
    lateinit var agent: AgentController
    lateinit var github: com.wakil.agent.github.GhManager
    lateinit var memory: com.wakil.agent.extra.AgentMemory
    lateinit var scheduler: com.wakil.agent.extra.Scheduler
    lateinit var shortcuts: com.wakil.agent.extra.Shortcuts

    override fun onCreate() {
        super.onCreate()
        instance = this
        prefs = Prefs(this)
        com.wakil.agent.ui.theme.Neon.palette = com.wakil.agent.ui.theme.Palettes.byId(prefs.theme)
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "وكيل - مهام جارية", NotificationManager.IMPORTANCE_LOW)
        )
        nm.createNotificationChannel(
            NotificationChannel(APPROVAL_CHANNEL_ID, "وكيل - طلبات الإذن", NotificationManager.IMPORTANCE_HIGH)
        )
        llm = LlmManager(this, prefs, appScope)
        models = ModelManager(this, appScope)
        // A finished download or import is loaded straight away when no model is active yet.
        models.onDownloaded = { f -> if (!llm.isReady()) appScope.launch { llm.load(f.path) } }
        models.onImported = { ref -> if (!llm.isReady()) appScope.launch { llm.load(ref) } }
        env = LinuxEnv(this, prefs, appScope)
        github = com.wakil.agent.github.GhManager(this, prefs, appScope)
        memory = com.wakil.agent.extra.AgentMemory(java.io.File(filesDir, "memory.json"))
        scheduler = com.wakil.agent.extra.Scheduler(this)
        agent = AgentController(this)
        scheduler.rearmAll()
        shortcuts = com.wakil.agent.extra.Shortcuts(this).also { it.publishDynamic() }
        ShizukuShell.init()
        com.wakil.agent.audio.Sfx.init(this, prefs)
        com.wakil.agent.audio.OfflineVoice.init(this)
        com.wakil.agent.audio.Speech.bind(prefs)
        com.wakil.agent.audio.Speech.init(this)
    }

    companion object {
        const val CHANNEL_ID = "wakil_tasks"
        const val APPROVAL_CHANNEL_ID = "wakil_approvals"
        lateinit var instance: WakilApp
            private set
    }
}
