package com.codecpos.verify.notification

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.codecpos.verify.R
import com.codecpos.verify.data.Prefs

/**
 * Expuesto a la PWA (que corre dentro del WebView) como `window.AndroidCodecVerify`
 * — ver `addJavascriptInterface` en MainActivity y `src/pwa/lib/androidBridge.ts`
 * del lado web. La PWA llama a esto apenas hay una sesión activa; no existe
 * ningún flujo de login/emparejamiento separado en la app nativa.
 *
 * Los métodos `@JavascriptInterface` corren en un hilo en segundo plano
 * (no el hilo de UI) — por eso Prefs (EncryptedSharedPreferences) es seguro
 * llamarlo directo aquí sin bloquear el WebView. `onAbrirAjustes` sí toca
 * estado de Compose, así que se despacha al hilo principal con un Handler.
 */
class AndroidNotificationBridge(
    private val context: Context,
    private val prefs: Prefs,
    private val onAbrirAjustes: () -> Unit,
    private val onPedirPermisoNotificaciones: () -> Unit,
    private val onAutenticarConHuella: (requestId: String) -> Unit,
    private val huellaDisponibleEnDispositivo: () -> Boolean,
) {
    private val mainHandler = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun guardarSesion(webhookToken: String, nombreNegocio: String) {
        if (webhookToken.isBlank()) return
        prefs.guardarEmparejamiento(webhookToken, nombreNegocio.ifBlank { null }, emptySet())
    }

    @JavascriptInterface
    fun cerrarSesion() {
        prefs.limpiar()
    }

    // 🔧 UX: antes había un ícono flotante propio (⚙️) además de la sección
    // "Automatización de pagos" de Configuración en la PWA — dos lugares de
    // ajustes confundían. Ahora Configuración tiene un botón que llama a
    // esto para abrir el mismo panel nativo (permisos + estado del listener).
    @JavascriptInterface
    fun abrirAjustesNotificaciones() {
        mainHandler.post { onAbrirAjustes() }
    }

    /**
     * Los WebView no implementan de forma uniforme Notification.requestPermission().
     * Esta entrada permite que el botón de avisos de Alimentos y Bebidas use el
     * diálogo real de Android en lugar de quedarse sin respuesta.
     */
    @JavascriptInterface
    fun pedirPermisoNotificaciones() {
        mainHandler.post { onPedirPermisoNotificaciones() }
    }

    @JavascriptInterface
    fun permisoNotificacionesConcedido(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** Muestra el aviso de una comanda con el canal nativo, aun dentro del WebView. */
    @JavascriptInterface
    fun avisarCambioComanda(titulo: String, cuerpo: String, estado: String, tag: String) {
        if (!permisoNotificacionesConcedido()) return

        val channelId = "pedidos_comandas"
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Pedidos y comandas",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Avisos cuando cocina cambia el estado de un pedido"
                enableVibration(true)
                vibrationPattern = if (estado == "listo") longArrayOf(0, 260, 110, 260, 110, 360) else longArrayOf(0, 150, 80, 150)
            }
            manager.createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(titulo.take(80))
            .setContentText(cuerpo.take(180))
            .setStyle(NotificationCompat.BigTextStyle().bigText(cuerpo.take(360)))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setAutoCancel(true)
            .build()

        NotificationManagerCompat.from(context).notify(tag.take(100), tag.hashCode(), notification)
    }

    /**
     * Huella dactilar nativa para el autobloqueo de la PWA (src/pwa/lib/huellaLock.ts).
     * WebAuthn del navegador no es confiable dentro de este WebView -- se usa
     * BiometricPrompt del sistema operativo en su lugar, que sí es consistente
     * en cualquier Android moderno. `requestId` viaja de ida y vuelta para que
     * la PWA pueda resolver la Promise correcta si hay más de una solicitud en
     * vuelo (ver window.__codecVerifyHuellaCallback en androidBridge.ts).
     */
    @JavascriptInterface
    fun autenticarConHuella(requestId: String) {
        mainHandler.post { onAutenticarConHuella(requestId) }
    }

    @JavascriptInterface
    fun huellaDisponible(): Boolean = huellaDisponibleEnDispositivo()
}
