/**
 * Agenda de estética/grooming del módulo Veterinaria y Mascotas.
 * Tabla `citas_grooming` (migración 0080).
 */
import { getSupabaseClient } from './config';
import { getLinkedClienteId } from './tenantLink';

export type EstadoCita = 'PENDIENTE' | 'EN_PROCESO' | 'COMPLETADA' | 'CANCELADA';

export interface CitaGrooming {
  id: string;
  tutorNombre: string;
  tutorTelefono: string | null;
  mascotaNombre: string;
  especie: string | null;
  raza: string | null;
  tipoPelo: string | null;
  observaciones: string | null;
  servicio: string;
  precio: number;
  fechaHora: string;
  estado: EstadoCita;
}

interface CitaRow {
  id: string;
  tutor_nombre: string;
  tutor_telefono: string | null;
  mascota_nombre: string;
  especie: string | null;
  raza: string | null;
  tipo_pelo: string | null;
  observaciones: string | null;
  servicio: string;
  precio: number;
  fecha_hora: string;
  estado: EstadoCita;
}

function mapRow(r: CitaRow): CitaGrooming {
  return {
    id: r.id,
    tutorNombre: r.tutor_nombre,
    tutorTelefono: r.tutor_telefono,
    mascotaNombre: r.mascota_nombre,
    especie: r.especie,
    raza: r.raza,
    tipoPelo: r.tipo_pelo,
    observaciones: r.observaciones,
    servicio: r.servicio,
    precio: Number(r.precio),
    fechaHora: r.fecha_hora,
    estado: r.estado,
  };
}

/** Trae las citas del día (o de hoy en adelante si `soloFuturas`) para el negocio vinculado. */
export async function listarCitasGrooming(desde: Date, hasta: Date): Promise<CitaGrooming[]> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return [];
  const { data, error } = await client
    .from('citas_grooming')
    .select('id, tutor_nombre, tutor_telefono, mascota_nombre, especie, raza, tipo_pelo, observaciones, servicio, precio, fecha_hora, estado')
    .eq('cliente_id', clienteId)
    .gte('fecha_hora', desde.toISOString())
    .lt('fecha_hora', hasta.toISOString())
    .order('fecha_hora');
  if (error) throw new Error(error.message);
  return ((data as CitaRow[]) || []).map(mapRow);
}

export async function crearCitaGrooming(datos: {
  tutorNombre: string; tutorTelefono?: string; mascotaNombre: string; especie?: string;
  raza?: string; tipoPelo?: string; observaciones?: string; servicio: string; precio: number; fechaHora: string;
}): Promise<void> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) throw new Error('No hay un negocio vinculado a esta sesión');
  const { error } = await client.from('citas_grooming').insert({
    cliente_id: clienteId,
    tutor_nombre: datos.tutorNombre,
    tutor_telefono: datos.tutorTelefono || null,
    mascota_nombre: datos.mascotaNombre,
    especie: datos.especie || null,
    raza: datos.raza || null,
    tipo_pelo: datos.tipoPelo || null,
    observaciones: datos.observaciones || null,
    servicio: datos.servicio,
    precio: datos.precio,
    fecha_hora: datos.fechaHora,
  });
  if (error) throw new Error(error.message);
}

export async function actualizarEstadoCita(id: string, estado: EstadoCita): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('nuestra base de datos no está configurada');
  const { error } = await client.from('citas_grooming').update({ estado }).eq('id', id);
  if (error) throw new Error(error.message);
}
