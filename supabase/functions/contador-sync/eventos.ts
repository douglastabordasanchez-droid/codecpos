/**
 * Arma los eventos que Codec POS le manda a Codec Document (pos-ingesta),
 * según el formato acordado con ese proyecto. Sin dependencias de Deno: lo
 * prueba vitest (eventos.test.ts).
 */

export interface VentaFila {
  id: string; numero: number | null; local_id: string | null; created_at: string;
  total: number | string; descuento: number | string | null; propina: number | string | null;
  metodo_pago: string | null; metodos_multiples: unknown; cajero_nombre: string | null; tienda_id: string | null;
}
export interface ItemFila {
  venta_id: string; nombre: string | null; cantidad: number | string; precio_unitario: number | string;
  subtotal: number | string | null; producto_id: string | null;
}
export interface FacturaFila {
  id: string; cufe: string | null; xml: string | null; fecha_emision: string | null; created_at: string; venta_referencia: string | null;
}

const num = (v: unknown) => (v == null || v === '' ? 0 : Number(v) || 0);
const redondear = (v: number) => Math.round(v * 100) / 100;

/** NIT solo con dígitos y sin dígito de verificación ("1049796031-3" → "1049796031"). */
export function nitSoloDigitos(nit: string | null | undefined): string {
  const base = String(nit ?? '').split('-')[0];
  return base.replace(/\D/g, '');
}

const COLOMBIA_MS = -5 * 3600_000;

/** "2026-10-21T15:04:00-05:00" (Colombia no tiene horario de verano). */
export function fechaHoraColombia(ts: string): string {
  const local = new Date(Date.parse(ts) + COLOMBIA_MS).toISOString().slice(0, 19);
  return `${local}-05:00`;
}

/** "2026-10-21", el día en Colombia. */
export function diaColombia(ts: string): string {
  return new Date(Date.parse(ts) + COLOMBIA_MS).toISOString().slice(0, 10);
}

/**
 * Los precios del POS ya traen el IVA incluido (ivaIncluido.ts): de cada
 * ítem se separa la base y el IVA según el porcentaje de su producto.
 */
export function construirEventoVenta(
  venta: VentaFila,
  items: ItemFila[],
  ivaPorProducto: Map<string, number>,
  tienda: string | null,
  facturaCufe: string | null,
) {
  let iva = 0;
  const lineas = items.map((i) => {
    const cantidad = num(i.cantidad);
    const precio = num(i.precio_unitario);
    const subtotal = num(i.subtotal) || redondear(precio * cantidad);
    const ivaPct = (i.producto_id && ivaPorProducto.get(i.producto_id)) || 0;
    iva += ivaPct > 0 ? subtotal - subtotal / (1 + ivaPct / 100) : 0;
    return { nombre: i.nombre || 'Producto', cantidad, precio_unitario: precio, subtotal, iva_pct: ivaPct };
  });
  const brutoItems = lineas.reduce((s, l) => s + l.subtotal, 0);
  iva = redondear(iva);
  const multiples = Array.isArray(venta.metodos_multiples) ? venta.metodos_multiples : [];
  return {
    tipo: 'venta' as const,
    id_origen: venta.id,
    numero: venta.numero,
    fecha: fechaHoraColombia(venta.created_at),
    total: num(venta.total),
    subtotal: redondear(brutoItems - iva),
    iva,
    descuento: num(venta.descuento),
    propina: num(venta.propina),
    medio_pago: venta.metodo_pago || 'efectivo',
    metodos_multiples: multiples,
    cajero: (venta.cajero_nombre || '').trim() || null,
    tienda,
    factura_cufe: facturaCufe,
    items: lineas,
  };
}

export function construirEventoFactura(factura: FacturaFila, ventaId: string | null) {
  return {
    tipo: 'factura_electronica' as const,
    id_origen: factura.id,
    venta_id: ventaId,
    cufe: factura.cufe,
    fecha: diaColombia(factura.fecha_emision || factura.created_at),
    xml: factura.xml,
  };
}

/** Espera antes del siguiente intento: 1, 2, 4… minutos, máximo 6 horas. */
export function minutosHastaReintento(intentos: number): number {
  return Math.min(2 ** Math.max(0, intentos - 1), 360);
}

/**
 * Las facturas del POS cuentan en el cupo mensual de XML del plan del
 * contador. Un rechazo por cupo no es definitivo: la factura se guarda en
 * espera hasta que el contador tenga cupo (mes nuevo o plan mayor).
 */
export function esRechazoPorCupo(motivo: string | null | undefined): boolean {
  return /cupo|l[ií]mite|limite_|quota|plan_/i.test(String(motivo ?? ''));
}

/** 429 y 5xx (o sin respuesta) se reintentan; el resto de 4xx no. */
export function esReintentable(status: number | null): boolean {
  return status === null || status === 429 || status >= 500;
}
