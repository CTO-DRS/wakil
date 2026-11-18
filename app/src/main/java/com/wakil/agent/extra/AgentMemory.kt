package com.wakil.agent.extra

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

data class MemoryNote(val id: Int, val text: String, val time: Long)

/** Long-term memory: short notes the agent saves about the user and their projects, shown in every prompt. */
class AgentMemory(private val file: File) {
    private val _notes = MutableStateFlow(load())
    val notes: StateFlow<List<MemoryNote>> = _notes

    private fun load(): List<MemoryNote> = runCatching {
        val a = JSONArray(file.readText())
        (0 until a.length()).map { val o = a.getJSONObject(it); MemoryNote(o.getInt("id"), o.getString("t"), o.optLong("ts")) }
    }.getOrDefault(emptyList())

    @Synchronized private fun save(list: List<MemoryNote>) {
        _notes.value = list
        runCatching {
            val a = JSONArray(); list.forEach { a.put(JSONObject().put("id", it.id).put("t", it.text).put("ts", it.time)) }
            file.writeText(a.toString())
        }
    }

    @Synchronized fun add(text: String): MemoryNote {
        val t = text.trim().take(500)
        _notes.value.firstOrNull { it.text.equals(t, true) }?.let { return it }
        val n = MemoryNote((_notes.value.maxOfOrNull { it.id } ?: 0) + 1, t, System.currentTimeMillis())
        save((_notes.value + n).takeLast(MAX))
        return n
    }

    @Synchronized fun remove(id: Int): Boolean {
        val before = _notes.value.size
        save(_notes.value.filterNot { it.id == id })
        return _notes.value.size != before
    }

    fun clear() = save(emptyList())

    fun promptBlock(): String =
        if (_notes.value.isEmpty()) "" else "Long-term memory (facts you saved earlier; use them, keep them up to date):\n" +
            _notes.value.takeLast(40).joinToString("\n") { "#${it.id}: ${it.text}" } + "\n"

    companion object { const val MAX = 200 }
}
