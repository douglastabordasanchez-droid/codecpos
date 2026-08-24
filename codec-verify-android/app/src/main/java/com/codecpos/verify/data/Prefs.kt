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

    val estaEmparejado: Boolean get() = !webhookToken.isNullOrBlank()

    fun limpiar() {
        prefs.edit().clear().apply()
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

        val DEFAULT_ENTIDADES = setOf("nequi", "bancolombia", "daviplata")

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
        )
    }
}
