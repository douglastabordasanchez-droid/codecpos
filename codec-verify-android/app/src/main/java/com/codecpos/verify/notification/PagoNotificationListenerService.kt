package com.codecpos.verify.notification

import android.app.Notification
import android.content.ComponentName
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.codecpos.verify.BuildConfig
import com.codecpos.verify.data.Prefs
import com.codecpos.verify.data.SupabaseApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.IOException

/**
 * Reemplazo nativo de MacroDroid: escucha TODAS las notificaciones del
 * sistema (requiere el permiso especial "Acceso a notificaciones", se activa
 * a mano en Ajustes — no hay diálogo de permiso normal para esto) y, para
 * las que vienen de un paquete habilitado, reenvía el texto crudo al mismo
 * RPC de Supabase que ya usa MacroDroid hoy.
 *
 * Solo envía avisos con Codec Verify encendido en el POS y que ClasificadorAviso
 * reconoce como dinero RECIBIDO; los pagos y envíos del propio negocio no salen
 * del celular. El monto lo lee Postgres (registrar_pago_automatico), que vuelve
 * a clasificar el aviso. Si ese regex no logra extraer un monto, se intenta UNA
 * vez más con la Edge Function `interpretar-pago-ia` (IA como respaldo).
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
        // Android a veces desconecta el lector (actualización de la app, ahorro de batería):
        // se pide reconectar enseguida para no perder pagos.
        pedirReconexion(applicationContext)
    }

    /** Avisos ya procesados (clave de la notificación + texto) para no registrar dos veces el mismo pago. */
    private val vistos = object : LinkedHashMap<String, Long>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Long>?) = size > 200
    }

    /** El mismo aviso re-publicado en menos de 20 s (algunas apps lo hacen al agruparlo) no es un pago nuevo. */
    private val ultimosTextos = HashMap<String, Long>()
    private fun vistoHaceSegundos(clave: String): Boolean = synchronized(ultimosTextos) {
        val ahora = System.currentTimeMillis()
        ultimosTextos.entries.removeAll { ahora - it.value > 60_000 }
        val antes = ultimosTextos.put(clave, ahora)
        antes != null && ahora - antes < 20_000
    }

    private fun yaVisto(clave: String): Boolean = synchronized(vistos) {
        val ahora = System.currentTimeMillis()
        val antes = vistos[clave]
        vistos[clave] = ahora
        antes != null && ahora - antes < 10 * 60_000
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        super.onNotificationPosted(sbn)
        if (sbn.packageName == packageName) return // ignorar nuestras propias notificaciones

        // 1) Interruptor del negocio: con Codec Verify apagado en el POS el aviso se descarta
        //    aquí mismo, sin leerlo, guardarlo ni enviarlo.
        val webhookToken = prefs.webhookToken
        if (webhookToken.isNullOrBlank()) return // app aún no emparejada
        if (!prefs.codecVerifyActivo && estadoReciente()) return

        // El resumen de un grupo repite lo que ya trae cada notificación individual.
        if (sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

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

        val texto = extraerTexto(sbn.notification)
        if (texto.isBlank()) return
        val habilitadas = prefs.entidadesHabilitadas

        // 2) ¿Entró dinero? Solo un aviso RECIBIDO puede volverse pago; lo que el propio negocio
        //    paga o envía, las solicitudes, promociones y códigos no salen del celular.
        val clase = ClasificadorAviso.clasificar(texto)

        // El método de pago lo dice el contenido: un aviso de Bre-B es Bre-B aunque llegue por la app de
        // Bancolombia, Nu, Davivienda o cualquier otro banco.
        // SMS del banco: DaviPlata avisa en su app "Recibiste Plata..." SIN valor y el valor llega por SMS
        // (código 85888). Solo cuentan SMS de códigos cortos o contactos con nombre de banco.
        val esSms = paquete in Prefs.APPS_SMS
        val entidadSms = if (esSms) ClasificadorAviso.entidadDeSms(remitente(sbn.notification), texto) else null
        if (esSms && (entidadSms == null || clase.clase != ClasificadorAviso.Clase.RECIBIDO)) return

        val entidadFinal = when {
            esSms -> if (entidadSms in habilitadas || entidadSms == "sms_banco") entidadSms!! else return
            "bre_b" in habilitadas && esAvisoBreB(texto) && paquete !in Prefs.APPS_EXCLUIDAS &&
                (entidad != null || clase.clase == ClasificadorAviso.Clase.RECIBIDO) -> "bre_b"
            entidad != null -> if (entidad in habilitadas) entidad else return
            // Cualquier otra app (banco o billetera fuera de la lista) que avise que ENTRÓ dinero:
            // puede ser el pago de un cliente. Debe ser una entrada y hablar de dinero.
            Prefs.OTROS_BANCOS in habilitadas && paquete !in Prefs.APPS_EXCLUIDAS &&
                clase.clase == ClasificadorAviso.Clase.RECIBIDO && ClasificadorAviso.hablaDeDinero(texto) -> Prefs.OTROS_BANCOS
            else -> return
        }
        // De qué app vino (para saber en Codec POS qué banco fue): "Lulo Bank | Recibiste $20.000".
        val textoFinal = if (entidadFinal == Prefs.OTROS_BANCOS) "${nombreApp(paquete)} | $texto" else texto

        // Las apps de los bancos actualizan la misma notificación varias veces: un solo registro por aviso.
        // La hora del aviso distingue un pago nuevo de una actualización: Nequi publica cada
        // "Te enviaron $50" con el mismo identificador y el mismo texto, y antes un segundo
        // pago igual dentro de 10 minutos se tomaba como repetido y no se leía.
        val horaAviso = sbn.notification.`when`.takeIf { it > 0 } ?: sbn.postTime
        val republicado = vistoHaceSegundos("${sbn.key}|$textoFinal")
        if (yaVisto("${sbn.key}|$horaAviso|$textoFinal") || republicado) return

        scope.launch {
            val entidad = entidadFinal
            if (!confirmarActivo(webhookToken)) return@launch
            val monto = ClasificadorAviso.montoVisible(textoFinal)

            if (clase.clase != ClasificadorAviso.Clase.RECIBIDO) {
                // Solo queda en el registro de este celular: el texto no se envía a ningún lado.
                anotar(entidad, paquete, textoFinal, clase, monto, "IGNORADO", exitoso = false, error = "${clase.clase.etiqueta}: ${clase.motivo}")
                return@launch
            }

            // Entrada sin valor (DaviPlata): el pago se registra con el SMS del banco que trae el valor.
            if (!ClasificadorAviso.tieneValor(textoFinal)) {
                anotar(entidad, paquete, textoFinal, clase, monto, "ESPERANDO SMS", exitoso = false, error = "El aviso no trae el valor; se registra con el SMS del banco")
                // Este aviso llega antes que el SMS: la venta que espera el pago lo muestra al instante
                // para que el cajero pueda confirmarlo sin esperar el valor.
                AlertaPagos.alertarEntradaSinValor(applicationContext, entidad, textoFinal)
                api.registrarEvento(webhookToken, entidad, "sin_valor", "Entró dinero; el valor llega por SMS", textoFinal)
                return@launch
            }

            // El mismo pago avisado por la app y por SMS: solo se registra una vez.
            val valor = ClasificadorAviso.valorEnPesos(textoFinal)
            if (valor != null && yaRegistradoPorOtraVia(valor, esSms)) {
                anotar(entidad, paquete, textoFinal, clase, monto, "DUPLICADO", exitoso = false, error = "Ese pago ya se registró por ${if (esSms) "la app del banco" else "SMS"}")
                return@launch
            }

            // Sin internet se reintenta (3 s, 10 s y 30 s) antes de darlo por perdido.
            var resultado = api.registrarPagoAutomatico(webhookToken, textoFinal, entidad)
            for (espera in longArrayOf(3_000, 10_000, 30_000)) {
                if (resultado.isSuccess || resultado.exceptionOrNull() !is IOException || resultado.exceptionOrNull()?.message?.contains("HTTP") == true) break
                delay(espera)
                resultado = api.registrarPagoAutomatico(webhookToken, textoFinal, entidad)
            }
            if (resultado.isSuccess) {
                if (valor != null) recordarRegistro(valor, esSms)
                anotar(entidad, paquete, textoFinal, clase, monto, "RECIBIDO", exitoso = true)
                AlertaPagos.alertarDesdeLector(applicationContext, entidad, textoFinal)
                return@launch
            }

            val mensaje = resultado.exceptionOrNull()?.message.orEmpty()
            // Lo apagaron en el POS mientras llegaba el aviso: no se anota nada.
            if (mensaje.contains("apagado")) {
                prefs.codecVerifyActivo = false
                return@launch
            }
            // Solo se recurre a la IA cuando el regex falló por no poder EXTRAER
            // un monto — nunca cuando rechazó a propósito (no es dinero recibido,
            // token inválido), esos casos no deben insistirse con otro intento.
            if (!mensaje.contains("No se pudo extraer el monto")) {
                val ignorado = mensaje.contains("saliente") || mensaje.contains("No es un pago recibido")
                anotar(entidad, paquete, textoFinal, clase, monto, if (ignorado) "IGNORADO" else "ERROR", exitoso = false, error = mensaje)
                api.registrarEvento(webhookToken, entidad, if (ignorado) "ignorado" else "error", mensaje.take(200), textoFinal)
                return@launch
            }

            val resultadoIA = api.interpretarConIA(webhookToken, textoFinal, entidad)
            val exitoIA = resultadoIA.getOrDefault(false)
            if (exitoIA) AlertaPagos.alertarDesdeLector(applicationContext, entidad, textoFinal)
            else api.registrarEvento(webhookToken, entidad, "no_leido", "No se encontró el monto en el aviso", textoFinal)
            anotar(
                entidad, paquete, textoFinal, clase, monto,
                if (exitoIA) "RECIBIDO (IA)" else "SIN MONTO",
                exitoso = exitoIA,
                error = if (exitoIA) null else (resultadoIA.exceptionOrNull()?.message ?: "El regex y la IA no lograron leer el monto"),
            )
        }
    }

    /** Pagos registrados hace poco: valor, si llegó por SMS y cuándo (para no duplicar app + SMS). */
    private val registrosRecientes = ArrayDeque<Triple<Long, Boolean, Long>>()

    private fun yaRegistradoPorOtraVia(valor: Long, esSms: Boolean): Boolean = synchronized(registrosRecientes) {
        val limite = System.currentTimeMillis() - 3 * 60_000
        registrosRecientes.removeAll { it.third < limite }
        val previo = registrosRecientes.firstOrNull { it.first == valor && it.second != esSms } ?: return false
        registrosRecientes.remove(previo) // un SMS cubre un solo aviso de la app (dos pagos iguales seguidos sí cuentan)
        true
    }

    private fun recordarRegistro(valor: Long, esSms: Boolean) = synchronized(registrosRecientes) {
        registrosRecientes.addLast(Triple(valor, esSms, System.currentTimeMillis()))
        while (registrosRecientes.size > 30) registrosRecientes.removeFirst()
    }

    /** Nombre visible de la app ("Lulo Bank"); si Android no lo deja ver, el paquete. */
    private fun nombreApp(paquete: String): String = try {
        packageManager.getApplicationLabel(packageManager.getApplicationInfo(paquete, 0)).toString()
    } catch (_: Exception) {
        paquete
    }

    /** Remitente del SMS: el título de la notificación ("85888" o el nombre del contacto). */
    private fun remitente(notification: Notification): String =
        notification.extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)?.toString()
            ?: notification.extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()

    /** El estado del interruptor se considera al día durante 2 minutos. */
    private fun estadoReciente(): Boolean =
        System.currentTimeMillis() - prefs.codecVerifyActivoConsultadoEn < 2 * 60_000

    /** ¿Codec Verify sigue encendido en el POS? Pregunta al servidor si lo último que se sabe es viejo. */
    private suspend fun confirmarActivo(webhookToken: String): Boolean {
        if (estadoReciente()) return prefs.codecVerifyActivo
        val activo = api.codecVerifyActivo(webhookToken) ?: return prefs.codecVerifyActivo // sin internet: lo último conocido
        prefs.codecVerifyActivo = activo
        return activo
    }

    /**
     * Registro de lo que leyó el lector: pantalla de estado de la app y, en las versiones de
     * desarrollo, Logcat con el texto completo (APP, hora, clasificación, valor y resultado)
     * para ajustar los patrones con avisos reales.
     */
    private fun anotar(
        entidad: String,
        paquete: String,
        texto: String,
        clase: ClasificadorAviso.Resultado,
        monto: String?,
        resultado: String,
        exitoso: Boolean,
        error: String? = null,
    ) {
        val resumen = listOfNotNull(resultado, monto, texto.take(140)).joinToString(" · ")
        EventBus.registrar(EventoCapturado(entidad, paquete, resumen, exitoso = exitoso, error = error))
        if (BuildConfig.DEBUG) {
            Log.d(
                "CodecVerify",
                "APP=$paquete | FECHA=${java.util.Date()} | CLASIFICACION=${clase.clase.etiqueta} (${clase.motivo}) | " +
                    "VALOR=${monto ?: "-"} | RESULTADO=$resultado | TEXTO=$texto",
            )
        }
    }

    /** El aviso menciona Bre-B (si es dinero recibido lo decide ClasificadorAviso). */
    private fun esAvisoBreB(texto: String): Boolean = Regex("(?i)bre[\\s-]?b\\b").containsMatchIn(texto)

    companion object {
        /** Pide a Android que vuelva a conectar el lector (se llama al abrir la app y si se desconecta). */
        fun pedirReconexion(context: Context) {
            try {
                requestRebind(ComponentName(context, PagoNotificationListenerService::class.java))
            } catch (_: Exception) { /* sin permiso de acceso a notificaciones todavía */ }
        }
    }

    private fun resolverEntidad(paquete: String): String? =
        prefs.paquetesPorEntidad.entries.firstOrNull { (_, paquetes) -> paquete in paquetes }?.key

    private fun extraerTexto(notification: Notification): String {
        val extras = notification.extras
        val titulo = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val texto = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
        val textoGrande = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString().orEmpty()
        // Notificaciones tipo "bandeja" (varias líneas): algunos bancos ponen el monto solo ahí.
        val lineas = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.joinToString(" ") { it.toString() }.orEmpty()
        val subtexto = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString().orEmpty()
        // El regex en Postgres busca palabras clave dentro de los primeros ~80
        // caracteres tras ellas — mandamos título + el texto más completo que
        // haya disponible (BigText normalmente incluye más detalle que Text).
        val cuerpo = textoGrande.ifBlank { texto }.ifBlank { lineas }
        return listOf(titulo, cuerpo, if (cuerpo == lineas) "" else lineas, subtexto)
            .filter { it.isNotBlank() }.distinct().joinToString(" | ")
    }
}
