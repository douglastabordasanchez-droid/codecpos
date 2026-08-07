import { getSupabaseClient } from '../../app/lib/supabase/config';

const STORAGE_KEY = 'codecverify_pwa_config';

export function codecVerifyPwaActivo(): boolean {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').enabled === true;
  } catch {
    return false;
  }
}

export function alternarCodecVerifyPwa(): boolean {
  const nuevo = !codecVerifyPwaActivo();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: nuevo }));
  window.dispatchEvent(new CustomEvent('codecverify-pwa:config-changed'));
  return nuevo;
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
