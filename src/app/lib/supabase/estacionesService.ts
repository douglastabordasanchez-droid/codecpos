/**
 * Estaciones de preparación (migración 0148): Cocina, Greca, Comidas rápidas,
 * Bar... El administrador las crea; el mesero elige la estación de cada
 * producto al enviar el pedido y cada tablet de estación ve solo lo suyo.
 *
 * La estación elegida para un producto se recuerda en la nube
 * (`panaderia_producto_estacion`) y sale preseleccionada para todos los
 * meseros la próxima vez. `null` = "solo cuenta": no se envía a ninguna parte.
 */
import { getSupabaseClient } from './config';

export interface Estacion {
  id: string;
  nombre: string;
  color: string;
  icono: string;
  orden: number;
  activa: boolean;
}

/** Colores sugeridos al crear una estación (se pueden cambiar). */
export const COLORES_ESTACION = ['#f97316', '#a16207', '#dc2626', '#2563eb', '#7c3aed', '#059669', '#db2777', '#0891b2'];

/** Estaciones típicas para crear con un toque. */
export const ESTACIONES_SUGERIDAS = ['Cocina', 'Greca', 'Comidas rápidas', 'Parrilla', 'Bar', 'Panadería'];

function mapEstacion(r: any): Estacion {
  return {
    id: r.id,
    nombre: r.nombre,
    color: r.color || '#f97316',
    icono: r.icono || 'cocina',
    orden: Number(r.orden) || 0,
    activa: r.activa !== false,
  };
}

export async function listarEstaciones(clienteId: string): Promise<Estacion[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client
    .from('estaciones')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('orden')
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data || []).map(mapEstacion);
}

export async function crearEstacion(clienteId: string, nombre: string, color: string, orden: number): Promise<Estacion> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Sin conexión con la nube');
  const { data, error } = await client
    .from('estaciones')
    .insert({ cliente_id: clienteId, nombre: nombre.trim(), color, orden })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return mapEstacion(data);
}

export async function actualizarEstacion(id: string, cambios: Partial<Pick<Estacion, 'nombre' | 'color' | 'activa' | 'orden'>>): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Sin conexión con la nube');
  const { error } = await client
    .from('estaciones')
    .update({ ...cambios, ...(cambios.nombre ? { nombre: cambios.nombre.trim() } : {}), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function eliminarEstacion(id: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Sin conexión con la nube');
  const { error } = await client.from('estaciones').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export function suscribirEstaciones(clienteId: string, alCambiar: () => void): () => void {
  const client = getSupabaseClient();
  if (!client) return () => {};
  const canal = client
    .channel(`estaciones-${clienteId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'estaciones', filter: `cliente_id=eq.${clienteId}` }, () => alCambiar())
    .subscribe();
  return () => { void client.removeChannel(canal); };
}

// ── Estación aprendida por producto ──────────────────────────────────────────

/** { productoId: estacionId | null } — null = solo cuenta. Sin entrada = nunca se eligió. */
export async function estacionesAprendidas(clienteId: string): Promise<Record<string, string | null>> {
  const client = getSupabaseClient();
  if (!client) return {};
  const { data, error } = await client
    .from('panaderia_producto_estacion')
    .select('producto_local_id, estacion_id')
    .eq('cliente_id', clienteId);
  if (error) return {};
  return Object.fromEntries((data || []).map((r: any) => [r.producto_local_id, r.estacion_id ?? null]));
}

export async function recordarEstaciones(clienteId: string, elecciones: Record<string, string | null>): Promise<void> {
  const client = getSupabaseClient();
  const filas = Object.entries(elecciones).map(([producto, estacion]) => ({
    cliente_id: clienteId,
    producto_local_id: producto,
    estacion_id: estacion,
    updated_at: new Date().toISOString(),
  }));
  if (!client || filas.length === 0) return;
  await client.from('panaderia_producto_estacion').upsert(filas, { onConflict: 'cliente_id,producto_local_id' });
}

// ── Preferencias de la tablet de estación (en este equipo) ───────────────────

const CLAVE_TABLET = 'codecpos_tablet_estacion';

export interface PreferenciasTablet {
  estacionId: string | null;
  sonido: boolean;
}

export function leerPreferenciasTablet(): PreferenciasTablet {
  try {
    const raw = localStorage.getItem(CLAVE_TABLET);
    if (raw) return { estacionId: null, sonido: true, ...JSON.parse(raw) };
  } catch { /* valores por defecto */ }
  return { estacionId: null, sonido: true };
}

export function guardarPreferenciasTablet(p: PreferenciasTablet): void {
  try { localStorage.setItem(CLAVE_TABLET, JSON.stringify(p)); } catch { /* ignorar */ }
}
