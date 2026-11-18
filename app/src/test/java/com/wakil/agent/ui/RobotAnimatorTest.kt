package com.wakil.agent.ui

import com.wakil.agent.ui.components.ArmPose
import com.wakil.agent.ui.components.RigSkeleton
import com.wakil.agent.ui.components.RobotAction
import com.wakil.agent.ui.components.RobotAnimator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.hypot

class RobotAnimatorTest {
    @Test fun ikReachesTarget() {
        for ((x, y) in listOf(455f to 352f, 470f to 662f, 402f to 700f, 200f to 800f, 300f to 300f)) {
            val (sh, el) = RigSkeleton.ik(x, y)
            val w = RigSkeleton.wrist(ArmPose(sh, el))
            assertTrue("ik($x,$y) -> $w", hypot(w.x - x, w.y - y) < 1.5f)
        }
    }

    @Test fun ikClampsUnreachableTargetAlongDirection() {
        val (sh, el) = RigSkeleton.ik(200f, 900f)   // beyond full reach: arm stretches toward it
        val w = RigSkeleton.wrist(ArmPose(sh, el))
        val reach = RigSkeleton.upperLen + RigSkeleton.foreLen
        assertTrue(hypot(w.x - RigSkeleton.SX, w.y - RigSkeleton.SY) > reach - 3f)
        val ang = { x: Float, y: Float -> kotlin.math.atan2(y - RigSkeleton.SY, x - RigSkeleton.SX) }
        assertTrue(abs(ang(w.x, w.y) - ang(200f, 900f)) < 0.05f)
    }

    @Test fun restPoseWristIsArtWrist() {
        val w = RigSkeleton.wrist(ArmPose(0f, 0f))
        assertEquals(RigSkeleton.WX, w.x, 0.5f); assertEquals(RigSkeleton.WY, w.y, 0.5f)
    }

    @Test fun everyActionStaysFiniteAndBounded() {
        for (a in RobotAction.entries) {
            val anim = RobotAnimator()
            var t = 0f
            while (t < 6f) {
                if (abs(t - 0.5f) < 1e-3f) anim.play(a, t)
                val p = anim.update(t)
                for (v in listOf(p.l.sh, p.l.el, p.r.sh, p.r.el, p.headTurn, p.headRot, p.bodyY, p.nod)) assertTrue("$a t=$t $p", v.isFinite())
                assertTrue(p.headTurn in -1f..1f)
                assertTrue("$a sh=${p.r.sh}", p.l.sh in -181f..181f && p.r.sh in -181f..181f)
                t += 1f / 60f
            }
        }
    }

    @Test fun oneShotEndsAndHandsBackToBase() {
        val anim = RobotAnimator()
        anim.setBase(RobotAction.THINK, 0f)
        anim.play(RobotAction.WAVE, 1f)
        var t = 1f
        while (t < 1f + anim.duration(RobotAction.WAVE) + 0.1f) { anim.update(t); t += 1f / 60f }
        assertNull(anim.playing)
        assertEquals(RobotAction.THINK, anim.base)
        // thinking pose: screen-left fist up at the chin
        val p = anim.update(t + 1f)
        assertTrue(p.l.fist > 0.9f)
    }

    @Test fun gazeFollowsTap() {
        val anim = RobotAnimator()
        var t = 0f
        anim.lookAt(0.6f, 0f, 0f)
        var p = anim.update(0f)
        while (t < 1f) { p = anim.update(t); t += 1f / 60f }
        assertTrue("turn=${p.headTurn}", p.headTurn > 0.5f)
    }
}
