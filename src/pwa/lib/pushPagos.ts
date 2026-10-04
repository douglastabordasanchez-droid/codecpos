/**
 * Notificaciones push de pagos (Codec Verify): avisan aunque la app esté
 * cerrada. Funcionan en Android (Chrome), en computador y en iPhone, donde
 * Apple exige que la web esté agregada a la pantalla de inicio (iOS 16.4+) y
 * que el permiso se pida con un toque de la persona.
 *
 * El servidor que envía es la Edge Function `push-pago` (migración 0105).
 * Dentro de la app Android nativa no se usa: esa app ya suena sola.
 */
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { estaEnAppAndroid } from './androidBridge';

/** Llave pública VAPID (la privada vive solo como secreto del servidor). */
const LLAVE_PUBLICA_VAPID = 'BKRXUe67GsToPbfjTyrWeOVFkku17624eh2UUczltgtvmCpnNzLHhacux0DWuXWgMT0myIyy4GwtcFPussnDyX8';

export function esIphone(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** true si se abrió desde el ícono de la pantalla de inicio (no desde una pestaña). */
export function abiertaComoApp(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

export type EstadoPush = 'activo' | 'inactivo' | 'bloqueado' | 'falta-instalar' | 'no-soportado' | 'app-android';

export function pushSoportado(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';
}

function plataforma(): string {
  if (esIphone()) return 'iphone';
  if (/Android/i.test(navigator.userAgent)) return 'android';
  return 'computador';
}

function base64UrlABytes(base64: string): Uint8Array {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function registro(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.ready);
  } catch {
    return null;
  }
}

export async function estadoPush(): Promise<EstadoPush> {
  if (estaEnAppAndroid()) return 'app-android';
  if (esIphone() && !abiertaComoApp()) return 'falta-instalar';
  if (!pushSoportado()) return 'no-soportado';
  if (Notification.permission === 'denied') return 'bloqueado';
  const reg = await registro();
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  return sub && Notification.permission === 'granted' ? 'activo' : 'inactivo';
}

async function guardarEnServidor(sub: PushSubscription) {
  const json = sub.toJSON();
  const client = getSupabaseClient();
  if (!client) throw new Error('Sin conexión con la nube');
  const { error } = await client.rpc('guardar_suscripcion_push', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh || '',
    p_auth: json.keys?.auth || '',
    p_plataforma: plataforma(),
    p_user_agent: navigator.userAgent.slice(0, 300),
  });
  if (error) throw new Error(error.message);
}

/**
 * Activa las notificaciones push en este dispositivo. Debe llamarse desde un
 * toque (el iPhone no muestra el permiso de otra forma).
 */
export async function activarPush(): Promise<{ ok: boolean; mensaje?: string }> {
  const estado = await estadoPush();
  if (estado === 'app-android') return { ok: true };
  if (estado === 'falta-instalar') return { ok: false, mensaje: 'En iPhone primero agrega Codec POS a la pantalla de inicio y ábrela desde ese ícono.' };
  if (estado === 'no-soportado') return { ok: false, mensaje: 'Este navegador no permite notificaciones con la app cerrada.' };
  const permiso = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permiso !== 'granted') return { ok: false, mensaje: 'No se dio permiso de notificaciones. Actívalo en los ajustes del navegador o del iPhone.' };
  const reg = await registro();
  if (!reg) return { ok: false, mensaje: 'La app todavía se está preparando. Vuelve a intentarlo en unos segundos.' };
  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlABytes(LLAVE_PUBLICA_VAPID) as BufferSource });
    }
    await guardarEnServidor(sub);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, mensaje: `No se pudo activar: ${e?.message || e}` };
  }
}

export async function desactivarPush(): Promise<void> {
  const reg = await registro();
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  if (!sub) return;
  try { await getSupabaseClient()?.rpc('eliminar_suscripcion_push', { p_endpoint: sub.endpoint }); } catch { /* sin red */ }
  try { await sub.unsubscribe(); } catch { /* ya no existía */ }
}

/** Si el dispositivo ya tenía push, renueva el registro en el servidor (por ejemplo tras iniciar sesión con otro usuario). */
export async function refrescarPush(): Promise<void> {
  if (!pushSoportado() || estaEnAppAndroid() || Notification.permission !== 'granted') return;
  const reg = await registro();
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  if (sub) await guardarEnServidor(sub).catch(() => { /* se reintenta la próxima vez */ });
}
