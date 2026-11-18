/**
 * Nota crédito emitida desde Facturación → devolución de la venta.
 *
 * El camino contrario ya existía (devolver en el POS emite la nota crédito,
 * ver notaPorDevolucion.ts). Pero una nota crédito hecha a mano desde
 * Facturación solo iba a la DIAN: la venta seguía viva en la caja y la
 * mercancía no volvía al inventario. Aquí, cuando la nota es por devolución
 * (concepto 1) o anulación (concepto 2), se registra la devolución:
 *
 *   • En Electron, si la venta se hizo en ESTE equipo: igual que Ventas ›
 *     Devolución (inventario local, venta marcada devuelta, sube a la nube).
 *   • En los demás casos (web, celular, venta de otro equipo): con la misma
 *     función de la nube que usa Devoluciones del celular, que regresa el
 *     stock en la nube; los equipos lo bajan en su sincronización.
 *
 * Nunca devuelve dos veces: descuenta lo que ya se devolvió de esa venta.
 * Nunca lanza: la nota ya quedó emitida.
 */
import { getSupabaseClient } from '../supabase/config';
import type { FacturaElectronicaDian, ItemFacturaDian } from './types';

/** Conceptos de nota crédito que significan que la mercancía vuelve. */
export const CONCEPTOS_QUE_DEVUELVEN = ['1', '2'];

export type ResultadoDevolucionPorNota =
  | { estado: 'devuelta'; donde: 'equipo' | 'nube'; total: number; unidades: number; ventaCompleta: boolean }
  | { estado: 'nada_pendiente' }
  | { estado: 'sin_venta' }
  | { estado: 'no_aplica' }
  | { estado: 'error'; motivo: string };

const norm = (v?: string | null) => String(v ?? '').trim().toLowerCase();
const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LineaVenta {
  /** id local del producto (Electron) o id de la línea (nube). */
  clave: string;
  productoId: string | null;
  codigo?: string;
  nombre: string;
  cantidad: number;
  precio: number;
}

/** Qué devolver de cada línea: todo lo pendiente o lo que dice la nota. */
export function cantidadesADevolver(
  lineas: LineaVenta[],
  yaDevuelto: (l: LineaVenta) => number,
  lineasNota: ItemFacturaDian[] | null,
): Array<{ linea: LineaVenta; cantidad: number }> {
  const pendiente = new Map(lineas.map((l) => [l, Math.max(0, l.cantidad - yaDevuelto(l))]));
  if (!lineasNota) {
    return lineas.map((l) => ({ linea: l, cantidad: pendiente.get(l) || 0 })).filter((x) => x.cantidad > 0);
  }
  const salida: Array<{ linea: LineaVenta; cantidad: number }> = [];
  for (const n of lineasNota) {
    const linea = lineas.find((l) => (pendiente.get(l) || 0) > 0 && (
      (n.codigo && l.codigo && norm(n.codigo) === norm(l.codigo)) || norm(n.descripcion) === norm(l.nombre)));
    if (!linea) continue;
    const cantidad = Math.min(Number(n.cantidad) || 0, pendiente.get(linea) || 0);
    if (cantidad <= 0) continue;
    pendiente.set(linea, (pendiente.get(linea) || 0) - cantidad);
    salida.push({ linea, cantidad });
  }
  return salida;
}

/** Devolución en ESTE equipo (Electron), para una venta hecha aquí. */
async function devolverEnEsteEquipo(
  ref: string[],
  lineasNota: ItemFacturaDian[] | null,
  motivo: string,
  numeroNota: string,
  usuario: string,
): Promise<ResultadoDevolucionPorNota | null> {
  if (typeof window === 'undefined' || !(window as any).electron) return null;
  const { electronStore } = await import('../electronStore');
  const ventas = await electronStore.obtenerVentas();
  const venta = ventas.find((v: any) => ref.some((r) => r && (v.id === r || v.numeroFactura === r)));
  // Una venta que bajó de la web o del celular vive en la nube: allá se devuelve.
  if (!venta || ((venta as any).supabaseId && (venta as any).supabaseId === venta.id)) return null;

  let historial: any[] = [];
  try { historial = JSON.parse(localStorage.getItem('codecpos_devoluciones') || '[]'); } catch { historial = []; }
  const previas = historial.filter((d) => d?.ventaId === venta.id);
  const devueltoPorProducto = new Map<string, number>();
  for (const d of previas) for (const i of d.items || []) {
    devueltoPorProducto.set(i.productoId, (devueltoPorProducto.get(i.productoId) || 0) + (Number(i.cantidadDevuelta) || 0));
  }

  const lineas: LineaVenta[] = (venta.items || []).map((it: any) => ({
    clave: it.id, productoId: it.id, codigo: it.codigo, nombre: it.nombre,
    cantidad: Number(it.cantidad) || 0, precio: Number(it.precioVenta ?? it.precio) || 0,
  }));
  // Lo ya devuelto se reparte en orden si un producto aparece en varias líneas.
  const restante = new Map(devueltoPorProducto);
  const yaDevuelto = (l: LineaVenta) => {
    const r = restante.get(l.clave) || 0;
    const usado = Math.min(r, l.cantidad);
    restante.set(l.clave, r - usado);
    return usado;
  };
  const aDevolver = cantidadesADevolver(lineas, yaDevuelto, lineasNota);
  if (aDevolver.length === 0) return { estado: 'nada_pendiente' };

  const items = aDevolver.map(({ linea, cantidad }) => ({
    productoId: linea.clave,
    nombre: linea.nombre,
    cantidadDevuelta: cantidad,
    precioUnitario: linea.precio,
    subtotal: linea.precio * cantidad,
    motivo,
  }));
  const total = items.reduce((s, i) => s + i.subtotal, 0);
  const totalPorProducto = new Map<string, number>(devueltoPorProducto);
  for (const i of items) totalPorProducto.set(i.productoId, (totalPorProducto.get(i.productoId) || 0) + i.cantidadDevuelta);
  const ventaCompleta = lineas.every((l) => (totalPorProducto.get(l.clave) || 0) >= l.cantidad);

  const devolucion = {
    id: `DEV${Date.now()}`,
    ventaId: venta.id,
    numeroFactura: venta.numeroFactura || venta.id,
    fecha: new Date().toISOString(),
    items,
    totalDevolucion: total,
    metodoPago: venta.metodoPago,
    procesadoPor: usuario,
    observaciones: `Nota crédito ${numeroNota}`,
    estado: 'completada' as const,
  };
  await electronStore.registrarDevolucionAtomica({
    devolucion: {
      ...devolucion,
      items: items.map((i) => ({ productoId: i.productoId, cantidadDevuelta: i.cantidadDevuelta, precioUnitario: i.precioUnitario, subtotal: i.subtotal })),
    } as any,
    marcarVentaComoDevuelta: ventaCompleta,
  });
  // registrarDevolucionAtomica guarda la versión corta; el historial lleva nombres y motivo.
  try {
    const lista: any[] = JSON.parse(localStorage.getItem('codecpos_devoluciones') || '[]');
    const i = lista.findIndex((d) => d?.id === devolucion.id);
    if (i >= 0) lista[i] = { ...lista[i], ...devolucion };
    else lista.push(devolucion);
    localStorage.setItem('codecpos_devoluciones', JSON.stringify(lista));
  } catch { /* el inventario ya volvió; el nombre en el historial no es crítico */ }

  return { estado: 'devuelta', donde: 'equipo', total, unidades: items.reduce((s, i) => s + i.cantidadDevuelta, 0), ventaCompleta };
}

/** Devolución en la nube (web, celular o venta de otro equipo). */
async function devolverEnNube(
  clienteId: string,
  ref: string[],
  lineasNota: ItemFacturaDian[] | null,
  motivo: string,
  numeroNota: string,
  usuario: { id?: string | null; nombre: string },
): Promise<ResultadoDevolucionPorNota> {
  const client = getSupabaseClient();
  if (!client) return { estado: 'error', motivo: 'Sin conexión con la nube' };

  let venta: { id: string; local_id: string | null; numero: number | null; metodo_pago: string | null } | null = null;
  for (const r of ref.filter(Boolean)) {
    const campos = 'id, local_id, numero, metodo_pago';
    const q = ES_UUID.test(r)
      ? client.from('ventas').select(campos).eq('cliente_id', clienteId).eq('id', r)
      : client.from('ventas').select(campos).eq('cliente_id', clienteId).or(`local_id.eq.${r},local_id.like.${r}-*`);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(1);
    if (error) return { estado: 'error', motivo: error.message };
    if (data && data[0]) { venta = data[0] as any; break; }
  }
  if (!venta) return { estado: 'sin_venta' };

  const { data: itemsVenta, error: eItems } = await client
    .from('venta_items').select('id, producto_id, nombre, cantidad, precio_unitario').eq('venta_id', venta.id);
  if (eItems) return { estado: 'error', motivo: eItems.message };

  // Lo ya devuelto: por la venta en la nube o por su número (devoluciones de Electron).
  const numeros = [venta.local_id, ...ref].filter(Boolean) as string[];
  const { data: previas } = await client
    .from('devoluciones').select('id, venta_id, numero_factura')
    .eq('cliente_id', clienteId)
    .or([`venta_id.eq.${venta.id}`, ...numeros.map((n) => `numero_factura.eq.${n}`)].join(','));
  const devueltoPorNombre = new Map<string, number>();
  const idsPrevias = (previas || []).map((d: any) => d.id);
  if (idsPrevias.length > 0) {
    const { data: itemsPrevios } = await client.from('devolucion_items').select('nombre, cantidad').in('devolucion_id', idsPrevias);
    for (const it of (itemsPrevios || []) as any[]) {
      devueltoPorNombre.set(norm(it.nombre), (devueltoPorNombre.get(norm(it.nombre)) || 0) + (Number(it.cantidad) || 0));
    }
  }

  const lineas: LineaVenta[] = ((itemsVenta || []) as any[]).map((it) => ({
    clave: it.id, productoId: it.producto_id, nombre: it.nombre || 'Producto',
    cantidad: Number(it.cantidad) || 0, precio: Number(it.precio_unitario) || 0,
  }));
  const restante = new Map(devueltoPorNombre);
  const yaDevuelto = (l: LineaVenta) => {
    const r = restante.get(norm(l.nombre)) || 0;
    const usado = Math.min(r, l.cantidad);
    restante.set(norm(l.nombre), r - usado);
    return usado;
  };
  const pendienteAntes = lineas.map((l) => ({ l, p: l.cantidad - yaDevuelto(l) }));
  restante.clear();
  for (const [k, v] of devueltoPorNombre) restante.set(k, v);
  const aDevolver = cantidadesADevolver(lineas, yaDevuelto, lineasNota);
  if (aDevolver.length === 0) return { estado: 'nada_pendiente' };

  const payload = aDevolver.map(({ linea, cantidad }) => ({
    producto_id: linea.productoId,
    nombre: linea.nombre,
    cantidad,
    precio_unitario: linea.precio,
    motivo,
  }));
  const { error } = await client.rpc('procesar_devolucion_movil', {
    p_cliente_id: clienteId,
    p_venta_id: venta.id,
    p_numero_factura: venta.local_id || ref[0] || null,
    p_metodo_pago: venta.metodo_pago,
    p_observaciones: `Nota crédito ${numeroNota}`,
    p_procesado_por: usuario.id && ES_UUID.test(usuario.id) ? usuario.id : null,
    p_procesado_por_nombre: usuario.nombre,
    p_items: payload,
  });
  if (error) return { estado: 'error', motivo: error.message };

  const devueltoAhora = new Map<LineaVenta, number>();
  for (const x of aDevolver) devueltoAhora.set(x.linea, (devueltoAhora.get(x.linea) || 0) + x.cantidad);
  const ventaCompleta = pendienteAntes.every(({ l, p }) => p - (devueltoAhora.get(l) || 0) <= 0);
  return {
    estado: 'devuelta', donde: 'nube',
    total: payload.reduce((s, x) => s + x.cantidad * x.precio_unitario, 0),
    unidades: payload.reduce((s, x) => s + x.cantidad, 0),
    ventaCompleta,
  };
}

/**
 * Registra la devolución de la venta de una factura tras emitir su nota
 * crédito. `lineasNota` = líneas devueltas (devolución parcial); null =
 * anulación: vuelve todo lo que no se haya devuelto antes.
 */
export async function devolverVentaPorNotaCredito(datos: {
  factura: FacturaElectronicaDian;
  conceptoCodigo: string;
  numeroNota: string;
  motivo: string;
  lineasNota: ItemFacturaDian[] | null;
  usuario: { id?: string | null; nombre: string };
}): Promise<ResultadoDevolucionPorNota> {
  if (!CONCEPTOS_QUE_DEVUELVEN.includes(datos.conceptoCodigo)) return { estado: 'no_aplica' };
  const ref = [datos.factura.ventaReferencia].filter(Boolean) as string[];
  if (ref.length === 0) return { estado: 'sin_venta' };
  const motivo = (datos.motivo || (datos.conceptoCodigo === '2' ? 'Anulación de la factura' : 'Devolución')).slice(0, 200);
  try {
    const local = await devolverEnEsteEquipo(ref, datos.lineasNota, motivo, datos.numeroNota, datos.usuario.nombre);
    if (local) return local;
    return await devolverEnNube(datos.factura.clienteId, ref, datos.lineasNota, motivo, datos.numeroNota, datos.usuario);
  } catch (e: any) {
    return { estado: 'error', motivo: e?.message || 'Error inesperado' };
  }
}

/** Mensaje para el cajero según cómo quedó la devolución. */
export function avisoDevolucionPorNota(r: ResultadoDevolucionPorNota): { tipo: 'success' | 'info' | 'warning'; texto: string } | null {
  const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;
  switch (r.estado) {
    case 'devuelta':
      return {
        tipo: 'success',
        texto: `${r.ventaCompleta ? 'Venta anulada' : 'Devolución registrada'}: ${r.unidades} unidad(es) volvieron al inventario (${money(r.total)}).`,
      };
    case 'nada_pendiente':
      return { tipo: 'info', texto: 'Esa venta ya estaba devuelta: el inventario no cambia.' };
    case 'sin_venta':
      return { tipo: 'warning', texto: 'No se encontró la venta de esta factura: devuelve la mercancía a mano desde Ventas.' };
    case 'error':
      return { tipo: 'warning', texto: `La nota quedó, pero no se pudo devolver la venta al inventario (${r.motivo}). Hazlo desde Ventas › Devolución.` };
    default:
      return null;
  }
}
