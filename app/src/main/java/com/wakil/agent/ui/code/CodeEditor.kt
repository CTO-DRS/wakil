package com.wakil.agent.ui.code

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Redo
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.automirrored.filled.FormatIndentDecrease
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wakil.agent.ui.theme.JetMono
import com.wakil.agent.ui.theme.Neon
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Holds the text, language and history for one open file. */
class CodeEditorState(initial: String, val lang: Lang) {
    var value by mutableStateOf(TextFieldValue(initial))
    val history = EditHistory(value)
    var version by mutableIntStateOf(0)   // bumps on every change (for undo button state)
    var original = initial
    val dirty get() = value.text != original

    fun set(next: TextFieldValue) {
        history.record(value, next); value = next; version++
    }
    fun undo() { history.undo(value)?.let { value = it; version++ } }
    fun redo() { history.redo(value)?.let { value = it; version++ } }
}

private class HighlightTransformation(private val lang: Lang) : VisualTransformation {
    private var lastText: String? = null
    private var lastOut: AnnotatedString? = null
    override fun filter(text: AnnotatedString): TransformedText {
        val out = if (text.text == lastText) lastOut!! else Highlighter.highlight(text.text, lang).also { lastText = text.text; lastOut = it }
        return TransformedText(out, OffsetMapping.Identity)
    }
}

private val SYMBOLS = listOf("⇥", "{", "}", "(", ")", "[", "]", "<", ">", ";", ":", "=", "\"", "'", "/", ".", ",", "!", "&", "|", "+", "-", "*", "_", "#", "$", "@", "?", "%", "\\")

@Composable
fun CodeEditor(state: CodeEditorState, modifier: Modifier = Modifier, readOnly: Boolean = false) {
    val lang = state.lang
    val transformation = remember(lang) { HighlightTransformation(lang) }
    val vScroll = rememberScrollState()
    val hScroll = rememberScrollState()
    val style = TextStyle(
        fontFamily = JetMono, fontSize = 13.sp, lineHeight = 19.sp, color = CodeColors.Text,
        textDirection = TextDirection.Ltr, textAlign = TextAlign.Left,
    )
    // words for completion, refreshed shortly after typing pauses
    var fileWords by remember { mutableStateOf(emptySet<String>()) }
    LaunchedEffect(state.value.text) { delay(350); fileWords = EditorLogic.words(state.value.text) }
    val prefix = EditorLogic.currentWord(state.value)
    val suggestions = remember(prefix, fileWords, lang) { EditorLogic.suggest(prefix, lang, fileWords) }
    var showFind by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val linePx = with(androidx.compose.ui.platform.LocalDensity.current) { 19.sp.toPx() }
    var query by remember { mutableStateOf("") }

    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Column(modifier) {
            if (showFind) FindBar(query, { query = it }, EditorLogic.countOf(state.value.text, query),
                onNext = {
                    EditorLogic.findNext(state.value.text, query, state.value.selection.max)?.let {
                        state.value = state.value.copy(selection = TextRange(it.first, it.last + 1))
                        // approximate scroll to the match line
                        val line = state.value.text.substring(0, it.first).count { c -> c == '\n' }
                        scope.launch { vScroll.animateScrollTo((line * linePx - 200).toInt().coerceAtLeast(0)) }
                    }
                }, onClose = { showFind = false })

            Box(Modifier.weight(1f).fillMaxWidth().background(Color(0xFF070B14))) {
                BoxWithConstraints(Modifier.fillMaxSize().verticalScroll(vScroll)) {
                    val minW = maxWidth
                    Row {
                        val lines = remember(state.value.text) { state.value.text.count { it == '\n' } + 1 }
                        Text(
                            (1..lines).joinToString("\n"), style = style.copy(color = CodeColors.LineNo, textAlign = TextAlign.Right),
                            modifier = Modifier.background(Color(0xFF05080F)).padding(start = 6.dp, end = 8.dp, top = 8.dp, bottom = 120.dp)
                                .widthIn(min = 28.dp)
                        )
                        Box(Modifier.horizontalScroll(hScroll)) {
                            BasicTextField(
                                value = state.value,
                                onValueChange = { if (!readOnly) state.set(EditorLogic.process(state.value, it, lang)) },
                                readOnly = readOnly,
                                textStyle = style,
                                cursorBrush = SolidColor(Neon.Cyan),
                                visualTransformation = transformation,
                                keyboardOptions = KeyboardOptions(
                                    capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false,
                                    keyboardType = KeyboardType.Ascii
                                ),
                                modifier = Modifier.widthIn(min = minW - 40.dp).padding(start = 8.dp, end = 40.dp, top = 8.dp, bottom = 120.dp)
                            )
                        }
                    }
                }
            }

            if (!readOnly) {
                if (suggestions.isNotEmpty()) {
                    LazyRow(
                        Modifier.fillMaxWidth().background(Color(0xFF0C1322)).padding(vertical = 4.dp),
                        contentPadding = PaddingValues(horizontal = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        items(suggestions, key = { it.kind + it.label }) { s ->
                            val c = when (s.kind) { 's' -> Neon.Magenta; 'k' -> CodeColors.Keyword; else -> Neon.Cyan }
                            Row(
                                Modifier.clip(RoundedCornerShape(10.dp)).background(c.copy(alpha = 0.10f))
                                    .border(1.dp, c.copy(alpha = 0.35f), RoundedCornerShape(10.dp))
                                    .clickable { state.set(EditorLogic.applyCompletion(state.value, prefix, s.insert)) }
                                    .padding(horizontal = 10.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(if (s.kind == 's') "⚡" else if (s.kind == 'k') "◆" else "•", color = c, fontSize = 10.sp)
                                Spacer(Modifier.width(5.dp))
                                Text(s.label, color = Neon.Text, fontFamily = JetMono, fontSize = 13.sp)
                            }
                        }
                    }
                }
                Row(
                    Modifier.fillMaxWidth().background(Color(0xFF0A0F1A)).padding(vertical = 3.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    ToolIcon(Icons.AutoMirrored.Filled.Undo, state.history.canUndo.also { state.version }) { state.undo() }
                    ToolIcon(Icons.AutoMirrored.Filled.Redo, state.history.canRedo.also { state.version }) { state.redo() }
                    ToolIcon(Icons.Filled.Search, true) { showFind = !showFind }
                    ToolIcon(Icons.AutoMirrored.Filled.FormatIndentDecrease, true) { state.set(EditorLogic.indentSelection(state.value, lang, true)) }
                    LazyRow(Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 4.dp)) {
                        items(SYMBOLS) { sym ->
                            Box(
                                Modifier.padding(horizontal = 2.dp).clip(RoundedCornerShape(8.dp)).background(Color.White.copy(alpha = 0.05f))
                                    .clickable {
                                        val next = if (sym == "⇥") EditorLogic.indentSelection(state.value, lang, false)
                                        else EditorLogic.process(state.value, EditorLogic.insert(state.value, sym), lang)
                                        state.set(next)
                                    }
                                    .padding(horizontal = 11.dp, vertical = 8.dp)
                            ) { Text(sym, color = Neon.Cyan, fontFamily = JetMono, fontSize = 14.sp) }
                        }
                    }
                }
            }
        }
    }
}


@Composable
private fun ToolIcon(icon: androidx.compose.ui.graphics.vector.ImageVector, enabled: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.size(38.dp).clip(RoundedCornerShape(10.dp)).clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center
    ) { Icon(icon, null, tint = if (enabled) Neon.TextDim else Neon.TextFaint.copy(alpha = 0.4f), modifier = Modifier.size(19.dp)) }
}

@Composable
private fun FindBar(query: String, onQuery: (String) -> Unit, count: Int, onNext: () -> Unit, onClose: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(Color(0xFF0C1322)).padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Filled.Search, null, tint = Neon.Cyan, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(6.dp))
        BasicTextField(
            query, onQuery, singleLine = true,
            textStyle = TextStyle(fontFamily = JetMono, fontSize = 13.sp, color = Neon.Text),
            cursorBrush = SolidColor(Neon.Cyan),
            modifier = Modifier.weight(1f).clip(RoundedCornerShape(8.dp)).background(Color.White.copy(alpha = 0.06f)).padding(8.dp)
        )
        Text(" $count ", color = Neon.TextDim, fontSize = 12.sp)
        ToolIcon(Icons.Filled.KeyboardArrowDown, query.isNotEmpty(), onNext)
        ToolIcon(Icons.Filled.Close, true, onClose)
    }
}
