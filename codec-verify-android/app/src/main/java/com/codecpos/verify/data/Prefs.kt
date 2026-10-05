package com.codecpos.verify.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Guarda el webhook_token del negocio (equivalente al dato que hoy se copia
 * a mano dentro de MacroDroid) cifrado en disco con Android Keystore — nunca
 * en texto plano, ni en logs.
 */
class Prefs(context: Context) {

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        "codec_verify_secure_prefs",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    var webhookToken: String?
        get() = prefs.getString(KEY_TOKEN, null)
        set(value) = prefs.edit().putString(KEY_TOKEN, value).apply()

    var nombreNegocio: String?
        get() = prefs.getString(KEY_NOMBRE, null)
        set(value) = prefs.edit().putString(KEY_NOMBRE, value).apply()

    var entidadesHabilitadas: Set<String>
        get() {
            val guardadas = prefs.getStringSet(KEY_ENTIDADES, DEFAULT_ENTIDADES) ?: DEFAULT_ENTIDADES
            // Bre-B llegó en la versión 1.1.1: se activa una sola vez para quien ya tenía la app.
            if (!prefs.getBoolean(KEY_BRE_B_MIGRADO, false)) {
                prefs.edit().putBoolean(KEY_BRE_B_MIGRADO, true).putStringSet(KEY_ENTIDADES, guardadas + "bre_b").apply()
                return guardadas + "bre_b"
            }
            return guardadas
        }
        set(value) = prefs.edit().putStringSet(KEY_ENTIDADES, value).apply()

    /** Paquetes de apps bancarias a escuchar por entidad — editable porque los
     * nombres de paquete pueden variar por versión/región y deben verificarse
     * en el propio teléfono (Ajustes > Apps > [app] > nombre del paquete, o
     * usando el "modo aprendizaje" del listener). */
    var paquetesPorEntidad: Map<String, Set<String>>
        get() = ENTIDADES_DEFAULT.keys.associateWith { entidad ->
            prefs.getStringSet(KEY_PAQUETES_PREFIX + entidad, ENTIDADES_DEFAULT[entidad])
                ?: ENTIDADES_DEFAULT[entidad]!!
        }
        set(value) {
            val editor = prefs.edit()
            value.forEach { (entidad, paquetes) -> editor.putStringSet(KEY_PAQUETES_PREFIX + entidad, paquetes) }
            editor.apply()
        }

    var modoAprendizaje: Boolean
        get() = prefs.getBoolean(KEY_MODO_APRENDIZAJE, false)
        set(value) = prefs.edit().putBoolean(KEY_MODO_APRENDIZAJE, value).apply()

    /** Sonido fuerte al recibir un pago (se cambia desde la app: Configuración o la bocina de la barra). */
    var alertaSonido: Boolean
        get() = prefs.getBoolean(KEY_ALERTA_SONIDO, true)
        set(value) = prefs.edit().putBoolean(KEY_ALERTA_SONIDO, value).apply()

    /** Notificación en la barra al recibir un pago. */
    var alertaNotificacion: Boolean
        get() = prefs.getBoolean(KEY_ALERTA_NOTIFICACION, true)
        set(value) = prefs.edit().putBoolean(KEY_ALERTA_NOTIFICACION, value).apply()

    /** Voz que dice el monto del pago. */
    var alertaVoz: Boolean
        get() = prefs.getBoolean(KEY_ALERTA_VOZ, true)
        set(value) = prefs.edit().putBoolean(KEY_ALERTA_VOZ, value).apply()

    /**
     * Interruptor de Codec Verify del negocio (clientes_pos.codec_verify_activo, migración 0109).
     * Apagado: el lector descarta cualquier aviso sin leerlo ni enviarlo. Se guarda aquí para
     * decidir al instante; lo actualizan la app web (al encender o apagar) y la consulta al servidor.
     */
    var codecVerifyActivo: Boolean
        get() = prefs.getBoolean(KEY_CV_ACTIVO, false)
        set(value) = prefs.edit().putBoolean(KEY_CV_ACTIVO, value).putLong(KEY_CV_ACTIVO_EN, System.currentTimeMillis()).apply()

    /** Cuándo se supo por última vez el estado del interruptor (0 = nunca). */
    val codecVerifyActivoConsultadoEn: Long get() = prefs.getLong(KEY_CV_ACTIVO_EN, 0L)

    val estaEmparejado: Boolean get() = !webhookToken.isNullOrBlank()

    fun limpiar() {
        // Al cerrar sesión se borra el emparejamiento, pero se conserva cómo quiere sonar este celular.
        val sonido = alertaSonido
        val notificacion = alertaNotificacion
        val voz = alertaVoz
        prefs.edit().clear().apply()
        alertaSonido = sonido
        alertaNotificacion = notificacion
        alertaVoz = voz
    }

    fun guardarEmparejamiento(webhookToken: String, nombreNegocio: String?, entidades: Set<String>) {
        this.webhookToken = webhookToken
        this.nombreNegocio = nombreNegocio
        if (entidades.isNotEmpty()) this.entidadesHabilitadas = entidades
    }

    companion object {
        private const val KEY_TOKEN = "webhook_token"
        private const val KEY_NOMBRE = "nombre_negocio"
        private const val KEY_ENTIDADES = "entidades_habilitadas"
        private const val KEY_PAQUETES_PREFIX = "paquetes_"
        private const val KEY_MODO_APRENDIZAJE = "modo_aprendizaje"
        private const val KEY_ALERTA_SONIDO = "alerta_pago_sonido"
        private const val KEY_ALERTA_NOTIFICACION = "alerta_pago_notificacion"
        private const val KEY_ALERTA_VOZ = "alerta_pago_voz"
        private const val KEY_BRE_B_MIGRADO = "bre_b_migrado"
        private const val KEY_CV_ACTIVO = "codec_verify_activo"
        private const val KEY_CV_ACTIVO_EN = "codec_verify_activo_en"

        val DEFAULT_ENTIDADES = setOf("nequi", "bancolombia", "daviplata", "davivienda", "bre_b")

        // Nombres de paquete verificados contra las fichas públicas de Google
        // Play (agosto 2026) — aun así, si algún banco cambia de paquete o el
        // usuario tiene una variante regional distinta, "modo aprendizaje"
        // permite descubrirlo sin adivinar.
        val ENTIDADES_DEFAULT: Map<String, Set<String>> = mapOf(
            "nequi" to setOf("com.nequi.MobileApp"),
            "bancolombia" to setOf(
                "co.com.bancolombia.personas.superapp", // Mi Bancolombia (app actual, reemplazó a Personas en jun-2025)
                "co.com.tcs.bancolombia.bancaalamano", // Bancolombia A la Mano — pagos con Llave llegan por cualquiera de las dos
                "com.todo1.mobile", // Bancolombia Personas (discontinuada, algunos celulares aún no migraron)
            ),
            "daviplata" to setOf("com.davivienda.daviplataapp"),
            // App del banco Davivienda propiamente dicha — distinta de la billetera
            // Daviplata de arriba (paquetes y notificaciones separados).
            "davivienda" to setOf("com.davivienda.daviviendaapp"),
            // Bre-B viene de CUALQUIER banco. Estas son apps de otros bancos que se escuchan siempre;
            // además, cualquier notificación que diga "Bre-B" y sea un pago recibido se toma como Bre-B
            // aunque venga de una app que no está aquí (ver PagoNotificationListenerService).
            "bre_b" to setOf(
                "com.nu.production", // Nu Colombia
                "com.bancodebogota.bancamovil", // Banco de Bogotá
                "co.com.bbva.mb", // BBVA Colombia
            ),
        )

        /**
         * Apps de chat, redes y correo: nunca se leen como pago aunque el texto diga Bre-B.
         * El correo del banco repite el aviso que ya llegó por su app (registraba el pago dos veces).
         */
        val APPS_EXCLUIDAS = setOf(
            "com.whatsapp", "com.whatsapp.w4b", "org.telegram.messenger", "org.thunderdog.challegram",
            "com.facebook.orca", "com.facebook.katana", "com.instagram.android", "com.zhiliaoapp.musically",
            "com.google.android.youtube", "com.twitter.android", "com.discord", "com.Slack",
            "com.google.android.gm", "com.microsoft.office.outlook", "com.samsung.android.email.provider",
            "com.yahoo.mobile.client.android.mail",
        )
    }
}
