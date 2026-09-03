import type { Comanda } from '../../app/lib/supabase/panaderiaSyncService';

export type EstadoAvisableComanda = 'preparando' | 'listo';

export interface PreferenciasAvisosPedidos {
  voz: boolean;
  vibracion: boolean;
}

const CLAVE_PREFERENCIAS = 'codecpos_pwa_avisos_pedidos';

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
    navigator.vibrate?.(estado === 'listo' ? [260, 110, 260, 110, 360] : [150, 80, 150]);
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
  if (preferencias.voz) hablar(texto);
  void mostrarNotificacion(
    estado === 'listo' ? '🍽️ Pedido listo' : '🍳 Pedido en preparación',
    texto,
    `codecpos-comanda-${comanda.id}`,
  );
}

/** Debe llamarse desde un toque del usuario para que iOS/Android permitan voz y avisos. */
export async function activarAvisosPedidos(): Promise<NotificationPermission | 'unsupported'> {
  if ('speechSynthesis' in window) {
    try { window.speechSynthesis.resume(); } catch { /* no-op */ }
  }
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'default') return Notification.requestPermission();
  return Notification.permission;
}

export function permisoAvisosPedidos(): NotificationPermission | 'unsupported' {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}
