/**
 * Alertas de pago de Codec Verify en este dispositivo (web, celular y la app
 * de Android): sonido fuerte, vibración y notificación del sistema cada vez
 * que entra un pago, mientras Codec Verify esté activo.
 *
 * Las preferencias son de ESTE dispositivo (cada celular decide si suena) y
 * se pueden apagar con un toque desde la barra superior o desde
 * Configuración. Dentro de la app de Android la alerta la da el sistema
 * nativo (canal de notificaciones propio y sonido por el volumen de alarma),
 * que suena aunque el celular esté en silencio y la app en segundo plano.
 */
import type { NotificacionPagoRow } from './codecVerifyPwa';
import { getAndroidBridge } from './androidBridge';

export interface PreferenciasAlertaPago {
  /** Sonido fuerte al entrar un pago. */
  sonido: boolean;
  /** Notificación del sistema (barra de notificaciones). */
  notificacion: boolean;
  /** Volumen del sonido en la web, de 0 a 1. */
  volumen: number;
}

const CLAVE = 'codecverify_alertas_pago';
export const EVENTO_ALERTAS_PAGO = 'codecverify:alertas-pago';
const POR_DEFECTO: PreferenciasAlertaPago = { sonido: true, notificacion: true, volumen: 1 };
/** Base de la app (/app/ en producción); las rutas de sonido e ícono cuelgan de ahí. */
const BASE: string = ((import.meta as any).env?.BASE_URL as string | undefined) || '/';
const RUTA_SONIDO = `${BASE}sonidos/pago-recibido.wav`.replace(/\/{2,}/g, '/');

export function obtenerAlertasPago(): PreferenciasAlertaPago {
  try {
    return { ...POR_DEFECTO, ...JSON.parse(localStorage.getItem(CLAVE) || '{}') };
  } catch {
    return POR_DEFECTO;
  }
}

export function guardarAlertasPago(cambios: Partial<PreferenciasAlertaPago>): PreferenciasAlertaPago {
  const nuevas = { ...obtenerAlertasPago(), ...cambios };
  try { localStorage.setItem(CLAVE, JSON.stringify(nuevas)); } catch { /* sin almacenamiento */ }
  // La app de Android también lo necesita: su lector nativo suena aunque la app esté cerrada.
  try { getAndroidBridge()?.configurarAlertasPago?.(nuevas.sonido, nuevas.notificacion); } catch { /* app vieja */ }
  window.dispatchEvent(new CustomEvent(EVENTO_ALERTAS_PAGO));
  return nuevas;
}

export const alternarSonidoPagos = () => guardarAlertasPago({ sonido: !obtenerAlertasPago().sonido });

// ── Sonido en la web ────────────────────────────────────────────────────────
// Los navegadores no dejan reproducir audio hasta que la persona toca la
// pantalla una vez. El audio se "desbloquea" en el primer toque y queda listo.
let contexto: AudioContext | null = null;
let buffer: AudioBuffer | null = null;

async function prepararAudio(): Promise<void> {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    contexto ||= new Ctx();
    if (contexto.state === 'suspended') await contexto.resume();
    if (!buffer) {
      const datos = await fetch(RUTA_SONIDO).then((r) => r.arrayBuffer());
      buffer = await contexto.decodeAudioData(datos);
    }
  } catch { /* sin audio en este navegador */ }
}

if (typeof window !== 'undefined') {
  const desbloquear = () => { prepararAudio(); };
  window.addEventListener('pointerdown', desbloquear, { once: true, passive: true });
  window.addEventListener('keydown', desbloquear, { once: true });
}

export async function reproducirSonidoPago(volumen = obtenerAlertasPago().volumen): Promise<boolean> {
  await prepararAudio();
  if (contexto && buffer) {
    try {
      const fuente = contexto.createBufferSource();
      fuente.buffer = buffer;
      const ganancia = contexto.createGain();
      // Por encima de 1 para que suene fuerte; el compresor evita que se distorsione.
      ganancia.gain.value = Math.max(0, Math.min(1, volumen)) * 1.8;
      const compresor = contexto.createDynamicsCompressor();
      compresor.threshold.value = -10;
      compresor.ratio.value = 12;
      fuente.connect(ganancia).connect(compresor).connect(contexto.destination);
      fuente.start();
      return true;
    } catch { /* se intenta con <audio> */ }
  }
  try {
    const audio = new Audio(RUTA_SONIDO);
    audio.volume = Math.max(0, Math.min(1, volumen));
    await audio.play();
    return true;
  } catch {
    return false; // el navegador lo bloqueó: falta tocar la pantalla una vez
  }
}

// ── Notificación del sistema ───────────────────────────────────────────────
export function permisoNotificaciones(): NotificationPermission | 'no-soportado' {
  return typeof Notification === 'undefined' ? 'no-soportado' : Notification.permission;
}

export async function pedirPermisoNotificaciones(): Promise<boolean> {
  const android = getAndroidBridge();
  if (android) {
    try {
      if (!android.permisoNotificacionesConcedido()) android.pedirPermisoNotificaciones();
      return android.permisoNotificacionesConcedido();
    } catch { return false; }
  }
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}

async function notificarSistema(titulo: string, cuerpo: string, tag: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const opciones: NotificationOptions = { body: cuerpo, tag, icon: `${BASE}logo.png`, requireInteraction: false };
  try {
    // En celulares Android con Chrome las notificaciones deben salir por el service worker.
    const registro = await navigator.serviceWorker?.getRegistration();
    if (registro) { await registro.showNotification(titulo, opciones); return; }
  } catch { /* se intenta directo */ }
  try { new Notification(titulo, opciones); } catch { /* no soportado */ }
}

// ── Alerta completa ────────────────────────────────────────────────────────
const yaAvisados = new Set<string>();

export function textoPago(row: Pick<NotificacionPagoRow, 'monto' | 'entidad' | 'origen'>) {
  const monto = `$${Number(row.monto).toLocaleString('es-CO')}`;
  const entidad = (row.entidad || '').trim();
  const nombreEntidad = entidad ? entidad.charAt(0).toUpperCase() + entidad.slice(1).toLowerCase() : '';
  return {
    titulo: row.origen === 'automatizacion' ? `Pago recibido ${monto}` : `Pago reportado ${monto}`,
    cuerpo: row.origen === 'automatizacion'
      ? `Codec Verify confirmó un pago${nombreEntidad ? ` por ${nombreEntidad}` : ''}.`
      : `Se reportó un pago manual${nombreEntidad ? ` por ${nombreEntidad}` : ''}. Revísalo en Pagos.`,
  };
}

/**
 * Suena, vibra y notifica un pago. Devuelve si sonó (false si estaba en
 * silencio o el navegador lo bloqueó), para mostrarlo en el aviso en pantalla.
 */
export async function alertarPago(row: NotificacionPagoRow): Promise<{ sono: boolean }> {
  if (yaAvisados.has(row.id)) return { sono: false };
  yaAvisados.add(row.id);
  const prefs = obtenerAlertasPago();
  const { titulo, cuerpo } = textoPago(row);

  const android = getAndroidBridge();
  if (android?.avisarPago) {
    try {
      android.avisarPago(row.id, Number(row.monto) || 0, titulo, cuerpo, prefs.sonido, prefs.notificacion);
      return { sono: prefs.sonido };
    } catch { /* app vieja: se sigue con la web */ }
  }

  let sono = false;
  if (prefs.sonido) {
    sono = await reproducirSonidoPago(prefs.volumen);
    try { navigator.vibrate?.([450, 150, 450, 150, 700]); } catch { /* sin vibración */ }
  }
  if (prefs.notificacion && (document.hidden || !document.hasFocus())) {
    await notificarSistema(titulo, cuerpo, `pago-${row.id}`);
  }
  return { sono };
}
