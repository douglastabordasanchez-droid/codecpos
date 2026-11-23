/**
 * Monto que una venta está esperando en este momento con Codec Verify
 * ("Esperando el pago"). Mientras hay una espera, el aviso general de
 * "Pago recibido" no se abre encima para ese mismo monto: la propia ventana de
 * la venta lo muestra. Lo comparten Electron y la web.
 */
// Con varios carritos abiertos puede haber varias esperas a la vez: cada una se
// registra aparte (antes la última pisaba a las demás y el pago de un carrito
// le aparecía a otro como «llegó un pago»).
const esperas = new Map<symbol, number>();

/** Registra el monto que espera una venta; devuelve la función para quitarlo. */
export function registrarEspera(monto: number): () => void {
  const clave = Symbol('espera');
  esperas.set(clave, Math.round(monto));
  return () => { esperas.delete(clave); };
}

/** true si alguna venta abierta (minimizada o no) espera exactamente ese monto. */
export function seEsperaMonto(monto: number): boolean {
  const m = Math.round(Number(monto) || 0);
  for (const v of esperas.values()) if (v === m) return true;
  return false;
}

/** Compatibilidad: el último monto esperado (null si no hay esperas). */
export function esperandoMonto(): number | null {
  let ultimo: number | null = null;
  for (const v of esperas.values()) ultimo = v;
  return ultimo;
}

/** Hay una ventana «Esperando el pago» abierta en pantalla (no minimizada): ella muestra el pago. */
export function hayEsperaVisible(): boolean {
  try { return !!document.querySelector('[data-esperando-pago="1"]'); } catch { return false; }
}

/** Colores de cada medio de pago, iguales en la web y en Electron. */
export const COLORES_MEDIO_PAGO: Record<string, { color: string; fondo: string }> = {
  nequi: { color: '#da0081', fondo: '#fde7f3' },
  daviplata: { color: '#e30613', fondo: '#fde8e9' },
  bancolombia: { color: '#2c2a29', fondo: '#fff5cc' },
  davivienda: { color: '#e1251b', fondo: '#fde9e8' },
  bre_b: { color: '#0b6bcb', fondo: '#e6f1fc' },
  transferencia: { color: '#0f766e', fondo: '#e6f6f4' },
};

export function colorMedioPago(entidad?: string | null) {
  return COLORES_MEDIO_PAGO[(entidad || '').toLowerCase()] || COLORES_MEDIO_PAGO.transferencia;
}
