/**
 * Panel Desarrollador > Multi-Tienda — administra `tiendas_vinculadas`
 * (migración 0045_multi_tienda_acceso_lectura.sql). Vincula varias
 * instalaciones/licencias (cliente_id) independientes bajo un mismo dueño
 * real, para que ese dueño pueda VER (no operar) las métricas de todas sus
 * tiendas desde un solo login en la PWA. Solo alcanzable vía DeveloperPanel
 * (login de staff Codec Studio, `es_staff_codec = true`) — las policies RLS
 * de `tiendas_vinculadas` rechazan esto a cualquier otro usuario.
 *
 * No confundir con el "Multitienda" de Electron (multitiendaService.ts) —
 * eso es una instalación con varios mostradores que comparten catálogo; esto
 * es varias instalaciones independientes bajo un mismo dueño real.
 */
import { getSupabaseClient } from './config';

export interface VinculoMultiTienda {
  id: string;
  clienteIdPropietario: string;
  nombrePropietario: string;
  clienteIdTienda: string;
  nombreTienda: string;
  createdAt: string;
}

interface VinculoRow {
  id: string;
  cliente_id_propietario: string;
  cliente_id_tienda: string;
  created_at: string;
}

interface ClienteNombreRow {
  id: string;
  nombre_negocio: string;
}

export async function listarVinculosMultiTienda(): Promise<VinculoMultiTienda[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const [{ data: vinculosData, error: e1 }, { data: clientesData, error: e2 }] = await Promise.all([
    client.from('tiendas_vinculadas').select('*').order('created_at', { ascending: false }),
    client.from('clientes_pos').select('id, nombre_negocio'),
  ]);

  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);

  const nombresPorId = new Map<string, string>();
  for (const c of (clientesData as ClienteNombreRow[]) || []) {
    nombresPorId.set(c.id, c.nombre_negocio);
  }

  return ((vinculosData as VinculoRow[]) || []).map((v) => ({
    id: v.id,
    clienteIdPropietario: v.cliente_id_propietario,
    nombrePropietario: nombresPorId.get(v.cliente_id_propietario) || '(negocio no encontrado)',
    clienteIdTienda: v.cliente_id_tienda,
    nombreTienda: nombresPorId.get(v.cliente_id_tienda) || '(negocio no encontrado)',
    createdAt: v.created_at,
  }));
}

export async function crearVinculoMultiTienda(
  clienteIdPropietario: string,
  clienteIdTienda: string,
  creadoPorNombre?: string
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Sin conexión a Supabase');
  if (clienteIdPropietario === clienteIdTienda) {
    throw new Error('Una tienda no puede vincularse a sí misma');
  }
  const { error } = await client.from('tiendas_vinculadas').insert({
    cliente_id_propietario: clienteIdPropietario,
    cliente_id_tienda: clienteIdTienda,
    creado_por_nombre: creadoPorNombre || null,
  });
  if (error) throw new Error(error.message);
}

export async function eliminarVinculoMultiTienda(id: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Sin conexión a Supabase');
  const { error } = await client.from('tiendas_vinculadas').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
