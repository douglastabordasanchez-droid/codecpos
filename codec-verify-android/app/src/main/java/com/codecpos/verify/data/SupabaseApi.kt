package com.codecpos.verify.data

import com.codecpos.verify.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Cliente HTTP directo contra PostgREST — el login/emparejamiento ya NO pasa
 * por aquí (la app es un WebView de la PWA real, que hace su propio login;
 * ver AndroidNotificationBridge). Lo único que necesita el listener de
 * notificaciones es esta llamada, idéntica a la que hoy hace MacroDroid.
 */
class SupabaseApi {

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private val jsonMedia = "application/json".toMediaType()
    private val baseUrl = BuildConfig.SUPABASE_URL.trimEnd('/')
    private val anonKey = BuildConfig.SUPABASE_ANON_KEY

    /**
     * Reemplaza la acción HTTP de MacroDroid: envía el texto CRUDO de la
     * notificación — el regex ya corregido en Postgres hace todo el parseo
     * (ver supabase/migrations/0045_registrar_pago_automatico_fix_bancolombia.sql).
     * No se debe intentar extraer el monto aquí — eso duplicaría lógica que
     * ya está probada y mantenida en un solo lugar.
     */
    suspend fun registrarPagoAutomatico(
        webhookToken: String,
        textoNotificacion: String,
        entidad: String,
        referencia: String = "",
    ): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val body = buildJsonObject {
                put("p_token", webhookToken)
                put("p_monto", textoNotificacion)
                put("p_entidad", entidad)
                put("p_referencia", referencia)
            }.toString()
            val request = Request.Builder()
                .url("$baseUrl/rest/v1/rpc/registrar_pago_automatico")
                .addHeader("apikey", anonKey)
                .addHeader("Authorization", "Bearer $anonKey")
                .addHeader("Content-Type", "application/json")
                .post(body.toRequestBody(jsonMedia))
                .build()
            client.newCall(request).execute().use { resp ->
                if (!resp.isSuccessful) {
                    val text = resp.body?.string().orEmpty()
                    Result.failure(IOException("registrar_pago_automatico: HTTP ${resp.code} $text"))
                } else {
                    Result.success(Unit)
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Respaldo por IA — SOLO se llama cuando registrarPagoAutomatico() falló
     * porque el regex no pudo extraer un monto (ver PagoNotificationListenerService,
     * que revisa el mensaje de error antes de llamar aquí). La clave de
     * OpenRouter NUNCA viaja a este cliente — vive como secreto en la Edge
     * Function `interpretar-pago-ia`, que además valida el webhookToken antes
     * de gastar nada.
     */
    suspend fun interpretarConIA(
        webhookToken: String,
        textoNotificacion: String,
        entidad: String,
    ): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val body = buildJsonObject {
                put("p_token", webhookToken)
                put("p_texto", textoNotificacion)
                put("p_entidad", entidad)
            }.toString()
            val request = Request.Builder()
                .url("$baseUrl/functions/v1/interpretar-pago-ia")
                .addHeader("apikey", anonKey)
                .addHeader("Authorization", "Bearer $anonKey")
                .addHeader("Content-Type", "application/json")
                .post(body.toRequestBody(jsonMedia))
                .build()
            client.newCall(request).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) return@withContext Result.failure(IOException("interpretar-pago-ia: HTTP ${resp.code} $text"))
                // La función responde {"ok": true/false, ...} incluso con HTTP 200
                // cuando la IA simplemente no tuvo confianza suficiente — no es un error.
                val ok = Json.parseToJsonElement(text.ifBlank { "{}" })
                    .jsonObject["ok"]?.jsonPrimitive?.booleanOrNull ?: false
                Result.success(ok)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
