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
  /** Número de factura local (POS/IndexedDB) que "reclamó" esta notificación — ver reclamarNotificacionPago(). */
  numero_factura_local: string | null;
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
  if (!client) return { ok: false, error: 'nuestra base de datos no está configurada' };

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

/**
 * Intenta "reclamar" atómicamente una notificación de pago para una venta
 * local específica — UPDATE condicionado a `numero_factura_local is null`,
 * así que si dos ventas esperan el mismo monto al mismo tiempo, solo una se
 * queda con la notificación. `true` = la reclamaste tú; `false` = alguien
 * más ya la reclamó (o hubo un error) — hay que seguir esperando otra.
 */
export async function reclamarNotificacionPago(id: string, numeroFacturaLocal: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { data, error } = await client
      .from('notificaciones_pago')
      .update({ numero_factura_local: numeroFacturaLocal })
      .eq('id', id)
      .is('numero_factura_local', null)
      .select('id');
    if (error) {
      console.error('Error reclamando notificación de pago:', error);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (error) {
    console.error('Error reclamando notificación de pago:', error);
    return false;
  }
}

/**
 * Espera la confirmación de un pago por transferencia (Nequi/Daviplata/
 * Transferencia) para UNA venta puntual, haciendo match por MONTO EXACTO —
 * el SMS bancario no trae ningún identificador de venta, así que el monto
 * es el único dato disponible (ver `reclamarNotificacionPago`). Combina 3
 * mecanismos para no perder el pago por una condición de carrera:
 *   1) Consulta inicial de notificaciones ya insertadas (el pago pudo
 *      llegar en el instante justo antes de suscribirse).
 *   2) Suscripción Realtime a nuevos INSERT.
 *   3) Poll de respaldo cada 5s (por si Realtime se cae momentáneamente).
 * `onMatch` se llama una sola vez, con la fila ya reclamada. Devuelve una
 * función para cancelar todo (unsubscribe + intervalos) — SIEMPRE debe
 * llamarse al cerrar/cancelar/desmontar, incluso si ya hubo match.
 */
export function suscribirPagoEsperado(
  monto: number,
  numeroFacturaLocal: string,
  onMatch: (row: NotificacionPagoRow) => void
): (() => void) | null {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return null;

  let resuelto = false;
  const montoRedondeado = Math.round(monto);

  const intentarReclamar = async (row: NotificacionPagoRow) => {
    if (resuelto) return;
    if (row.estado !== 'confirmado' || row.numero_factura_local) return;
    if (Math.round(Number(row.monto)) !== montoRedondeado) return;
    const reclamada = await reclamarNotificacionPago(row.id, numeroFacturaLocal);
    if (reclamada && !resuelto) {
      resuelto = true;
      onMatch(row);
    }
  };

  const revisarCandidatas = async () => {
    if (resuelto) return;
    const desde = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data, error } = await client
      .from('notificaciones_pago')
      .select('*')
      .eq('cliente_id', clienteId)
      .eq('estado', 'confirmado')
      .is('numero_factura_local', null)
      .gte('created_at', desde)
      .order('created_at', { ascending: true });
    if (error || !data) return;
    for (const row of data as NotificacionPagoRow[]) {
      if (resuelto) return;
      await intentarReclamar(row);
    }
  };

  // 1) Chequeo inicial inmediato (cubre pagos que ya llegaron)
  revisarCandidatas();

  // 2) Realtime — nuevos pagos mientras se espera
  const channel: RealtimeChannel = client
    .channel(`pago-esperado-${clienteId}-${numeroFacturaLocal}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notificaciones_pago', filter: `cliente_id=eq.${clienteId}` },
      (payload) => { intentarReclamar(payload.new as NotificacionPagoRow); }
    )
    .subscribe();

  // 3) Poll de respaldo
  const intervalo = setInterval(revisarCandidatas, 5000);

  return () => {
    resuelto = true;
    clearInterval(intervalo);
    client.removeChannel(channel);
  };
}
