/**
 * Datos del ticket de una venta hecha en la web/celular, con la misma
 * información del negocio que imprime Electron (configuración de empresa que
 * Electron sincroniza a la nube y su logo).
 */
import type { TicketData } from '../../app/lib/thermalPrinter';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { nombreMedioPago } from '../../app/lib/voz';

interface Empresa {
  datos: Record<string, any>;
  logoUrl: string;
  nombre: string;
  expira: number;
}

let cache: { clienteId: string; empresa: Empresa } | null = null;

export async function obtenerEmpresaWeb(clienteId: string): Promise<Empresa> {
  if (cache && cache.clienteId === clienteId && cache.empresa.expira > Date.now()) return cache.empresa;
  const client = getSupabaseClient();
  const [{ data: conf }, { data: negocio }] = await Promise.all([
    client!.from('empresa_configuraciones').select('datos, logo_path').eq('cliente_id', clienteId).maybeSingle(),
    client!.from('clientes_pos').select('nombre_negocio, nit, telefono').eq('id', clienteId).maybeSingle(),
  ]);
  const datos = { ...((conf as any)?.datos || {}) } as Record<string, any>;
  datos.nit ||= (negocio as any)?.nit || '';
  datos.telefono ||= (negocio as any)?.telefono || '';
  let logoUrl = '';
  const ruta = (conf as any)?.logo_path;
  if (ruta) {
    // El logo se convierte a data URL: así la impresora y el diálogo de impresión no dependen de un enlace que vence.
    const { data } = await client!.storage.from('empresa-logos').download(ruta);
    if (data) logoUrl = await new Promise<string>((ok) => { const f = new FileReader(); f.onload = () => ok(String(f.result)); f.onerror = () => ok(''); f.readAsDataURL(data); });
  }
  const empresa = { datos, logoUrl, nombre: datos.nombreComercial || (negocio as any)?.nombre_negocio || 'Mi negocio', expira: Date.now() + 10 * 60_000 };
  cache = { clienteId, empresa };
  return empresa;
}

export interface VentaParaTicket {
  numero: number | string;
  fecha?: string;
  items: Array<{ nombre: string; cantidad: number; precio: number }>;
  total: number;
  propina?: number;
  descuento?: number;
  metodoPago: string;
  cambio?: number;
  cajero?: string;
}

export async function armarTicketVenta(clienteId: string, v: VentaParaTicket): Promise<TicketData> {
  const { datos, logoUrl, nombre } = await obtenerEmpresaWeb(clienteId);
  const prefijo = datos.prefijoFactura || '';
  const numero = typeof v.numero === 'number' ? `${prefijo}${String(v.numero).padStart(6, '0')}` : v.numero;
  const subtotal = v.items.reduce((a, it) => a + it.cantidad * it.precio, 0);
  return {
    logoUrl: logoUrl || undefined,
    header: nombre,
    razonSocial: datos.razonSocial || undefined,
    nit: datos.nit ? `${datos.nit}${datos.digitoVerificacion ? `-${datos.digitoVerificacion}` : ''}` : undefined,
    eslogan: datos.eslogan || undefined,
    direccion: datos.direccion || undefined,
    ciudad: datos.ciudad || undefined,
    telefono: datos.telefono || undefined,
    email: datos.email || undefined,
    numeroFactura: numero,
    fecha: v.fecha || new Date().toISOString(),
    prefijoFactura: prefijo || undefined,
    items: v.items.map((it) => ({ nombre: it.nombre, cantidad: it.cantidad, precio: it.precio, total: it.cantidad * it.precio })),
    subtotal,
    descuento: v.descuento || undefined,
    propina: v.propina || undefined,
    total: v.total,
    cajero: v.cajero,
    metodoPago: nombreMedioPago(v.metodoPago) || v.metodoPago,
    cambio: v.cambio || undefined,
    mensajeTirillaArriba: datos.mensajeTirillaArriba || undefined,
    mensajeTirillaBajo: datos.mensajeTirillaBajo || datos.mensajeTirilla || undefined,
  };
}
