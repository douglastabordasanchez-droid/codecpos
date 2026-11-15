package com.codecstudio.pos;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;

/**
 * Servicio guardián en primer plano.
 *
 * Mantiene el proceso con prioridad alta (Android no lo cierra por memoria) y,
 * si la app se cae o la quitan de recientes, la vuelve a abrir. No la reabre
 * cuando el usuario sale con Inicio: así nunca queda encerrado.
 * Si se cae más de 4 veces en 2 minutos (cada caída cuenta dos) deja de reabrirla para no entrar en bucle.
 */
public class GuardianService extends Service {

    private static final String CANAL = "codec_guardian";
    static final String EXTRA_DESDE_APP = "desde_app";

    public static void iniciar(Context ctx) {
        Intent i = new Intent(ctx, GuardianService.class);
        i.putExtra(EXTRA_DESDE_APP, true);
        try {
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
            else ctx.startService(i);
        } catch (Exception ignorado) { /* sin permiso para arrancar en segundo plano */ }
    }

    /** Programa abrir la app en `ms` milisegundos, salvo que se esté cayendo en bucle. */
    public static void reabrir(Context ctx, long ms) {
        if (enBucle(ctx)) return;
        Intent abrir = new Intent(ctx, MainActivity.class);
        abrir.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(ctx, 7, abrir, flags);
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + ms, pi);
    }

    private static boolean enBucle(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences("guardian", MODE_PRIVATE);
        long ahora = System.currentTimeMillis();
        long inicio = p.getLong("inicio", 0);
        int veces = p.getInt("veces", 0);
        if (ahora - inicio > 120_000) { inicio = ahora; veces = 0; }
        veces++;
        p.edit().putLong("inicio", inicio).putInt("veces", veces).commit();
        return veces > 8;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null) {
            NotificationChannel c = new NotificationChannel(CANAL, "Codec POS activo", NotificationManager.IMPORTANCE_MIN);
            c.setShowBadge(false);
            nm.createNotificationChannel(c);
        }
        Intent abrir = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, abrir, PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CANAL) : new Notification.Builder(this);
        Notification n = b.setContentTitle("Codec POS")
                .setContentText("Caja activa")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(pi)
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(1, n);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Intent nulo = Android reinició el servicio tras matar el proceso: reabrir la caja.
        if (intent == null || !intent.getBooleanExtra(EXTRA_DESDE_APP, false)) {
            if (!MainActivity.visible) reabrir(this, 1500);
        }
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        reabrir(this, 1500);
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
