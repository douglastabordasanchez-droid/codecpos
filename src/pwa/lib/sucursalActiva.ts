/**
 * 🏪 Sucursal operativa activa — UNA sola preferencia por dispositivo,
 * compartida por TODOS los módulos (Vender, Inventario, Alimentos y
 * Bebidas, etc.), no un interruptor separado por pantalla.
 *
 * Solo aplica a administradores/dueños que se mueven entre sus propias
 * sucursales (ver EscanerTiendaQR.tsx) — un empleado operativo con sucursal
 * fija (`empleado.tienda_id`, migración 0092) no usa esto: la suya viene
 * dada por su asignación permanente, no por lo que escanee en el momento.
 *
 * Vive en localStorage (por dispositivo, no por cuenta) y notifica a todos
 * los componentes montados en esta pestaña vía un evento — así un cambio
 * hecho desde una pantalla se refleja al instante en cualquier otra que
 * también esté escuchando, sin depender de que React Router remonte nada.
 */
export interface SucursalActiva {
  id: string;
  nombre: string;
}

const LS_KEY = 'pwa_sucursal_activa';
const EVENTO_CAMBIO = 'codecpos:sucursal-activa-cambio';

export function getSucursalActiva(): SucursalActiva | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSucursalActiva(sucursal: SucursalActiva | null): void {
  try {
    if (sucursal) localStorage.setItem(LS_KEY, JSON.stringify(sucursal));
    else localStorage.removeItem(LS_KEY);
  } catch { /* storage lleno o bloqueado — no crítico */ }
  window.dispatchEvent(new CustomEvent(EVENTO_CAMBIO));
}

export function suscribirSucursalActiva(onCambio: () => void): () => void {
  window.addEventListener(EVENTO_CAMBIO, onCambio);
  return () => window.removeEventListener(EVENTO_CAMBIO, onCambio);
}
