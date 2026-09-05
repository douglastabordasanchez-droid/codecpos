import type { Comanda } from '../../app/lib/supabase/panaderiaSyncService';
import { activarAvisosPedidosAndroid, avisarCambioComandaAndroid } from './androidBridge';

export type EstadoAvisableComanda = 'preparando' | 'listo';

export interface PreferenciasAvisosPedidos {
  voz: boolean;
  vibracion: boolean;
}

const CLAVE_PREFERENCIAS = 'codecpos_pwa_avisos_pedidos';
let contextoAudio: AudioContext | null = null;

function obtenerContextoAudio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const ConstructorAudio = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!ConstructorAudio) return null;
  if (!contextoAudio) contextoAudio = new ConstructorAudio();
  return contextoAudio;
}

/** Se ejecuta exclusivamente después de un toque para cumplir autoplay de iOS. */
async function desbloquearAudio(): Promise<boolean> {
  const contexto = obtenerContextoAudio();
  if (!contexto) return false;
  try {
    await contexto.resume();
    // Pulso prácticamente silencioso: Safari registra la reproducción sin
    // molestar al mesero al abrir la mesa o tocar la campana.
    const ganancia = contexto.createGain();
    ganancia.gain.setValueAtTime(0.00001, contexto.currentTime);
    const oscilador = contexto.createOscillator();
    oscilador.connect(ganancia).connect(contexto.destination);
    oscilador.start();
    oscilador.stop(contexto.currentTime + 0.02);
    return true;
  } catch {
    return false;
  }
}

function reproducirTono(estado: EstadoAvisableComanda): void {
  const contexto = obtenerContextoAudio();
  if (!contexto || contexto.state !== 'running') return;
  const ahora = contexto.currentTime;
  const notas = estado === 'listo' ? [880, 1175, 1568] : [740, 988];
  notas.forEach((frecuencia, indice) => {
    const inicio = ahora + indice * 0.15;
    const oscilador = contexto.createOscillator();
    const ganancia = contexto.createGain();
    oscilador.type = 'sine';
    oscilador.frequency.setValueAtTime(frecuencia, inicio);
    ganancia.gain.setValueAtTime(0.00001, inicio);
    ganancia.gain.exponentialRampToValueAtTime(0.18, inicio + 0.015);
    ganancia.gain.exponentialRampToValueAtTime(0.00001, inicio + 0.12);
    oscilador.connect(ganancia).connect(contexto.destination);
    oscilador.start(inicio);
    oscilador.stop(inicio + 0.13);
  });
}

/** Preferencias locales: cada celular decide si reproduce voz y vibración. */
export function obtenerPreferenciasAvisosPedidos(): PreferenciasAvisosPedidos {
  try {
    const guardadas = JSON.parse(localStorage.getItem(CLAVE_PREFERENCIAS) || '{}');
    return { voz: guardadas.voz !== false, vibracion: guardadas.vibracion !== false };
  } catch {
    return { voz: true, vibracion: true };
  }
}

export function guardarPreferenciasAvisosPedidos(preferencias: PreferenciasAvisosPedidos): void {
  try {
    localStorage.setItem(CLAVE_PREFERENCIAS, JSON.stringify(preferencias));
  } catch {
    // La selección actual se conserva durante esta sesión aunque no se pueda guardar.
  }
}

function textoParaEstado(comanda: Comanda, estado: EstadoAvisableComanda): string {
  const mesa = comanda.mesaNombre || `la mesa ${comanda.mesaLocalId}`;
  if (estado === 'preparando') return `La cocina está preparando el pedido de ${mesa}.`;
  if (estado === 'listo') return `El pedido de ${mesa} está listo para servir.`;
  return estado === 'preparando'
    ? `El pedido de ${mesa} está en preparación.`
    : `El pedido de ${mesa} está listo para servir.`;
}

function vibrar(estado: EstadoAvisableComanda): void {
  try {
    // Patrones distinguibles: corto para "en preparación" y más insistente
    // para "listo para servir". iPhone ignora vibrate() por diseño; allí se
    // conserva la notificación y la voz cuando la app está activa.
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate?.(estado === 'listo' ? [260, 110, 260, 110, 360] : [150, 80, 150]);
    }
  } catch { /* El navegador puede bloquear la vibración. */ }
}

function hablar(texto: string): void {
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const mensaje = new SpeechSynthesisUtterance(texto);
    mensaje.lang = 'es-CO';
    mensaje.rate = 0.96;
    mensaje.pitch = 1;
    const vozEspanol = window.speechSynthesis
      .getVoices()
      .find((voz) => voz.lang.toLowerCase().startsWith('es'));
    if (vozEspanol) mensaje.voice = vozEspanol;
    window.speechSynthesis.speak(mensaje);
  } catch { /* La voz depende de la política de reproducción del teléfono. */ }
}

async function mostrarNotificacion(titulo: string, cuerpo: string, tag: string): Promise<void> {
  // Android WebView no ofrece un Notification API fiable; delegamos el aviso
  // al canal nativo para que sí aparezca con la aplicación instalada.
  if (avisarCambioComandaAndroid(titulo, cuerpo, titulo.includes('listo') ? 'listo' : 'preparando', tag)) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const opciones: NotificationOptions = {
    body: cuerpo,
    icon: '/app/logo.png',
    badge: '/app/logo.png',
    tag,
    renotify: true,
  };

  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(titulo, opciones);
      return;
    }
    new Notification(titulo, opciones);
  } catch {
    // Algunos navegadores solo permiten Notification a través del service worker.
  }
}

/** Notifica al mesero de una transición que ocurrió mientras su PWA está activa. */
export function avisarCambioComanda(comanda: Comanda, estado: EstadoAvisableComanda): void {
  const texto = textoParaEstado(comanda, estado);
  const preferencias = obtenerPreferenciasAvisosPedidos();
  if (preferencias.vibracion) vibrar(estado);
  reproducirTono(estado);
  if (preferencias.voz) hablar(texto);
  void mostrarNotificacion(
    estado === 'listo' ? '🍽️ Pedido listo' : '🍳 Pedido en preparación',
    texto,
    `codecpos-comanda-${comanda.id}`,
  );
}

/** Debe llamarse desde un toque del usuario para que iOS/Android permitan voz y avisos. */
export async function desbloquearAvisosPedidos(): Promise<boolean> {
  const audioActivo = await desbloquearAudio();
  if ('speechSynthesis' in window) {
    try { window.speechSynthesis.resume(); } catch { /* no-op */ }
  }
  return audioActivo;
}

export async function activarAvisosPedidos(): Promise<NotificationPermission | 'unsupported'> {
  const permisoAndroid = activarAvisosPedidosAndroid();
  if (permisoAndroid !== null) return permisoAndroid ? 'granted' : 'default';
  await desbloquearAvisosPedidos();
  // En Safari abierto como pestaña, la Notification API no entrega avisos
  // utilizables. No mostramos un permiso que no resolvería los avisos: el
  // banner y Web Audio son la vía principal hasta que se instale como PWA.
  const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const esPwaInstalada = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (esIOS && !esPwaInstalada) return 'unsupported';
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'default') return Notification.requestPermission();
  return Notification.permission;
}

export function permisoAvisosPedidos(): NotificationPermission | 'unsupported' {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}
