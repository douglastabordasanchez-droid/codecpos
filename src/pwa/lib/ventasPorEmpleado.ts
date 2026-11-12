/**
 * Ventas por empleado en el celular y la web del administrador.
 *
 * Cada venta trae el nombre de quien la hizo (cajero_nombre), tanto las de
 * Electron como las del celular. Los cajeros de Electron muchas veces solo
 * existen en ese PC, así que la lista de empleados sale de las ventas mismas.
 * El nombre se compara sin mayúsculas ni espacios de más: «Michell » y
 * «Michell» son la misma persona.
 */
import { ventaSinPropina } from '../../app/lib/propinas';

export interface VentaConCajero {
  cajero_nombre?: string | null;
  total: number | string;
  propina?: number | string | null;
}

export interface ResumenEmpleado {
  clave: string;
  nombre: string;
  cantidad: number;
  total: number;
  propinas: number;
}

export const SIN_CAJERO = '__sin_cajero__';

export function claveEmpleado(nombre: string | null | undefined): string {
  const limpio = (nombre || '').trim().replace(/\s+/g, ' ').toLowerCase();
  return limpio || SIN_CAJERO;
}

export function nombreVisibleEmpleado(nombre: string | null | undefined): string {
  return (nombre || '').trim().replace(/\s+/g, ' ') || 'Sin cajero';
}

export function filtrarPorEmpleado<T extends VentaConCajero>(ventas: T[], clave: string | null): T[] {
  if (!clave) return ventas;
  return ventas.filter((v) => claveEmpleado(v.cajero_nombre) === clave);
}

/** Total, cantidad y propinas de cada empleado, de mayor a menor venta. */
export function resumirPorEmpleado(ventas: VentaConCajero[]): ResumenEmpleado[] {
  const mapa = new Map<string, ResumenEmpleado>();
  for (const v of ventas) {
    const clave = claveEmpleado(v.cajero_nombre);
    let r = mapa.get(clave);
    if (!r) {
      r = { clave, nombre: nombreVisibleEmpleado(v.cajero_nombre), cantidad: 0, total: 0, propinas: 0 };
      mapa.set(clave, r);
    }
    r.cantidad += 1;
    r.total += ventaSinPropina(v as any);
    r.propinas += Math.max(0, Number(v.propina) || 0);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
}

/**
 * Filtro de la Tienda Principal: las ventas de la principal llegan con
 * tienda_id vacío (cajas sin sedes) o 'tienda_principal' (multitienda).
 * Antes solo se buscaba el vacío y se escondían las otras.
 */
export const FILTRO_TIENDA_PRINCIPAL = 'tienda_id.is.null,tienda_id.eq.tienda_principal';
