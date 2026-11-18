package com.drsai.assistant.data.model

import android.content.Context
import com.drsai.assistant.domain.model.ModelCatalog
import com.drsai.assistant.domain.model.ModelSpec
import com.drsai.assistant.domain.repository.ModelRepository
import com.drsai.assistant.domain.repository.ModelSelection
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * One [ModelDownloader] per catalog model plus the persisted choice of which one chats.
 * The choice lives in SharedPreferences so it can be read synchronously at startup
 * (the navigation start destination depends on it).
 */
class ModelManager(
    context: Context,
    scope: CoroutineScope,
    override val catalog: List<ModelSpec> = ModelCatalog.ALL,
) : ModelSelection {
    private val prefs = context.getSharedPreferences("models", Context.MODE_PRIVATE)
    private val repos: Map<String, ModelRepository> =
        catalog.associate { it.id to ModelDownloader(context, it, scope) }

    private val _selected = MutableStateFlow(
        ModelCatalog.initialSelection(prefs.getString(KEY_SELECTED, null)) { repository(it.id).isModelReady() },
    )
    override val selected: StateFlow<ModelSpec> = _selected.asStateFlow()

    override fun repository(id: String): ModelRepository =
        repos[id] ?: throw IllegalArgumentException("Unknown model: $id")

    override fun selectedRepository(): ModelRepository = repository(_selected.value.id)

    override fun select(id: String) {
        val spec = catalog.firstOrNull { it.id == id } ?: return
        prefs.edit().putString(KEY_SELECTED, spec.id).apply()
        _selected.value = spec
    }

    private companion object {
        const val KEY_SELECTED = "selected_model_id"
    }
}
