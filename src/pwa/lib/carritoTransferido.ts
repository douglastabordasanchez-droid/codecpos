/**
 * Pasar ítems de un módulo (Veterinaria) al carrito de Vender, para cobrar
 * con todo lo de Vender: métodos de pago, Codec Verify, crédito, factura
 * electrónica, impresora y cajón. Es el equivalente web de
 * `codecpos_carrito_transferido` en Electron.
 */
import type { ItemCarritoMovil } from './ventaMovilService';

export const CLAVE_CARRITO_TRANSFERIDO = 'codecpos_web_carrito_transferido';

export function transferirAlCarrito(items: ItemCarritoMovil[]): boolean {
  try {
    const previos: ItemCarritoMovil[] = JSON.parse(sessionStorage.getItem(CLAVE_CARRITO_TRANSFERIDO) || '[]');
    sessionStorage.setItem(CLAVE_CARRITO_TRANSFERIDO, JSON.stringify([...previos, ...items]));
    return true;
  } catch {
    return false;
  }
}

/** "1.250 kg" para lo pesado, el número tal cual para unidades. */
export function formatoCantidad(cantidad: number, unidad?: 'kg'): string {
  return unidad === 'kg' ? `${cantidad.toFixed(3).replace(/\.?0+$/, '')} kg` : String(cantidad);
}
