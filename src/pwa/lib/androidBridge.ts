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
}

declare global {
  interface Window {
    AndroidCodecVerify?: AndroidCodecVerifyBridge;
  }
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
