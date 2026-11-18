package com.drsai.assistant.di

import android.content.Context
import com.drsai.assistant.avatar.AvatarController
import com.drsai.assistant.avatar.StateOnlyAvatarController
import com.drsai.assistant.data.db.DrsDatabase
import com.drsai.assistant.data.model.ModelManager
import com.drsai.assistant.data.repository.RoomChatRepository
import com.drsai.assistant.data.settings.DataStoreSettingsRepository
import com.drsai.assistant.data.voice.VoicePack
import com.drsai.assistant.data.voice.VoicePackManager
import com.drsai.assistant.domain.repository.ChatRepository
import com.drsai.assistant.domain.repository.ModelSelection
import com.drsai.assistant.domain.repository.SettingsRepository
import com.drsai.assistant.llm.LlamaCppEngine
import com.drsai.assistant.llm.LlmEngine
import com.drsai.assistant.voice.NoOpSpeechToText
import com.drsai.assistant.voice.NabraTextToSpeech
import com.drsai.assistant.voice.SpeechToText
import com.drsai.assistant.voice.TextToSpeech
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Dispatchers

/** Manual dependency container: small, explicit, no reflection. */
class AppContainer(context: Context) {
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val db = DrsDatabase.create(context)

    val chatRepository: ChatRepository = RoomChatRepository(db.chatDao())
    val settingsRepository: SettingsRepository = DataStoreSettingsRepository(context)
    val models: ModelSelection = ModelManager(context, appScope)
    val llmEngine: LlmEngine = LlamaCppEngine()

    // Offline Saudi-Arabic voice (v0.3): downloadable Nabra model + ONNX Runtime.
    val voicePack: VoicePack = VoicePackManager(context, appScope)
    val textToSpeech: TextToSpeech = NabraTextToSpeech(context.applicationContext, voicePack, appScope, settingsRepository)

    // later: speech input
    val speechToText: SpeechToText = NoOpSpeechToText
    val avatar: AvatarController = StateOnlyAvatarController()
}
