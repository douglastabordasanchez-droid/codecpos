package com.codecstudio.pos;

import android.os.Build;
import android.os.Bundle;
import android.os.Process;
import android.view.View;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

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

        // ⌨️ En pantalla completa Android pone el teclado ENCIMA de la app sin achicarla:
        // los campos de abajo quedaban tapados y no se podía deslizar hasta ellos.
        // Se deja abajo un espacio del alto del teclado mientras está abierto.
        View contenido = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(contenido, (v, insets) -> {
            int teclado = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom;
            if (v.getPaddingBottom() != teclado) v.setPadding(0, 0, 0, teclado);
            return insets;
        });
        GuardianService.iniciar(this);

        if (bridge != null && bridge.getWebView() != null) {
            WebView wv = bridge.getWebView();
            // Sin autocompletado de Android: su sugerencia de usuario o contraseña pintaba
            // el texto en negro sobre los campos oscuros del inicio de sesión (la app ya
            // tiene su propio «Guardar contraseña»).
            if (Build.VERSION.SDK_INT >= 26) {
                wv.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
            }
            // Sin oscurecimiento automático (modo oscuro del sistema en Android 10+): la app
            // ya tiene sus propios colores y el sistema los invertía.
            try {
                if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
                    WebSettingsCompat.setAlgorithmicDarkeningAllowed(wv.getSettings(), false);
                }
                if (WebViewFeature.isFeatureSupported(WebViewFeature.FORCE_DARK)) {
                    WebSettingsCompat.setForceDark(wv.getSettings(), WebSettingsCompat.FORCE_DARK_OFF);
                }
            } catch (Throwable ignorado) { /* WebView viejo: no aplica */ }
        }

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
