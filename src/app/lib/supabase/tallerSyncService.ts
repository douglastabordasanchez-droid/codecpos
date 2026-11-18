/**
 * CODEC POS v2.0 — Sincronización del Taller de Reparaciones con la nube
 *
 * El Taller vive en el IndexedDB de cada equipo (Electron o la web en el
 * navegador) y se publica en `taller_ordenes` (0024, 0156) para que el
 * celular y los OTROS equipos del negocio la reciban al instante.
 *
 * Modelo, deliberadamente simple y sin CRDT:
 *   • push  → quien crea o edita la orden sube la orden completa. Si no hay
 *             internet queda en una cola (localStorage) y sube sola después.
 *   • pull  → bajan todos los cambios ajenos desde la última vez, con la
 *             hora del SERVIDOR (0156), no la del reloj de cada equipo.
 *   • eco   → cada equipo recuerda qué empujó hace unos segundos y se ignora
 *             a sí mismo, sin bloquear los cambios de los demás.
 */
import { getSupabaseClient } from './config';
import { getLinkedClienteId } from './tenantLink';
import type { OrdenServicio } from '../../types/taller';

const LS_ULTIMO_PULL = 'codecpos_taller_ultimo_pull';
const LS_PENDIENTES = 'codecpos_taller_pendientes_nube';
const LS_PUSH_INICIAL = 'codecpos_taller_push_inicial_0156';

const VENTANA_ECO_MS = 8000;
const recienEmpujadas = new Map<string, number>();

function marcarComoRecienEmpujada(localId: string): void {
  recienEmpujadas.set(localId, Date.now());
  if (recienEmpujadas.size > 200) {
    const limite = Date.now() - VENTANA_ECO_MS;
    for (const [id, ts] of recienEmpujadas) if (ts < limite) recienEmpujadas.delete(id);
  }
}

function esEcoPropio(localId: string): boolean {
  const ts = recienEmpujadas.get(localId);
  return !!ts && Date.now() - ts < VENTANA_ECO_MS;
}

/** Orden tal como baja de la nube: puede venir marcada como borrada. */
export type OrdenRemota = OrdenServicio & { eliminada?: boolean };

interface FilaTallerOrden {
  local_id: string;
  numero_orden: string;
  estado: string;
  datos: OrdenServicio;
  eliminada?: boolean;
  actualizado_en: string;
  updated_at: string;
}

function filaDesdeOrden(orden: OrdenRemota, clienteId: string) {
  const historial = Array.isArray(orden.historialEstados) ? orden.historialEstados : [];
  const ultimoCambio = historial.length > 0 ? historial[historial.length - 1]?.usuario : undefined;
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
    eliminada: orden.eliminada === true,
    actualizado_por: ultimoCambio || orden.creadoPor || null,
    actualizado_en: 'electron',
    updated_at: new Date().toISOString(),
  };
}

// ── Cola de pendientes (sin internet) ────────────────────────────────────────
// Solo se guarda el id y si fue un borrado: la orden completa se vuelve a
// leer del IndexedDB al reintentar (las fotos de recepción pesan mucho para
// localStorage, y así siempre sube la versión más reciente).

type Pendiente = { eliminada?: boolean; orden?: OrdenRemota };

function leerPendientes(): Record<string, Pendiente> {
  try {
    const raw = localStorage.getItem(LS_PENDIENTES);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === 'object' ? data : {};
  } catch { return {}; }
}

function guardarPendientes(mapa: Record<string, Pendiente>): void {
  try { localStorage.setItem(LS_PENDIENTES, JSON.stringify(mapa)); } catch { /* almacenamiento lleno */ }
}

function encolar(orden: OrdenRemota): void {
  const mapa = leerPendientes();
  // Un borrado ya no está en el IndexedDB: se guarda la orden para poder subirla.
  mapa[orden.id] = orden.eliminada ? { eliminada: true, orden } : {};
  guardarPendientes(mapa);
}

function quitarDeCola(ids: string[]): void {
  const mapa = leerPendientes();
  let cambio = false;
  for (const id of ids) if (id in mapa) { delete mapa[id]; cambio = true; }
  if (cambio) guardarPendientes(mapa);
}

/** ¿Esta orden tiene cambios de este equipo que todavía no suben? */
export function tienePendienteDeSubir(localId: string): boolean {
  return localId in leerPendientes();
}

export function cantidadPendientesTaller(): number {
  return Object.keys(leerPendientes()).length;
}

/** Sube a la nube las órdenes dadas. Idempotente. */
export async function pushOrdenesTaller(ordenes: OrdenRemota[]): Promise<number> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId || ordenes.length === 0) return 0;

  const filas = ordenes.map((o) => filaDesdeOrden(o, clienteId));
  const TAMANO_LOTE = 100;
  let subidas = 0;
  for (let i = 0; i < filas.length; i += TAMANO_LOTE) {
    const lote = filas.slice(i, i + TAMANO_LOTE);
    // Antes del upsert: Realtime puede avisar antes de que vuelva la respuesta.
    lote.forEach((f) => marcarComoRecienEmpujada(f.local_id));
    const { error } = await client
      .from('taller_ordenes')
      .upsert(lote, { onConflict: 'cliente_id,local_id' });
    if (error) throw new Error(error.message);
    lote.forEach((f) => marcarComoRecienEmpujada(f.local_id));
    quitarDeCola(lote.map((f) => f.local_id));
    subidas += lote.length;
  }
  return subidas;
}

/**
 * Sube una orden cuando este equipo la crea, la edita o la borra. Si no hay
 * internet (o falla), queda en la cola y sube en el siguiente intento.
 */
export async function pushOrdenTaller(orden: OrdenRemota): Promise<void> {
  encolar(orden);
  await pushOrdenesTaller([orden]);
}

/** Reintenta lo que quedó en cola, con la versión más reciente del IndexedDB. */
export async function reintentarPendientesTaller(
  leerLocal: (id: string) => Promise<OrdenServicio | null>
): Promise<number> {
  const mapa = leerPendientes();
  const ids = Object.keys(mapa);
  if (ids.length === 0 || !navigator.onLine) return 0;
  const ordenes: OrdenRemota[] = [];
  const huerfanas: string[] = [];
  for (const id of ids) {
    const p = mapa[id];
    if (p?.eliminada && p.orden) { ordenes.push(p.orden); continue; }
    const local = await leerLocal(id).catch(() => null);
    if (local) ordenes.push(local);
    else huerfanas.push(id);
  }
  if (huerfanas.length > 0) quitarDeCola(huerfanas);
  return pushOrdenesTaller(ordenes);
}

/**
 * Una sola vez por equipo y negocio: sube todas las órdenes locales. Así las
 * que se crearon antes de vincular el negocio (o que se perdieron por un
 * error de sync anterior) llegan a los demás equipos sin pulsar «Publicar».
 */
export async function pushInicialTaller(todas: () => Promise<OrdenServicio[]>): Promise<void> {
  const clienteId = getLinkedClienteId();
  if (!clienteId || !navigator.onLine) return;
  const clave = `${LS_PUSH_INICIAL}_${clienteId}`;
  if (localStorage.getItem(clave)) return;
  const ordenes = await todas();
  if (ordenes.length > 0) await pushOrdenesTaller(ordenes);
  localStorage.setItem(clave, new Date().toISOString());
}

/**
 * Baja los cambios ajenos (celular u otro equipo) desde el último pull.
 * Incluye las órdenes borradas (eliminada = true) para quitarlas aquí.
 */
export async function pullOrdenesTallerDesdePwa(): Promise<OrdenRemota[]> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return [];

  // El cursor va por negocio: un equipo que cambia de negocio no se salta nada.
  const claveCursor = `${LS_ULTIMO_PULL}_${clienteId}`;
  const desde = localStorage.getItem(claveCursor) || new Date(0).toISOString();

  const filas: FilaTallerOrden[] = [];
  for (let pagina = 0; ; pagina++) {
    const { data, error } = await client
      .from('taller_ordenes')
      .select('local_id, numero_orden, estado, datos, eliminada, actualizado_en, updated_at')
      .eq('cliente_id', clienteId)
      .gt('updated_at', desde)
      .order('updated_at', { ascending: true })
      .range(pagina * 500, pagina * 500 + 499);
    if (error) throw new Error(error.message);
    filas.push(...((data as FilaTallerOrden[]) || []));
    if (!data || data.length < 500) break;
  }

  if (filas.length > 0) {
    localStorage.setItem(claveCursor, filas[filas.length - 1].updated_at);
  }

  return filas
    .filter((f) => !esEcoPropio(f.local_id))
    .filter((f) => f.datos && typeof f.datos.id === 'string')
    .map((f) => ({ ...f.datos, eliminada: f.eliminada === true }));
}

/** Escucha en tiempo real los cambios ajenos (celular u otro equipo). */
export function suscribirCambiosTallerPwa(
  onCambio: (orden: OrdenRemota) => void
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
        if (!fila || !fila.local_id || esEcoPropio(fila.local_id)) return;
        if (fila.datos && typeof fila.datos.id === 'string') {
          onCambio({ ...fila.datos, eliminada: fila.eliminada === true });
        }
      }
    )
    .subscribe();

  return () => { client.removeChannel(canal); };
}

/**
 * Siguiente número de orden del negocio, dado por la nube (0156) para que
 * dos equipos nunca usen el mismo. null si no hay nube o no responde a tiempo.
 */
export async function siguienteNumeroOrdenNube(timeoutMs = 4000): Promise<string | null> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId || (typeof navigator !== 'undefined' && !navigator.onLine)) return null;
  try {
    const consulta = Promise.resolve(client.rpc('siguiente_numero_orden_taller'));
    const espera = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs));
    const res: any = await Promise.race([consulta, espera]);
    if (!res || res.error || typeof res.data !== 'string') return null;
    return res.data;
  } catch {
    return null;
  }
}
