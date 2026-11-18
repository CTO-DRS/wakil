package com.wakil.agent.ui.components

import androidx.compose.ui.geometry.Offset
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.sin

/**
 * Body-language actions of the articulated robot (v1.4).
 * Continuous: POINT, THINK, TALK, TYPE, CELEBRATE (held while requested).
 * One-shot: WAVE, NOD, SHAKE, HAPPY, BOW (played once each time `action`/`actionKey` changes to them).
 */
enum class RobotAction {
    NONE, WAVE, NOD, SHAKE, POINT, THINK, TALK, TYPE, HAPPY, CELEBRATE, BOW,
    // v1.5
    DANCE, SALUTE, CLAP, THUMBS_UP, SURPRISE, YAWN, DIZZY, SLEEP;

    val oneShot: Boolean get() = this == WAVE || this == NOD || this == SHAKE || this == HAPPY || this == BOW ||
        this == DANCE || this == SALUTE || this == CLAP || this == THUMBS_UP || this == SURPRISE || this == YAWN || this == DIZZY
    /** Big moves get a servo whir. */
    val big: Boolean get() = this == WAVE || this == HAPPY || this == CELEBRATE || this == POINT || this == BOW ||
        this == DANCE || this == SALUTE || this == THUMBS_UP || this == YAWN
}

/** One arm: joint angles in degrees relative to the art's rest pose (+ = clockwise on screen for the screen-left arm,
 *  mirrored for the screen-right arm, i.e. + always raises the arm outwards) and hand-shape weights. */
data class ArmPose(
    val sh: Float = -3f, val el: Float = -12f, val wr: Float = 0f,
    val open: Float = 1f, val point: Float = 0f, val fist: Float = 0f, val thumb: Float = 0f,
)

/** Full skeleton pose in rig units (pixels of the 1024² front art). */
data class RigPose(
    val bodyY: Float = 0f, val bodyRot: Float = 0f, val breathe: Float = 0f,
    val headTurn: Float = 0f, val headRot: Float = 0f, val headX: Float = 0f, val headY: Float = 0f, val nod: Float = 0f,
    val l: ArmPose = ArmPose(), val r: ArmPose = ArmPose(),
    val lensSpin: Float = 0f, val lensBoost: Float = 0f, val keyboard: Float = 0f,
    /** 0..1 asleep: dims the lenses and floats "Z"s. */ val sleep: Float = 0f,
    /** 0..1 dizzy: stars orbit the head. */ val dizzy: Float = 0f,
)

private fun mix(a: Float, b: Float, w: Float) = a + (b - a) * w
fun lerpArm(a: ArmPose, b: ArmPose, w: Float) = ArmPose(
    mix(a.sh, b.sh, w), mix(a.el, b.el, w), mix(a.wr, b.wr, w), mix(a.open, b.open, w), mix(a.point, b.point, w), mix(a.fist, b.fist, w), mix(a.thumb, b.thumb, w)
)
fun lerpPose(a: RigPose, b: RigPose, w: Float): RigPose = if (w <= 0f) a else if (w >= 1f) b else RigPose(
    mix(a.bodyY, b.bodyY, w), mix(a.bodyRot, b.bodyRot, w), mix(a.breathe, b.breathe, w),
    mix(a.headTurn, b.headTurn, w), mix(a.headRot, b.headRot, w), mix(a.headX, b.headX, w), mix(a.headY, b.headY, w), mix(a.nod, b.nod, w),
    lerpArm(a.l, b.l, w), lerpArm(a.r, b.r, w),
    mix(a.lensSpin, b.lensSpin, w), mix(a.lensBoost, b.lensBoost, w), mix(a.keyboard, b.keyboard, w),
    mix(a.sleep, b.sleep, w), mix(a.dizzy, b.dizzy, w),
)

internal fun smooth(x: Float): Float { val c = x.coerceIn(0f, 1f); return c * c * (3f - 2f * c) }
private fun easeOutBack(x: Float): Float { val c = x.coerceIn(0f, 1f) - 1f; return 1f + c * c * (2.2f * c + 1.2f) }
private const val TAU = (2 * PI).toFloat()
private fun deg(r: Float) = r * 180f / PI.toFloat()
private fun rad(d: Float) = d * PI.toFloat() / 180f
private fun wrap(a: Float): Float { var x = a; while (x > 180f) x -= 360f; while (x < -180f) x += 360f; return x }

/** Skeleton geometry + 2-bone IK for the screen-left arm (the right arm is its mirror image). */
object RigSkeleton {
    const val SX = RigData.SHOULDER_X; const val SY = RigData.SHOULDER_Y
    const val EX = RigData.ELBOW_X; const val EY = RigData.ELBOW_Y
    const val WX = RigData.WRIST_X; const val WY = RigData.WRIST_Y
    val upperLen = hypot(EX - SX, EY - SY)
    val foreLen = hypot(WX - EX, WY - EY)
    private val upperRest = deg(atan2(EY - SY, EX - SX))
    private val foreRest = deg(atan2(WY - EY, WX - EX))
    private val armRest = deg(atan2(WY - SY, WX - SX))

    /** Joint angles (sh, el) that put the wrist of the screen-left arm at (tx, ty). Elbow bends to the outer/lower side. */
    fun ik(tx: Float, ty: Float): Pair<Float, Float> {
        val a = upperLen; val b = foreLen
        val dx = tx - SX; val dy = ty - SY
        val d = hypot(dx, dy).coerceIn(abs(a - b) + 1f, a + b - 1f)
        val phi = deg(atan2(dy, dx))
        val beta = deg(acos(((a * a + d * d - b * b) / (2 * a * d)).coerceIn(-1f, 1f)))
        val au = phi + beta
        val ex = SX + a * cos(rad(au)); val ey = SY + a * sin(rad(au))
        val af = deg(atan2(ty - ey, tx - ex))
        val sh = wrap(au - upperRest)
        return sh to wrap(af - foreRest - sh)
    }

    /** Shoulder angle that aims the straight screen-left arm at (tx, ty). */
    fun aim(tx: Float, ty: Float): Float = wrap(deg(atan2(ty - SY, tx - SX)) - armRest)

    /**
     * Pointing pose for the screen-left arm toward (tx, ty): a straight arm for targets level or above the shoulder,
     * and for targets below it the elbow swings out and the forearm + index finger aim at the target (reads better
     * in a front view than a straight arm hanging down).
     */
    fun pointArm(tx: Float, ty: Float, jab: Float, wobble: Float): ArmPose {
        val theta = deg(atan2(ty - SY, tx - SX))
        val straight = wrap(theta - armRest)
        val down = smoothF((theta - 35f) / 30f)            // 0 = level/up … 1 = clearly below
        val sh = (straight + 52f * down + 2.5f * wobble).coerceIn(-62f, 175f)
        val elBent = wrap(theta - foreRest - sh)
        val el = (-8f) * (1f - down) + elBent * down - 6f * jab
        return ArmPose(sh, el, 0f, open = 0f, point = 1f)
    }
    private fun smoothF(x: Float): Float { val c = x.coerceIn(0f, 1f); return c * c * (3f - 2f * c) }

    /** Wrist position of the screen-left arm for a pose (rig units, before body transform). */
    fun wrist(a: ArmPose): Offset {
        val au = rad(upperRest + a.sh); val af = rad(foreRest + a.sh + a.el)
        return Offset(SX + upperLen * cos(au) + foreLen * cos(af), SY + upperLen * sin(au) + foreLen * sin(af))
    }
}

/**
 * Deterministic animation state machine: feed it time (seconds) every frame, get a [RigPose].
 * Base (continuous) action + optional one-shot layered on top with smooth envelopes, crossfaded base changes,
 * and a critically damped "gaze" spring for head turns (idle look-around and touch tracking).
 */
class RobotAnimator {
    var base: RobotAction = RobotAction.NONE; private set
    private var fromBase: RobotAction = RobotAction.NONE
    private var baseT = -10f
    var happy = false
    private var shot: RobotAction? = null
    private var shotT = 0f
    private var shotSeed = 0
    /** Point target in rig units. */
    var pointTarget = Offset(660f, 1500f)

    private var gazeTarget = 0f; private var pitchTarget = 0f; private var gazeUntil = -1f
    private var turn = 0f; private var turnV = 0f; private var pitch = 0f; private var pitchV = 0f
    private var lastT = Float.NaN
    private var nextLook = 2.2f; private var lookIdx = 0
    private var glanceT = -10f

    val playing: RobotAction? get() = shot

    fun setBase(a: RobotAction, t: Float) {
        val nb = if (a.oneShot) RobotAction.NONE else a
        if (nb == base) return
        fromBase = base; base = nb; baseT = t
    }

    fun play(a: RobotAction, t: Float, seed: Int = 0) {
        if (!a.oneShot) { setBase(a, t); return }
        shot = a; shotT = t; shotSeed = seed
    }

    /** Look toward a horizontal direction (-1 = far screen-left … 1 = far right) and pitch (-1 up … 1 down). */
    fun lookAt(dir: Float, down: Float, t: Float, hold: Float = 2.4f) {
        gazeTarget = dir.coerceIn(-0.75f, 0.75f); pitchTarget = down.coerceIn(-1f, 1f); gazeUntil = t + hold; glanceT = t
    }

    fun duration(a: RobotAction) = when (a) {
        RobotAction.WAVE -> 2.4f; RobotAction.NOD -> 1.0f; RobotAction.SHAKE -> 1.15f
        RobotAction.HAPPY -> 1.7f; RobotAction.BOW -> 1.9f
        RobotAction.DANCE -> 4.0f; RobotAction.SALUTE -> 2.1f; RobotAction.CLAP -> 2.0f; RobotAction.THUMBS_UP -> 1.9f
        RobotAction.SURPRISE -> 1.4f; RobotAction.YAWN -> 2.8f; RobotAction.DIZZY -> 2.4f
        else -> 0f
    }

    fun update(t: Float): RigPose {
        // ---- gaze spring
        val dt = if (lastT.isNaN()) 0f else (t - lastT).coerceIn(0f, 0.1f)
        lastT = t
        val idleish = base == RobotAction.NONE && shot == null
        if (t > gazeUntil) {
            if (idleish) {
                if (t >= nextLook) {
                    val seq = LOOKS[lookIdx % LOOKS.size]; lookIdx++
                    gazeTarget = seq.first; pitchTarget = seq.second
                    nextLook = t + 1.6f + 2.2f * fr01(lookIdx * 0.618f)
                    if (seq.first != 0f) glanceT = t
                }
            } else { gazeTarget = 0f; pitchTarget = 0f; nextLook = t + 1.5f }
        }
        var steps = max(1, (dt / (1f / 120f)).toInt() + 1); val h = dt / steps
        val w = 8.5f
        while (steps-- > 0 && h > 0f) {
            turnV += (w * w * (gazeTarget - turn) - 2f * w * turnV) * h; turn += turnV * h
            pitchV += (w * w * (pitchTarget - pitch) - 2f * w * pitchV) * h; pitch += pitchV * h
        }

        // ---- base (crossfaded on change)
        val bw = smooth((t - baseT) / 0.55f)
        var p = basePose(base, t)
        if (bw < 1f) p = lerpPose(basePose(fromBase, t), p, bw)

        // ---- one-shot layer
        shot?.let { a ->
            val lt = t - shotT; val d = duration(a)
            if (lt >= d) shot = null
            else {
                val env = smooth(lt / 0.28f) * smooth((d - lt) / 0.38f)
                p = lerpPose(p, shotPose(a, lt, p), env)
            }
        }

        val glance = exp(-max(0f, t - glanceT) * 3f) * (if (t >= glanceT) 1f else 0f)
        return p.copy(
            headTurn = (p.headTurn + turn).coerceIn(-1f, 1f),
            headY = p.headY + pitch * 10f,
            headRot = p.headRot + turn * 3f,
            lensBoost = max(p.lensBoost, glance),
        )
    }

    // ------------------------------------------------------------------ poses

    private fun idle(t: Float): RigPose {
        val cheer = if (happy) 1f else 0f
        return RigPose(
            bodyY = sin(t * 1.35f) * 5f - cheer * 7f * abs(sin(t * 3.2f)),
            bodyRot = sin(t * 0.55f) * 0.8f,
            breathe = sin(t * 1.6f) * 0.010f,
            headRot = sin(t * 0.7f) * 1.8f + cheer * 3f * sin(t * 3.2f),
            l = ArmPose(-3f + sin(t * 1.35f + 0.6f) * 1.6f, -12f + sin(t * 1.1f + 1f) * 3f, sin(t * 0.9f) * 4f),
            r = ArmPose(-3f + sin(t * 1.27f + 2.1f) * 1.6f, -12f + sin(t * 1.05f + 2.4f) * 3f, sin(t * 0.83f + 1f) * 4f),
        )
    }

    private fun basePose(a: RobotAction, t: Float): RigPose {
        val i = idle(t)
        return when (a) {
            RobotAction.TALK -> i.copy(
                headRot = 2.5f * sin(t * 2.1f), nod = 0.35f * max(0f, sin(t * 6.3f)), headTurn = 0.10f * sin(t * 0.8f),
                l = ArmPose(6f + 5f * sin(t * 1.9f + 2f), -38f + 16f * sin(t * 2.6f + 1f), 8f * sin(t * 3.3f)),
                r = ArmPose(22f + 8f * sin(t * 2.3f), -85f + 20f * sin(t * 3.1f + 0.4f), 10f * sin(t * 3.7f)),
                lensBoost = 0.5f + 0.5f * sin(t * 9f),
            )
            RobotAction.THINK -> {
                val (s1, e1) = RigSkeleton.ik(455f, 352f + 4f * sin(t * 1.2f))
                val (s2, e2) = RigSkeleton.ik(470f, 662f)
                i.copy(
                    headRot = 6f + 1.5f * sin(t * 0.9f), headTurn = -0.12f, headY = -3f,
                    l = ArmPose(s1, e1, 6f * sin(t * 4.5f), open = 0f, fist = 1f),
                    r = ArmPose(s2, e2, 4f * sin(t * 1.3f)),
                    lensSpin = 1f,
                )
            }
            RobotAction.TYPE -> {
                val (s1, e1) = RigSkeleton.ik(402f, 700f + 7f * sin(t * 15f))
                val (s2, e2) = RigSkeleton.ik(402f, 700f + 7f * sin(t * 15f + 2.4f))
                i.copy(
                    headY = 9f, nod = 0.25f, headRot = 1.5f * sin(t * 1.7f),
                    l = ArmPose(s1, e1, 6f * sin(t * 15f)), r = ArmPose(s2, e2, 6f * sin(t * 15f + 2.4f)),
                    keyboard = 1f, lensBoost = 0.3f + 0.3f * sin(t * 15f),
                )
            }
            RobotAction.POINT -> {
                val tgt = pointTarget
                val leftSide = tgt.x <= RigData.MIRROR_X
                val tx = if (leftSide) tgt.x else 2 * RigData.MIRROR_X - tgt.x
                val jab = max(0f, sin(t * 4.2f))
                val arm = RigSkeleton.pointArm(tx, tgt.y, jab, sin(t * 4.2f))
                i.copy(
                    headTurn = ((tgt.x - 512f) / 750f).coerceIn(-0.45f, 0.45f),
                    headY = if (tgt.y > 700f) 7f else 0f, headRot = if (leftSide) -3f else 3f,
                    l = if (leftSide) arm else i.l, r = if (leftSide) i.r else arm,
                )
            }
            RobotAction.CELEBRATE -> {
                val ph = t * 1.45f * TAU
                i.copy(
                    bodyY = -30f * abs(sin(ph / 2f)), breathe = 0.015f * sin(ph),
                    headRot = 4f * sin(ph / 2f), nod = 0.2f * abs(sin(ph / 2f)),
                    l = ArmPose(146f + 9f * sin(ph), 14f + 14f * sin(ph + 1f), 10f * sin(ph + 0.5f), open = 0f, fist = 1f),
                    r = ArmPose(146f + 9f * sin(ph + PI.toFloat()), 14f + 14f * sin(ph + 1f + PI.toFloat()), 10f * sin(ph + 2f), open = 0f, fist = 1f),
                    lensBoost = 0.6f + 0.4f * sin(ph * 2f),
                )
            }
            RobotAction.SLEEP -> {
                val b = sin(t * 0.9f)
                i.copy(
                    bodyY = 10f + 4f * b, bodyRot = 0f, breathe = 0.018f * b,
                    headRot = 4f, headTurn = 0.06f, headY = 12f, nod = 1.25f + 0.08f * b,
                    l = ArmPose(-7f, -2f + 2f * b, 3f), r = ArmPose(-7f, -2f + 2f * b, 3f),
                    sleep = 1f,
                )
            }
            else -> i
        }
    }

    private fun shotPose(a: RobotAction, lt: Float, under: RigPose): RigPose = when (a) {
        RobotAction.WAVE -> {
            val up = easeOutBack(lt / 0.45f)
            val ph = (lt - 0.3f).coerceAtLeast(0f) * 2.1f * TAU
            under.copy(
                headRot = 5f, headTurn = 0.08f, bodyRot = 1.2f,
                r = ArmPose(148f * up, 22f + 26f * sin(ph), 10f * sin(ph + 0.7f)),
                lensBoost = 0.7f,
            )
        }
        RobotAction.NOD -> {
            val n = max(0f, sin(lt / 1.0f * 2f * TAU - 0.4f)) * (1f - lt / 1.1f)
            under.copy(nod = 1.2f * n, headRot = under.headRot * 0.3f, headTurn = under.headTurn * 0.3f)
        }
        RobotAction.SHAKE -> {
            val s = sin(lt * 2.4f * TAU) * (1f - lt / 1.3f)
            under.copy(headTurn = 0.5f * s, headRot = -4f * s, headX = 0f, lensBoost = 0.4f)
        }
        RobotAction.HAPPY -> {
            val ph = lt * 2.3f * TAU
            val pump = sin(ph)
            under.copy(
                bodyY = -10f * abs(sin(ph / 2f)), headRot = -4f, nod = 0.3f * max(0f, pump),
                r = ArmPose(52f + 10f * pump, 104f + 16f * pump, 0f, open = 0f, fist = 1f),
                lensBoost = 1f,
            )
        }
        RobotAction.BOW -> {
            val b = sin((lt / 1.9f).coerceIn(0f, 1f) * PI.toFloat())
            val (s1, e1) = RigSkeleton.ik(470f, 560f)
            under.copy(
                bodyY = 22f * b, breathe = -0.03f * b, nod = 1.6f * b, headRot = 0f,
                l = lerpArm(under.l, ArmPose(s1, e1, -10f), smooth(b * 1.6f)),
                r = ArmPose(8f * b - 3f, -12f, 0f),
            )
        }
        RobotAction.DANCE -> {
            val ph = lt * 2.2f * TAU                    // ~132 bpm
            val bob = abs(sin(ph / 2f))
            val disco = lt > 2.0f
            val sw = sin(ph / 2f)
            val l: ArmPose; val r: ArmPose
            if (!disco) {   // arm pumps, alternating
                l = ArmPose(70f + 55f * sin(ph), 60f + 35f * sin(ph + 0.8f), 0f, open = 0f, fist = 1f)
                r = ArmPose(70f - 55f * sin(ph), 60f - 35f * sin(ph + 0.8f), 0f, open = 0f, fist = 1f)
            } else {        // disco point: up-and-out, then down-and-across
                val up = (sin(ph / 2f) + 1f) / 2f
                l = ArmPose(mix(-25f, 158f, up), mix(-55f, -6f, up), 0f, open = 0f, point = 1f)
                r = ArmPose(mix(10f, 40f, up), mix(-60f, -80f, up), 0f, open = 1f)
            }
            under.copy(
                bodyY = -16f * bob, bodyRot = 5f * sw, breathe = 0.012f * sin(ph),
                headTurn = 0.28f * sw, headRot = -5f * sw + 2f * sin(ph), headX = 10f * sw, nod = 0.35f * bob,
                l = l, r = r, lensBoost = 0.5f + 0.5f * sin(ph * 2f),
            )
        }
        RobotAction.SALUTE -> {
            val up = easeOutBack(lt / 0.5f)
            under.copy(
                bodyY = -4f, bodyRot = 0f, headRot = 0f, headTurn = 0f, headY = -3f, nod = 0f, breathe = 0.008f,
                l = lerpArm(under.l, ArmPose(125f, 101f + 3f * sin(lt * 2f), -8f, open = 1f), up),
                r = ArmPose(-6f, -4f, 0f),
                lensBoost = 0.6f,
            )
        }
        RobotAction.CLAP -> {
            val ph = (lt - 0.25f).coerceAtLeast(0f) * 2.6f * TAU
            val close = (1f - cos(ph)) / 2f                 // 0 apart … 1 together
            val ty = 580f + 10f * sin(ph * 0.5f)
            val (s1, e1) = RigSkeleton.ik(mix(360f, 440f, close), ty)
            val arm = ArmPose(s1, e1, mix(-10f, 18f, close), open = 1f)
            under.copy(
                bodyY = -6f * close, headRot = 2f * sin(ph * 0.5f), nod = 0.25f * close, headY = 4f,
                l = arm, r = arm, lensBoost = 0.4f + 0.6f * close,
            )
        }
        RobotAction.THUMBS_UP -> {
            val up = easeOutBack(lt / 0.45f)
            under.copy(
                headRot = 6f, headTurn = 0.12f, nod = 0.2f * max(0f, sin(lt * 6f)),
                r = lerpArm(under.r, ArmPose(20f + 3f * sin(lt * 9f), 138f, 4f, open = 0f, thumb = 1f), up),
                lensBoost = 0.9f,
            )
        }
        RobotAction.SURPRISE -> {
            val j = sin((lt / 0.55f).coerceIn(0f, 1f) * PI.toFloat())
            val k = smooth(lt / 0.12f)
            val arm = ArmPose(mix(-3f, 48f, k), mix(-12f, -40f, k), mix(0f, -14f, k), open = 1f)
            under.copy(
                bodyY = -46f * j, breathe = 0.02f * j, headY = -10f * k, nod = -0.4f * k, headRot = 0f, headTurn = 0f,
                l = arm, r = arm, lensBoost = 1f,
            )
        }
        RobotAction.YAWN -> {
            val st = smooth(lt / 0.9f) * smooth((2.6f - lt) / 0.7f)
            val arm = ArmPose(mix(-3f, 162f, st), mix(-12f, 12f, st), 0f, open = 1f)
            under.copy(
                bodyY = -10f * st, breathe = 0.025f * st, headY = -14f * st, nod = -0.55f * st, headRot = 3f * st,
                l = arm, r = arm, sleep = 0.5f * smooth((lt - 1.6f) / 1.0f),
            )
        }
        RobotAction.DIZZY -> {
            val fade = 1f - smooth((lt - 1.7f) / 0.7f)
            val w = lt * 5.5f
            under.copy(
                bodyRot = 4f * sin(w) * fade, headX = 14f * sin(w) * fade, headY = 8f * cos(w) * fade,
                headTurn = 0.2f * sin(w) * fade, headRot = 9f * cos(w) * fade,
                l = ArmPose(14f + 10f * sin(w * 1.3f), -30f + 14f * sin(w), 0f), r = ArmPose(14f + 10f * sin(w * 1.3f + 2f), -30f + 14f * sin(w + 2f), 0f),
                dizzy = fade,
            )
        }
        else -> under
    }

    private companion object {
        val LOOKS = listOf(0.55f to 0.1f, 0f to 0f, -0.5f to -0.15f, 0f to 0.2f, 0.3f to -0.1f, -0.62f to 0.15f, 0f to 0f, 0.25f to 0.3f)
        fun fr01(x: Float) = x - kotlin.math.floor(x)
    }
}

/** Random-ish playful reactions for a tap on the robot. */
internal val TAP_REACTIONS = listOf(
    RobotAction.HAPPY, RobotAction.WAVE, RobotAction.DANCE, RobotAction.THUMBS_UP, RobotAction.NOD,
    RobotAction.SALUTE, RobotAction.CLAP, RobotAction.BOW, RobotAction.SURPRISE, RobotAction.SHAKE,
)

