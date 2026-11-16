package com.codecpos.verify.notification

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import androidx.core.app.NotificationCompat
import com.codecpos.verify.R
import com.codecpos.verify.data.Prefs
import com.codecpos.verify.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Guardián del lector de pagos.
 *
 * Samsung y otros fabricantes duermen el lector de notificaciones después de
 * unas horas o días sin avisar: el celular sigue mostrando los pagos, pero
 * Codec Verify deja de leerlos y nada suena en la caja. Este servicio en
 * primer plano mantiene viva la app y cada 3 minutos pide a Android que
 * reconecte el lector si se cayó. Arranca solo al encender el celular.
 */
class GuardianEscuchaService : Service() {

    private val handler = Handler(Looper.getMainLooper())
    private val revisar = object : Runnable {
        override fun run() {
            if (!EventBus.listenerConectado.value && tienePermiso(this@GuardianEscuchaService)) {
                PagoNotificationListenerService.pedirReconexion(applicationContext)
                // En algunos Samsung requestRebind no basta: apagar y prender el componente fuerza la reconexión.
                reiniciarComponente(applicationContext)
            }
            handler.postDelayed(this, INTERVALO_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CANAL) == null) {
            manager.createNotificationChannel(
                NotificationChannel(CANAL, "Escuchando pagos", NotificationManager.IMPORTANCE_MIN).apply {
                    description = "Mantiene Codec Verify atento a los pagos"
                    setShowBadge(false)
                    setSound(null, null)
                }
            )
        }
        val abrir = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
        )
        val aviso: Notification = NotificationCompat.Builder(this, CANAL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Codec Verify")
            .setContentText("Escuchando pagos")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setContentIntent(abrir)
            .build()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(ID, aviso, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(ID, aviso)
        }
        // La primera revisión espera un poco: al arrancar el lector tarda en conectarse.
        handler.postDelayed(revisar, 30_000)
        // Respaldo: conexión permanente con el correo del banco (llega al instante, ver LectorCorreo).
        // Si se cae, se vuelve a abrir enseguida; sin internet o sin correo configurado, cada 10 s.
        correo = scope.launch {
            while (isActive) {
                val inicio = System.currentTimeMillis()
                try { LectorCorreo.escuchar(applicationContext) } catch (_: Exception) { /* se reintenta */ }
                delay(if (System.currentTimeMillis() - inicio < 30_000) 10_000 else 1_000)
            }
        }
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var correo: Job? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onDestroy() {
        handler.removeCallbacks(revisar)
        correo?.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val CANAL = "codec_verify_guardian"
        private const val ID = 4401
        private const val INTERVALO_MS = 3 * 60_000L

        fun tienePermiso(context: Context): Boolean =
            Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners").orEmpty()
                .contains(context.packageName)

        /** Arranca el guardián si la app ya está emparejada y tiene acceso a notificaciones. */
        fun iniciar(context: Context) {
            val emparejado = try { !Prefs(context).webhookToken.isNullOrBlank() } catch (e: Exception) { true }
            val conCorreo = try { Prefs(context).correoActivo } catch (e: Exception) { false }
            if (!emparejado || !(tienePermiso(context) || conCorreo)) {
                android.util.Log.i("CodecVerifyGuardian", "No arranca: emparejado=$emparejado permiso=${tienePermiso(context)}")
                if (!emparejado) avisarSinSesion(context)
                return
            }
            val intent = Intent(context, GuardianEscuchaService::class.java)
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
                else context.startService(intent)
            } catch (e: Exception) {
                // Android no deja arrancarlo ahora; se intenta al abrir la app.
                android.util.Log.w("CodecVerifyGuardian", "No se pudo arrancar: ${e.message}")
            }
        }

        private const val ID_SIN_SESION = 4402

        /** Aviso fijo: la app tiene el permiso pero no está emparejada, así que no escucha pagos. */
        fun avisarSinSesion(context: Context) {
            if (!tienePermiso(context)) return
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CANAL_AVISO) == null) {
                manager.createNotificationChannel(NotificationChannel(CANAL_AVISO, "Codec Verify sin sesión", NotificationManager.IMPORTANCE_HIGH))
            }
            val abrir = PendingIntent.getActivity(context, 1, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
            val aviso = NotificationCompat.Builder(context, CANAL_AVISO)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Codec Verify no está escuchando pagos")
                .setContentText("Toca aquí e inicia sesión para que los pagos vuelvan a sonar en la caja.")
                .setStyle(NotificationCompat.BigTextStyle().bigText("Toca aquí e inicia sesión para que los pagos vuelvan a sonar en la caja."))
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(abrir)
                .build()
            try { manager.notify(ID_SIN_SESION, aviso) } catch (_: SecurityException) { /* sin permiso de notificaciones */ }
        }

        fun quitarAvisoSinSesion(context: Context) {
            (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(ID_SIN_SESION)
        }

        private const val CANAL_AVISO = "codec_verify_sin_sesion"

        fun reiniciarComponente(context: Context) {
            try {
                val pm = context.packageManager
                val componente = ComponentName(context, PagoNotificationListenerService::class.java)
                pm.setComponentEnabledSetting(componente, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
                pm.setComponentEnabledSetting(componente, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
            } catch (_: Exception) { /* ignorar */ }
        }
    }
}

/** Al encender el celular (o actualizar la app) vuelve a escuchar pagos sin abrir nada. */
class ArranqueVerifyReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        PagoNotificationListenerService.pedirReconexion(context)
        GuardianEscuchaService.iniciar(context)
    }
}
