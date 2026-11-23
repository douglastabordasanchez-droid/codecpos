/**
 * Pagos sin venta: dinero que entró por Bre-B, Nequi, Daviplata u otro banco
 * (avisos de Codec Verify en `notificaciones_pago`) y que no quedó en ninguna
 * venta. Sirve de control: si la cajera cobró como efectivo o no registró la
 * venta, el ingreso igual se ve en Ventas.
 *
 * Un pago cuenta como "con venta" si:
 *  1) una venta lo reclamó mientras esperaba el pago (numero_factura_local no es null), o
 *  2) hay una venta no en efectivo del mismo valor 30 minutos antes o después
 *     (cada venta se usa una sola vez), o
 *  3) alguien lo marcó como revisado («REVISADO · …»).
 */
import { getSupabaseClient } from './config';

export interface PagoSinVenta {
  id: string;
  monto: number;
  entidad: string | null;
  referencia: string | null;
  created_at: string;
}

const VENTANA_MS = 30 * 60 * 1000;

interface VentaCruce { local_id?: string | null; total: number; propina?: number | null; metodo_pago: string | null; metodos_multiples: unknown; created_at: string; estado: string | null }

/** Venta guardada en este equipo (caja o terminal), que quizá aún no subió a la nube. */
export interface VentaLocalCruce { numeroFactura?: string; fecha: string; total: number; propina?: number; metodoPago: string; metodosMultiples?: unknown }

/** Partes pagadas por medios que no son efectivo (mixto: cada parte). Cada parte acepta varios valores. */
function partesNoEfectivo(v: VentaCruce): number[][] {
  const metodo = String(v.metodo_pago || '').toLowerCase();
  const mm = v.metodos_multiples;
  let partes: number[] = [];
  if (Array.isArray(mm)) {
    partes = mm.filter((x: any) => x && String(x.metodo || '').toLowerCase() !== 'efectivo' && Number(x.monto) > 0).map((x: any) => Math.round(Number(x.monto)));
  } else if (mm && typeof mm === 'object') {
    partes = Object.entries(mm as Record<string, unknown>)
      .filter(([m, valor]) => m.toLowerCase() !== 'efectivo' && Number(valor) > 0)
      .map(([, valor]) => Math.round(Number(valor)));
  }
  if (partes.length) return partes.map((x) => [x]);
  if (!metodo || metodo === 'efectivo' || metodo === 'mixto') return [];
  const total = Math.round(Number(v.total) || 0);
  const propina = Math.round(Number(v.propina) || 0);
  // El cliente pudo transferir con o sin la propina.
  return [propina > 0 ? [total, total + propina, total - propina] : [total]];
}

export async function listarPagosSinVenta(
  clienteId: string,
  desde: Date,
  hasta: Date = new Date(),
  ventasLocales: VentaLocalCruce[] = [],
): Promise<PagoSinVenta[]> {
  const client = getSupabaseClient();
  if (!client || !clienteId) return [];
  const { data: pagos, error } = await client
    .from('notificaciones_pago')
    .select('id, monto, entidad, referencia, created_at, numero_factura_local, estado')
    .eq('cliente_id', clienteId)
    .eq('estado', 'confirmado')
    .gt('monto', 0)
    .gte('created_at', desde.toISOString())
    .lte('created_at', hasta.toISOString())
    .order('created_at', { ascending: true })
    .limit(2000);
  if (error || !pagos?.length) return [];

  const { data: ventas } = await client
    .from('ventas')
    .select('local_id, total, propina, metodo_pago, metodos_multiples, created_at, estado')
    .eq('cliente_id', clienteId)
    .neq('metodo_pago', 'efectivo')
    .gte('created_at', new Date(desde.getTime() - VENTANA_MS).toISOString())
    .lte('created_at', new Date(hasta.getTime() + VENTANA_MS).toISOString())
    .limit(5000);

  // Bolsa de cobros no en efectivo: { valores aceptados, hora, usado }. Nube + este equipo, sin repetir.
  const nube = ((ventas || []) as VentaCruce[]).filter((v) => !/anulad|cancelad/i.test(String(v.estado || '')));
  const enNube = new Set(nube.map((v) => String(v.local_id || '')).filter(Boolean));
  const locales: VentaCruce[] = ventasLocales
    .filter((v) => !v.numeroFactura || !enNube.has(String(v.numeroFactura)))
    .map((v) => ({ local_id: v.numeroFactura, total: v.total, propina: v.propina, metodo_pago: v.metodoPago, metodos_multiples: v.metodosMultiples, created_at: v.fecha, estado: null }));
  const cobros = [...nube, ...locales]
    .flatMap((v) => partesNoEfectivo(v).map((valores) => ({ valores, hora: Date.parse(v.created_at), usado: false })))
    .filter((c) => Number.isFinite(c.hora));

  const usarCobro = (monto: number, hora: number): boolean => {
    let mejor: (typeof cobros)[number] | null = null;
    for (const c of cobros) {
      if (c.usado || !c.valores.includes(monto)) continue;
      const d = Math.abs(c.hora - hora);
      if (d <= VENTANA_MS && (!mejor || d < Math.abs(mejor.hora - hora))) mejor = c;
    }
    if (mejor) mejor.usado = true;
    return !!mejor;
  };

  const filas = pagos as Array<PagoSinVenta & { numero_factura_local: string | null }>;
  // Primero los que ya tienen venta (reclamados), para que no "roben" la venta de otro pago.
  for (const p of filas) {
    if (p.numero_factura_local !== null) usarCobro(Math.round(Number(p.monto)), Date.parse(p.created_at));
  }
  const sinVenta: PagoSinVenta[] = [];
  for (const p of filas) {
    if (p.numero_factura_local !== null) continue;
    if (usarCobro(Math.round(Number(p.monto)), Date.parse(p.created_at))) continue;
    sinVenta.push({ id: p.id, monto: Number(p.monto) || 0, entidad: p.entidad, referencia: p.referencia, created_at: p.created_at });
  }
  return sinVenta.reverse();
}

/** Marca un pago como revisado (ya se registró a mano, era un abono, etc.). Sale de la lista. */
export async function marcarPagoRevisado(id: string, quien: string, nota?: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  const texto = ['REVISADO', quien || 'sin nombre', new Date().toLocaleString('es-CO'), nota?.trim()].filter(Boolean).join(' · ');
  const { data, error } = await client
    .from('notificaciones_pago')
    .update({ numero_factura_local: texto.slice(0, 200) })
    .eq('id', id)
    .is('numero_factura_local', null)
    .select('id');
  return !error && Array.isArray(data) && data.length > 0;
}
