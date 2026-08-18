/**
 * CODEC POS v2.0 — Sincronización del Taller de Reparaciones con la nube
 *
 * El Taller vivía únicamente en el IndexedDB de UNA instalación de Electron.
 * Esto lo publica en `taller_ordenes` (migración 0024) para que el celular
 * pueda ver y operar las órdenes desde cualquier red — Y para que OTRA
 * instalación de Electron (otra sede, o simplemente otra caja fuera de la
 * misma LAN) también las reciba.
 *
 * Modelo de sincronización, deliberadamente simple y sin CRDT:
 *   • push  → quien crea/edita la orden es la fuente de verdad del catálogo
 *             completo (diagnóstico, insumos, pagos, firmas…). Sube todo.
 *   • pull  → vuelven TODOS los cambios ajenos, sin importar si el origen
 *             fue la PWA u otra instalación de Electron.
 *
 * ⚠️ Antes se filtraba estrictamente `actualizado_en === 'pwa'` para evitar
 * que una caja se bajara su propio push como si fuera un cambio ajeno — pero
 * eso también bloqueaba, sin excepción, cualquier orden creada/asignada
 * desde OTRA instalación de Electron: un técnico en otra sede (o incluso en
 * la misma sede pero fuera de la LAN local) nunca se enteraba de una
 * reparación asignada, ni al instante ni con retraso. El anti-eco correcto
 * es local: cada terminal recuerda qué `local_id` empujó ella misma en los
 * últimos segundos y se ignora a sí misma — sin bloquear a las demás.
 */
import { getSupabaseClient } from './config';
import { getLinkedClienteId } from './tenantLink';
import type { OrdenServicio } from '../../types/taller';

const LS_ULTIMO_PULL = 'codecpos_taller_ultimo_pull';

// Anti-eco: local_id → momento en que ESTA terminal lo empujó. Un cambio
// remoto para ese mismo local_id dentro de la ventana es casi seguro el
// reflejo del propio push (Supabase Realtime notifica a todos los
// suscriptores, incluido quien escribió), no un cambio ajeno real.
const VENTANA_ECO_MS = 8000;
const recienEmpujadas = new Map<string, number>();

function marcarComoRecienEmpujada(localId: string): void {
  recienEmpujadas.set(localId, Date.now());
  // Housekeeping ocasional para no acumular memoria indefinidamente.
  if (recienEmpujadas.size > 200) {
    const limite = Date.now() - VENTANA_ECO_MS;
    for (const [id, ts] of recienEmpujadas) if (ts < limite) recienEmpujadas.delete(id);
  }
}

function esEcoPropio(localId: string): boolean {
  const ts = recienEmpujadas.get(localId);
  return !!ts && Date.now() - ts < VENTANA_ECO_MS;
}

interface FilaTallerOrden {
  local_id: string;
  numero_orden: string;
  estado: string;
  datos: OrdenServicio;
  actualizado_en: string;
  updated_at: string;
}

function filaDesdeOrden(orden: OrdenServicio, clienteId: string) {
  return {
    cliente_id: clienteId,
    local_id: orden.id,
    numero_orden: orden.numeroOrden,
    estado: orden.estado,
    prioridad: orden.prioridad || 'normal',
    cliente_nombre: orden.cliente?.nombre ?? null,
    cliente_telefono: orden.cliente?.telefono ?? null,
    dispositivo_tipo: orden.dispositivo?.tipo ?? null,
    dispositivo_marca: orden.dispositivo?.marca ?? null,
    dispositivo_modelo: orden.dispositivo?.modelo ?? null,
    tecnico_asignado: orden.tecnicoAsignado ?? null,
    fecha_recepcion: orden.fechaRecepcion || new Date().toISOString(),
    fecha_estimada_entrega: orden.fechaEstimadaEntrega || null,
    fecha_entrega: orden.fechaEntrega || null,
    costo_estimado: Number(orden.costoEstimado) || 0,
    costo_final: Number(orden.costoFinal) || 0,
    anticipo: Number(orden.anticipo) || 0,
    saldo_pendiente: Number(orden.saldoPendiente) || 0,
    datos: orden,
    actualizado_por: orden.creadoPor ?? null,
    actualizado_en: 'electron',
    updated_at: new Date().toISOString(),
  };
}

/** Sube al negocio en la nube todas las órdenes locales. Idempotente. */
export async function pushOrdenesTaller(ordenes: OrdenServicio[]): Promise<number> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId || ordenes.length === 0) return 0;

  const filas = ordenes.map((o) => filaDesdeOrden(o, clienteId));

  // En lotes: una tienda con años de historial puede tener miles de órdenes y
  // el jsonb de cada una no es pequeño.
  const TAMANO_LOTE = 100;
  let subidas = 0;
  for (let i = 0; i < filas.length; i += TAMANO_LOTE) {
    const lote = filas.slice(i, i + TAMANO_LOTE);
    const { error } = await client
      .from('taller_ordenes')
      .upsert(lote, { onConflict: 'cliente_id,local_id' });
    if (error) throw new Error(error.message);
    lote.forEach((f) => marcarComoRecienEmpujada(f.local_id));
    subidas += lote.length;
  }
  return subidas;
}

/** Sube una sola orden — para llamar cuando Electron la crea o la modifica. */
export async function pushOrdenTaller(orden: OrdenServicio): Promise<void> {
  await pushOrdenesTaller([orden]);
}

/**
 * Baja los cambios ajenos (celular U OTRA instalación de Electron) desde el
 * último pull. Devuelve las órdenes que esta caja debe aplicar localmente.
 */
export async function pullOrdenesTallerDesdePwa(): Promise<OrdenServicio[]> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return [];

  const desde = localStorage.getItem(LS_ULTIMO_PULL) || new Date(0).toISOString();

  const { data, error } = await client
    .from('taller_ordenes')
    .select('local_id, numero_orden, estado, datos, actualizado_en, updated_at')
    .eq('cliente_id', clienteId)
    .gt('updated_at', desde)
    .order('updated_at', { ascending: true });

  if (error) throw new Error(error.message);

  const filas = (data as FilaTallerOrden[]) || [];
  if (filas.length > 0) {
    localStorage.setItem(LS_ULTIMO_PULL, filas[filas.length - 1].updated_at);
  }

  return filas
    .filter((f) => !esEcoPropio(f.local_id))
    .map((f) => f.datos)
    .filter((o): o is OrdenServicio => !!o && typeof o.id === 'string');
}

/** Escucha en tiempo real los cambios ajenos (celular u otra caja) sobre las órdenes. */
export function suscribirCambiosTallerPwa(
  onCambio: (orden: OrdenServicio) => void
): () => void {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return () => {};

  const canal = client
    .channel(`taller-ordenes-${clienteId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'taller_ordenes', filter: `cliente_id=eq.${clienteId}` },
      (payload) => {
        const fila = payload.new as FilaTallerOrden | null;
        // Ignorar el reflejo del propio push — todo lo demás (celular u otra
        // caja) sí es un cambio ajeno real que hay que aplicar.
        if (!fila || esEcoPropio(fila.local_id)) return;
        if (fila.datos && typeof fila.datos.id === 'string') onCambio(fila.datos);
      }
    )
    .subscribe();

  return () => { client.removeChannel(canal); };
}
