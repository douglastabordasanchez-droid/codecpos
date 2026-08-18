/**
 * CODEC POS v2.0 — Sincronización del directorio de tiendas (Multi-Tienda)
 * hacia Supabase. Solo el directorio (nombre/dirección/teléfono) — ver
 * migración 0030 sobre por qué el stock por tienda queda fuera.
 */
import { getSupabaseClient } from './config';
import { getLinkedClienteId } from './tenantLink';
import type { Tienda } from '../multitiendaService';

export async function publicarTiendas(tiendas: Tienda[]): Promise<void> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId || tiendas.length === 0) return;

  const { error } = await client.from('tiendas').upsert(
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
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'cliente_id,local_id' }
  );
  if (error) throw new Error(error.message);
}
