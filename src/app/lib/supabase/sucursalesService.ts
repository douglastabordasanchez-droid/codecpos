/**
 * Sucursales de UN negocio (mismo NIT/licencia) + qué instalación física
 * (caja/computador) pertenece a cuál — tablas `sucursales` e `instalaciones`
 * (migración 0047), con el RPC de asignación agregado en 0076. Pensado para
 * el caso real: un dueño con varios locales, cada uno con su propio
 * Electron/inventario independiente, que quiere ver desde el celular cuánto
 * vendió cada uno por separado (ver InicioPage.tsx, SucursalSelector.tsx).
 *
 * `ventas.terminal_id` guarda el mismo UUID de hardware que
 * `instalaciones.machine_id` (ver useRegistrarInstalacion.ts) — por eso
 * alcanza con este mapeo simple para filtrar ventas por sucursal, sin tocar
 * la tabla ventas para nada.
 */
import { getSupabaseClient } from './config';

export interface Sucursal {
  id: string;
  nombre: string;
  direccion: string | null;
  esPrincipal: boolean;
}

export interface InstalacionFila {
  id: string;
  machineId: string | null;
  codigoCaja: number | null;
  tipo: string;
  sucursalId: string | null;
  ultimaConexion: string | null;
  activadaEn: string;
}

interface SucursalRow {
  id: string;
  nombre: string;
  direccion: string | null;
  es_principal: boolean;
}

interface InstalacionRow {
  id: string;
  machine_id: string | null;
  codigo_caja: number | null;
  tipo: string;
  sucursal_id: string | null;
  ultima_conexion: string | null;
  activada_en: string;
}

export async function listarSucursales(clienteId: string): Promise<Sucursal[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client
    .from('sucursales')
    .select('id, nombre, direccion, es_principal')
    .eq('cliente_id', clienteId)
    .eq('estado', 'ACTIVA')
    .order('es_principal', { ascending: false })
    .order('nombre');
  if (error) throw new Error(error.message);
  return ((data as SucursalRow[]) || []).map((s) => ({
    id: s.id,
    nombre: s.nombre,
    direccion: s.direccion,
    esPrincipal: s.es_principal,
  }));
}

export async function crearSucursal(clienteId: string, nombre: string, direccion?: string): Promise<string> {
  const client = getSupabaseClient();
  if (!client) throw new Error('nuestra base de datos no está configurada');
  const { data, error } = await client.rpc('crear_sucursal', {
    p_cliente_id: clienteId,
    p_nombre: nombre,
    p_direccion: direccion || null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function listarInstalaciones(clienteId: string): Promise<InstalacionFila[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client
    .from('instalaciones')
    .select('id, machine_id, codigo_caja, tipo, sucursal_id, ultima_conexion, activada_en')
    .eq('cliente_id', clienteId)
    .order('codigo_caja');
  if (error) throw new Error(error.message);
  return ((data as InstalacionRow[]) || []).map((i) => ({
    id: i.id,
    machineId: i.machine_id,
    codigoCaja: i.codigo_caja,
    tipo: i.tipo,
    sucursalId: i.sucursal_id,
    ultimaConexion: i.ultima_conexion,
    activadaEn: i.activada_en,
  }));
}

export async function asignarInstalacionASucursal(instalacionId: string, sucursalId: string | null): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('nuestra base de datos no está configurada');
  const { error } = await client.rpc('asignar_instalacion_a_sucursal', {
    p_instalacion_id: instalacionId,
    p_sucursal_id: sucursalId,
  });
  if (error) throw new Error(error.message);
}

/** machine_id de todas las instalaciones asignadas a una sucursal — usarlo para
 *  filtrar `ventas.terminal_id` (`.in('terminal_id', ...)`) al elegir esa sucursal. */
export async function machineIdsDeSucursal(clienteId: string, sucursalId: string): Promise<string[]> {
  const instalaciones = await listarInstalaciones(clienteId);
  return instalaciones.filter((i) => i.sucursalId === sucursalId && i.machineId).map((i) => i.machineId as string);
}
