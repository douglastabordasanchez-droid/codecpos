package com.codecstudio.pos;

import android.os.Bundle;
import android.os.Process;
import android.view.View;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

/**
 * Codec POS en terminal Android: pantalla completa inmersiva, pantalla siempre
 * encendida, impresora térmica integrada y estabilidad de caja:
 * • el botón Atrás nunca cierra la app,
 * • si el motor del WebView se cae, la pantalla se recarga en vez de cerrarse,
 * • si la app falla, se reabre sola (GuardianService),
 * • mesas y cuentas tienen respaldo en disco (RespaldoPlugin).
 */
public class MainActivity extends BridgeActivity {

    static volatile boolean visible = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ImpresoraPosPlugin.class);
        registerPlugin(RespaldoPlugin.class);
        registerPlugin(VozPlugin.class);
        super.onCreate(savedInstanceState);

        final Thread.UncaughtExceptionHandler previo = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((hilo, error) -> {
            try { GuardianService.reabrir(getApplicationContext(), 1500); } catch (Throwable ignorado) { }
            if (previo != null) previo.uncaughtException(hilo, error);
            else { Process.killProcess(Process.myPid()); System.exit(10); }
        });

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        pantallaCompleta();
        GuardianService.iniciar(this);

        if (bridge != null) {
            bridge.addWebViewListener(new WebViewListener() {
                @Override
                public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                    // Sin esto Android cierra la app entera. Los datos están en el respaldo.
                    runOnUiThread(MainActivity.this::recreate);
                    return true;
                }
            });
        }

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView wv = bridge != null ? bridge.getWebView() : null;
                if (wv != null && wv.canGoBack()) wv.goBack();
                // Si no hay a dónde volver no se hace nada: la caja no se cierra.
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        visible = true;
    }

    @Override
    public void onPause() {
        visible = false;
        super.onPause();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) pantallaCompleta();
    }

    private void pantallaCompleta() {
        View decor = getWindow().getDecorView();
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat ctrl = WindowCompat.getInsetsController(getWindow(), decor);
        ctrl.hide(WindowInsetsCompat.Type.systemBars());
        ctrl.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
