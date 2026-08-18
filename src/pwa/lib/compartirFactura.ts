/**
 * Fase 7: puente al ecosistema Codec — genera el PDF de una venta ya
 * sincronizada en Supabase (reutilizando `generarFacturaPDF`, el mismo
 * generador que usa Electron) y lo comparte desde el celular. Web Share
 * API (nivel 2, con archivos) cuando el navegador lo soporta; si no,
 * descarga el PDF y abre WhatsApp Web con un mensaje — el usuario adjunta
 * el archivo manualmente. Punto de integración para Codec Document: cuando
 * exista, este mismo Blob es lo que se subiría en vez de descargarlo.
 */
import { format } from 'date-fns';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { generarFacturaPDF } from '../../app/lib/pdfGenerator';

interface NegocioInfo {
  nombre_negocio: string | null;
  nit: string | null;
  telefono: string | null;
  email: string | null;
}

interface VentaParaCompartir {
  id: string;
  numero: number | null;
  created_at: string;
  total: number;
  metodo_pago: string | null;
  cajero_nombre: string | null;
}

async function construirDatosFactura(clienteId: string, venta: VentaParaCompartir) {
  const client = getSupabaseClient();
  if (!client) throw new Error('nuestra base de datos no está configurada');

  const [{ data: negocio }, { data: items }] = await Promise.all([
    client
      .from('clientes_pos')
      .select('nombre_negocio, nit, telefono, email')
      .eq('id', clienteId)
      .maybeSingle(),
    client
      .from('venta_items')
      .select('nombre, cantidad, precio_unitario, subtotal')
      .eq('venta_id', venta.id),
  ]);

  const negocioInfo = (negocio as NegocioInfo | null) || { nombre_negocio: null, nit: null, telefono: null, email: null };

  const config = {
    nombreComercial: negocioInfo.nombre_negocio || 'Mi Negocio',
    razonSocial: negocioInfo.nombre_negocio || 'Mi Negocio',
    nit: negocioInfo.nit || '',
    direccion: '',
    telefono: negocioInfo.telefono || '',
    email: negocioInfo.email || '',
    ciudad: '',
  };

  const facturaVenta = {
    numeroFactura: venta.numero ? String(venta.numero) : venta.id.slice(0, 8),
    fecha: venta.created_at,
    items: (items || []).map((it: any) => ({
      nombre: it.nombre || 'Producto',
      cantidad: Number(it.cantidad),
      precio: Number(it.precio_unitario),
      subtotal: Number(it.subtotal ?? it.cantidad * it.precio_unitario),
    })),
    subtotal: Number(venta.total),
    iva: 0,
    total: Number(venta.total),
    metodoPago: venta.metodo_pago || 'No especificado',
    cajero: venta.cajero_nombre || 'N/A',
  };

  return { config, facturaVenta };
}

/**
 * Abre la factura en una pestaña nueva usando el visor de PDF nativo del
 * navegador — ese visor ya trae su propio botón de imprimir, así que
 * cualquier impresora instalada en Windows (térmica incluida, si tiene
 * driver) queda disponible sin integración adicional. Es el respaldo real
 * si Electron falla: misma factura, mismo generador (pdfGenerator.ts), solo
 * cambia cómo se le entrega al usuario.
 */
export async function verFactura(clienteId: string, venta: VentaParaCompartir): Promise<{ ok: boolean; error?: string }> {
  try {
    const { config, facturaVenta } = await construirDatosFactura(clienteId, venta);
    const blob = await generarFacturaPDF(facturaVenta, config);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'No se pudo generar el PDF' };
  }
}

export async function compartirRecibo(clienteId: string, venta: VentaParaCompartir): Promise<{ ok: boolean; error?: string }> {
  try {
    const { config, facturaVenta } = await construirDatosFactura(clienteId, venta);
    const blob = await generarFacturaPDF(facturaVenta, config);
    const nombreArchivo = `Factura_${facturaVenta.numeroFactura}_${format(new Date(facturaVenta.fecha), 'yyyyMMdd')}.pdf`;

    const archivo = new File([blob], nombreArchivo, { type: 'application/pdf' });

    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      await navigator.share({
        files: [archivo],
        title: `Factura ${facturaVenta.numeroFactura}`,
        text: `Factura ${facturaVenta.numeroFactura} · ${config.nombreComercial}`,
      });
      return { ok: true };
    }

    // Fallback: sin soporte de archivos en Web Share — se descarga el PDF y
    // se abre WhatsApp con un mensaje, el usuario adjunta el archivo desde
    // su carpeta de descargas.
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nombreArchivo;
    link.click();
    URL.revokeObjectURL(url);

    const mensaje = encodeURIComponent(
      `Factura ${facturaVenta.numeroFactura} · ${config.nombreComercial} · Total: $${facturaVenta.total.toLocaleString('es-CO')}`
    );
    window.open(`https://wa.me/?text=${mensaje}`, '_blank');

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'No se pudo generar el PDF' };
  }
}
