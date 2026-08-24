package com.codecpos.verify.notification

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat

object PermissionsHelper {

    /** El acceso a notificaciones no tiene diálogo estándar — solo se activa
     * a mano en una pantalla de Ajustes del sistema. */
    fun tieneAccesoNotificaciones(context: Context): Boolean =
        NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)

    fun intentAccesoNotificaciones(): Intent =
        Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)

    fun tieneExencionBateria(context: Context): Boolean {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    fun intentExencionBateria(context: Context): Intent =
        Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = android.net.Uri.parse("package:${context.packageName}")
        }

    /** POST_NOTIFICATIONS solo existe como permiso runtime desde Android 13 (API 33). */
    fun requierePermisoNotificacionesRuntime(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
}
