package com.drsai.assistant.data.settings

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.drsai.assistant.domain.model.AppSettings
import com.drsai.assistant.domain.model.VoiceCatalog
import com.drsai.assistant.domain.repository.SettingsRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "settings")

class DataStoreSettingsRepository(private val context: Context) : SettingsRepository {
    private val keyTemperature = floatPreferencesKey("temperature")
    private val keyContext = intPreferencesKey("context_size")
    private val keyAutoRead = booleanPreferencesKey("tts_auto_read")
    private val keyTtsSpeed = floatPreferencesKey("tts_speed")

    override val settings: Flow<AppSettings> = context.dataStore.data.map { p ->
        AppSettings(
            temperature = p[keyTemperature] ?: AppSettings.DEFAULT_TEMPERATURE,
            contextSize = p[keyContext] ?: AppSettings.DEFAULT_CONTEXT,
            autoRead = p[keyAutoRead] ?: true,
            ttsSpeed = VoiceCatalog.clampSpeed(p[keyTtsSpeed] ?: VoiceCatalog.DEFAULT_SPEED),
        )
    }

    override suspend fun setTemperature(value: Float) {
        context.dataStore.edit { it[keyTemperature] = value.coerceIn(0f, 1.5f) }
    }

    override suspend fun setContextSize(value: Int) {
        context.dataStore.edit { it[keyContext] = value }
    }

    override suspend fun setAutoRead(value: Boolean) {
        context.dataStore.edit { it[keyAutoRead] = value }
    }

    override suspend fun setTtsSpeed(value: Float) {
        context.dataStore.edit { it[keyTtsSpeed] = VoiceCatalog.clampSpeed(value) }
    }
}
