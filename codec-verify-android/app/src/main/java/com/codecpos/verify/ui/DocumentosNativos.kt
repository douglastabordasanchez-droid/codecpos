package com.codecpos.verify.ui

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import android.util.Base64
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

/**
 * El WebView de Android no descarga archivos, no comparte (no tiene Web Share
 * API) ni imprime PDF. La PWA manda aquí el PDF de la factura (en base64) y
 * se usa lo nativo: la hoja de compartir de Android (WhatsApp, correo,
 * Drive...) y el servicio de impresión del sistema.
 */
object DocumentosNativos {

    /** Guarda el archivo en la caché de la app (la expone FileProvider, ver res/xml/file_paths.xml). */
    fun guardarTemporal(context: Context, base64: String, nombre: String): File {
        val carpeta = File(context.cacheDir, "documentos").apply { mkdirs() }
        // Las facturas viejas se borran: solo hacen falta mientras se comparten.
        carpeta.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 60 * 60_000 }?.forEach { it.delete() }
        val limpio = nombre.replace(Regex("[^\\w.-]+"), "_").ifBlank { "documento.pdf" }
        return File(carpeta, limpio).apply { writeBytes(Base64.decode(base64, Base64.DEFAULT)) }
    }

    fun compartir(context: Context, archivo: File, mime: String, texto: String) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", archivo)
        val envio = Intent(Intent.ACTION_SEND).apply {
            type = mime
            putExtra(Intent.EXTRA_STREAM, uri)
            if (texto.isNotBlank()) putExtra(Intent.EXTRA_TEXT, texto)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val selector = Intent.createChooser(envio, "Compartir factura").apply {
            if (context !is android.app.Activity) addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(selector)
    }

    /** Abre el diálogo de impresión de Android con el PDF tal cual (impresoras Wi-Fi, Bluetooth o "Guardar como PDF"). */
    fun imprimirPdf(context: Context, archivo: File, nombre: String) {
        val manager = context.getSystemService(Context.PRINT_SERVICE) as PrintManager
        manager.print(nombre, AdaptadorPdf(archivo, nombre), PrintAttributes.Builder().build())
    }

    private class AdaptadorPdf(private val archivo: File, private val nombre: String) : PrintDocumentAdapter() {
        override fun onLayout(
            oldAttributes: PrintAttributes?,
            newAttributes: PrintAttributes,
            cancellationSignal: CancellationSignal?,
            callback: LayoutResultCallback,
            extras: Bundle?,
        ) {
            if (cancellationSignal?.isCanceled == true) return callback.onLayoutCancelled()
            val info = PrintDocumentInfo.Builder(nombre)
                .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                .build()
            callback.onLayoutFinished(info, oldAttributes != newAttributes)
        }

        override fun onWrite(
            pages: Array<out PageRange>?,
            destination: ParcelFileDescriptor,
            cancellationSignal: CancellationSignal?,
            callback: WriteResultCallback,
        ) {
            try {
                FileInputStream(archivo).use { entrada ->
                    FileOutputStream(destination.fileDescriptor).use { salida -> entrada.copyTo(salida) }
                }
                callback.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
            } catch (e: Exception) {
                callback.onWriteFailed(e.message)
            }
        }
    }
}
