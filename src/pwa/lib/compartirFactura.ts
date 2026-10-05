/**
 * Fase 7: puente al ecosistema Codec — genera el PDF de una venta ya
 * sincronizada en Supabase (reutilizando `generarFacturaPDF`, el mismo
 * generador que usa Electron) y lo comparte desde el celular. Web Share
 * API (nivel 2, con archivos) cuando el navegador lo soporta; si no,
 * descarga el PDF y abre WhatsApp Web con un mensaje — el usuario adjunta
 * el archivo manualmente. Punto de integración para Codec Document: cuando
 * exista, este mismo Blob es lo que se subiría en vez de descargarlo.
 */
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { construirUrlQR } from '../../app/lib/dian/softwareSecurityCode';
import { generarFacturaPDF, nombreArchivoFactura, type ConfigEmpresa, type Venta as VentaFactura } from '../../app/lib/pdfGenerator';
import { compartirPdf, descargarPdf } from '../../app/lib/archivoPdf';

interface VentaParaCompartir {
  id: string;
  numero: number | null;
  created_at: string;
  total: number;
  metodo_pago: string | null;
  cajero_nombre: string | null;
}

/**
 * Los datos del negocio y el enlace del logo son iguales para todas las
 * facturas: se guardan 4 minutos (el enlace firmado del logo dura 5) para que
 * abrir varias facturas seguidas no repita esas consultas.
 */
const configCache = new Map<string, { hasta: number; promesa: Promise<ConfigEmpresa> }>();

function configDelNegocio(clienteId: string): Promise<ConfigEmpresa> {
  const guardada = configCache.get(clienteId);
  if (guardada && guardada.hasta > Date.now()) return guardada.promesa;
  const promesa = cargarConfigDelNegocio(clienteId);
  configCache.set(clienteId, { hasta: Date.now() + 4 * 60_000, promesa });
  promesa.catch(() => configCache.delete(clienteId));
  return promesa;
}

async function cargarConfigDelNegocio(clienteId: string): Promise<ConfigEmpresa> {
  const client = getSupabaseClient();
  if (!client) throw new Error('nuestra base de datos no está configurada');
  const [{ data: negocio }, { data: empresa }] = await Promise.all([
    client.from('clientes_pos').select('nombre_negocio, nit, telefono, email, ciudad').eq('id', clienteId).maybeSingle(),
    client.from('empresa_configuraciones').select('datos, logo_path').eq('cliente_id', clienteId).maybeSingle(),
  ]);

  const n = (negocio as Record<string, any> | null) || {};
  const datos = ((empresa as { datos?: Record<string, any> } | null)?.datos || {}) as Record<string, any>;
  const logoPath = (empresa as { logo_path?: string | null } | null)?.logo_path;
  let logoUrl = '';
  if (logoPath) {
    const { data: firmado } = await client.storage.from('empresa-logos').createSignedUrl(logoPath, 300);
    logoUrl = firmado?.signedUrl || '';
  }

  const config: ConfigEmpresa = {
    nombreComercial: datos.nombreComercial || n.nombre_negocio || 'Mi negocio',
    razonSocial: datos.razonSocial || n.nombre_negocio || '',
    nit: datos.nit || n.nit || '',
    digitoVerificacion: datos.digitoVerificacion || '',
    direccion: datos.direccion || '',
    telefono: datos.telefono || n.telefono || '',
    email: datos.email || n.email || '',
    ciudad: datos.ciudad || n.ciudad || '',
    departamento: datos.departamento || '',
    regimenFiscal: datos.regimenFiscal || '',
    mensajeTirilla: datos.mensajeTirilla || '',
    prefijoFactura: datos.prefijoFactura || '',
    claveResolucionDIAN: datos.claveResolucionDIAN || '',
    fechaResolucionDIAN: datos.fechaResolucionDIAN || '',
    rangoAutorizadoDesde: datos.rangoAutorizadoDesde || '',
    rangoAutorizadoHasta: datos.rangoAutorizadoHasta || '',
    logoUrl,
  };

  return config;
}

/**
 * Datos del negocio como los ve Electron: la configuración de empresa que
 * Electron sincroniza (empresa_configuraciones.datos), su logo (bucket
 * empresa-logos) y, de respaldo, la ficha del negocio en clientes_pos.
 */
export async function obtenerDatosFactura(clienteId: string, venta: VentaParaCompartir): Promise<{ config: ConfigEmpresa; venta: VentaFactura }> {
  const client = getSupabaseClient();
  if (!client) throw new Error('nuestra base de datos no está configurada');

  const [config, { data: items }, { data: ventaFila }] = await Promise.all([
    configDelNegocio(clienteId),
    client.from('venta_items').select('nombre, cantidad, precio_unitario, subtotal').eq('venta_id', venta.id),
    client.from('ventas').select('numero, local_id, descuento, propina, metodos_multiples').eq('id', venta.id).maybeSingle(),
  ]);

  const v = (ventaFila as Record<string, any> | null) || {};
  const pagoMixto = v.metodos_multiples && typeof v.metodos_multiples === 'object' && !Array.isArray(v.metodos_multiples)
    ? v.metodos_multiples as Record<string, number>
    : null;
  const numero = venta.numero ?? v.numero;

  const facturaVenta: VentaFactura = {
    // Mismo número que imprime Electron (FE003998): el local_id que sube cada venta;
    // las ventas hechas en la web usan el mismo formato, prefijo y seis dígitos.
    numeroFactura: (typeof v.local_id === 'string' && /^[A-Za-z]*\d+$/.test(v.local_id)) ? v.local_id
      : numero ? `${config.prefijoFactura || ''}${String(numero).padStart(6, '0')}` : venta.id.slice(0, 8).toUpperCase(),
    fecha: venta.created_at,
    items: (items || []).map((it: any) => ({
      nombre: it.nombre || 'Producto',
      cantidad: Number(it.cantidad),
      precio: Number(it.precio_unitario),
      subtotal: Number(it.subtotal ?? it.cantidad * it.precio_unitario),
    })),
    subtotal: Number(venta.total),
    iva: 0,
    descuento: Number(v.descuento) || 0,
    propina: Number(v.propina) || 0,
    total: Number(venta.total),
    metodoPago: venta.metodo_pago || 'No especificado',
    pagoMixto,
    cajero: venta.cajero_nombre || '',
  };

  // ¿La venta tiene factura electrónica? Se enlaza por el número de la venta
  // (venta_referencia = FE003998, el mismo que imprime Electron).
  const referencias = [facturaVenta.numeroFactura, venta.id].filter(Boolean);
  const { data: fe } = await client
    .from('facturas_electronicas')
    .select('prefijo, numero_factura, cufe, estado, issuer_ambiente, cliente_nit, cliente_nombre, cliente_email, cliente_telefono')
    .eq('cliente_id', clienteId)
    .in('venta_referencia', referencias)
    .not('cufe', 'is', null)
    .neq('estado', 'rejected')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fe) {
    const f = fe as Record<string, any>;
    facturaVenta.cufe = f.cufe;
    facturaVenta.qrUrl = construirUrlQR(f.cufe, f.issuer_ambiente === 'produccion' ? 'produccion' : 'habilitacion');
    facturaVenta.numeroElectronico = `${f.prefijo || ''}${f.numero_factura ?? ''}` || null;
    if (f.cliente_nombre) facturaVenta.cliente = f.cliente_nombre;
    if (f.cliente_nit) facturaVenta.clienteDocumento = f.cliente_nit;
    if (f.cliente_telefono) facturaVenta.clienteTelefono = f.cliente_telefono;
    if (f.cliente_email) facturaVenta.clienteEmail = f.cliente_email;
  }

  return { config, venta: facturaVenta };
}

/**
 * Comparte el PDF: en la app Android con la hoja nativa, en el celular con la
 * del sistema; si el equipo no comparte archivos, se descarga el PDF y se abre
 * WhatsApp con el mensaje para adjuntarlo a mano.
 */
export async function compartirRecibo(clienteId: string, venta: VentaParaCompartir): Promise<{ ok: boolean; error?: string }> {
  try {
    const { config, venta: facturaVenta } = await obtenerDatosFactura(clienteId, venta);
    const blob = await generarFacturaPDF(facturaVenta, config);
    const nombreArchivo = nombreArchivoFactura(facturaVenta);
    const mensaje = `Factura ${facturaVenta.numeroFactura} · ${config.nombreComercial} · Total: $${facturaVenta.total.toLocaleString('es-CO')}`;

    if (await compartirPdf(blob, nombreArchivo, `Factura ${facturaVenta.numeroFactura}`, mensaje)) return { ok: true };

    descargarPdf(blob, nombreArchivo);
    window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'No se pudo generar el PDF' };
  }
}
