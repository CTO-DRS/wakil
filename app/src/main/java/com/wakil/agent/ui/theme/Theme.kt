package com.wakil.agent.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.sp
import com.wakil.agent.R

/** "Jarvis" HUD palette. [source] labels identity packs merged from the legacy standalone apps. */
data class Palette(val id: String, val name: String, val cyan: Color, val blue: Color, val violet: Color, val magenta: Color, val source: String? = null)

object Palettes {
    val all = listOf(
        Palette("jarvis", "جارفس (أزرق نيون)", Color(0xFF00E5FF), Color(0xFF2F6BFF), Color(0xFF8B5CFF), Color(0xFFE040FB)),
        Palette("gold", "ذهبي", Color(0xFFFFC94D), Color(0xFFFF9F1C), Color(0xFFE8B04B), Color(0xFFFF7A3D)),
        Palette("red", "أحمر آيرن مان", Color(0xFFFF4D5E), Color(0xFFE0262F), Color(0xFFFFB02E), Color(0xFFFF2E93)),
        Palette("green", "أخضر الهاكر", Color(0xFF39FF9C), Color(0xFF13B86B), Color(0xFF00E5FF), Color(0xFFB4FF39)),
        Palette("violet", "بنفسجي", Color(0xFFC77DFF), Color(0xFF7B2CFF), Color(0xFFFF6AD5), Color(0xFF5E9BFF)),
        // هويات المشاريع القديمة المدمجة — ألوان مستخرجة حرفيًا من كود كل مشروع، تُختار من الإعدادات:
        Palette("rafeeq", "رفيق AI (بنفسجي)", Color(0xFF22D3EE), Color(0xFF8B5CF6), Color(0xFF7C3AED), Color(0xFFFF2D8C), "هوية Rafeeq AI المدمجة"),
        Palette("mosaed", "مساعد OS (أزرق)", Color(0xFF22C58B), Color(0xFF4F8CFF), Color(0xFF9FB0CD), Color(0xFFA9C6FF), "هوية مساعد OS المدمجة"),
        Palette("drsai", "DRS AI (أخضر ملكي)", Color(0xFF7FDBA0), Color(0xFF006C35), Color(0xFF0E5E4E), Color(0xFFE6C17F), "هوية DRS AI المدمجة"),
    )
    fun byId(id: String) = all.firstOrNull { it.id == id } ?: all[0]
}

object Neon {
    val Black = Color(0xFF000000)
    val Void = Color(0xFF05070D)
    /** Accent palette, switchable in Settings (الثيم). Read through getters so the UI recomposes on change. */
    var palette by androidx.compose.runtime.mutableStateOf(Palettes.all[0])
    val Cyan: Color get() = palette.cyan
    val Blue: Color get() = palette.blue
    val Violet: Color get() = palette.violet
    val Magenta: Color get() = palette.magenta
    val Amber = Color(0xFFFFAB2E)
    val Yellow = Color(0xFFFFE14D)
    val Red = Color(0xFFFF3D5A)
    val Green = Color(0xFF39FF9C)
    val TermGreen = Color(0xFF7CFFB2)
    val Text = Color(0xFFE8F4FF)
    val TextDim = Color(0xFF8A9BB5)
    val TextFaint = Color(0xFF55627A)
    val Glass = Color(0x14FFFFFF)        // ~8% white
    val GlassStrong = Color(0x22FFFFFF)
    val GlassEdge = Color(0x33FFFFFF)

    val primaryGradient: Brush get() = Brush.linearGradient(listOf(Cyan, Blue, Violet))
    val borderGradient: Brush get() = Brush.linearGradient(listOf(Cyan.copy(alpha = 0.85f), Violet.copy(alpha = 0.55f), Magenta.copy(alpha = 0.8f)))
    val softBorder: Brush get() = Brush.linearGradient(listOf(Color(0x55FFFFFF), Color(0x10FFFFFF), Cyan.copy(alpha = 0.2f)))
}

val PlexArabic = FontFamily(
    Font(R.font.plex_arabic_regular, FontWeight.Normal),
    Font(R.font.plex_arabic_medium, FontWeight.Medium),
    Font(R.font.plex_arabic_semibold, FontWeight.SemiBold),
    Font(R.font.plex_arabic_bold, FontWeight.Bold),
)

val JetMono = FontFamily(
    Font(R.font.jetbrains_mono_regular, FontWeight.Normal),
    Font(R.font.jetbrains_mono_bold, FontWeight.Bold),
)

/** Code/terminal text: always laid out LTR, even for lines that start with Arabic. */
val MonoLtr = TextStyle(fontFamily = JetMono, textDirection = TextDirection.Ltr)

private fun t(size: Int, weight: FontWeight, line: Int = (size * 1.45f).toInt(), ls: Float = 0f) =
    TextStyle(
        fontFamily = PlexArabic, fontSize = size.sp, fontWeight = weight, lineHeight = line.sp, letterSpacing = ls.sp,
        // Each paragraph follows its own first strong character: English/code reads LTR, Arabic RTL.
        textDirection = TextDirection.Content,
    )

private val WakilTypography = Typography(
    displaySmall = t(34, FontWeight.Bold, 44),
    headlineMedium = t(26, FontWeight.Bold, 36),
    headlineSmall = t(22, FontWeight.SemiBold, 32),
    titleLarge = t(20, FontWeight.SemiBold, 28),
    titleMedium = t(16, FontWeight.SemiBold, 24),
    titleSmall = t(14, FontWeight.Medium, 20),
    bodyLarge = t(16, FontWeight.Normal, 25),
    bodyMedium = t(14, FontWeight.Normal, 22),
    bodySmall = t(12, FontWeight.Normal, 18),
    labelLarge = t(14, FontWeight.Medium, 20),
    labelMedium = t(12, FontWeight.Medium, 16),
    labelSmall = t(11, FontWeight.Medium, 15),
)

private val WakilColors = darkColorScheme(
    primary = Neon.Cyan,
    onPrimary = Color(0xFF00141A),
    primaryContainer = Color(0xFF00363F),
    onPrimaryContainer = Neon.Cyan,
    secondary = Neon.Violet,
    onSecondary = Color.White,
    tertiary = Neon.Magenta,
    background = Neon.Black,
    onBackground = Neon.Text,
    surface = Neon.Void,
    onSurface = Neon.Text,
    surfaceVariant = Color(0xFF111827),
    onSurfaceVariant = Neon.TextDim,
    surfaceContainerHigh = Color(0xFF0D1320),
    surfaceContainer = Color(0xFF0A0F1A),
    outline = Color(0xFF2A3A55),
    outlineVariant = Color(0xFF1A2438),
    error = Neon.Red,
    onError = Color.White,
)

@Composable
fun WakilTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = WakilColors, typography = WakilTypography, content = content)
}
