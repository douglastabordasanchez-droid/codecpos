package com.codecstudio.pos;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Abre Codec POS al encender la terminal. */
public class ArranqueReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        String a = intent != null ? intent.getAction() : null;
        if (a == null) return;
        if (!a.equals(Intent.ACTION_BOOT_COMPLETED)
                && !a.equals("android.intent.action.QUICKBOOT_POWERON")
                && !a.equals("com.htc.intent.action.QUICKBOOT_POWERON")
                && !a.equals(Intent.ACTION_MY_PACKAGE_REPLACED)) return;
        GuardianService.iniciar(ctx);
        try {
            Intent abrir = new Intent(ctx, MainActivity.class);
            abrir.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(abrir);
        } catch (Exception e) {
            GuardianService.reabrir(ctx, 2000);
        }
    }
}
