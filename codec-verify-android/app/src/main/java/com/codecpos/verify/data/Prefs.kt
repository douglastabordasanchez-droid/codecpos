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
        get() = prefs.getStringSet(KEY_ENTIDADES, DEFAULT_ENTIDADES) ?: DEFAULT_ENTIDADES
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

        val DEFAULT_ENTIDADES = setOf("nequi", "bancolombia", "daviplata", "davivienda")

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
        )
    }
}
