package com.codecpos.verify.notification

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.codecpos.verify.R
import com.codecpos.verify.data.Prefs
import com.codecpos.verify.ui.MainActivity

/**
 * Alerta de "pago recibido" de Codec Verify: sonido fuerte, vibración y
 * notificación en la barra del celular.
 *
 * El sonido se reproduce por el volumen de ALARMA (no el de notificaciones),
 * así suena fuerte aunque el celular esté en silencio o con el volumen de
 * notificaciones bajo. La notificación va por un canal sin sonido propio para
 * que no suene dos veces. Todo se puede apagar desde la app (Configuración o
 * el botón de bocina de la barra superior), que guarda la preferencia aquí.
 *
 * Se llama desde dos lugares:
 *  · El lector de notificaciones bancarias, al registrar un pago (funciona
 *    con la app cerrada).
 *  · La web dentro de la app (window.AndroidCodecVerify.avisarPago) cuando
 *    llega un pago detectado por OTRO celular del negocio.
 */
object AlertaPagos {
    private const val CANAL = "pagos_codec_verify"
    private const val VENTANA_DUPLICADO_MS = 60_000L

    @Volatile private var ultimaAlertaNativa = 0L
    private val idsAvisados = LinkedHashSet<String>()
    private var reproductor: MediaPlayer? = null

    private fun crearCanal(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(CANAL) != null) return
        val canal = NotificationChannel(CANAL, "Pagos recibidos", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Aviso cuando Codec Verify confirma un pago"
            setSound(null, null) // el sonido fuerte lo reproduce la app por el volumen de alarma
            enableVibration(false) // la vibración también la maneja la app, para respetar el ajuste de sonido
            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        }
        manager.createNotificationChannel(canal)
    }

    private fun puedeNotificar(context: Context) =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** Alerta disparada por el lector nativo al registrar un pago en este mismo celular. */
    fun alertarDesdeLector(context: Context, entidad: String, textoBanco: String) {
        val prefs = Prefs(context.applicationContext)
        ultimaAlertaNativa = System.currentTimeMillis()
        val nombre = entidad.replaceFirstChar { it.uppercase() }
        mostrar(
            context,
            tag = "pago-nativo-${ultimaAlertaNativa}",
            titulo = "Pago recibido por $nombre",
            cuerpo = textoBanco.take(240),
            sonido = prefs.alertaSonido,
            notificacion = prefs.alertaNotificacion,
        )
    }

    /** Alerta pedida por la web (pago detectado en otro celular del negocio o una prueba). */
    fun alertarDesdeWeb(context: Context, id: String, titulo: String, cuerpo: String, sonido: Boolean, notificacion: Boolean) {
        synchronized(idsAvisados) {
            if (!idsAvisados.add(id)) return
            if (idsAvisados.size > 200) idsAvisados.remove(idsAvisados.first())
        }
        // Si este mismo celular acaba de alertar el pago con su lector nativo, no se repite.
        val esPrueba = id.startsWith("prueba-")
        if (!esPrueba && System.currentTimeMillis() - ultimaAlertaNativa < VENTANA_DUPLICADO_MS) return
        mostrar(context, "pago-$id", titulo, cuerpo, sonido, notificacion)
    }

    private fun mostrar(context: Context, tag: String, titulo: String, cuerpo: String, sonido: Boolean, notificacion: Boolean) {
        val app = context.applicationContext
        if (sonido) {
            sonar(app)
            vibrar(app)
        }
        if (!notificacion || !puedeNotificar(app)) return
        crearCanal(app)
        val abrir = PendingIntent.getActivity(
            app, 0,
            Intent(app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val n = NotificationCompat.Builder(app, CANAL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(titulo.take(80))
            .setContentText(cuerpo.take(180))
            .setStyle(NotificationCompat.BigTextStyle().bigText(cuerpo.take(360)))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setContentIntent(abrir)
            .setAutoCancel(true)
            .setSilent(true)
            .build()
        try {
            NotificationManagerCompat.from(app).notify(tag.take(100), tag.hashCode(), n)
        } catch (_: SecurityException) { /* sin permiso */ }
    }

    private fun sonar(context: Context) {
        try {
            reproductor?.release()
            val uri = Uri.parse("android.resource://${context.packageName}/${R.raw.pago_recibido}")
            reproductor = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                setDataSource(context, uri)
                setVolume(1f, 1f)
                setOnCompletionListener { it.release(); if (reproductor === it) reproductor = null }
                prepare()
                start()
            }
        } catch (_: Exception) { /* sin audio: queda la notificación */ }
    }

    private fun vibrar(context: Context) {
        try {
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            val patron = longArrayOf(0, 450, 150, 450, 150, 700)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) vibrator.vibrate(VibrationEffect.createWaveform(patron, -1))
            else @Suppress("DEPRECATION") vibrator.vibrate(patron, -1)
        } catch (_: Exception) { /* sin vibración */ }
    }
}
