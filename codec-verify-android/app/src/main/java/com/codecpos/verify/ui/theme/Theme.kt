package com.codecpos.verify.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val CodecGreen = Color(0xFF10B981)
private val CodecDark = Color(0xFF0F172A)

private val LightColors = lightColorScheme(
    primary = CodecGreen,
    secondary = CodecDark,
)

private val DarkColors = darkColorScheme(
    primary = CodecGreen,
    secondary = Color(0xFF94A3B8),
    background = CodecDark,
    surface = Color(0xFF1E293B),
)

@Composable
fun CodecVerifyTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content,
    )
}
