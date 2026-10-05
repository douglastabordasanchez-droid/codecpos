import { getSupabaseClient } from '../../app/lib/supabase/config';
import { getAndroidBridge } from './androidBridge';

const STORAGE_KEY = 'codecverify_pwa_config';

export function codecVerifyPwaActivo(): boolean {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').enabled === true;
  } catch {
    return false;
  }
}

function guardarLocal(activo: boolean): void {
  const antes = codecVerifyPwaActivo();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: activo }));
  // El lector de la app Android descarta todos los avisos mientras esté apagado.
  try { getAndroidBridge()?.configurarCodecVerify?.(activo); } catch { /* app vieja */ }
  if (antes !== activo) window.dispatchEvent(new CustomEvent('codecverify-pwa:config-changed'));
}

/**
 * El interruptor es del negocio (clientes_pos.codec_verify_activo, migración
 * 0109): lo comparten Electron, la web y los celulares, y con él apagado el
 * servidor no registra ningún aviso. `empleadoId` sigue marcando el celular
 * en "Celulares conectados" de Electron (migración 0041).
 */
export function alternarCodecVerifyPwa(empleadoId?: string): boolean {
  const nuevo = !codecVerifyPwaActivo();
  guardarLocal(nuevo);

  const client = getSupabaseClient();
  client?.rpc('cambiar_codec_verify_activo', { p_activo: nuevo }).then(() => {});
  if (empleadoId) {
    client
      ?.from('empleados')
      .update({ codec_verify_activo: nuevo, codec_verify_actualizado_en: new Date().toISOString() })
      .eq('id', empleadoId)
      .then(() => {});
  }

  return nuevo;
}

/** Trae el estado del interruptor del negocio (al abrir la app y al volver a ella). */
export async function sincronizarCodecVerifyPwa(): Promise<void> {
  const { data, error } = (await getSupabaseClient()?.rpc('obtener_codec_verify_activo')) ?? {};
  if (!error && typeof data === 'boolean') guardarLocal(data);
}

/** Sincroniza ahora y cada vez que la app vuelve a primer plano; devuelve cómo dejar de hacerlo. */
export function seguirCodecVerifyPwa(): () => void {
  sincronizarCodecVerifyPwa();
  const alVolver = () => { if (document.visibilityState === 'visible') sincronizarCodecVerifyPwa(); };
  document.addEventListener('visibilitychange', alVolver);
  return () => document.removeEventListener('visibilitychange', alVolver);
}

export interface NotificacionPagoRow {
  id: string;
  monto: number;
  entidad: string | null;
  referencia: string | null;
  origen: 'manual' | 'automatizacion';
  estado: 'pendiente' | 'confirmado' | 'descartado';
}

/** Igual que suscribirNotificacionesPago (app/lib/supabase/codecVerifyService.ts) pero sin depender de getLinkedClienteId() — la PWA usa el cliente_id del empleado logueado, no el de una instalación de Electron vinculada. */
export function suscribirNotificacionesPagoPwa(
  clienteId: string,
  onNotificacion: (row: NotificacionPagoRow) => void
): (() => void) | null {
  const client = getSupabaseClient();
  if (!client) return null;

  const channel = client
    .channel(`notificaciones-pago-pwa-${clienteId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notificaciones_pago', filter: `cliente_id=eq.${clienteId}` },
      (payload) => {
        const row = payload.new as NotificacionPagoRow;
        if (row.estado === 'pendiente' || row.origen === 'automatizacion') onNotificacion(row);
      }
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}
