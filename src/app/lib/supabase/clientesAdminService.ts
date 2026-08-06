/**
 * Panel Desarrollador > Clientes — administra la tabla REAL de licenciamiento
 * (clientes_pos + usuarios_clientes), no datos locales de demo. Solo
 * alcanzable vía DeveloperPanel, que ya exige `esDesarrollador` (login de
 * staff Codec Studio verificado contra Supabase Auth) — las policies RLS de
 * estas tablas permiten INSERT/UPDATE/DELETE a cualquier usuario
 * autenticado, así que basta con tener sesión (ver StaffLoginGate).
 */
import { getSupabaseClient } from './config';

export type PlanCliente = 'BASICO' | 'PREMIUM';
export type DuracionCliente = '1_MES' | '3_MESES' | '1_ANO' | 'VITALICIA';
export type EstadoCliente = 'ACTIVA' | 'VENCIDA' | 'SUSPENDIDA';

export interface ClienteAdmin {
  id: string;
  nombreNegocio: string;
  nit: string;
  contacto: string;
  telefono: string;
  email: string;
  usuario: string;
  contraseña: string;
  plan: PlanCliente;
  duracion: DuracionCliente;
  fechaActivacion: string;
  fechaExpiracion?: string;
  estado: EstadoCliente;
  createdAt: number;
  enPrueba: boolean;
  diasPruebaRestantes: number;
  modulosActivos: string[] | null;
}

interface ClientePosRow {
  id: string;
  nombre_negocio: string;
  nit: string | null;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  plan: string | null;
  duracion: string | null;
  fecha_activacion: string | null;
  fecha_expiracion: string | null;
  estado: string | null;
  created_at: string;
  en_prueba: boolean | null;
  dias_prueba_restantes: number | null;
  modulos_activos: string[] | null;
}

interface UsuarioClienteRow {
  id: string;
  cliente_id: string;
  username: string;
  contraseña: string;
  activo: boolean;
}

function mapCliente(row: ClientePosRow, credencial: UsuarioClienteRow | undefined): ClienteAdmin {
  return {
    id: row.id,
    nombreNegocio: row.nombre_negocio,
    nit: row.nit || '',
    contacto: row.contacto || '',
    telefono: row.telefono || '',
    email: row.email || '',
    usuario: credencial?.username || '',
    contraseña: credencial?.contraseña || '',
    plan: (row.plan as PlanCliente) || 'BASICO',
    duracion: (row.duracion as DuracionCliente) || 'VITALICIA',
    fechaActivacion: row.fecha_activacion || row.created_at,
    fechaExpiracion: row.fecha_expiracion || undefined,
    estado: (row.estado as EstadoCliente) || 'ACTIVA',
    createdAt: new Date(row.created_at).getTime(),
    enPrueba: row.en_prueba || false,
    diasPruebaRestantes: row.dias_prueba_restantes || 0,
    modulosActivos: row.modulos_activos,
  };
}

export async function listarClientesAdmin(): Promise<ClienteAdmin[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const [{ data: clientesData, error: e1 }, { data: credencialesData, error: e2 }] = await Promise.all([
    client.from('clientes_pos').select('*').order('created_at', { ascending: false }),
    client.from('usuarios_clientes').select('*'),
  ]);

  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);

  const credencialesPorCliente = new Map<string, UsuarioClienteRow>();
  for (const c of (credencialesData as UsuarioClienteRow[]) || []) {
    if (!credencialesPorCliente.has(c.cliente_id)) credencialesPorCliente.set(c.cliente_id, c);
  }

  return ((clientesData as ClientePosRow[]) || []).map((row) =>
    mapCliente(row, credencialesPorCliente.get(row.id))
  );
}

interface DatosClienteForm {
  nombreNegocio: string;
  nit: string;
  contacto: string;
  telefono: string;
  email: string;
  usuario: string;
  contraseña: string;
  plan: PlanCliente;
  duracion: DuracionCliente;
  fechaActivacion: string;
  fechaExpiracion?: string;
  estado: EstadoCliente;
  enPrueba: boolean;
  diasPruebaRestantes: number;
  modulosActivos: string[];
}

export async function crearClienteAdmin(datos: DatosClienteForm): Promise<ClienteAdmin> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase no configurado');

  const { data: clienteRow, error: e1 } = await client
    .from('clientes_pos')
    .insert({
      nombre_negocio: datos.nombreNegocio,
      nit: datos.nit || null,
      contacto: datos.contacto || null,
      telefono: datos.telefono || null,
      email: datos.email || null,
      plan: datos.plan,
      duracion: datos.duracion,
      fecha_activacion: datos.fechaActivacion,
      fecha_expiracion: datos.fechaExpiracion || null,
      estado: datos.estado,
      en_prueba: datos.enPrueba,
      dias_prueba_restantes: datos.diasPruebaRestantes,
      modulos_activos: datos.modulosActivos,
    })
    .select('*')
    .single();

  if (e1) throw new Error(e1.message);

  const { data: credRow, error: e2 } = await client
    .from('usuarios_clientes')
    .insert({
      cliente_id: clienteRow.id,
      username: datos.usuario,
      contraseña: datos.contraseña,
      rol: 'admin',
      activo: true,
    })
    .select('*')
    .single();

  if (e2) throw new Error(e2.message);

  return mapCliente(clienteRow as ClientePosRow, credRow as UsuarioClienteRow);
}

export async function actualizarClienteAdmin(id: string, datos: DatosClienteForm): Promise<ClienteAdmin> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase no configurado');

  const { data: clienteRow, error: e1 } = await client
    .from('clientes_pos')
    .update({
      nombre_negocio: datos.nombreNegocio,
      nit: datos.nit || null,
      contacto: datos.contacto || null,
      telefono: datos.telefono || null,
      email: datos.email || null,
      plan: datos.plan,
      duracion: datos.duracion,
      fecha_activacion: datos.fechaActivacion,
      fecha_expiracion: datos.fechaExpiracion || null,
      estado: datos.estado,
      en_prueba: datos.enPrueba,
      dias_prueba_restantes: datos.diasPruebaRestantes,
      modulos_activos: datos.modulosActivos,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (e1) throw new Error(e1.message);

  const { data: existente } = await client
    .from('usuarios_clientes')
    .select('id')
    .eq('cliente_id', id)
    .maybeSingle();

  let credRow: UsuarioClienteRow;
  if (existente) {
    const { data, error } = await client
      .from('usuarios_clientes')
      .update({ username: datos.usuario, contraseña: datos.contraseña })
      .eq('id', existente.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    credRow = data as UsuarioClienteRow;
  } else {
    const { data, error } = await client
      .from('usuarios_clientes')
      .insert({ cliente_id: id, username: datos.usuario, contraseña: datos.contraseña, rol: 'admin', activo: true })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    credRow = data as UsuarioClienteRow;
  }

  return mapCliente(clienteRow as ClientePosRow, credRow);
}

export async function eliminarClienteAdmin(id: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase no configurado');

  await client.from('usuarios_clientes').delete().eq('cliente_id', id);
  const { error } = await client.from('clientes_pos').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function obtenerModulosClienteAdmin(clienteId: string): Promise<string[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client
    .from('clientes_pos')
    .select('modulos_activos')
    .eq('id', clienteId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { modulos_activos: string[] | null } | null)?.modulos_activos ?? null;
}

export async function actualizarModulosClienteAdmin(clienteId: string, modulosActivos: string[]): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase no configurado');
  const { error } = await client.from('clientes_pos').update({ modulos_activos: modulosActivos }).eq('id', clienteId);
  if (error) throw new Error(error.message);
}

export async function cambiarEstadoClienteAdmin(
  id: string,
  estado: EstadoCliente,
  fechaActivacion?: string,
  fechaExpiracion?: string
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase no configurado');

  const payload: Record<string, unknown> = { estado };
  if (fechaActivacion) payload.fecha_activacion = fechaActivacion;
  if (fechaExpiracion !== undefined) payload.fecha_expiracion = fechaExpiracion || null;

  const { error } = await client.from('clientes_pos').update(payload).eq('id', id);
  if (error) throw new Error(error.message);
}
