/**
 * Ventas con el mismo número en dos cajas.
 *
 * La nube identifica cada venta por (cliente_id, local_id) y el local_id es
 * el número de la venta. Dos computadores sin letra de caja numeran igual
 * (FE000541 en los dos), así que la segunda en subir reemplazaba a la
 * primera. La hora de la venta dice si la fila que ya está en la nube es
 * esta misma venta (un reintento) u otra con el mismo número.
 */

/** Más de 2 minutos de diferencia en la hora = es otra venta con el mismo número. */
export const MARGEN_MISMA_VENTA_MS = 2 * 60 * 1000;

export function esOtraVenta(creadaEnNube: string, creadaLocal: number | string | undefined): boolean {
  const nube = Date.parse(creadaEnNube);
  const local = typeof creadaLocal === 'number' ? creadaLocal : Date.parse(String(creadaLocal || ''));
  if (!Number.isFinite(nube) || !Number.isFinite(local)) return false;
  return Math.abs(nube - local) > MARGEN_MISMA_VENTA_MS;
}
