import { getSupabaseClient } from '../../app/lib/supabase/config';

/**
 * Puente hacia la app Android nativa "Codec Verify" (codec-verify-android/).
 * Esa app es un WebView que carga ESTA MISMA PWA — todas las pantallas y el
 * login son exactamente los mismos, sin duplicar nada. Lo único nuevo que
 * aporta la app nativa es un NotificationListenerService que lee las
 * notificaciones bancarias en tiempo real (algo que una PWA no puede hacer).
 *
 * Para que ese listener sepa a qué negocio pertenece, esta PWA le pasa el
 * webhook_token apenas hay una sesión activa — el usuario nunca ve un paso
 * de "emparejamiento" aparte: inicia sesión igual que siempre y, si está
 * corriendo dentro del WebView nativo, queda configurado solo.
 *
 * `window.AndroidCodecVerify` solo existe cuando el WebView lo inyecta
 * (ver codec-verify-android AndroidNotificationBridge) — en un navegador
 * normal o en Electron esto es `undefined` y todas las funciones de aquí
 * no hacen nada.
 */
interface AndroidCodecVerifyBridge {
  guardarSesion(webhookToken: string, nombreNegocio: string): void;
  cerrarSesion(): void;
  abrirAjustesNotificaciones(): void;
  autenticarConHuella(requestId: string): void;
  huellaDisponible(): boolean;
}

declare global {
  interface Window {
    AndroidCodecVerify?: AndroidCodecVerifyBridge;
    /** Llamado por MainActivity.kt (evaluateJavascript) cuando BiometricPrompt termina. */
    __codecVerifyHuellaCallback?: (requestId: string, ok: boolean) => void;
  }
}

const solicitudesHuellaPendientes: Record<string, (ok: boolean) => void> = {};

if (typeof window !== 'undefined') {
  window.__codecVerifyHuellaCallback = (requestId, ok) => {
    const resolver = solicitudesHuellaPendientes[requestId];
    if (resolver) {
      delete solicitudesHuellaPendientes[requestId];
      resolver(ok);
    }
  };
}

function getBridge(): AndroidCodecVerifyBridge | null {
  return typeof window !== 'undefined' && window.AndroidCodecVerify ? window.AndroidCodecVerify : null;
}

/** Se llama cada vez que hay un empleado autenticado (login o restauración de sesión). */
export async function sincronizarSesionConAndroid(clienteId: string): Promise<void> {
  const bridge = getBridge();
  if (!bridge) return; // no estamos dentro del WebView nativo — no hay nada que hacer

  const client = getSupabaseClient();
  if (!client) return;

  const { data, error } = await client
    .from('clientes_pos')
    .select('webhook_token, nombre_negocio')
    .eq('id', clienteId)
    .maybeSingle();

  if (error || !data) return;
  const fila = data as { webhook_token: string | null; nombre_negocio: string | null };
  if (!fila.webhook_token) return; // negocio aún no tiene token generado — el listener simplemente no envía nada

  try {
    bridge.guardarSesion(fila.webhook_token, fila.nombre_negocio || '');
  } catch {
    /* la app nativa nunca debe romper la PWA si algo falla acá */
  }
}

export function cerrarSesionAndroid(): void {
  try {
    getBridge()?.cerrarSesion();
  } catch {
    /* no crítico */
  }
}

/** true solo cuando esta PWA corre dentro del WebView de la app nativa. */
export function estaEnAppAndroid(): boolean {
  return getBridge() !== null;
}

/** Abre el panel nativo (permisos de notificación + estado del listener) — antes era un ícono flotante aparte. */
export function abrirAjustesNotificacionesAndroid(): void {
  try {
    getBridge()?.abrirAjustesNotificaciones();
  } catch {
    /* no crítico */
  }
}

/**
 * Huella dactilar nativa (BiometricPrompt) — usada por huellaLock.ts SOLO
 * cuando estaEnAppAndroid() es true. El WebView de esta app no soporta
 * WebAuthn del navegador de forma confiable, así que dentro de la app
 * nativa se usa el diálogo de huella del propio sistema operativo en su
 * lugar (más simple y más confiable que intentar forzar WebAuthn en WebView).
 */
export function huellaDisponibleAndroid(): boolean {
  try {
    return getBridge()?.huellaDisponible() ?? false;
  } catch {
    return false;
  }
}

/** Se resuelve cuando MainActivity.kt llama de vuelta a __codecVerifyHuellaCallback, o a los 30s si nunca responde. */
export function autenticarConHuellaAndroid(): Promise<boolean> {
  return new Promise((resolve) => {
    const bridge = getBridge();
    if (!bridge) {
      resolve(false);
      return;
    }

    const requestId = crypto.randomUUID();
    const timeoutId = setTimeout(() => {
      delete solicitudesHuellaPendientes[requestId];
      resolve(false);
    }, 30000);

    solicitudesHuellaPendientes[requestId] = (ok) => {
      clearTimeout(timeoutId);
      resolve(ok);
    };

    try {
      bridge.autenticarConHuella(requestId);
    } catch {
      clearTimeout(timeoutId);
      delete solicitudesHuellaPendientes[requestId];
      resolve(false);
    }
  });
}
