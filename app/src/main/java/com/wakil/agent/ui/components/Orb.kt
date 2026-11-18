package com.wakil.agent.ui.components

import android.os.Build
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlurEffect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.wakil.agent.ui.theme.Neon
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/** Visual state of the energy orb, derived from the agent state (UI only). */
enum class OrbState { IDLE, THINKING, TOOL, APPROVAL, ERROR }

private data class OrbLook(val a: Color, val b: Color, val speed: Float, val pulseHz: Float, val energy: Float)

private fun lookOf(s: OrbState) = when (s) {
    OrbState.IDLE -> OrbLook(Neon.Cyan, Neon.Blue, 0.25f, 0.18f, 0.55f)
    OrbState.THINKING -> OrbLook(Neon.Cyan, Neon.Magenta, 1.35f, 0.9f, 1f)
    OrbState.TOOL -> OrbLook(Neon.Amber, Color(0xFFFF6A00), 0.9f, 1.4f, 0.95f)
    OrbState.APPROVAL -> OrbLook(Neon.Yellow, Neon.Amber, 0.35f, 0.7f, 0.85f)
    OrbState.ERROR -> OrbLook(Neon.Red, Color(0xFFB0002A), 0.15f, 2.2f, 0.8f)
}

/** Shared clock for HUD animations: seconds since first composition, advanced every frame. */
@Composable
fun rememberHudClock(): State<Float> {
    val t = remember { mutableFloatStateOf(0f) }
    LaunchedEffect(Unit) {
        var last = 0L
        while (true) {
            withFrameNanos { now ->
                if (last != 0L) t.floatValue += ((now - last) / 1e9f).coerceAtMost(0.05f)
                last = now
            }
        }
    }
    return t
}

/**
 * The hero "energy orb": glowing core, concentric rotating arcs and orbiting particles.
 * All drawing happens in the draw phase (no recomposition per frame).
 */
@Composable
fun EnergyOrb(state: OrbState, size: Dp, modifier: Modifier = Modifier, detail: Boolean = true) {
    val look = lookOf(state)
    val ca by animateColorAsState(look.a, tween(600), label = "orbA")
    val cb by animateColorAsState(look.b, tween(600), label = "orbB")
    val speed by animateFloatAsState(look.speed, tween(900), label = "orbSpeed")
    val pulseHz by animateFloatAsState(look.pulseHz, tween(900), label = "orbHz")
    val energy by animateFloatAsState(look.energy, tween(700), label = "orbEnergy")
    val isError = state == OrbState.ERROR
    val isThinking = state == OrbState.THINKING

    // integrate rotation phase so speed changes never cause jumps
    val phase = remember { mutableFloatStateOf(0f) }
    val pulse = remember { mutableFloatStateOf(0f) }
    val clock = remember { mutableFloatStateOf(0f) }
    LaunchedEffect(Unit) {
        var last = 0L
        while (true) withFrameNanos { now ->
            if (last != 0L) {
                val dt = ((now - last) / 1e9f).coerceAtMost(0.05f)
                phase.floatValue += dt * speed * 60f
                pulse.floatValue += dt * pulseHz * 2f * PI.toFloat()
                clock.floatValue += dt
            }
            last = now
        }
    }

    Box(modifier.size(size)) {
        // Halo: real blur on API 31+, plain soft radial gradient otherwise.
        val haloMod = if (Build.VERSION.SDK_INT >= 31) Modifier.fillMaxSize().graphicsLayer {
            renderEffect = BlurEffect(18f, 18f, TileMode.Decal)
        } else Modifier.fillMaxSize()
        Canvas(haloMod) {
            val p = (sin(pulse.floatValue) + 1f) / 2f
            val flick = if (isError) (0.55f + 0.45f * sin(clock.floatValue * 37f) * sin(clock.floatValue * 13f)).coerceIn(0.2f, 1f) else 1f
            val r = this.size.minDimension / 2f
            drawCircle(
                Brush.radialGradient(
                    listOf(ca.copy(alpha = (0.30f + 0.25f * p * energy) * flick), cb.copy(alpha = 0.12f * flick), Color.Transparent),
                    center = center, radius = r
                ), radius = r
            )
        }
        Canvas(Modifier.fillMaxSize()) {
            val t = clock.floatValue
            val ph = phase.floatValue
            val p = (sin(pulse.floatValue) + 1f) / 2f
            val flick = if (isError) (0.6f + 0.4f * sin(t * 41f) * sin(t * 7f)).coerceIn(0.25f, 1f) else 1f
            val r = this.size.minDimension / 2f
            val sw = r * 0.018f

            // outer dashed HUD ring
            rotate(ph * 0.6f) { dashedRing(r * 0.86f, 28, 0.55f, ca.copy(alpha = 0.55f * flick), sw) }
            if (detail) {
                // tick marks ring (counter-rotating)
                rotate(-ph * 0.25f) {
                    for (i in 0 until 60) {
                        val a = i / 60f * 2f * PI.toFloat()
                        val long = i % 5 == 0
                        val r1 = r * 0.74f
                        val r2 = r * (if (long) 0.79f else 0.765f)
                        drawLine(
                            cb.copy(alpha = (if (long) 0.6f else 0.28f) * flick),
                            Offset(center.x + cos(a) * r1, center.y + sin(a) * r1),
                            Offset(center.x + cos(a) * r2, center.y + sin(a) * r2),
                            strokeWidth = sw * 0.8f
                        )
                    }
                }
            }
            // main energy arcs
            val arcBrush = Brush.sweepGradient(listOf(Color.Transparent, ca, cb, Color.Transparent), center)
            rotate(ph * 1.6f) {
                arc(r * 0.64f, 0f, 110f, arcBrush, sw * 3.2f, flick)
                arc(r * 0.64f, 180f, 110f, arcBrush, sw * 3.2f, flick)
            }
            rotate(-ph * 2.3f) {
                arc(r * 0.53f, 40f, 70f, SolidBrush(cb.copy(alpha = 0.85f)), sw * 1.6f, flick)
                arc(r * 0.53f, 160f, 40f, SolidBrush(ca.copy(alpha = 0.7f)), sw * 1.6f, flick)
                arc(r * 0.53f, 250f, 85f, SolidBrush(cb.copy(alpha = 0.6f)), sw * 1.6f, flick)
            }
            drawCircle(ca.copy(alpha = 0.18f * flick), radius = r * 0.45f, style = Stroke(sw))

            // orbiting particles
            val n = if (detail) 22 else 10
            for (i in 0 until n) {
                val seed = i * 12.9898f
                val orbit = r * (0.38f + 0.5f * frac(sin(seed) * 43758.55f))
                val spd = 0.15f + frac(sin(seed * 1.7f) * 9631.3f) * 0.6f
                val a = (ph / 60f) * spd * (if (i % 2 == 0) 1f else -1f) * 2.2f + i * 0.9f
                val tw = (sin(t * (1.5f + i % 5) + i) + 1f) / 2f
                drawCircle(
                    (if (i % 3 == 0) cb else ca).copy(alpha = (0.25f + 0.65f * tw) * flick),
                    radius = sw * (0.9f + 1.2f * tw),
                    center = Offset(center.x + cos(a) * orbit, center.y + sin(a) * orbit * 0.92f)
                )
            }

            // core
            val breathe = if (isThinking) 0.9f + 0.18f * p else 0.92f + 0.10f * p
            val coreR = r * 0.30f * breathe
            drawCircle(
                Brush.radialGradient(
                    listOf(Color.White.copy(alpha = 0.95f * flick), ca.copy(alpha = 0.9f * flick), cb.copy(alpha = 0.35f * flick), Color.Transparent),
                    center = center, radius = coreR
                ), radius = coreR
            )
            drawCircle(Color.White.copy(alpha = 0.9f * flick), radius = r * 0.06f * breathe)
        }
    }
}

private fun frac(x: Float) = x - kotlin.math.floor(x)

@Suppress("FunctionName")
private fun SolidBrush(c: Color): Brush = Brush.linearGradient(listOf(c, c))

private fun DrawScope.arc(radius: Float, start: Float, sweep: Float, brush: Brush, width: Float, alpha: Float) {
    drawArc(
        brush, start, sweep, useCenter = false,
        topLeft = Offset(center.x - radius, center.y - radius), size = Size(radius * 2, radius * 2),
        style = Stroke(width, cap = StrokeCap.Round), alpha = alpha
    )
}

private fun DrawScope.dashedRing(radius: Float, segments: Int, fill: Float, color: Color, width: Float) {
    val step = 360f / segments
    for (i in 0 until segments) {
        drawArc(
            color, i * step, step * fill, useCenter = false,
            topLeft = Offset(center.x - radius, center.y - radius), size = Size(radius * 2, radius * 2),
            style = Stroke(width)
        )
    }
}
