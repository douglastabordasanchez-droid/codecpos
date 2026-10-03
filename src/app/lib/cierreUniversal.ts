/**
 * Cierre universal de caja.
 *
 * Por defecto el cierre de caja solo cuadra el EFECTIVO (billetes contados vs
 * efectivo esperado). Con el cierre universal activo (lo decide solo el
 * administrador), el cajero además declara cuánto recibió por cada medio
 * electrónico y la diferencia del cierre se calcula sobre la suma de TODOS
 * los medios de pago.
 */

const CIERRE_UNIVERSAL_KEY = 'pos-cierre-universal';

/** Medios de pago no efectivo que se cuadran en el cierre universal (mismas claves que `ventasPorMetodo`). */
export const MEDIOS_CIERRE_UNIVERSAL = [
  { key: 'tarjeta', label: 'Tarjeta' },
  { key: 'nequi', label: 'Nequi' },
  { key: 'daviplata', label: 'Daviplata' },
  { key: 'bre_b', label: 'Bre-B' },
  { key: 'transferencia', label: 'Transferencia' },
  { key: 'bancolombia', label: 'Bancolombia' },
  { key: 'rappi', label: 'Rappi' },
] as const;

export type MedioCierreUniversal = typeof MEDIOS_CIERRE_UNIVERSAL[number]['key'];

/** Una fila del cuadre por medio que queda guardada en el cierre. */
export interface MedioCuadrado {
  medio: MedioCierreUniversal;
  label: string;
  esperado: number;
  declarado: number;
}

export function isCierreUniversalActivo(): boolean {
  try {
    return localStorage.getItem(CIERRE_UNIVERSAL_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setCierreUniversalActivo(activo: boolean): void {
  try {
    localStorage.setItem(CIERRE_UNIVERSAL_KEY, activo ? 'true' : 'false');
  } catch { /* storage lleno: se mantiene el valor anterior */ }
}

/**
 * Lleva el método de pago guardado en un abono de cartera a uno de los medios
 * del cierre universal. Lo que no coincide con ninguno cae en tarjeta o
 * transferencia según su canal (mismo criterio que el arqueo por canal).
 */
export function medioCierreDesdeMetodo(metodoRaw: string): MedioCierreUniversal | null {
  const metodo = String(metodoRaw || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (!metodo || metodo === 'efectivo') return null;
  if (metodo === 'breb') return 'bre_b';
  const directo = MEDIOS_CIERRE_UNIVERSAL.find((m) => m.key === metodo);
  if (directo) return directo.key;
  if (['tarjeta_banco', 'banco', 'cheque', 'datafono', 'credito', 'debito'].includes(metodo)) return 'tarjeta';
  return 'transferencia';
}
