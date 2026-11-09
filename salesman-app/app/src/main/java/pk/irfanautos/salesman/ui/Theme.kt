package pk.irfanautos.salesman.ui

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

val Navy = Color(0xFF0B2A5B)
val Brand = Color(0xFF1F5FD6)
val BrandSoft = Color(0xFFE4ECFD)
val Teal = Color(0xFF0E9F9A)
val Good = Color(0xFF1B9E5A)
val GoodSoft = Color(0xFFE3F5EB)
val Warn = Color(0xFFD97A00)
val WarnSoft = Color(0xFFFFF1DC)
val Bad = Color(0xFFD64545)
val BadSoft = Color(0xFFFDEAEA)
val Ink = Color(0xFF14213D)
val Muted = Color(0xFF6B7794)
val Line = Color(0xFFE3E8F3)
val Bg = Color(0xFFF3F6FC)

private val AppTypography = Typography(
    headlineMedium = TextStyle(fontWeight = FontWeight.Bold, fontSize = 26.sp, lineHeight = 32.sp),
    headlineSmall = TextStyle(fontWeight = FontWeight.Bold, fontSize = 22.sp, lineHeight = 28.sp),
    titleLarge = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 26.sp),
    titleMedium = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 22.sp),
    titleSmall = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 22.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 16.sp),
    labelLarge = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 14.sp),
    labelMedium = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 12.sp),
)

@Composable
fun AppTheme(content: @Composable () -> Unit) {
    val d = LocalDensity.current
    CompositionLocalProvider(LocalDensity provides Density(d.density, fontScale = minOf(d.fontScale, 1.1f))) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Brand, onPrimary = Color.White, primaryContainer = BrandSoft, onPrimaryContainer = Navy,
            secondary = Teal, background = Bg, onBackground = Ink, surface = Color.White, onSurface = Ink,
            surfaceVariant = Color(0xFFEDF1F9), onSurfaceVariant = Muted, outline = Line, error = Bad,
        ),
        typography = AppTypography,
        shapes = Shapes(small = RoundedCornerShape(10.dp), medium = RoundedCornerShape(16.dp), large = RoundedCornerShape(22.dp)),
        content = content,
    )
    }
}
