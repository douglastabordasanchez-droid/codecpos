package com.codecpos.verify.notification

import android.webkit.JavascriptInterface
import com.codecpos.verify.data.Prefs

/**
 * Expuesto a la PWA (que corre dentro del WebView) como `window.AndroidCodecVerify`
 * — ver `addJavascriptInterface` en MainActivity y `src/pwa/lib/androidBridge.ts`
 * del lado web. La PWA llama a esto apenas hay una sesión activa; no existe
 * ningún flujo de login/emparejamiento separado en la app nativa.
 *
 * Los métodos `@JavascriptInterface` corren en un hilo en segundo plano
 * (no el hilo de UI) — por eso Prefs (EncryptedSharedPreferences) es seguro
 * llamarlo directo aquí sin bloquear el WebView.
 */
class AndroidNotificationBridge(private val prefs: Prefs) {

    @JavascriptInterface
    fun guardarSesion(webhookToken: String, nombreNegocio: String) {
        if (webhookToken.isBlank()) return
        prefs.guardarEmparejamiento(webhookToken, nombreNegocio.ifBlank { null }, emptySet())
    }

    @JavascriptInterface
    fun cerrarSesion() {
        prefs.limpiar()
    }
}
