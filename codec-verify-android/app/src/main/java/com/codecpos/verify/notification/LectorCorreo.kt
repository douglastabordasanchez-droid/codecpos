package com.codecpos.verify.notification

import android.content.Context
import android.text.Html
import android.util.Log
import com.codecpos.verify.data.Prefs
import com.codecpos.verify.data.SupabaseApi
import com.sun.mail.imap.IMAPFolder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.Properties
import javax.mail.AuthenticationFailedException
import javax.mail.FetchProfile
import javax.mail.Folder
import javax.mail.Message
import javax.mail.Multipart
import javax.mail.Part
import javax.mail.Session
import javax.mail.UIDFolder
import javax.mail.internet.InternetAddress

/**
 * Respaldo de las notificaciones: lee el correo del negocio.
 *
 * Muchas veces la app del banco no muestra la notificación (el celular la
 * duerme, el banco la manda tarde o nunca), pero el banco SÍ manda el correo
 * de «Recibiste una transferencia». Cada 45 segundos se revisan por IMAP los
 * correos NUEVOS de la bandeja de entrada (solo lectura: no se marcan como
 * leídos ni se borran) y los de bancos que confirman dinero recibido se
 * registran como un pago, igual que una notificación, para desbloquear la venta
 * que lo espera.
 *
 * Seguridad:
 *  - Solo cuentan correos de bancos y billeteras conocidos (o remitentes que el
 *    negocio agregue) y, cuando el servidor de correo lo informa (Gmail sí),
 *    con la firma del banco verificada (DKIM/DMARC): un correo falso que diga
 *    «Recibiste $500.000» no desbloquea nada.
 *  - Correos de hace más de 20 minutos no cuentan (no deben pagar una venta nueva).
 *  - La clave de aplicación queda cifrada en el celular y no viaja a Codec POS;
 *    al servidor va solo el texto del aviso, como con las notificaciones.
 */
object LectorCorreo {
    private const val TAG = "CodecVerifyCorreo"
    private const val ANTIGUEDAD_MAXIMA_MS = 20 * 60_000L
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val candado = Mutex()
    private val api = SupabaseApi()

    /** Bancos y billeteras de Colombia: se reconocen por el dominio del remitente. */
    private val DOMINIOS_BANCO = listOf(
        "bancolombia", "nequi", "daviplata", "davivienda", "bbva", "nu.com.co", "nubank", "bancodebogota",
        "bancodeoccidente", "bancopopular", "avvillas", "colpatria", "scotiabank", "bancocajasocial",
        "bancoagrario", "itau", "bancofalabella", "lulobank", "movii", "dale.com.co", "bancoomeva",
        "bancamia", "mibanco", "pibank", "bancow", "gnbsudameris", "bancofinandina", "serfinanza",
        "bancocoopcentral", "confiar", "uala", "rappipay", "mercadopago", "bold.co", "wompi", "ach.com.co",
        "redeban", "credibanco", "powwi", "tpaga", "transfiya", "bre-b", "breb",
    )

    /**
     * El dominio es de un banco si una de sus partes es exactamente el nombre del banco
     * («bancolombia.com.co», «an.notificacionesbancolombia.com»). Un dominio parecido
     * como «bancolombia-pagos.com» o «mibancolombia.net» no cuenta.
     */
    fun esDominioBanco(dominio: String): Boolean {
        val d = dominio.lowercase().trim()
        val partes = d.split('.')
        val prefijos = listOf("", "notificaciones", "notificacion", "alertas", "alertasynotificaciones", "info", "mail", "correo")
        return DOMINIOS_BANCO.any { banco ->
            if (banco.contains('.')) d == banco || d.endsWith(".$banco")
            else partes.any { parte -> prefijos.any { pre -> parte == pre + banco } }
        }
    }

    /**
     * DMARC aprobado, o firma DKIM aprobada DEL MISMO dominio del remitente (una firma válida
     * de otro dominio no prueba que el correo venga del banco).
     */
    fun firmaDelRemitente(autenticacion: String, dominio: String): Boolean {
        val a = autenticacion.lowercase()
        if (Regex("dmarc=pass").containsMatchIn(a)) return true
        return Regex("dkim=pass[^;]*?header\\.(?:i|d)=@?([a-z0-9.-]+)").findAll(a).any { r ->
            val firmado = r.groupValues[1].trimEnd('.')
            dominio == firmado || dominio.endsWith(".$firmado") || firmado.endsWith(".$dominio")
        }
    }

    fun servidorPara(correo: String): String {
        val dominio = correo.substringAfter('@').lowercase().trim()
        return when {
            dominio in setOf("gmail.com", "googlemail.com") -> "imap.gmail.com"
            dominio.startsWith("outlook.") || dominio.startsWith("hotmail.") || dominio.startsWith("live.") -> "outlook.office365.com"
            dominio.startsWith("yahoo.") -> "imap.mail.yahoo.com"
            dominio in setOf("icloud.com", "me.com", "mac.com") -> "imap.mail.me.com"
            else -> "imap.$dominio"
        }
    }

    /** Revisión inmediata (al guardar el correo o al abrir la app). */
    fun revisarAhora(context: Context) {
        scope.launch { revisar(context.applicationContext) }
    }

    /** Revisa los correos nuevos. La llama el guardián cada 45 segundos. */
    suspend fun revisar(context: Context) = candado.withLock {
        val prefs = try { Prefs(context) } catch (_: Exception) { return@withLock }
        val token = prefs.webhookToken
        val usuario = prefs.correoUsuario
        val clave = prefs.correoClave
        if (!prefs.correoActivo || token.isNullOrBlank() || usuario.isNullOrBlank() || clave.isNullOrBlank()) return@withLock
        val servidor = prefs.correoServidor?.takeIf { it.isNotBlank() } ?: servidorPara(usuario)

        val props = Properties().apply {
            put("mail.store.protocol", "imaps")
            put("mail.imaps.host", servidor)
            put("mail.imaps.port", "993")
            put("mail.imaps.ssl.enable", "true")
            put("mail.imaps.ssl.checkserveridentity", "true")
            put("mail.imaps.connectiontimeout", "15000")
            put("mail.imaps.timeout", "20000")
        }
        try {
            val store = Session.getInstance(props).getStore("imaps")
            store.connect(servidor, 993, usuario, clave.replace(" ", ""))
            try {
                val bandeja = store.getFolder("INBOX") as IMAPFolder
                bandeja.open(Folder.READ_ONLY)
                try {
                    procesarBandeja(context, prefs, token, bandeja)
                } finally {
                    bandeja.close(false)
                }
            } finally {
                store.close()
            }
            prefs.correoUltimaRevision = System.currentTimeMillis()
            prefs.correoUltimoError = null
        } catch (e: AuthenticationFailedException) {
            prefs.correoUltimoError = "El correo o la clave de aplicación no son correctos"
            Log.w(TAG, "Autenticación: ${e.message}")
        } catch (e: Exception) {
            prefs.correoUltimoError = "No se pudo conectar al correo: ${e.message?.take(120) ?: e.javaClass.simpleName}"
            Log.w(TAG, "Error: ${e.message}")
        }
    }

    private suspend fun procesarBandeja(context: Context, prefs: Prefs, token: String, bandeja: IMAPFolder) {
        val validez = bandeja.uidValidity
        val siguiente = bandeja.uidNext
        // Primera vez (o el buzón cambió): se empieza desde ahora, sin leer correos viejos.
        if (prefs.correoUidValidity != validez || prefs.correoUltimoUid <= 0L) {
            prefs.correoUidValidity = validez
            prefs.correoUltimoUid = (siguiente - 1).coerceAtLeast(1)
            return
        }
        val ultimo = prefs.correoUltimoUid
        if (siguiente in 1..ultimo + 1) return // nada nuevo

        val mensajes = bandeja.getMessagesByUID(ultimo + 1, UIDFolder.LASTUID)
            .filter { bandeja.getUID(it) > ultimo }
            .takeLast(30)
        if (mensajes.isEmpty()) return
        bandeja.fetch(mensajes.toTypedArray(), FetchProfile().apply {
            add(FetchProfile.Item.ENVELOPE)
            add(UIDFolder.FetchProfileItem.UID)
            add("Authentication-Results")
        })

        var mayor = ultimo
        for (m in mensajes) {
            val uid = bandeja.getUID(m)
            try {
                procesarCorreo(context, prefs, token, m)
            } catch (e: Exception) {
                Log.w(TAG, "Correo $uid: ${e.message}")
            }
            if (uid > mayor) mayor = uid
            prefs.correoUltimoUid = mayor
        }
    }

    private suspend fun procesarCorreo(context: Context, prefs: Prefs, token: String, m: Message) {
        val remitente = (m.from?.firstOrNull() as? InternetAddress)?.address?.lowercase().orEmpty()
        val dominio = remitente.substringAfter('@')
        val extra = prefs.correoRemitentesExtra.split(',', ';', ' ').map { it.trim().lowercase() }.filter { it.isNotBlank() }
        val esBanco = esDominioBanco(dominio)
        val esExtra = extra.any { remitente == it || dominio == it.removePrefix("@") || dominio.endsWith("." + it.removePrefix("@")) }
        if (!esBanco && !esExtra) return

        val hora = (m.receivedDate ?: m.sentDate)?.time ?: System.currentTimeMillis()
        if (System.currentTimeMillis() - hora > ANTIGUEDAD_MAXIMA_MS) return

        // Firma del banco: Gmail anota si el correo de verdad viene de ese dominio.
        val autenticacion = m.getHeader("Authentication-Results")?.joinToString(" ")?.lowercase()
        if (autenticacion != null && !firmaDelRemitente(autenticacion, dominio)) {
            EventBus.registrar(EventoCapturado("correo", remitente, "IGNORADO · correo sin firma verificada de $dominio", exitoso = false))
            return
        }

        val asunto = m.subject.orEmpty()
        val cuerpo = textoDelCorreo(m)
        val texto = recortarAviso(asunto, cuerpo)
        val clase = ClasificadorAviso.clasificar(texto)
        val nombreBanco = nombreBanco(dominio)
        val textoFinal = "Correo $nombreBanco | $texto"
        val monto = ClasificadorAviso.montoVisible(textoFinal)

        if (clase.clase != ClasificadorAviso.Clase.RECIBIDO || !ClasificadorAviso.hablaDeDinero(texto)) {
            anotar(remitente, textoFinal, monto, "IGNORADO", false, "${clase.clase.etiqueta}: ${clase.motivo}")
            return
        }
        if (!ClasificadorAviso.tieneValor(texto)) {
            anotar(remitente, textoFinal, monto, "SIN VALOR", false, "El correo no trae el valor")
            return
        }

        val habilitadas = prefs.entidadesHabilitadas
        val propia = entidadDe(dominio, texto)
        val entidad = when {
            propia in habilitadas -> propia
            Prefs.OTROS_BANCOS in habilitadas -> Prefs.OTROS_BANCOS
            else -> return
        }
        if (!confirmarActivo(prefs, token)) return

        val valor = ClasificadorAviso.valorEnPesos(texto)
        if (valor != null && PagosRecientes.yaRegistradoPorOtraVia(valor, PagosRecientes.Via.CORREO)) {
            anotar(remitente, textoFinal, monto, "DUPLICADO", false, "Ese pago ya llegó por la notificación o el SMS")
            return
        }

        val resultado = api.registrarPagoAutomatico(token, textoFinal, entidad, origen = "correo")
        if (resultado.isSuccess) {
            if (valor != null) PagosRecientes.recordar(valor, PagosRecientes.Via.CORREO)
            prefs.correoUltimoPago = "${monto ?: ""} · $nombreBanco · ${java.text.SimpleDateFormat("h:mm a", java.util.Locale("es", "CO")).format(java.util.Date())}"
            anotar(remitente, textoFinal, monto, "RECIBIDO (correo)", true)
            AlertaPagos.alertarDesdeLector(context, entidad, textoFinal)
            return
        }
        val mensaje = resultado.exceptionOrNull()?.message.orEmpty()
        if (mensaje.contains("apagado")) { prefs.codecVerifyActivo = false; return }
        if (mensaje.contains("No se pudo extraer el monto")) {
            val ia = api.interpretarConIA(token, textoFinal, entidad).getOrDefault(false)
            if (ia) {
                if (valor != null) PagosRecientes.recordar(valor, PagosRecientes.Via.CORREO)
                AlertaPagos.alertarDesdeLector(context, entidad, textoFinal)
            }
            anotar(remitente, textoFinal, monto, if (ia) "RECIBIDO (correo, IA)" else "SIN MONTO", ia)
            return
        }
        anotar(remitente, textoFinal, monto, "ERROR", false, mensaje)
        api.registrarEvento(token, entidad, "error", "Correo: ${mensaje.take(180)}", textoFinal)
    }

    private suspend fun confirmarActivo(prefs: Prefs, token: String): Boolean {
        if (System.currentTimeMillis() - prefs.codecVerifyActivoConsultadoEn < 2 * 60_000) return prefs.codecVerifyActivo
        val activo = api.codecVerifyActivo(token) ?: return prefs.codecVerifyActivo
        prefs.codecVerifyActivo = activo
        return activo
    }

    private fun entidadDe(dominio: String, texto: String): String = when {
        Regex("(?i)bre[\\s-]?b\\b").containsMatchIn(texto) -> "bre_b"
        dominio.contains("nequi") -> "nequi"
        dominio.contains("daviplata") -> "daviplata"
        dominio.contains("davivienda") -> "davivienda"
        dominio.contains("bancolombia") -> "bancolombia"
        else -> Prefs.OTROS_BANCOS
    }

    private fun nombreBanco(dominio: String): String {
        val base = dominio.split('.').firstOrNull { it.length > 2 && it !in setOf("www", "mail", "an", "info", "notificaciones", "alertas", "co", "com") }
            ?: dominio
        return base.replace("notificaciones", "").replace("alertas", "").ifBlank { dominio }.replaceFirstChar { it.uppercase() }
    }

    /** Texto plano del correo (si solo trae HTML, se le quitan las etiquetas). */
    private fun textoDelCorreo(parte: Part): String {
        var plano: String? = null
        var html: String? = null
        fun recorrer(p: Part, nivel: Int) {
            if (nivel > 6) return
            when {
                p.isMimeType("text/plain") && plano == null -> plano = p.content as? String
                p.isMimeType("text/html") && html == null -> html = p.content as? String
                p.isMimeType("multipart/*") -> {
                    val mp = p.content as? Multipart ?: return
                    for (i in 0 until mp.count) recorrer(mp.getBodyPart(i), nivel + 1)
                }
            }
        }
        recorrer(parte, 0)
        val desdeHtml = html?.let {
            val limpio = it.replace(Regex("(?is)<(style|script|head)[^>]*>.*?</\\1>"), " ")
            Html.fromHtml(limpio, Html.FROM_HTML_MODE_LEGACY).toString()
        }
        return (plano?.takeIf { it.isNotBlank() } ?: desdeHtml.orEmpty())
            .replace(' ', ' ').replace(Regex("[\\s\\u200B\\uFFFC]+"), " ").trim()
    }

    /**
     * Asunto + el trozo del correo alrededor del primer valor en pesos: los correos traen
     * saludos, publicidad y textos legales que confundirían al clasificador.
     */
    fun recortarAviso(asunto: String, cuerpo: String): String {
        val i = Regex("(?:\\$|COP)\\s?\\d").find(cuerpo)?.range?.first
        val trozo = if (i == null) cuerpo.take(300) else cuerpo.substring((i - 180).coerceAtLeast(0), (i + 140).coerceAtMost(cuerpo.length))
        return listOf(asunto.trim(), trozo.trim()).filter { it.isNotBlank() }.distinct().joinToString(" | ")
    }

    private fun anotar(remitente: String, texto: String, monto: String?, resultado: String, exitoso: Boolean, error: String? = null) {
        val resumen = listOfNotNull(resultado, monto, texto.take(140)).joinToString(" · ")
        EventBus.registrar(EventoCapturado("correo", remitente, resumen, exitoso = exitoso, error = error))
        Log.d(TAG, "$resultado | $remitente | $texto")
    }
}
