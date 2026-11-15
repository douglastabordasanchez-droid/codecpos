package com.codecstudio.pos;

import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Respaldo en disco de mesas, cuentas y ventas pendientes.
 *
 * El localStorage del WebView escribe en disco con retraso: si la terminal se
 * apaga de golpe se pueden perder los últimos cambios. Aquí cada clave se
 * escribe en su propio archivo, con fsync y renombrado atómico, en orden
 * (un solo hilo). Al abrir la app, el JS restaura desde estos archivos.
 */
@CapacitorPlugin(name = "Respaldo")
public class RespaldoPlugin extends Plugin {

    private final ExecutorService hilo = Executors.newSingleThreadExecutor();

    private File carpeta() {
        File dir = new File(getContext().getFilesDir(), "respaldo");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    /** Nombre de archivo seguro y reversible para cualquier clave. */
    private static String nombre(String clave) {
        return Base64.encodeToString(clave.getBytes(StandardCharsets.UTF_8),
                Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING) + ".dat";
    }

    private static String clave(String nombreArchivo) {
        String b = nombreArchivo.substring(0, nombreArchivo.length() - 4);
        return new String(Base64.decode(b, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING),
                StandardCharsets.UTF_8);
    }

    @PluginMethod
    public void guardar(PluginCall call) {
        final String clave = call.getString("clave");
        final String valor = call.getString("valor");
        if (clave == null || valor == null) { call.reject("faltan datos"); return; }
        hilo.execute(() -> {
            try {
                File destino = new File(carpeta(), nombre(clave));
                File tmp = new File(carpeta(), nombre(clave) + ".tmp");
                try (FileOutputStream out = new FileOutputStream(tmp)) {
                    out.write(valor.getBytes(StandardCharsets.UTF_8));
                    out.flush();
                    out.getFD().sync();
                }
                if (!tmp.renameTo(destino)) {
                    destino.delete();
                    if (!tmp.renameTo(destino)) throw new IOException("no se pudo renombrar");
                }
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        });
    }

    @PluginMethod
    public void borrar(PluginCall call) {
        final String clave = call.getString("clave");
        if (clave == null) { call.reject("falta la clave"); return; }
        hilo.execute(() -> {
            new File(carpeta(), nombre(clave)).delete();
            call.resolve();
        });
    }

    @PluginMethod
    public void leerTodo(PluginCall call) {
        hilo.execute(() -> {
            JSObject datos = new JSObject();
            File[] archivos = carpeta().listFiles();
            if (archivos != null) {
                for (File f : archivos) {
                    String n = f.getName();
                    if (!n.endsWith(".dat")) continue;
                    try (FileInputStream in = new FileInputStream(f)) {
                        byte[] buf = new byte[(int) f.length()];
                        int leidos = 0;
                        while (leidos < buf.length) {
                            int r = in.read(buf, leidos, buf.length - leidos);
                            if (r < 0) break;
                            leidos += r;
                        }
                        datos.put(clave(n), new String(buf, 0, leidos, StandardCharsets.UTF_8));
                    } catch (Exception ignorado) { /* archivo dañado: se omite */ }
                }
            }
            JSObject r = new JSObject();
            r.put("datos", datos);
            call.resolve(r);
        });
    }
}
