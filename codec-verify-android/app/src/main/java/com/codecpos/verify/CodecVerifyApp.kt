package com.codecpos.verify

import android.app.Application
import android.provider.Settings
import com.codecpos.verify.notification.PagoNotificationListenerService

class CodecVerifyApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // Si el permiso de acceso a notificaciones está dado, se reconecta el lector al abrir la app.
        val habilitados = Settings.Secure.getString(contentResolver, "enabled_notification_listeners").orEmpty()
        if (habilitados.contains(packageName)) PagoNotificationListenerService.pedirReconexion(this)
    }
}
