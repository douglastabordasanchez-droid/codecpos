package com.codecstudio.pos;

import android.speech.tts.TextToSpeech;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

/**
 * Voz de la terminal: el navegador interno de Android (WebView) no trae
 * speechSynthesis, así que los avisos de pagos y de pedidos no se oían.
 * Este plugin usa el motor de voz del sistema (TextToSpeech) en español.
 */
@CapacitorPlugin(name = "Voz")
public class VozPlugin extends Plugin {

    private TextToSpeech tts;
    private boolean lista = false;

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), estado -> {
            if (estado == TextToSpeech.SUCCESS) {
                int r = tts.setLanguage(new Locale("es", "CO"));
                if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                    tts.setLanguage(new Locale("es"));
                }
                lista = true;
            }
        });
    }

    @PluginMethod
    public void hablar(PluginCall call) {
        String texto = call.getString("texto", "");
        Double velocidad = call.getDouble("velocidad", 1.0);
        Double tono = call.getDouble("tono", 1.0);
        if (tts == null || !lista || texto == null || texto.isEmpty()) { call.resolve(); return; }
        tts.setSpeechRate(velocidad.floatValue());
        tts.setPitch(tono.floatValue());
        tts.speak(texto, TextToSpeech.QUEUE_ADD, null, "codec-" + System.currentTimeMillis());
        call.resolve();
    }

    @PluginMethod
    public void callar(PluginCall call) {
        if (tts != null) tts.stop();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) { tts.stop(); tts.shutdown(); }
    }
}
