package com.codecpos.verify.notification

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

data class EventoCapturado(
    val entidad: String,
    val paquete: String,
    val resumen: String,
    val exitoso: Boolean,
    val error: String? = null,
    val timestamp: Long = System.currentTimeMillis(),
)

/**
 * Historial en memoria (se pierde al cerrar la app) de las últimas
 * notificaciones capturadas — solo para que el usuario pueda ver en la
 * pantalla de estado que el listener SÍ está funcionando, no es un registro
 * permanente ni se envía a ningún lado aparte del monto/entidad ya reportado.
 */
object EventBus {
    private const val MAX_EVENTOS = 40

    private val _eventos = MutableStateFlow<List<EventoCapturado>>(emptyList())
    val eventos = _eventos.asStateFlow()

    private val _listenerConectado = MutableStateFlow(false)
    val listenerConectado = _listenerConectado.asStateFlow()

    fun marcarConectado(conectado: Boolean) {
        _listenerConectado.value = conectado
    }

    fun registrar(evento: EventoCapturado) {
        _eventos.value = (listOf(evento) + _eventos.value).take(MAX_EVENTOS)
    }
}
