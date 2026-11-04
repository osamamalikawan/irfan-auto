package pk.irfanautos.salesman.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Brand = Color(0xFF1F4E8C)
val Good = Color(0xFF1B7F3B)
val Warn = Color(0xFFB26A00)
val Bad = Color(0xFFB3261E)

@Composable
fun AppTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(primary = Brand, onPrimary = Color.White, error = Bad),
        content = content,
    )
}
