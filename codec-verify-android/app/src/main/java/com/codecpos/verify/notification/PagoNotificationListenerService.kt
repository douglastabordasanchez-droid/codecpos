package com.codecpos.verify.notification

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.codecpos.verify.data.Prefs
import com.codecpos.verify.data.SupabaseApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Reemplazo nativo de MacroDroid: escucha TODAS las notificaciones del
 * sistema (requiere el permiso especial "Acceso a notificaciones", se activa
 * a mano en Ajustes — no hay diálogo de permiso normal para esto) y, para
 * las que vienen de un paquete habilitado, reenvía el texto crudo al mismo
 * RPC de Supabase que ya usa MacroDroid hoy.
 *
 * A propósito NO intenta parsear el monto aquí — esa lógica ya vive,
 * probada y corregida, en Postgres (registrar_pago_automatico). Duplicarla
 * en Kotlin sería mantener el mismo regex en dos lugares. Si ese regex no
 * logra extraer un monto, se intenta UNA vez más con la Edge Function
 * `interpretar-pago-ia` (IA como respaldo, no como método principal).
 */
class PagoNotificationListenerService : NotificationListenerService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var prefs: Prefs
    private val api = SupabaseApi()

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(applicationContext)
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        EventBus.marcarConectado(true)
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        EventBus.marcarConectado(false)
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        super.onNotificationPosted(sbn)
        if (sbn.packageName == packageName) return // ignorar nuestras propias notificaciones

        val paquete = sbn.packageName
        val entidad = resolverEntidad(paquete)

        if (prefs.modoAprendizaje) {
            // Modo diagnóstico: solo registra qué llegó, no envía nada al backend.
            // Sirve para descubrir el paquete real de una app bancaria sin
            // adivinar — luego el usuario lo habilita desde Ajustes.
            val texto = extraerTexto(sbn.notification)
            EventBus.registrar(
                EventoCapturado(
                    entidad = entidad ?: "(desconocido)",
                    paquete = paquete,
                    resumen = "[modo aprendizaje] $paquete: ${texto.take(120)}",
                    exitoso = false,
                )
            )
            return
        }

        if (entidad == null) return // paquete no habilitado, ignorar
        if (entidad !in prefs.entidadesHabilitadas) return

        val texto = extraerTexto(sbn.notification)
        if (texto.isBlank()) return

        val webhookToken = prefs.webhookToken
        if (webhookToken.isNullOrBlank()) return // app aún no emparejada

        scope.launch {
            val resultado = api.registrarPagoAutomatico(webhookToken, texto, entidad)
            if (resultado.isSuccess) {
                EventBus.registrar(EventoCapturado(entidad, paquete, texto.take(160), exitoso = true))
                return@launch
            }

            val mensaje = resultado.exceptionOrNull()?.message.orEmpty()
            // Solo se recurre a la IA cuando el regex falló por no poder EXTRAER
            // un monto — nunca cuando rechazó a propósito (transacción saliente,
            // token inválido), esos casos no deben insistirse con otro intento.
            if (!mensaje.contains("No se pudo extraer el monto")) {
                EventBus.registrar(EventoCapturado(entidad, paquete, texto.take(160), exitoso = false, error = mensaje))
                return@launch
            }

            val resultadoIA = api.interpretarConIA(webhookToken, texto, entidad)
            val exitoIA = resultadoIA.getOrDefault(false)
            EventBus.registrar(
                EventoCapturado(
                    entidad = entidad,
                    paquete = paquete,
                    resumen = if (exitoIA) "[IA] ${texto.take(150)}" else texto.take(160),
                    exitoso = exitoIA,
                    error = if (exitoIA) null else (resultadoIA.exceptionOrNull()?.message ?: "El regex y la IA no lograron leer el monto"),
                )
            )
        }
    }

    private fun resolverEntidad(paquete: String): String? =
        prefs.paquetesPorEntidad.entries.firstOrNull { (_, paquetes) -> paquete in paquetes }?.key

    private fun extraerTexto(notification: Notification): String {
        val extras = notification.extras
        val titulo = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val texto = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
        val textoGrande = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString().orEmpty()
        // El regex en Postgres busca palabras clave dentro de los primeros ~80
        // caracteres tras ellas — mandamos título + el texto más completo que
        // haya disponible (BigText normalmente incluye más detalle que Text).
        val cuerpo = textoGrande.ifBlank { texto }
        return listOf(titulo, cuerpo).filter { it.isNotBlank() }.joinToString(" — ")
    }
}
