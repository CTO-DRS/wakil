package com.wakil.agent.ui.components

import android.content.res.Resources
import android.graphics.BitmapFactory
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.changedToDownIgnoreConsumed
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import com.wakil.agent.R
import com.wakil.agent.audio.Sfx
import com.wakil.agent.audio.Sound
import com.wakil.agent.ui.theme.Neon
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/** What the robot is "doing". Purely visual. */
enum class RobotMood { IDLE, TALK, THINK, HAPPY, CELEBRATE }

private fun fr(x: Float) = x - floor(x)
private fun hash(i: Int, salt: Float) = fr(sin(i * 12.9898f + salt * 78.233f) * 43758.547f)
private fun easeOut(x: Float) = 1f - (1f - x.coerceIn(0f, 1f)).let { it * it * it }

private val HEAD_LENS = Offset(0.2414f, 0.3757f)     // lens inside wakil_robot_head.webp (avatar)

// Rig viewport: rig units shown in the (square) canvas. x centred on 512; y from VIEW_TOP to VIEW_TOP + VIEW.
internal const val VIEW = 1110f
internal const val VIEW_TOP = -95f
/** Idle time before the robot yawns and dozes off. */
internal const val DOZE_AFTER_MS = 45_000L
/** Accelerometer magnitude (m/s²) counted as a jolt; three jolts in quick succession = a shake. */
private const val SHAKE_G = 17f

/* ------------------------------------------------------------------ touch → gaze */

/** Collects taps anywhere on a screen so the robot can look toward them. Provide with [LocalRobotGaze]. */
class RobotGaze {
    internal var origin = Offset.Zero
    internal var tap by mutableStateOf(Offset.Zero)
    internal var tapId by mutableIntStateOf(0)
    fun report(windowPos: Offset) { tap = windowPos; tapId++ }
}

val LocalRobotGaze = staticCompositionLocalOf<RobotGaze?> { null }

/** Put on a screen's root: observes every press (without consuming it) and reports it to [g]. */
fun Modifier.robotGazeSource(g: RobotGaze): Modifier =
    this.onGloballyPositioned { g.origin = it.positionInWindow() }
        .pointerInput(g) {
            awaitPointerEventScope {
                while (true) {
                    val e = awaitPointerEvent(PointerEventPass.Initial)
                    e.changes.firstOrNull { it.changedToDownIgnoreConsumed() }?.let { g.report(g.origin + it.position) }
                }
            }
        }

/* ------------------------------------------------------------------ assets */

/** The rig layers (res/drawable-nodpi/rig_*.webp, cut from art generated from the app icon's robot). */
class RigImages(
    val torso: ImageBitmap, val headFront: ImageBitmap, val head34: ImageBitmap, val headSide: ImageBitmap,
    val upperArm: ImageBitmap, val forearm: ImageBitmap, val pauldron: ImageBitmap,
    val handOpen: ImageBitmap, val handPoint: ImageBitmap, val handFist: ImageBitmap, val handThumb: ImageBitmap,
)

@Composable
fun rememberRigImages(): RigImages {
    @Composable fun i(b: RigBox) = ImageBitmap.imageResource(b.res)
    val d = RigData
    return RigImages(i(d.torso), i(d.headFront), i(d.head34), i(d.headSide), i(d.upperArm), i(d.forearm), i(d.pauldron), i(d.handOpen), i(d.handPoint), i(d.handFist), i(d.handThumb))
}

/** Non-compose loader (frame dumps / tests). */
fun loadRigImages(res: Resources): RigImages {
    val o = BitmapFactory.Options().apply { inScaled = false }
    fun i(b: RigBox) = BitmapFactory.decodeResource(res, b.res, o).asImageBitmap()
    val d = RigData
    return RigImages(i(d.torso), i(d.headFront), i(d.head34), i(d.headSide), i(d.upperArm), i(d.forearm), i(d.pauldron), i(d.handOpen), i(d.handPoint), i(d.handFist), i(d.handThumb))
}

/* ------------------------------------------------------------------ composable */

/**
 * Wakil's robot (v1.4): an articulated 2D rig of the app icon's robot — torso, head (front / ¾ / profile frames),
 * upper arm, forearm and hand per side (open / pointing / fist) — animated in code by [RobotAnimator], with the
 * hologram effects on top: materialize scan, lens pulse, mood-tinted aura, orbit rings, shockwaves/confetti.
 *
 * @param materialize 0..1 hologram build-up (top-to-bottom reveal with converging particles).
 * @param eyesOn 0..1 lens power-on (flickers while < 1).
 * @param animated false = a still frame (cheap; for small avatars in lists).
 * @param detail false = circular head avatar.
 * @param action body-language request (see [RobotAction]); one-shots replay when [actionKey] changes.
 * @param pointAt where POINT aims, relative to the robot's box: (0,0) = centre, units of the box size (e.g. (0, 0.9) = below it).
 * @param interactive tapping the robot plays a random playful reaction + chirp.
 * @param gaze tap source the head follows (defaults to [LocalRobotGaze]).
 */
@Composable
fun WakilRobot(
    size: Dp,
    modifier: Modifier = Modifier,
    mood: RobotMood = RobotMood.IDLE,
    accent: Color = Neon.Cyan,
    materialize: Float = 1f,
    eyesOn: Float = 1f,
    animated: Boolean = true,
    detail: Boolean = true,
    action: RobotAction = RobotAction.NONE,
    actionKey: Int = 0,
    pointAt: Offset? = null,
    interactive: Boolean = true,
    gaze: RobotGaze? = LocalRobotGaze.current,
) {
    val moodTint = when (mood) {
        RobotMood.THINK -> Neon.Violet
        RobotMood.HAPPY -> Neon.Green
        else -> accent
    }
    val acc by animateColorAsState(moodTint, tween(700), label = "robotAccent")
    val clock = if (animated) rememberHudClock() else remember { mutableFloatStateOf(1.3f) }
    if (!detail) {
        val head = ImageBitmap.imageResource(R.drawable.wakil_robot_head)
        val dip = remember { Animatable(0f) }
        LaunchedEffect(action, actionKey) {
            if (action == RobotAction.NOD && actionKey != 0) {
                dip.animateTo(1f, tween(140)); dip.animateTo(0f, tween(180)); dip.animateTo(0.6f, tween(120)); dip.animateTo(0f, tween(200))
            }
        }
        Canvas(modifier.size(size).graphicsLayer { translationY = dip.value * size.toPx() * 0.10f; rotationZ = dip.value * 4f }) {
            drawAvatar(head, clock.value, mood, acc, eyesOn.coerceIn(0f, 1f), animated)
        }
        return
    }

    val imgs = rememberRigImages()
    val anim = remember { RobotAnimator() }
    val base = when {
        action != RobotAction.NONE && !action.oneShot -> action
        mood == RobotMood.THINK -> RobotAction.THINK
        mood == RobotMood.TALK -> RobotAction.TALK
        mood == RobotMood.CELEBRATE -> RobotAction.CELEBRATE
        else -> RobotAction.NONE
    }
    SideEffect { anim.happy = mood == RobotMood.HAPPY }
    if (pointAt != null) SideEffect { anim.pointTarget = Offset(512f + pointAt.x * VIEW, VIEW_TOP + VIEW / 2f + pointAt.y * VIEW) }
    var first by remember { mutableStateOf(true) }
    LaunchedEffect(base) {
        anim.setBase(base, clock.value)
        if (animated && !first && (base == RobotAction.CELEBRATE || base == RobotAction.POINT)) Sfx.play(Sound.SERVO)
    }
    var lastMood by remember { mutableStateOf(mood) }
    LaunchedEffect(mood) {
        if (mood == RobotMood.HAPPY && lastMood != RobotMood.HAPPY && !first && action == RobotAction.NONE) {
            anim.play(RobotAction.HAPPY, clock.value); Sfx.play(Sound.SERVO)
        }
        lastMood = mood
    }
    LaunchedEffect(action, actionKey) {
        if (action.oneShot) { anim.play(action, clock.value); if (animated && action.big) Sfx.play(Sound.SERVO) }
        first = false
    }
    val density = LocalDensity.current
    val conf = LocalConfiguration.current
    var origin by remember { mutableStateOf(Offset.Zero) }
    if (gaze != null && animated) LaunchedEffect(gaze, gaze.tapId) {
        if (gaze.tapId == 0) return@LaunchedEffect
        val px = with(density) { size.toPx() }
        val head = origin + Offset(px / 2f, px * (190f - VIEW_TOP) / VIEW)
        val sw = with(density) { conf.screenWidthDp.toFloat() * this.density }
        val sh = with(density) { conf.screenHeightDp.toFloat() * this.density }
        val d = gaze.tap - head
        anim.lookAt(d.x / (sw * 0.42f), (d.y / (sh * 0.35f)).coerceIn(-0.6f, 1f), clock.value)
    }
    var reactions by remember { mutableIntStateOf(0) }
    // ---- v1.5: dozes off when left alone (yawn → sleep), wakes up startled on a tap or a phone shake
    var sleeping by remember { mutableStateOf(false) }
    val curBase by rememberUpdatedState(base)
    var poke by remember { mutableIntStateOf(0) }
    fun wake(): Boolean {
        if (!sleeping) return false
        sleeping = false; anim.setBase(base, clock.value); anim.play(RobotAction.SURPRISE, clock.value); Sfx.play(Sound.WHOOSH)
        return true
    }
    val canDoze = interactive && animated && base == RobotAction.NONE && materialize >= 1f
    LaunchedEffect(canDoze, action, actionKey, poke, gaze?.tapId) {
        if (sleeping && !canDoze) { sleeping = false; anim.setBase(base, clock.value) }
        if (!canDoze || sleeping) return@LaunchedEffect
        kotlinx.coroutines.delay(DOZE_AFTER_MS)
        anim.play(RobotAction.YAWN, clock.value); Sfx.play(Sound.ROBOT_THINK)
        kotlinx.coroutines.delay((anim.duration(RobotAction.YAWN) * 1000).toLong() - 500L)
        anim.setBase(RobotAction.SLEEP, clock.value); sleeping = true
    }
    if (interactive && animated) {
        val ctx = androidx.compose.ui.platform.LocalContext.current
        DisposableEffect(ctx) {
            val sm = ctx.getSystemService(android.content.Context.SENSOR_SERVICE) as? android.hardware.SensorManager
            val acc = sm?.getDefaultSensor(android.hardware.Sensor.TYPE_ACCELEROMETER)
            var lastJolt = 0L; var jolts = 0; var lastFire = 0L
            val l = object : android.hardware.SensorEventListener {
                override fun onSensorChanged(e: android.hardware.SensorEvent) {
                    val g = kotlin.math.sqrt(e.values[0] * e.values[0] + e.values[1] * e.values[1] + e.values[2] * e.values[2])
                    if (g < SHAKE_G) return
                    val now = android.os.SystemClock.uptimeMillis()
                    jolts = if (now - lastJolt < 450L) jolts + 1 else 1
                    lastJolt = now
                    if (jolts >= 3 && now - lastFire > 2600L) {
                        lastFire = now; jolts = 0
                        sleeping = false; anim.setBase(curBase, clock.value)
                        anim.play(RobotAction.DIZZY, clock.value); Sfx.play(Sound.CHIRP); poke++
                    }
                }
                override fun onAccuracyChanged(s: android.hardware.Sensor?, a: Int) {}
            }
            if (acc != null) sm.registerListener(l, acc, android.hardware.SensorManager.SENSOR_DELAY_GAME)
            onDispose { sm?.unregisterListener(l) }
        }
    }
    val tapMod = if (interactive && animated) Modifier.clickable(remember { MutableInteractionSource() }, indication = null) {
        poke++
        if (!wake()) {
            reactions++
            anim.play(TAP_REACTIONS[(reactions + kotlin.random.Random.nextInt(TAP_REACTIONS.size)) % TAP_REACTIONS.size], clock.value)
            Sfx.play(Sound.CHIRP)
        }
    } else Modifier
    Canvas(modifier.size(size).onGloballyPositioned { origin = it.positionInWindow() }.then(tapMod)) {
        val t = clock.value
        drawRigRobot(imgs, anim.update(t), t, anim.base, acc, materialize.coerceIn(0f, 1f), eyesOn.coerceIn(0f, 1f))
    }
}

/* ------------------------------------------------------------------ drawing */

private fun DrawScope.glow(c: Offset, r: Float, color: Color, a: Float) {
    if (r <= 0f || a <= 0f) return
    drawCircle(Brush.radialGradient(listOf(color.copy(alpha = a.coerceIn(0f, 1f)), color.copy(alpha = a * 0.35f), Color.Transparent), c, r), r, c)
}

private fun DrawScope.part(img: ImageBitmap, b: RigBox, alpha: Float = 1f) {
    if (alpha <= 0.003f) return
    drawImage(img, IntOffset.Zero, IntSize(img.width, img.height), IntOffset(b.x, b.y), IntSize(b.w, b.h), alpha = alpha.coerceAtMost(1f), filterQuality = FilterQuality.High)
}

/**
 * Draws one frame of the full robot into this DrawScope (square-ish canvas). Pure function of its inputs,
 * so tests/frame dumps can call it with a fixed clock.
 */
fun DrawScope.drawRigRobot(img: RigImages, pose: RigPose, t: Float, base: RobotAction, acc: Color, m: Float, eyes: Float) {
    val u = size.minDimension
    val k = u / VIEW
    val cx = size.width / 2f
    val ox = cx - 512f * k
    val oy = size.height - (VIEW + VIEW_TOP) * k
    fun at(x: Float, y: Float) = Offset(ox + x * k, oy + y * k)
    val head = at(512f + pose.headX, 200f + pose.bodyY + pose.headY)
    val revealY = oy + (VIEW_TOP + (VIEW + 40f) * m) * k
    val flicker = if (m < 1f) (0.75f + 0.25f * sin(t * 53f) * sin(t * 17f)).coerceIn(0.4f, 1f) else 1f
    val celebrate = base == RobotAction.CELEBRATE
    val compact = u < 260f          // tiny (header) robot: no rings/particles/scanlines, just aura + rig

    // --- aura behind (mood tinted)
    val pulse = (sin(t * 2.1f) + 1f) / 2f
    val boost = if (celebrate) 0.16f else 0f
    val auraC = at(512f, 330f + pose.bodyY)
    drawCircle(
        Brush.radialGradient(listOf(acc.copy(alpha = (0.22f + 0.10f * pulse + boost) * m), Neon.Blue.copy(alpha = 0.09f * m), Color.Transparent), auraC, 0.56f * u),
        0.56f * u, auraC
    )
    if (celebrate) for (j in 0 until 3) {
        val ph = fr(t * 0.75f + j / 3f)
        drawCircle(lerp(acc, Neon.Magenta, ph).copy(alpha = 0.55f * (1f - ph)), 0.20f * u + 0.32f * u * ph, head, style = Stroke(2.4f * (1f - ph) + 0.6f))
    }

    // --- projector base
    val baseY = size.height - 0.02f * u
    if (!compact) clipRect(bottom = revealY + 0.05f * u) {
        drawOval(acc.copy(alpha = 0.10f * m), Offset(cx - 0.32f * u, baseY - 0.035f * u), Size(0.64f * u, 0.07f * u))
        drawOval(acc.copy(alpha = 0.45f * flicker * m), Offset(cx - 0.27f * u, baseY - 0.022f * u), Size(0.54f * u, 0.044f * u), style = Stroke(1.4f))
        drawOval(Neon.Violet.copy(alpha = 0.40f * m), Offset(cx - 0.34f * u, baseY - 0.04f * u), Size(0.68f * u, 0.08f * u),
            style = Stroke(1.2f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 9f), -t * 30f)))
    }
    val ringC = at(512f, 230f + pose.bodyY)
    if (m > 0.2f && !compact) orbitRings(ringC, u, t, acc, front = false, alpha = (m - 0.2f) / 0.8f)

    // --- the rig
    val lensCol = lerp(Neon.Cyan, acc, 0.35f)
    val on = if (eyes < 1f) (eyes * (0.55f + 0.45f * sin(t * 61f))).coerceIn(0f, 1f) else 1f
    val lp = when (base) {
        RobotAction.TALK, RobotAction.CELEBRATE -> (sin(t * 11f) + 1f) / 2f
        RobotAction.THINK -> (sin(t * 5f) + 1f) / 2f
        else -> (sin(t * 2.2f) + 1f) / 2f
    }
    val lensA = ((0.28f + 0.42f * lp) + 0.35f * pose.lensBoost) * on * (1f - 0.82f * pose.sleep.coerceIn(0f, 1f))
    clipRect(bottom = revealY) {
        withTransform({ translate(ox, oy); scale(k, k, Offset.Zero) }) {
            withTransform({
                translate(0f, pose.bodyY)
                rotate(pose.bodyRot, Offset(512f, 900f))
                scale(1f, 1f + pose.breathe, Offset(512f, 900f))
            }) {
                part(img.torso, RigData.torso, flicker)
                // chest light pulse
                glow(Offset(512f, 505f), 46f, Neon.Cyan, (0.10f + 0.18f * lp) * on * flicker)
                drawHead(img, pose, t, lensCol, lensA, flicker)
                if (pose.keyboard > 0.01f) holoKeyboard(acc, pose.keyboard * m, t)
                drawArm(img, pose.l, false, flicker, lensCol, on)
                drawArm(img, pose.r, true, flicker, lensCol, on)
            }
            // faint hologram scanlines over the robot's box
            val step = if (compact) 1e9f else 12f
            var y = -60f + (t * 10f) % step
            while (y < 1000f) {
                drawLine(Color(0xFF02040A).copy(alpha = 0.10f), Offset(0f, y), Offset(1024f, y), 3.4f)
                y += step
            }
        }
    }

    if (m > 0.2f && !compact) orbitRings(ringC, u, t, acc, front = true, alpha = (m - 0.2f) / 0.8f)

    // --- materialize edge + converging particles / ambient sparkles
    if (m < 1f) {
        val edge = revealY
        drawLine(acc.copy(alpha = 0.35f), Offset(cx - 0.42f * u, edge), Offset(cx + 0.42f * u, edge), 9f, cap = StrokeCap.Round)
        drawLine(Color.White.copy(alpha = 0.95f), Offset(cx - 0.38f * u, edge), Offset(cx + 0.38f * u, edge), 2.2f, cap = StrokeCap.Round)
        drawCircle(Color.White, 3.5f, Offset(cx - 0.38f * u, edge)); drawCircle(Color.White, 3.5f, Offset(cx + 0.38f * u, edge))
        drawOval(Brush.radialGradient(listOf(acc.copy(alpha = 0.35f), Color.Transparent), Offset(cx, edge), 0.40f * u), Offset(cx - 0.40f * u, edge - 0.03f * u), Size(0.80f * u, 0.06f * u))
        for (i in 0 until 46) {
            val sx = size.width * hash(i, 1f); val sy = size.height * hash(i, 2f)
            val tx = cx + (hash(i, 3f) - 0.5f) * 0.75f * u
            val local = ((m - hash(i, 4f) * 0.5f) / 0.5f).coerceIn(0f, 1f)
            val e = easeOut(local)
            val p = Offset(sx + (tx - sx) * e, sy + (edge - sy) * e)
            val a = (if (local <= 0f) 0.35f else 1f - local * 0.85f) * (1f - m * 0.6f)
            drawCircle(acc.copy(alpha = a), radius = (1.4f + 2.2f * hash(i, 5f)), center = p)
        }
    } else if (!compact) {
        for (i in 0 until 16) {
            val ang = t * (0.15f + 0.25f * hash(i, 6f)) + i * 0.9f
            val r = 0.44f * u + 0.06f * u * hash(i, 7f)
            val p = Offset(cx + cos(ang) * r, head.y + 0.16f * u + sin(ang) * r * 0.62f)
            val tw = (sin(t * (1.5f + hash(i, 8f) * 2f) + i) + 1f) / 2f
            drawCircle((if (i % 3 == 0) Neon.Violet else acc).copy(alpha = 0.15f + 0.55f * tw), radius = 1.2f + 1.8f * hash(i, 9f), center = p)
        }
    }

    // --- asleep: floating Z's; dizzy: stars orbiting the head
    if (pose.sleep > 0.05f) sleepZs(head, u, t, acc, pose.sleep.coerceIn(0f, 1f) * m)
    if (pose.dizzy > 0.02f) dizzyStars(head, u, t, pose.dizzy.coerceIn(0f, 1f) * m)

    // --- celebrate confetti (front)
    if (celebrate) for (i in 0 until 26) {
        val ph = fr(t * 0.9f + hash(i, 11f))
        val ang = (i / 26f) * 2f * PI.toFloat() + hash(i, 12f)
        val r = 0.20f * u + 0.38f * u * easeOut(ph)
        val p = Offset(cx + cos(ang) * r, head.y + sin(ang) * r + ph * ph * 0.08f * u)
        val c = listOf(acc, Neon.Magenta, Neon.Yellow, Neon.Green)[i % 4]
        if (i % 2 == 0) drawLine(c.copy(alpha = 1f - ph), p, Offset(p.x - cos(ang) * 0.03f * u, p.y - sin(ang) * 0.03f * u), 3f * (1f - ph) + 1f, StrokeCap.Round)
        else rotate(ph * 540f + i * 30f, p) { drawRect(c.copy(alpha = 1f - ph), Offset(p.x - 3f, p.y - 1.6f), Size(6f, 3.2f)) }
    }
}

private fun DrawScope.sleepZs(head: Offset, u: Float, t: Float, acc: Color, a: Float) {
    for (j in 0 until 3) {
        val ph = fr(t * 0.33f + j / 3f)
        val sz = (0.035f + 0.05f * ph) * u
        val c = Offset(head.x + (0.12f + 0.16f * ph) * u + 0.025f * u * sin(t * 2f + j), head.y - (0.10f + 0.34f * ph) * u)
        val al = a * (if (ph < 0.15f) ph / 0.15f else 1f - (ph - 0.15f) / 0.85f)
        val path = Path().apply {
            moveTo(c.x - sz / 2, c.y - sz / 2); lineTo(c.x + sz / 2, c.y - sz / 2)
            lineTo(c.x - sz / 2, c.y + sz / 2); lineTo(c.x + sz / 2, c.y + sz / 2)
        }
        rotate(-12f, c) {
            drawPath(path, acc.copy(alpha = 0.35f * al), style = Stroke(sz * 0.30f, cap = StrokeCap.Round, join = androidx.compose.ui.graphics.StrokeJoin.Round))
            drawPath(path, Color.White.copy(alpha = 0.95f * al), style = Stroke(sz * 0.12f, cap = StrokeCap.Round, join = androidx.compose.ui.graphics.StrokeJoin.Round))
        }
    }
}

private fun DrawScope.dizzyStars(head: Offset, u: Float, t: Float, a: Float) {
    val c = Offset(head.x, head.y - 0.13f * u)
    for (j in 0 until 5) {
        val ang = t * 4.2f + j * (2f * PI.toFloat() / 5f)
        val p = Offset(c.x + cos(ang) * 0.17f * u, c.y + sin(ang) * 0.05f * u)
        val front = sin(ang) > 0f
        val r = (if (front) 0.022f else 0.015f) * u
        val col = if (j % 2 == 0) Neon.Yellow else Neon.Cyan
        val star = Path().apply {
            for (k in 0 until 10) {
                val rr = if (k % 2 == 0) r else r * 0.42f
                val aa = -PI.toFloat() / 2f + k * PI.toFloat() / 5f + t * 3f
                val q = Offset(p.x + cos(aa) * rr, p.y + sin(aa) * rr)
                if (k == 0) moveTo(q.x, q.y) else lineTo(q.x, q.y)
            }
            close()
        }
        glow(p, r * 2.2f, col, 0.5f * a)
        drawPath(star, col.copy(alpha = (if (front) 1f else 0.55f) * a))
    }
}

/** Head with view frames: front (|turn| < .3), ¾ (.42–.78), profile (> .9); narrow crossfades between them. */
private fun DrawScope.drawHead(img: RigImages, p: RigPose, t: Float, lensCol: Color, lensA: Float, flicker: Float) {
    val hx = RigData.NECK_X; val hy = RigData.NECK_Y
    val turn = p.headTurn
    val a = abs(turn); val right = turn > 0f
    withTransform({
        translate(p.headX + turn * 18f, p.headY + 20f * p.nod)
        rotate(p.headRot, Offset(hx, hy))
        scale(1f, 1f - 0.07f * p.nod, Offset(hx, hy))
    }) {
        fun frame(kind: Int, alpha: Float) {
            if (alpha <= 0.003f) return
            withTransform({
                if (right && kind > 0) scale(-1f, 1f, Offset(hx, 0f))
                if (kind == 0) scale(1f - 0.10f * (a / 0.42f).coerceAtMost(1f), 1f, Offset(hx, hy))
            }) {
                val al = alpha * flicker
                when (kind) {
                    0 -> {
                        part(img.headFront, RigData.headFront, al)
                        glow(Offset(382f, 196f), 30f, lensCol, lensA * 0.8f * alpha)
                        glow(Offset(643f, 196f), 30f, lensCol, lensA * 0.8f * alpha)
                        // eye slits shimmer
                        glow(Offset(452f, 198f), 22f, Neon.Cyan, (0.15f + 0.25f * p.lensBoost) * alpha)
                        glow(Offset(572f, 198f), 22f, Neon.Cyan, (0.15f + 0.25f * p.lensBoost) * alpha)
                        if (p.lensSpin > 0.01f) lensArc(Offset(643f, 196f), 34f, t, lensCol, p.lensSpin * alpha)
                    }
                    1 -> {
                        part(img.head34, RigData.head34, al)
                        val c = Offset(RigData.LENS_HEAD34_X, RigData.LENS_HEAD34_Y)
                        glow(c, 52f, lensCol, lensA * alpha); drawCircle(Color.White.copy(alpha = 0.8f * alpha * (lensA.coerceAtMost(1f))), 5f, c)
                        if (p.lensSpin > 0.01f) lensArc(c, 48f, t, lensCol, p.lensSpin * alpha)
                    }
                    else -> {
                        part(img.headSide, RigData.headSide, al)
                        val c = Offset(RigData.LENS_HEADSIDE_X, RigData.LENS_HEADSIDE_Y)
                        glow(c, 56f, lensCol, lensA * alpha); drawCircle(Color.White.copy(alpha = 0.8f * alpha * (lensA.coerceAtMost(1f))), 5.5f, c)
                        if (p.lensSpin > 0.01f) lensArc(c, 52f, t, lensCol, p.lensSpin * alpha)
                    }
                }
            }
        }
        fun pair(k0: Int, k1: Int, w: Float) {
            if (w < 0.5f) { frame(k0, 1f); frame(k1, w * 2f) } else { frame(k1, 1f); frame(k0, (1f - w) * 2f) }
        }
        when {
            a < 0.33f -> frame(0, 1f)
            a < 0.39f -> pair(0, 1, smooth((a - 0.33f) / 0.06f))
            a < 0.81f -> frame(1, 1f)
            a < 0.87f -> pair(1, 2, smooth((a - 0.81f) / 0.06f))
            else -> frame(2, 1f)
        }
    }
}

private fun DrawScope.lensArc(c: Offset, r: Float, t: Float, col: Color, a: Float) {
    val sweep = (t * 260f) % 360f
    drawArc(col.copy(alpha = 0.9f * a), sweep, 90f, false, Offset(c.x - r, c.y - r), Size(2 * r, 2 * r), style = Stroke(5f, cap = StrokeCap.Round))
    drawArc(Color.White.copy(alpha = 0.6f * a), sweep + 180f, 40f, false, Offset(c.x - r, c.y - r), Size(2 * r, 2 * r), style = Stroke(3f, cap = StrokeCap.Round))
}

private fun DrawScope.drawArm(img: RigImages, a: ArmPose, mirror: Boolean, flicker: Float, lensCol: Color, on: Float) {
    val sh = Offset(RigData.SHOULDER_X, RigData.SHOULDER_Y)
    val el = Offset(RigData.ELBOW_X, RigData.ELBOW_Y)
    val wr = Offset(RigData.WRIST_X, RigData.WRIST_Y)
    withTransform({ if (mirror) scale(-1f, 1f, Offset(RigData.MIRROR_X, 0f)) }) {
        withTransform({ rotate(a.sh, sh) }) {
            withTransform({ rotate(a.el, el) }) {
                withTransform({ rotate(a.wr, wr) }) { drawHand(img, a, flicker) }
                part(img.forearm, RigData.forearm, flicker)
            }
            part(img.upperArm, RigData.upperArm, flicker)
        }
        val lift = ((a.sh - 60f) / 90f).coerceIn(0f, 1f) * 10f
        withTransform({ translate(0f, -lift); rotate(a.sh * 0.08f, sh) }) {
            part(img.pauldron, RigData.pauldron, flicker)
            glow(Offset(222f, 445f), 30f, lensCol, 0.28f * on)
        }
    }
}

private fun DrawScope.drawHand(img: RigImages, a: ArmPose, flicker: Float) {
    val ws = listOf(Triple(img.handOpen, RigData.handOpen, a.open), Triple(img.handPoint, RigData.handPoint, a.point), Triple(img.handFist, RigData.handFist, a.fist), Triple(img.handThumb, RigData.handThumb, a.thumb))
        .sortedByDescending { it.third }
    val top = ws[0]; val second = ws[1]
    part(top.first, top.second, flicker)
    val sum = top.third + second.third
    if (second.third > 0.02f && sum > 0f) part(second.first, second.second, flicker * (second.third / sum) * 1.6f)
}

/** Hologram keyboard under the hands (TYPE). Drawn in rig units inside the body transform. */
private fun DrawScope.holoKeyboard(acc: Color, a: Float, t: Float) {
    val y0 = 735f; val y1 = 800f; val xl0 = 330f; val xr0 = 694f; val xl1 = 300f; val xr1 = 724f
    val path = Path().apply { moveTo(xl0, y0); lineTo(xr0, y0); lineTo(xr1, y1); lineTo(xl1, y1); close() }
    drawPath(path, Brush.verticalGradient(listOf(acc.copy(alpha = 0.10f * a), acc.copy(alpha = 0.30f * a)), y0, y1))
    drawPath(path, acc.copy(alpha = 0.85f * a), style = Stroke(3f))
    for (r in 1..2) {
        val f = r / 3f; val y = y0 + (y1 - y0) * f
        drawLine(acc.copy(alpha = 0.5f * a), Offset(xl0 + (xl1 - xl0) * f, y), Offset(xr0 + (xr1 - xr0) * f, y), 1.6f)
    }
    for (c in 1..9) {
        val f = c / 10f
        drawLine(acc.copy(alpha = 0.4f * a), Offset(xl0 + (xr0 - xl0) * f, y0), Offset(xl1 + (xr1 - xl1) * f, y1), 1.4f)
    }
    for (i in 0 until 3) {
        val k = ((t * 7f).toInt() * 7 + i * 13) % 30
        val col = k % 10; val row = (k / 10) % 3
        val fx = (col + 0.5f) / 10f; val fy = (row + 0.5f) / 3f
        val x = mix(mix(xl0, xr0, fx), mix(xl1, xr1, fx), fy); val y = y0 + (y1 - y0) * fy
        drawCircle(Color.White.copy(alpha = 0.8f * a), 6f, Offset(x, y))
    }
}

private fun mix(a: Float, b: Float, w: Float) = a + (b - a) * w


private fun DrawScope.orbitRings(c: Offset, u: Float, t: Float, acc: Color, front: Boolean, alpha: Float) {
    val start = if (front) 0f else 180f
    val a = (if (front) 1f else 0.45f) * alpha.coerceIn(0f, 1f)
    val cy1 = c.y + 0.10f * u
    rotate(-14f, Offset(c.x, cy1)) {
        val w = 0.86f * u; val h = 0.20f * u
        val tl = Offset(c.x - w / 2, cy1 - h / 2)
        drawArc(acc.copy(alpha = 0.16f * a), start, 180f, false, tl, Size(w, h), style = Stroke(5f))
        drawArc(acc.copy(alpha = 0.80f * a), start, 180f, false, tl, Size(w, h),
            style = Stroke(1.4f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(26f, 10f, 4f, 10f), -t * 40f)))
        val ang = t * 1.1f; val s = sin(ang)
        if ((s > 0) == front) drawCircle(Color.White.copy(alpha = 0.9f * a), 3.2f, Offset(c.x + cos(ang) * w / 2, cy1 + s * h / 2))
    }
    val cy2 = c.y + 0.14f * u
    rotate(18f, Offset(c.x, cy2)) {
        val w = 0.74f * u; val h = 0.12f * u
        val tl = Offset(c.x - w / 2, cy2 - h / 2)
        drawArc(Neon.Violet.copy(alpha = 0.7f * a), start, 180f, false, tl, Size(w, h),
            style = Stroke(1.2f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 8f), t * 25f)))
        val ang = -t * 0.8f + 2f; val s = sin(ang)
        if ((s > 0) == front) drawCircle(Neon.Magenta.copy(alpha = 0.9f * a), 2.6f, Offset(c.x + cos(ang) * w / 2, cy2 + s * h / 2))
    }
}

/** Circular head avatar: dark disc, the icon robot's head, lens glow, neon ring. */
private fun DrawScope.drawAvatar(head: ImageBitmap, t: Float, mood: RobotMood, acc: Color, eyes: Float, animated: Boolean) {
    val d = size.minDimension
    val c = Offset(size.width / 2f, size.height / 2f)
    val r = d / 2f
    drawCircle(Brush.radialGradient(listOf(Color(0xFF12305E), Color(0xFF060B18)), c, r), r, c)
    val clip = Path().apply { addOval(androidx.compose.ui.geometry.Rect(c, r - 0.5f)) }
    clipPath(clip) {
        val s = d * 1.04f
        val tl = Offset(c.x - s / 2f, c.y - s / 2f + d * 0.02f)
        drawImage(head, IntOffset.Zero, IntSize(head.width, head.height), IntOffset(tl.x.roundToInt(), tl.y.roundToInt()), IntSize(s.roundToInt(), s.roundToInt()), filterQuality = FilterQuality.High)
        val lp = if (animated) (sin(t * (if (mood == RobotMood.TALK) 11f else 2.2f)) + 1f) / 2f else 0.6f
        val lens = Offset(tl.x + HEAD_LENS.x * s, tl.y + HEAD_LENS.y * s)
        glow(lens, s * 0.16f, Neon.Cyan, (0.25f + 0.35f * lp) * eyes)
    }
    val stroke = (d * 0.06f).coerceIn(1.2f, 3.2f)
    drawCircle(acc.copy(alpha = 0.25f), r - stroke / 2f, c, style = Stroke(stroke * 2.2f))
    drawCircle(Brush.sweepGradient(listOf(acc, Neon.Violet, Neon.Blue, acc), c), r - stroke / 2f, c, style = Stroke(stroke))
}
