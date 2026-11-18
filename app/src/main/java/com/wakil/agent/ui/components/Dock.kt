package com.wakil.agent.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.wakil.agent.ui.theme.Neon

data class DockTab(val label: String, val icon: ImageVector)

/** Floating glass dock with a glowing indicator that slides between tabs. RTL-aware via Modifier.offset. */
@Composable
fun GlassDock(tabs: List<DockTab>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    val view = LocalView.current
    val shape = RoundedCornerShape(30.dp)
    BoxWithConstraints(
        modifier.fillMaxWidth().height(68.dp)
            .glass(shape = shape, border = Neon.softBorder, fill = Color(0xCC0A0F1A), glow = Neon.Cyan.copy(alpha = 0.35f), glowRadius = 10.dp)
            .padding(6.dp)
    ) {
        val itemW = maxWidth / tabs.size
        val x by animateDpAsState(itemW * selected, spring(dampingRatio = 0.72f, stiffness = Spring.StiffnessMediumLow), label = "dockX")
        // indicator
        Box(
            Modifier.offset { IntOffset(x.roundToPx(), 0) }.width(itemW).fillMaxHeight().padding(horizontal = 4.dp)
                .clip(RoundedCornerShape(24.dp))
                .background(Brush.verticalGradient(listOf(Neon.Cyan.copy(alpha = 0.22f), Neon.Violet.copy(alpha = 0.10f))))
                .drawBehind {
                    // glowing bar at the bottom edge of the indicator
                    val bw = size.width * 0.42f
                    val y = size.height - 2.dp.toPx()
                    drawLine(Neon.Cyan.copy(alpha = 0.35f), Offset(center.x - bw / 2, y), Offset(center.x + bw / 2, y), 8.dp.toPx())
                    drawLine(Neon.Cyan, Offset(center.x - bw / 2, y), Offset(center.x + bw / 2, y), 2.5.dp.toPx())
                }
        )
        Row(Modifier.fillMaxSize()) {
            tabs.forEachIndexed { i, t ->
                val on = i == selected
                val scale by animateFloatAsState(if (on) 1.18f else 1f, spring(dampingRatio = 0.4f, stiffness = 600f), label = "dockS")
                val lift by animateDpAsState(if (on) (-2).dp else 0.dp, spring(dampingRatio = 0.5f), label = "dockL")
                val tint by animateColorAsState(if (on) Neon.Cyan else Neon.TextDim, label = "dockT")
                Column(
                    Modifier.weight(1f).fillMaxHeight()
                        .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {
                            if (!on) { haptic(view, HapticKind.TICK); onSelect(i) }
                        },
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center
                ) {
                    Icon(
                        t.icon, t.label, tint = tint,
                        modifier = Modifier.offset { IntOffset(0, lift.roundToPx()) }.size(22.dp).graphicsLayer { scaleX = scale; scaleY = scale }
                    )
                    Spacer(Modifier.height(3.dp))
                    Text(t.label, color = tint, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Clip)
                }
            }
        }
    }
}
