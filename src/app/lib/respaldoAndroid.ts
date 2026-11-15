/**
 * Respaldo en disco de mesas, cuentas y ventas pendientes (solo APK Android).
 *
 * El localStorage del WebView tarda unos segundos en llegar al disco; si la
 * terminal se apaga o la app se cae, los últimos cambios se pueden perder.
 * Aquí se espejan las claves críticas al plugin nativo Respaldo (archivo con
 * fsync por clave) y, al abrir la app, se restauran antes de pintar nada.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

interface RespaldoPlugin {
  guardar(o: { clave: string; valor: string }): Promise<void>;
  borrar(o: { clave: string }): Promise<void>;
  leerTodo(): Promise<{ datos: Record<string, string> }>;
}

const Respaldo = registerPlugin<RespaldoPlugin>('Respaldo');

/** Claves que no se pueden perder: mesas, cuentas abiertas y lo que falta por subir. */
const CLAVES_EXACTAS = new Set([
  'codecpos_mesas_config',
  'codecpos_mesas_cuentas',
  'codecpos_panaderia_cuenta_libre',
  'codecpos_carrito_transferido',
  'codecpos_mesa_activa',
  'codecpos_panaderia_origen',
  'codecpos_referencia_mesa',
  'pos-ventas-pendientes',
  'pos-cierres-pendientes',
  'pos-turnos',
  'pos-caja-sesiones-diarias',
  'pos-ventas-dia',
  'pos-cierres-caja',
]);

function esCritica(clave: string): boolean {
  return CLAVES_EXACTAS.has(clave) || clave.startsWith('codecpos_mesas_');
}

function esAndroid(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

let instalado = false;

/**
 * Restaura desde disco y deja el espejo funcionando. Se espera antes de montar
 * React; si el plugin no responde en 3 s se sigue sin bloquear la caja.
 */
export async function iniciarRespaldoAndroid(): Promise<void> {
  if (!esAndroid() || instalado) return;
  instalado = true;

  try {
    const { datos } = await Promise.race([
      Respaldo.leerTodo(),
      new Promise<{ datos: Record<string, string> }>((_, rej) => setTimeout(() => rej(new Error('tiempo')), 3000)),
    ]);
    for (const [clave, valor] of Object.entries(datos || {})) {
      // El archivo siempre se escribe después del localStorage y con fsync:
      // si difieren, el archivo es lo último que de verdad quedó guardado.
      try {
        if (localStorage.getItem(clave) !== valor) localStorage.setItem(clave, valor);
      } catch { /* sin espacio: se deja lo que hay */ }
    }
  } catch { /* sin respaldo previo o plugin lento */ }

  const proto = Storage.prototype;
  const setOriginal = proto.setItem;
  const removeOriginal = proto.removeItem;
  const clearOriginal = proto.clear;

  proto.setItem = function (this: Storage, clave: string, valor: string) {
    setOriginal.call(this, clave, valor);
    if (this === window.localStorage && esCritica(clave)) {
      Respaldo.guardar({ clave, valor: String(valor) }).catch(() => {});
    }
  };
  proto.removeItem = function (this: Storage, clave: string) {
    removeOriginal.call(this, clave);
    if (this === window.localStorage && esCritica(clave)) {
      Respaldo.borrar({ clave }).catch(() => {});
    }
  };
  proto.clear = function (this: Storage) {
    const criticas = this === window.localStorage
      ? Array.from({ length: this.length }, (_, i) => this.key(i)).filter((k): k is string => !!k && esCritica(k))
      : [];
    clearOriginal.call(this);
    for (const clave of criticas) Respaldo.borrar({ clave }).catch(() => {});
  };

  // Primer respaldo de lo que ya había (instalación anterior sin espejo).
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && esCritica(k)) {
        const v = localStorage.getItem(k);
        if (v !== null) Respaldo.guardar({ clave: k, valor: v }).catch(() => {});
      }
    }
  } catch { /* ignorar */ }
}
