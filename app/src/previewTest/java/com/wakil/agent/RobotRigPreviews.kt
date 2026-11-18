package com.wakil.agent

import android.graphics.Bitmap
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Canvas
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.drawscope.CanvasDrawScope
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.test.core.app.ApplicationProvider
import com.wakil.agent.ui.components.RigImages
import com.wakil.agent.ui.components.RobotAction
import com.wakil.agent.ui.components.RobotAnimator
import com.wakil.agent.ui.components.drawRigRobot
import com.wakil.agent.ui.components.loadRigImages
import com.wakil.agent.ui.theme.Neon
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import kotlin.math.min

/**
 * v1.4 rig previews: each robot action rendered at several clock times (out/v1.4-previews/30-action-*.png),
 * plus the demo-video frame dump (720x1280 @30fps, -Dwakil.demo.frames=<dir>).
 * Draws with drawRigRobot directly on a bitmap at fixed clock times (no Compose clock involved).
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], application = android.app.Application::class)
class RobotRigPreviews {
    private val ctx get() = ApplicationProvider.getApplicationContext<android.app.Application>()
    private val outDir get() = File(System.getProperty("wakil.previews.dir") ?: "build/previews").apply { mkdirs() }

    private fun frame(img: RigImages, anim: RobotAnimator, t: Float, size: Int, acc: Color = Neon.Cyan, m: Float = 1f, eyes: Float = 1f): Bitmap {
        val ib = ImageBitmap(size, size)
        CanvasDrawScope().draw(Density(3f), LayoutDirection.Ltr, Canvas(ib), Size(size.toFloat(), size.toFloat())) {
            drawRect(Brush.radialGradient(listOf(Color(0xFF0B1730), Color(0xFF03060D)), Offset(size / 2f, size * 0.4f), size * 0.8f))
            drawRigRobot(img, anim.update(t), t, anim.base, acc, m, eyes)
        }
        return ib.asAndroidBitmap()
    }

    private fun strip(name: String, cells: List<Bitmap>, labels: List<String>) {
        val c = cells.first().width
        val out = Bitmap.createBitmap(c * cells.size, c + 34, Bitmap.Config.ARGB_8888)
        val cv = android.graphics.Canvas(out)
        cv.drawColor(0xFF000000.toInt())
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF8AE9FF.toInt(); textSize = 22f; typeface = Typeface.MONOSPACE }
        cells.forEachIndexed { i, b ->
            cv.drawBitmap(b, (i * c).toFloat(), 34f, null)
            cv.drawText(labels[i], i * c + 10f, 25f, p)
        }
        File(outDir, "$name.png").outputStream().use { out.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    /** Runs an animator from 0 to the sample times (dt = 1/60), returns frames at [times] (seconds after the action starts). */
    private fun sampleAction(img: RigImages, a: RobotAction, times: List<Float>, size: Int, setup: (RobotAnimator) -> Unit = {}, acc: Color = Neon.Cyan): List<Bitmap> {
        val anim = RobotAnimator(); setup(anim)
        val t0 = 1.0f
        var t = 0f
        val res = ArrayList<Bitmap>()
        for (target in times) {
            while (t < t0 + target - 1e-4f) { anim.update(t); if (t < t0 && t + 1f / 60f >= t0) { if (a.oneShot) anim.play(a, t0) else anim.setBase(a, t0) }; t += 1f / 60f }
            res += frame(img, anim, t0 + target, size, acc)
        }
        return res
    }

    @Test fun actions() {
        val img = loadRigImages(ctx.resources)
        val sz = 480
        val specs = listOf(
            Triple(RobotAction.NONE, listOf(0.5f, 2.5f, 4.5f, 6.5f, 8.5f), Neon.Cyan),
            Triple(RobotAction.WAVE, listOf(0.15f, 0.45f, 0.8f, 1.1f, 1.5f, 2.3f), Neon.Cyan),
            Triple(RobotAction.POINT, listOf(0.2f, 0.7f, 1.4f, 2.2f), Neon.Cyan),
            Triple(RobotAction.THINK, listOf(0.3f, 0.7f, 1.5f, 2.6f), Neon.Violet),
            Triple(RobotAction.TALK, listOf(0.6f, 1.0f, 1.4f, 1.8f), Neon.Cyan),
            Triple(RobotAction.TYPE, listOf(0.6f, 0.65f, 0.7f, 1.2f), Neon.Amber),
            Triple(RobotAction.NOD, listOf(0.1f, 0.25f, 0.45f, 0.75f), Neon.Cyan),
            Triple(RobotAction.SHAKE, listOf(0.1f, 0.2f, 0.3f, 0.45f), Neon.Red),
            Triple(RobotAction.HAPPY, listOf(0.25f, 0.45f, 0.65f, 1.0f), Neon.Green),
            Triple(RobotAction.CELEBRATE, listOf(0.3f, 0.6f, 0.9f, 1.2f, 1.6f), Neon.Cyan),
            Triple(RobotAction.BOW, listOf(0.3f, 0.7f, 0.95f, 1.5f), Neon.Cyan),
            Triple(RobotAction.DANCE, listOf(0.3f, 0.55f, 0.8f, 1.5f, 2.3f, 2.75f, 3.2f), Neon.Magenta),
            Triple(RobotAction.SALUTE, listOf(0.2f, 0.5f, 1.0f, 1.8f), Neon.Cyan),
            Triple(RobotAction.CLAP, listOf(0.25f, 0.44f, 0.63f, 0.83f), Neon.Cyan),
            Triple(RobotAction.THUMBS_UP, listOf(0.2f, 0.5f, 1.0f, 1.6f), Neon.Green),
            Triple(RobotAction.SURPRISE, listOf(0.08f, 0.25f, 0.5f, 1.0f), Neon.Yellow),
            Triple(RobotAction.YAWN, listOf(0.4f, 1.0f, 1.8f, 2.5f), Neon.Violet),
            Triple(RobotAction.SLEEP, listOf(0.3f, 1.0f, 2.0f, 3.0f), Neon.Violet),
            Triple(RobotAction.DIZZY, listOf(0.2f, 0.5f, 0.9f, 1.4f), Neon.Yellow),
        )
        for ((a, times, acc) in specs) {
            val frames = sampleAction(img, a, times, sz, acc = acc)
            strip("30-action-${a.name.lowercase()}", frames, times.map { "${a.name.lowercase()} t=%.2f".format(it) })
        }
        // pointing at other targets: left-down, right-up, at a button far below
        val pts = listOf(Offset(150f, 1100f), Offset(1000f, 150f), Offset(620f, 2800f), Offset(-100f, 450f))
        strip("30-action-point-targets", pts.map { p -> sampleAction(img, RobotAction.POINT, listOf(1.2f), sz, { it.pointTarget = p }).first() },
            pts.map { "point ${it.x.toInt()},${it.y.toInt()}" })
        // head turns (touch tracking)
        val looks = listOf(-0.9f, -0.6f, -0.36f, 0f, 0.36f, 0.6f, 0.9f)
        strip("31-head-turns", looks.map { d ->
            val anim = RobotAnimator(); var t = 0f
            while (t < 3f) { if (t in 0.5f..0.52f) anim.lookAt(d, 0f, t, 10f); anim.update(t); t += 1f / 60f }
            frame(img, anim, t, 360)
        }, looks.map { "turn $it" })
        // materialize
        strip("32-materialize", listOf(0.15f, 0.4f, 0.65f, 0.9f).map { m -> frame(img, RobotAnimator(), 1f, 400, m = m, eyes = 0f) }, listOf("m .15", "m .4", "m .65", "m .9"))
        // small sizes (header 58dp at xxhdpi ≈ 174 px; permission 180dp ≈ 540)
        strip("33-small-sizes", listOf(120, 174, 240).map { s -> sampleAction(img, RobotAction.THINK, listOf(1f), s).first().let { b -> Bitmap.createScaledBitmap(b, 240, 240, false) } }, listOf("120px", "174px", "240px"))
    }

    // ------------------------------------------------------------------ demo video frames

    private data class Seg(val label: String, val sub: String, val dur: Float, val action: RobotAction, val acc: Color, val sounds: List<Pair<Float, String>>)

    @Test fun demoFrames() {
        val dir = File(System.getProperty("wakil.demo.frames") ?: return).apply { mkdirs() }
        val img = loadRigImages(ctx.resources)
        val fontDir = File(System.getProperty("wakil.fonts.dir") ?: "src/main/res/font")
        val bold = Typeface.createFromFile(File(fontDir, "plex_arabic_bold.ttf"))
        val reg = Typeface.createFromFile(File(fontDir, "plex_arabic_regular.ttf"))
        val mono = Typeface.createFromFile(File(fontDir, "jetbrains_mono_regular.ttf"))
        val v15 = System.getProperty("wakil.demo.set") == "v15"
        val segs = if (v15) listOf(
            Seg("يرقص", "dance", 4.0f, RobotAction.DANCE, Neon.Magenta, listOf(0f to "servo", 0.1f to "celebrate", 2.0f to "servo")),
            Seg("تحيّة", "salute", 2.1f, RobotAction.SALUTE, Neon.Cyan, listOf(0f to "servo", 0.45f to "confirm")),
            Seg("يصفّق", "clap", 2.0f, RobotAction.CLAP, Neon.Cyan, (0 until 5).map { 0.44f + it * 0.385f to "tap" }),
            Seg("ممتاز!", "thumbs up", 1.9f, RobotAction.THUMBS_UP, Neon.Green, listOf(0f to "servo", 0.3f to "granted")),
            Seg("مفاجأة!", "surprise", 1.4f, RobotAction.SURPRISE, Neon.Yellow, listOf(0f to "whoosh")),
            Seg("يتثاءب", "yawn · idle 45s", 2.8f, RobotAction.YAWN, Neon.Violet, listOf(0.1f to "robot_think")),
            Seg("نايم… Zzz", "sleep", 3.2f, RobotAction.SLEEP, Neon.Violet, emptyList()),
            Seg("صحّيته!", "tap to wake", 1.4f, RobotAction.SURPRISE, Neon.Cyan, listOf(0f to "whoosh", 0.1f to "chirp")),
            Seg("دايخ! (هزّ الجوال)", "shake the phone", 2.4f, RobotAction.DIZZY, Neon.Yellow, listOf(0f to "chirp", 0.6f to "chirp")),
        ) else listOf(
            Seg("التجسّد", "materialize", 2.0f, RobotAction.NONE, Neon.Cyan, listOf(0f to "power_on")),
            Seg("يتلفّت وينظر حوله", "look around · touch tracking", 2.8f, RobotAction.NONE, Neon.Cyan, listOf(0.3f to "servo", 1.4f to "servo")),
            Seg("مرحباً، أنا وكيل", "wave", 2.5f, RobotAction.WAVE, Neon.Cyan, listOf(0f to "servo", 0.15f to "voice_welcome")),
            Seg("يشير إلى الزر", "point", 2.3f, RobotAction.POINT, Neon.Cyan, listOf(0f to "servo")),
            Seg("يفكّر", "think", 2.5f, RobotAction.THINK, Neon.Violet, listOf(0.1f to "robot_think")),
            Seg("يتحدّث", "talk", 2.2f, RobotAction.TALK, Neon.Cyan, listOf(0.1f to "robot_talk", 1.1f to "robot_talk")),
            Seg("ينفّذ أداة", "type", 2.0f, RobotAction.TYPE, Neon.Amber, (0 until 14).map { 0.1f + it * 0.13f to "tool_tick" }),
            Seg("نعم", "nod", 1.3f, RobotAction.NOD, Neon.Green, listOf(0.05f to "received")),
            Seg("لا · خطأ", "shake", 1.4f, RobotAction.SHAKE, Neon.Red, listOf(0.05f to "error")),
            Seg("تمّ منح الإذن!", "happy", 1.9f, RobotAction.HAPPY, Neon.Green, listOf(0f to "servo", 0.1f to "granted")),
            Seg("كل شيء جاهز!", "celebrate", 2.8f, RobotAction.CELEBRATE, Neon.Cyan, listOf(0f to "servo", 0.15f to "celebrate")),
            Seg("إلى اللقاء", "bow", 2.0f, RobotAction.BOW, Neon.Cyan, listOf(0f to "servo", 0.9f to "chirp")),
        )
        val W = 720; val H = 1280; val fps = 30
        val anim = RobotAnimator()
        anim.pointTarget = Offset(640f, 2200f)
        val total = segs.sumOf { it.dur.toDouble() }.toFloat()
        val timeline = StringBuilder()
        var start = 0f
        val starts = segs.map { s -> start.also { start += s.dur } }
        segs.forEachIndexed { i, s -> s.sounds.forEach { (dt, snd) -> timeline.append("%.3f %s\n".format(starts[i] + dt, snd)) } }
        File(dir, "sounds.txt").writeText(timeline.toString())
        val n = (total * fps).toInt()
        var seg = -1
        val tb = Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface = bold; textSize = 64f; color = 0xFFE8F4FF.toInt(); textAlign = Paint.Align.CENTER }
        val ts = Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface = mono; textSize = 24f; color = 0xFF8A9BB5.toInt(); textAlign = Paint.Align.CENTER; letterSpacing = 0.08f }
        val th = Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface = mono; textSize = 22f; color = 0x9900E5FF.toInt(); textAlign = Paint.Align.CENTER; letterSpacing = 0.2f }
        val tr = Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface = reg; textSize = 30f; color = 0xFF8A9BB5.toInt(); textAlign = Paint.Align.CENTER }
        val pill = Paint(Paint.ANTI_ALIAS_FLAG)
        for (f in 0 until n) {
            val t = f.toFloat() / fps
            val si = starts.indexOfLast { it <= t + 1e-4f }
            if (si != seg) {
                seg = si
                val s = segs[si]
                if (s.action.oneShot) { anim.setBase(RobotAction.NONE, t); anim.play(s.action, t) } else anim.setBase(s.action, t)
            }
            val lt = t - starts[si]
            if (!v15 && si == 1) { // scripted look-around: left, right, down-centre
                if (f == ((starts[1] + 0.3f) * fps).toInt()) anim.lookAt(-0.62f, 0.1f, t, 1.0f)
                if (f == ((starts[1] + 1.4f) * fps).toInt()) anim.lookAt(0.62f, -0.1f, t, 1.0f)
                if (f == ((starts[1] + 2.4f) * fps).toInt()) anim.lookAt(0f, 0.2f, t, 0.6f)
            }
            val m = if (!v15 && si == 0) min(1f, lt / 1.7f).let { it * it * (3 - 2 * it) } else 1f
            val eyes = if (!v15 && si == 0) ((lt - 1.6f) / 0.4f).coerceIn(0f, 1f) else 1f
            val s = segs[si]
            val pose = anim.update(t)
            val outFile = File(dir, "f%04d.png".format(f))
            if (outFile.length() > 0L) continue   // resume after an OOM-killed run (animator stays deterministic)
            if (f % 120 == 0) System.gc()
            val ib = ImageBitmap(W, H)
            CanvasDrawScope().draw(Density(2f), LayoutDirection.Ltr, Canvas(ib), Size(W.toFloat(), H.toFloat())) {
                drawRect(Brush.verticalGradient(listOf(Color(0xFF040812), Color(0xFF0A1630), Color(0xFF03050B)), 0f, H.toFloat()))
                drawCircle(Brush.radialGradient(listOf(s.acc.copy(alpha = 0.16f), Color.Transparent), Offset(W / 2f, 560f), 520f), 520f, Offset(W / 2f, 560f))
                // faint HUD grid
                var gy = 0f; while (gy < H) { drawLine(Color(0x0F00E5FF), Offset(0f, gy), Offset(W.toFloat(), gy), 1f); gy += 40f }
                var gx = 0f; while (gx < W) { drawLine(Color(0x0A00E5FF), Offset(gx, 0f), Offset(gx, H.toFloat()), 1f); gx += 40f }
                translate(0f, 170f) {
                    val sc = Size(W.toFloat(), W.toFloat())
                    // drawRigRobot uses this.size: draw into a W x W region
                    drawContext.size = sc
                    drawRigRobot(img, pose, t, anim.base, s.acc, m, eyes)
                    drawContext.size = Size(W.toFloat(), H.toFloat())
                }
            }
            val bmp = ib.asAndroidBitmap()
            val cv = android.graphics.Canvas(bmp)
            cv.drawText(if (v15) "W A K I L  ·  v1.5" else "W A K I L  ·  v1.4", W / 2f, 92f, th)
            cv.drawText(if (v15) "حركات جديدة" else "الروبوت المتحرّك", W / 2f, 140f, tr)
            // label pill (fades in at each segment)
            val fade = (lt / 0.25f).coerceIn(0f, 1f)
            val acc = s.acc
            val argb = android.graphics.Color.argb((fade * 60).toInt(), (acc.red * 255).toInt(), (acc.green * 255).toInt(), (acc.blue * 255).toInt())
            pill.color = argb; pill.style = Paint.Style.FILL
            val bw = tb.measureText(s.label) + 90f
            val r = RectF(W / 2f - bw / 2f, 1010f, W / 2f + bw / 2f, 1110f)
            cv.drawRoundRect(r, 50f, 50f, pill)
            pill.style = Paint.Style.STROKE; pill.strokeWidth = 3f
            pill.color = android.graphics.Color.argb((fade * 220).toInt(), (acc.red * 255).toInt(), (acc.green * 255).toInt(), (acc.blue * 255).toInt())
            cv.drawRoundRect(r, 50f, 50f, pill)
            tb.alpha = (fade * 255).toInt(); cv.drawText(s.label, W / 2f, 1083f, tb)
            ts.alpha = (fade * 255).toInt(); cv.drawText(s.sub.uppercase(), W / 2f, 1160f, ts)
            // progress dots
            val dotP = Paint(Paint.ANTI_ALIAS_FLAG)
            for (k in segs.indices) {
                dotP.color = if (k == si) 0xFF00E5FF.toInt() else 0x33FFFFFF
                val x = W / 2f + (k - (segs.size - 1) / 2f) * 26f
                cv.drawCircle(x, 1215f, if (k == si) 7f else 5f, dotP)
            }
            outFile.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
            bmp.recycle()
        }
    }
}
