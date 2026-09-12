/**
 * CODEC POS v2.0 — Sincronización del directorio de tiendas (Multi-Tienda)
 * hacia Supabase. Solo el directorio (nombre/dirección/teléfono) — ver
 * migración 0030 sobre por qué el stock por tienda queda fuera.
 */
import { getSupabaseClient } from './config';
import { getLinkedClienteId } from './tenantLink';
import type { Tienda } from '../multitiendaService';

const NETWORK_TIMEOUT_MS = 15_000;
function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timer: number | undefined;
  return Promise.race([promise, new Promise<T>((_, reject) => { timer = window.setTimeout(() => reject(new Error(message)), NETWORK_TIMEOUT_MS); })])
    .finally(() => { if (timer) window.clearTimeout(timer); });
}

export async function publicarTiendas(tiendas: Tienda[]): Promise<void> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId || tiendas.length === 0) return;

  const { error } = await withTimeout(client.from('tiendas').upsert(
    tiendas.map((t) => ({
      cliente_id: clienteId,
      local_id: t.id,
      nombre: t.nombre,
      direccion: t.direccion || null,
      telefono: t.telefono || null,
      color: t.color || null,
      emoji: t.emoji || null,
      activo: t.activo,
      es_principal: t.esPrincipal,
      notas: t.notas || null,
      tipo: t.tipo || 'tienda',
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'cliente_id,local_id' }
  ), 'La sincronización de tiendas tardó demasiado');
  if (error) throw new Error(error.message);
}

/** Borra una tienda en la nube apenas se elimina en Electron — sin esto, una
 *  tienda borrada localmente seguía apareciendo en el celular (publicarTiendas
 *  solo hace upsert, nunca sabe que una tienda ausente significa "bórrala"). */
export async function eliminarTiendaEnNube(localId: string): Promise<void> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return;
  const { error } = await withTimeout(
    client.from('tiendas').delete().eq('cliente_id', clienteId).eq('local_id', localId),
    'El borrado de la tienda tardó demasiado'
  );
  if (error) throw new Error(error.message);
}

export async function descargarTiendas(): Promise<Tienda[] | null> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId || !navigator.onLine) return null;
  const { data, error } = await withTimeout(client.from('tiendas').select('local_id,nombre,direccion,telefono,color,emoji,activo,es_principal,notas,tipo,updated_at').eq('cliente_id', clienteId).order('es_principal', { ascending: false }), 'La consulta de tiendas tardó demasiado');
  if (error) throw new Error(error.message);
  return (data || []).map((row: any) => ({ id: row.local_id, nombre: row.nombre, direccion: row.direccion || '', telefono: row.telefono || '', color: row.color || '#10b981', emoji: row.emoji || '🏪', activo: row.activo !== false, esPrincipal: row.es_principal === true, notas: row.notas || undefined, tipo: row.tipo || 'tienda', fechaCreacion: row.updated_at || new Date().toISOString() }));
}
