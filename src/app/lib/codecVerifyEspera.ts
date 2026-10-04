/**
 * Monto que una venta está esperando en este momento con Codec Verify
 * ("Esperando el pago"). Mientras hay una espera, el aviso general de
 * "Pago recibido" no se abre encima para ese mismo monto: la propia ventana de
 * la venta lo muestra. Lo comparten Electron y la web.
 */
let montoEsperado: number | null = null;

export function marcarMontoEsperado(monto: number | null) {
  montoEsperado = monto == null ? null : Math.round(monto);
}

export function esperandoMonto(): number | null {
  return montoEsperado;
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
