package com.codecpos.verify.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import com.codecpos.verify.data.Prefs
import com.codecpos.verify.notification.EventBus

/**
 * El emparejamiento con el negocio ya NO pasa por este ViewModel — la PWA
 * (dentro del WebView de MainActivity) hace login normal y le pasa el
 * webhook_token a AndroidNotificationBridge directamente. Este ViewModel
 * solo expone lo que necesita el panel nativo de "Notificaciones automáticas"
 * (permisos, bancos habilitados, actividad reciente).
 */
class CodecVerifyViewModel(application: Application) : AndroidViewModel(application) {

    val prefs: Prefs = Prefs(application.applicationContext)

    val eventos = EventBus.eventos
    val listenerConectado = EventBus.listenerConectado

    fun setEntidadHabilitada(entidad: String, habilitada: Boolean) {
        val actuales = prefs.entidadesHabilitadas.toMutableSet()
        if (habilitada) actuales.add(entidad) else actuales.remove(entidad)
        prefs.entidadesHabilitadas = actuales
    }

    fun setModoAprendizaje(activo: Boolean) {
        prefs.modoAprendizaje = activo
    }
}
