/**
 * 🔒 Candado de comandas por dispositivo — un mesero/cajero no puede tomar
 * pedidos desde su celular hasta que escanee el QR de su sucursal (generado
 * en Electron > Multi-Tienda) EN ESE DISPOSITIVO. A diferencia de
 * `sucursalActiva.ts` (que decide QUÉ sucursal ve un admin y es solo para
 * admin/dueño), esto es un candado de PERMISO — cualquier rol operativo lo
 * necesita, y no cambia qué sucursal ve (esa sigue siendo `empleado.tienda_id`,
 * fija por un admin) sino si este celular puede enviar comandas ahora mismo.
 *
 * Varios celulares pueden estar autorizados a la vez (cada mesero escanea el
 * suyo). La desconexión es siempre manual — no expira sola al cerrar caja.
 *
 * Vive en localStorage (por dispositivo). No es un mecanismo de seguridad
 * criptográfico — es un candado operativo para que nadie tome pedidos "sin
 * avisar que llegó", no una defensa contra un empleado que manipule su propio
 * teléfono.
 */
const LS_KEY = 'pwa_comandas_autorizado';
const EVENTO_CAMBIO = 'codecpos:comandas-autorizacion-cambio';

export interface ComandasAutorizacion {
  tiendaId: string; // 'tienda_principal' o local_id de la sucursal
  tiendaNombre: string;
  autorizadoEn: string; // ISO
}

export function getComandasAutorizacion(): ComandasAutorizacion | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function autorizarComandas(tiendaId: string, tiendaNombre: string): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ tiendaId, tiendaNombre, autorizadoEn: new Date().toISOString() }));
  } catch { /* storage lleno o bloqueado -- no crítico */ }
  window.dispatchEvent(new CustomEvent(EVENTO_CAMBIO));
}

export function desconectarComandas(): void {
  try { localStorage.removeItem(LS_KEY); } catch { /* noop */ }
  window.dispatchEvent(new CustomEvent(EVENTO_CAMBIO));
}

export function suscribirComandasAutorizacion(onCambio: () => void): () => void {
  window.addEventListener(EVENTO_CAMBIO, onCambio);
  return () => window.removeEventListener(EVENTO_CAMBIO, onCambio);
}

/** ¿La autorización guardada en este dispositivo sigue sirviendo para la sucursal fija de este empleado? */
export function comandasAutorizadasPara(tiendaEmpleado: string | null | undefined): boolean {
  const actual = getComandasAutorizacion();
  if (!actual) return false;
  const esperada = tiendaEmpleado || 'tienda_principal';
  return actual.tiendaId === esperada;
}
