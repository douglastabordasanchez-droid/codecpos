package com.codecstudio.pos;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;

/**
 * Puente de la impresora térmica de la terminal POS.
 *
 * La web ya arma los bytes ESC/POS (src/app/lib/thermalPrinter.ts); aquí solo
 * se entregan por la vía que tenga la terminal:
 *   · usb   → impresora integrada conectada por USB interno (lo más común).
 *   · serie → impresora integrada en un puerto serie (/dev/ttyS1, /dev/ttyS3…).
 *   · red   → impresora de red en el puerto 9100.
 */
@CapacitorPlugin(name = "ImpresoraPos")
public class ImpresoraPosPlugin extends Plugin {

    private static final String ACCION_PERMISO = "com.codecstudio.pos.PERMISO_USB";
    private static final int TROZO = 4096;

    /** Lista las impresoras USB visibles y los puertos serie que existen. */
    @PluginMethod
    public void listar(PluginCall call) {
        JSArray usb = new JSArray();
        UsbManager um = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
        if (um != null) {
            for (UsbDevice d : um.getDeviceList().values()) {
                if (salidaBulk(d) == null) continue;
                JSObject o = new JSObject();
                o.put("vendorId", d.getVendorId());
                o.put("productId", d.getProductId());
                o.put("nombre", d.getProductName() != null ? d.getProductName() : d.getDeviceName());
                o.put("esImpresora", esClaseImpresora(d));
                o.put("permiso", um.hasPermission(d));
                usb.put(o);
            }
        }
        JSArray serie = new JSArray();
        File dev = new File("/dev");
        File[] archivos = dev.listFiles();
        if (archivos != null) {
            for (File f : archivos) {
                String n = f.getName();
                if (n.startsWith("ttyS") || n.startsWith("ttyUSB") || n.startsWith("ttyACM") || n.startsWith("ttyMT")) {
                    JSObject o = new JSObject();
                    o.put("ruta", f.getAbsolutePath());
                    o.put("escribible", f.canWrite());
                    serie.put(o);
                }
            }
        }
        JSObject r = new JSObject();
        r.put("usb", usb);
        r.put("serie", serie);
        r.put("modelo", Build.MANUFACTURER + " " + Build.MODEL);
        call.resolve(r);
    }

    /**
     * imprimir({ datos: base64, via: 'usb'|'serie'|'red', vendorId?, productId?, ruta?, ip?, puerto? })
     */
    @PluginMethod
    public void imprimir(PluginCall call) {
        String b64 = call.getString("datos");
        if (b64 == null || b64.isEmpty()) {
            call.reject("Sin datos para imprimir");
            return;
        }
        final byte[] datos = Base64.decode(b64, Base64.DEFAULT);
        final String via = call.getString("via", "usb");
        new Thread(() -> {
            try {
                switch (via) {
                    case "red":
                        porRed(call.getString("ip"), call.getInt("puerto", 9100), datos);
                        break;
                    case "serie":
                        porSerie(call.getString("ruta", "/dev/ttyS1"), datos);
                        break;
                    default:
                        porUsb(call, datos);
                        return; // porUsb resuelve la llamada (puede esperar el permiso)
                }
                call.resolve(ok());
            } catch (Exception e) {
                call.reject("No se pudo imprimir: " + e.getMessage(), e);
            }
        }).start();
    }

    // ─── USB ──────────────────────────────────────────────────────────────

    private void porUsb(PluginCall call, byte[] datos) {
        UsbManager um = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
        UsbDevice dev = buscarUsb(um, call.getInt("vendorId"), call.getInt("productId"));
        if (dev == null) {
            call.reject("No se encontró la impresora USB");
            return;
        }
        if (um.hasPermission(dev)) {
            escribirUsb(call, um, dev, datos);
            return;
        }
        // Android pide permiso la primera vez; si se marca «usar por defecto» no vuelve a preguntar.
        Context ctx = getContext();
        BroadcastReceiver receptor = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent i) {
                ctx.unregisterReceiver(this);
                if (i.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                    new Thread(() -> escribirUsb(call, um, dev, datos)).start();
                } else {
                    call.reject("Permiso USB denegado");
                }
            }
        };
        IntentFilter filtro = new IntentFilter(ACCION_PERMISO);
        if (Build.VERSION.SDK_INT >= 33) ctx.registerReceiver(receptor, filtro, Context.RECEIVER_NOT_EXPORTED);
        else ctx.registerReceiver(receptor, filtro);
        int banderas = Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0;
        Intent intent = new Intent(ACCION_PERMISO).setPackage(ctx.getPackageName());
        um.requestPermission(dev, PendingIntent.getBroadcast(ctx, 0, intent, banderas));
    }

    private void escribirUsb(PluginCall call, UsbManager um, UsbDevice dev, byte[] datos) {
        UsbInterface intf = null;
        UsbEndpoint ep = null;
        for (int i = 0; i < dev.getInterfaceCount() && ep == null; i++) {
            UsbInterface it = dev.getInterface(i);
            for (int j = 0; j < it.getEndpointCount(); j++) {
                UsbEndpoint e = it.getEndpoint(j);
                if (e.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK && e.getDirection() == UsbConstants.USB_DIR_OUT) {
                    intf = it;
                    ep = e;
                    break;
                }
            }
        }
        UsbDeviceConnection con = um.openDevice(dev);
        if (con == null || intf == null) {
            call.reject("No se pudo abrir la impresora USB");
            return;
        }
        try {
            con.claimInterface(intf, true);
            for (int off = 0; off < datos.length; off += TROZO) {
                int n = Math.min(TROZO, datos.length - off);
                byte[] trozo = new byte[n];
                System.arraycopy(datos, off, trozo, 0, n);
                if (con.bulkTransfer(ep, trozo, n, 5000) < 0) {
                    call.reject("La impresora USB no recibió los datos");
                    return;
                }
            }
            call.resolve(ok());
        } finally {
            con.releaseInterface(intf);
            con.close();
        }
    }

    private UsbDevice buscarUsb(UsbManager um, Integer vendorId, Integer productId) {
        if (um == null) return null;
        UsbDevice cualquiera = null;
        for (UsbDevice d : um.getDeviceList().values()) {
            if (vendorId != null && productId != null) {
                if (d.getVendorId() == vendorId && d.getProductId() == productId) return d;
                continue;
            }
            if (esClaseImpresora(d)) return d;
            if (cualquiera == null && salidaBulk(d) != null) cualquiera = d;
        }
        return cualquiera;
    }

    private static boolean esClaseImpresora(UsbDevice d) {
        for (int i = 0; i < d.getInterfaceCount(); i++) {
            if (d.getInterface(i).getInterfaceClass() == UsbConstants.USB_CLASS_PRINTER) return true;
        }
        return false;
    }

    private static UsbEndpoint salidaBulk(UsbDevice d) {
        for (int i = 0; i < d.getInterfaceCount(); i++) {
            UsbInterface it = d.getInterface(i);
            for (int j = 0; j < it.getEndpointCount(); j++) {
                UsbEndpoint e = it.getEndpoint(j);
                if (e.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK && e.getDirection() == UsbConstants.USB_DIR_OUT) return e;
            }
        }
        return null;
    }

    // ─── Serie y red ──────────────────────────────────────────────────────

    private static void porSerie(String ruta, byte[] datos) throws Exception {
        try (OutputStream os = new FileOutputStream(ruta)) {
            os.write(datos);
            os.flush();
        }
    }

    private static void porRed(String ip, int puerto, byte[] datos) throws Exception {
        if (ip == null || ip.isEmpty()) throw new Exception("Falta la IP de la impresora");
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(ip, puerto), 4000);
            OutputStream os = s.getOutputStream();
            os.write(datos);
            os.flush();
        }
    }

    private static JSObject ok() {
        JSObject r = new JSObject();
        r.put("ok", true);
        return r;
    }
}
