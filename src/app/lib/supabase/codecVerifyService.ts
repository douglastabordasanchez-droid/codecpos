/**
 * Codec Verify v2 — sobre Supabase Realtime en vez del WebSocket local
 * ws://localhost:3969 (que solo podía funcionar si el celular estaba en la
 * MISMA máquina que la caja, nunca desde un celular real). La tabla
 * notificaciones_pago (Fase 0) ya tiene Realtime habilitado.
 */
import { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from './config';
import { getLinkedClienteId } from './tenantLink';

export interface NotificacionPagoRow {
  id: string;
  cliente_id: string;
  terminal_id: string | null;
  venta_id: string | null;
  monto: number;
  entidad: string | null;
  referencia: string | null;
  origen: 'manual' | 'automatizacion';
  estado: 'pendiente' | 'confirmado' | 'descartado';
  confirmado_por: string | null;
  created_at: string;
}

/**
 * Registra una notificación de pago. La dispara Electron (confirmación
 * manual desde CodecVerifyConexionPage, usando el negocio vinculado a la
 * instalación) o la PWA (usando el cliente_id del empleado logueado) — mismo
 * esquema para ambos, sin cambios de backend entre uno y otro.
 */
export async function confirmarPagoManual(datos: {
  monto: number;
  entidad?: string;
  referencia?: string;
  terminal_id?: string;
  clienteId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const client = getSupabaseClient();
  const clienteId = datos.clienteId || getLinkedClienteId();
  if (!client || !clienteId) {
    return { ok: false, error: 'No hay un negocio vinculado a esta sesión' };
  }

  const { error } = await client.from('notificaciones_pago').insert({
    cliente_id: clienteId,
    terminal_id: datos.terminal_id || null,
    monto: datos.monto,
    entidad: datos.entidad || null,
    referencia: datos.referencia || null,
    origen: 'manual',
    estado: 'pendiente',
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function marcarNotificacionPago(
  id: string,
  estado: 'confirmado' | 'descartado'
): Promise<{ ok: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase no configurado' };

  const { error } = await client.from('notificaciones_pago').update({ estado }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Se suscribe a notificaciones de pago pendientes para el negocio vinculado.
 * Devuelve una función para desuscribirse. No hace nada si no hay tenant
 * vinculado (evita errores ruidosos en instalaciones sin vincular todavía).
 */
export function suscribirNotificacionesPago(
  onNuevaNotificacion: (row: NotificacionPagoRow) => void
): (() => void) | null {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return null;

  const channel: RealtimeChannel = client
    .channel(`notificaciones-pago-${clienteId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notificaciones_pago',
        filter: `cliente_id=eq.${clienteId}`,
      },
      (payload) => {
        const row = payload.new as NotificacionPagoRow;
        // Las manuales llegan 'pendiente' (requieren confirmar/descartar en
        // el modal). Las automáticas (origen='automatizacion', vía el
        // webhook de correo/SMS) ya llegan 'confirmado' — el token secreto
        // del webhook ES la verificación, así que no piden acción del
        // cajero, solo se notifican.
        if (row.estado === 'pendiente' || row.origen === 'automatizacion') onNuevaNotificacion(row);
      }
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}
