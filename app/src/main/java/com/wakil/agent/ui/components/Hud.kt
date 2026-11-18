package com.wakil.agent.ui.components

import android.os.Build
import android.view.HapticFeedbackConstants
import android.view.View
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.KeyboardOptions
import com.wakil.agent.ui.theme.JetMono
import com.wakil.agent.ui.theme.Neon
import kotlin.math.PI
import kotlin.math.sin

/* ---------------------------------------------------------------- background */

/** True-black backdrop with a slow aurora, faint HUD grid and drifting particles. Draw-phase only. */
@Composable
fun AuroraBackground(modifier: Modifier = Modifier, tint: Color = Neon.Cyan) {
    val clock = rememberHudClock()
    val tintAnim by animateColorAsState(tint, tween(1200), label = "auroraTint")
    Canvas(modifier.fillMaxSize().background(Neon.Black)) {
        val t = clock.value
        val w = size.width; val h = size.height
        fun blob(cx: Float, cy: Float, r: Float, c: Color, a: Float) = drawCircle(
            Brush.radialGradient(listOf(c.copy(alpha = a), c.copy(alpha = a * 0.35f), Color.Transparent), Offset(cx, cy), r),
            radius = r, center = Offset(cx, cy)
        )
        blob(w * (0.25f + 0.18f * sin(t * 0.11f)), h * (0.12f + 0.06f * sin(t * 0.07f + 1f)), w * 0.85f, tintAnim, 0.26f)
        blob(w * (0.85f + 0.12f * sin(t * 0.09f + 2f)), h * (0.42f + 0.10f * sin(t * 0.05f)), w * 0.75f, Neon.Violet, 0.22f)
        blob(w * (0.35f + 0.20f * sin(t * 0.06f + 4f)), h * (0.88f + 0.05f * sin(t * 0.1f)), w * 0.9f, Neon.Blue, 0.22f)
        blob(w * (0.9f + 0.1f * sin(t * 0.13f + 3f)), h * (0.95f), w * 0.5f, Neon.Magenta, 0.12f)

        // HUD grid, fading toward the edges
        val step = 34.dp.toPx()
        val gridC = Color(0xFF7FD8FF)
        var x = (t * 4f) % step
        while (x < w) {
            val edge = 1f - kotlin.math.abs(x / w - 0.5f) * 1.6f
            drawLine(gridC.copy(alpha = 0.035f * edge.coerceIn(0f, 1f)), Offset(x, 0f), Offset(x, h), 1f)
            x += step
        }
        var y = (t * 6f) % step
        while (y < h) {
            val edge = 1f - kotlin.math.abs(y / h - 0.5f) * 1.5f
            drawLine(gridC.copy(alpha = 0.035f * edge.coerceIn(0f, 1f)), Offset(0f, y), Offset(w, y), 1f)
            y += step
        }
        // dust particles
        for (i in 0 until 36) {
            val s1 = frac(sin(i * 91.7f) * 43758.5f)
            val s2 = frac(sin(i * 27.3f) * 12731.1f)
            val px = w * s1 + sin(t * 0.3f + i) * 12f
            val py = (h * s2 - t * (6f + 10f * s1)).mod(h)
            val tw = (sin(t * (0.8f + s2 * 2f) + i) + 1f) / 2f
            drawCircle(Color.White.copy(alpha = 0.05f + 0.22f * tw), radius = 0.6.dp.toPx() + 1.dp.toPx() * s2, center = Offset(px, py))
        }
        // vignette
        drawRect(Brush.radialGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.55f)), center, maxOf(w, h) * 0.8f))
    }
}

private fun frac(x: Float) = x - kotlin.math.floor(x)

/* ---------------------------------------------------------------- glass */

val GlassShape = RoundedCornerShape(24.dp)

/** Translucent glass surface with a 1dp gradient edge and soft neon outer glow. */
fun Modifier.glass(
    shape: Shape = GlassShape,
    border: Brush = Neon.softBorder,
    fill: Color = Neon.Glass,
    glow: Color = Color.Transparent,
    glowRadius: Dp = 14.dp,
): Modifier = this
    .then(if (glow != Color.Transparent) Modifier.neonGlow(glow, shape, glowRadius) else Modifier)
    .clip(shape)
    .background(Brush.verticalGradient(listOf(fill.copy(alpha = (fill.alpha * 1.4f).coerceAtMost(1f)), fill)))
    .border(1.dp, border, shape)

/** Cheap outer glow: a few stacked translucent strokes behind the shape (works on every API level). */
fun Modifier.neonGlow(color: Color, shape: Shape, radius: Dp = 14.dp): Modifier = drawBehind {
    val outline = shape.createOutline(size, layoutDirection, this)
    val r = radius.toPx()
    val layers = 5
    for (i in layers downTo 1) {
        val grow = r * i / layers
        val a = 0.10f * (1f - (i - 1f) / layers)
        val cr = when (outline) {
            is androidx.compose.ui.graphics.Outline.Rounded -> outline.roundRect.topLeftCornerRadius.x
            is androidx.compose.ui.graphics.Outline.Generic -> 0f
            is androidx.compose.ui.graphics.Outline.Rectangle -> 0f
        }
        drawRoundRect(
            color.copy(alpha = a), topLeft = Offset(-grow / 2, -grow / 2), size = Size(size.width + grow, size.height + grow),
            cornerRadius = CornerRadius(cr + grow / 2), style = Stroke(grow)
        )
    }
}

@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    border: Brush = Neon.softBorder,
    glow: Color = Color.Transparent,
    padding: PaddingValues = PaddingValues(16.dp),
    fill: Color = Neon.Glass,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(modifier.glass(border = border, glow = glow, fill = fill).padding(padding), content = content)
}

/* ---------------------------------------------------------------- small pieces */

@Composable
fun PulseDot(color: Color, modifier: Modifier = Modifier, size: Dp = 10.dp, pulsing: Boolean = true) {
    val inf = rememberInfiniteTransition(label = "dot")
    val p by inf.animateFloat(0f, 1f, infiniteRepeatable(tween(1400, easing = LinearEasing)), label = "dotP")
    Canvas(modifier.size(size * 2.2f)) {
        val r = size.toPx() / 2
        if (pulsing) drawCircle(color.copy(alpha = 0.45f * (1f - p)), radius = r * (1f + 1.2f * p))
        drawCircle(color.copy(alpha = 0.35f), radius = r * 1.35f)
        drawCircle(color, radius = r)
        drawCircle(Color.White.copy(alpha = 0.6f), radius = r * 0.35f)
    }
}

/** Determinate (0..1) or indeterminate (null) neon progress ring with optional center content. */
@Composable
fun ProgressRing(
    progress: Float?, modifier: Modifier = Modifier, size: Dp = 64.dp, stroke: Dp = 5.dp,
    color: Color = Neon.Cyan, center: (@Composable () -> Unit)? = null,
) {
    val inf = rememberInfiniteTransition(label = "ring")
    val spin by inf.animateFloat(0f, 360f, infiniteRepeatable(tween(1100, easing = LinearEasing)), label = "ringSpin")
    val anim by animateFloatAsState(progress ?: 0f, tween(400), label = "ringP")
    Box(modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val s = stroke.toPx()
            val d = this.size.minDimension - s * 2
            val tl = Offset(s, s)
            drawArc(Color.White.copy(alpha = 0.08f), 0f, 360f, false, tl, Size(d, d), style = Stroke(s))
            val brush = Brush.sweepGradient(listOf(Neon.Violet, color, Color.White, color), this.center)
            if (progress == null) {
                drawArc(brush, spin, 110f, false, tl, Size(d, d), style = Stroke(s, cap = StrokeCap.Round))
            } else {
                drawArc(color.copy(alpha = 0.25f), -90f, 360f * anim, false, Offset(s - 2, s - 2), Size(d + 4, d + 4), style = Stroke(s * 2.2f, cap = StrokeCap.Round))
                drawArc(brush, -90f, 360f * anim, false, tl, Size(d, d), style = Stroke(s, cap = StrokeCap.Round))
            }
        }
        center?.invoke()
    }
}

@Composable
fun Badge(text: String, color: Color = Neon.Cyan, modifier: Modifier = Modifier) {
    Text(
        text, color = color, style = MaterialTheme.typography.labelSmall, maxLines = 1,
        modifier = modifier.clip(RoundedCornerShape(50)).background(color.copy(alpha = 0.12f))
            .border(1.dp, color.copy(alpha = 0.45f), RoundedCornerShape(50)).padding(horizontal = 9.dp, vertical = 3.dp)
    )
}

/** Gradient pill button with glow. */
@Composable
fun GlowButton(
    text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true,
    icon: ImageVector? = null, colors: List<Color> = listOf(Neon.Cyan, Neon.Blue, Neon.Violet),
) {
    val shape = RoundedCornerShape(50)
    val alpha = if (enabled) 1f else 0.35f
    Row(
        modifier
            .then(if (enabled) Modifier.neonGlow(colors.first(), shape, 12.dp) else Modifier)
            .clip(shape)
            .background(Brush.horizontalGradient(colors.map { it.copy(alpha = 0.9f * alpha) }))
            .clickable(enabled = enabled, onClick = { onClick(); com.wakil.agent.audio.Sfx.click() })
            .padding(horizontal = 18.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center,
    ) {
        if (icon != null) { Icon(icon, null, tint = Color(0xFF00121A), modifier = Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)) }
        Text(text, color = Color(0xFF00121A), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

/** Outlined neon ghost button. */
@Composable
fun GhostButton(
    text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true,
    color: Color = Neon.Cyan, icon: ImageVector? = null,
) {
    val shape = RoundedCornerShape(50)
    val c = if (enabled) color else Neon.TextFaint
    Row(
        modifier.clip(shape).background(c.copy(alpha = 0.08f)).border(1.dp, c.copy(alpha = 0.6f), shape)
            .clickable(enabled = enabled, onClick = { onClick(); com.wakil.agent.audio.Sfx.click() }).padding(horizontal = 16.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center,
    ) {
        if (icon != null) { Icon(icon, null, tint = c, modifier = Modifier.size(17.dp)); Spacer(Modifier.width(6.dp)) }
        Text(text, color = c, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Custom neon toggle switch. */
@Composable
fun NeonSwitch(checked: Boolean, onCheckedChange: (Boolean) -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val view = androidx.compose.ui.platform.LocalView.current
    val pos by animateFloatAsState(if (checked) 1f else 0f, spring(dampingRatio = 0.62f, stiffness = 500f), label = "sw")
    val track by animateColorAsState(if (checked) Neon.Cyan.copy(alpha = 0.28f) else Color.White.copy(alpha = 0.06f), label = "swT")
    val edge by animateColorAsState(if (checked) Neon.Cyan else Color.White.copy(alpha = 0.22f), label = "swE")
    val shape = RoundedCornerShape(50)
    val rtl = androidx.compose.ui.platform.LocalLayoutDirection.current == androidx.compose.ui.unit.LayoutDirection.Rtl
    Box(
        modifier.size(52.dp, 30.dp)
            .then(if (checked && enabled) Modifier.neonGlow(Neon.Cyan, shape, 10.dp) else Modifier)
            .clip(shape).background(track).border(1.dp, edge.copy(alpha = if (enabled) 1f else 0.3f), shape)
            .clickable(enabled = enabled, interactionSource = remember { MutableInteractionSource() }, indication = ripple(bounded = true)) {
                haptic(view, HapticKind.TICK, com.wakil.agent.audio.Sound.TOGGLE); onCheckedChange(!checked)
            }
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val r = size.height / 2 - 4.dp.toPx()
            val startX = 4.dp.toPx() + r
            val endX = size.width - 4.dp.toPx() - r
            val p = if (rtl) 1f - pos else pos
            val cx = startX + (endX - startX) * p
            val c = if (enabled) lerpC(Color(0xFF8A9BB5), Color.White, pos) else Color(0xFF3A4458)
            if (pos > 0.05f && enabled) drawCircle(Neon.Cyan.copy(alpha = 0.45f * pos), radius = r * 1.5f, center = Offset(cx, center.y))
            drawCircle(c, radius = r, center = Offset(cx, center.y))
        }
    }
}

private fun lerpC(a: Color, b: Color, f: Float) = androidx.compose.ui.graphics.lerp(a, b, f)

/** Segmented neon pill control. */
@Composable
fun <T> NeonSegmented(options: List<Pair<T, String>>, selected: T, colors: List<Color>, onSelect: (T) -> Unit, modifier: Modifier = Modifier) {
    val view = androidx.compose.ui.platform.LocalView.current
    Row(
        modifier.clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.04f))
            .border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(50)).padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp)
    ) {
        options.forEachIndexed { i, (value, label) ->
            val on = value == selected
            val c = colors[i % colors.size]
            val bg by animateColorAsState(if (on) c.copy(alpha = 0.22f) else Color.Transparent, label = "seg")
            val fg by animateColorAsState(if (on) c else Neon.TextDim, label = "segF")
            val shape = RoundedCornerShape(50)
            Box(
                Modifier.weight(1f).height(34.dp)
                    .then(if (on) Modifier.neonGlow(c, shape, 8.dp) else Modifier)
                    .clip(shape).background(bg)
                    .border(1.dp, if (on) c.copy(alpha = 0.85f) else Color.Transparent, shape)
                    .clickable { if (!on) { haptic(view, HapticKind.TICK); onSelect(value) } },
                contentAlignment = Alignment.Center
            ) {
                Text(label, color = fg, style = MaterialTheme.typography.labelLarge, maxLines = 1)
            }
        }
    }
}

@Composable
fun NeonTextField(
    value: String, onValueChange: (String) -> Unit, label: String, modifier: Modifier = Modifier,
    mono: Boolean = false, singleLine: Boolean = true, enabled: Boolean = true,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
) {
    OutlinedTextField(
        value = value, onValueChange = onValueChange, modifier = modifier.fillMaxWidth(),
        label = { Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        singleLine = singleLine, enabled = enabled, visualTransformation = visualTransformation,
        keyboardOptions = keyboardOptions,
        textStyle = if (mono) LocalTextStyle.current.copy(fontFamily = JetMono, fontSize = 13.sp) else LocalTextStyle.current,
        shape = RoundedCornerShape(16.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = Neon.Cyan, unfocusedBorderColor = Color.White.copy(alpha = 0.14f),
            focusedLabelColor = Neon.Cyan, unfocusedLabelColor = Neon.TextDim, cursorColor = Neon.Cyan,
            focusedContainerColor = Color.White.copy(alpha = 0.04f), unfocusedContainerColor = Color.White.copy(alpha = 0.025f),
            focusedTextColor = Neon.Text, unfocusedTextColor = Neon.Text,
        )
    )
}

/** Section title in HUD style: small glowing bar + label. */
@Composable
fun HudTitle(text: String, modifier: Modifier = Modifier, color: Color = Neon.Cyan, icon: ImageVector? = null) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        if (icon != null) {
            Box(
                Modifier.size(30.dp).clip(RoundedCornerShape(10.dp)).background(color.copy(alpha = 0.12f))
                    .border(1.dp, color.copy(alpha = 0.4f), RoundedCornerShape(10.dp)),
                contentAlignment = Alignment.Center
            ) { Icon(icon, null, tint = color, modifier = Modifier.size(17.dp)) }
            Spacer(Modifier.width(10.dp))
        } else {
            Box(Modifier.size(4.dp, 16.dp).clip(RoundedCornerShape(2.dp)).background(Brush.verticalGradient(listOf(color, Neon.Violet))))
            Spacer(Modifier.width(8.dp))
        }
        Text(text, style = MaterialTheme.typography.titleMedium, color = Neon.Text)
    }
}

/** Screen header used by Terminal / Models / Settings. */
@Composable
fun ScreenHeader(title: String, modifier: Modifier = Modifier, subtitle: String? = null, trailing: (@Composable () -> Unit)? = null) {
    Row(modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.headlineSmall, color = Neon.Text)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.labelMedium, color = Neon.Cyan.copy(alpha = 0.8f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        trailing?.invoke()
    }
}

/* ---------------------------------------------------------------- haptics */

enum class HapticKind { TICK, CONFIRM, REJECT, ALERT }

fun haptic(view: View, kind: HapticKind, sound: com.wakil.agent.audio.Sound? = defaultSound(kind)) {
    sound?.let { com.wakil.agent.audio.Sfx.play(it) }
    val c = when (kind) {
        HapticKind.TICK -> HapticFeedbackConstants.CLOCK_TICK
        HapticKind.CONFIRM -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
        HapticKind.REJECT -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS
        HapticKind.ALERT -> HapticFeedbackConstants.LONG_PRESS
    }
    view.performHapticFeedback(c)
}

private fun defaultSound(kind: HapticKind) = when (kind) {
    HapticKind.TICK -> com.wakil.agent.audio.Sound.TAP
    HapticKind.CONFIRM -> com.wakil.agent.audio.Sound.CONFIRM
    HapticKind.REJECT -> com.wakil.agent.audio.Sound.TOGGLE
    HapticKind.ALERT -> com.wakil.agent.audio.Sound.ROBOT_TALK
}

@Composable
fun CircleIconButton(icon: ImageVector, contentDescription: String, onClick: () -> Unit, tint: Color = Neon.TextDim, enabled: Boolean = true, size: Dp = 40.dp) {
    Box(
        Modifier.size(size).clip(CircleShape).background(Color.White.copy(alpha = 0.05f))
            .border(1.dp, Color.White.copy(alpha = 0.10f), CircleShape).clickable(enabled = enabled, onClick = { onClick(); com.wakil.agent.audio.Sfx.click() }),
        contentAlignment = Alignment.Center
    ) { Icon(icon, contentDescription, tint = if (enabled) tint else tint.copy(alpha = 0.3f), modifier = Modifier.size(size * 0.5f)) }
}

