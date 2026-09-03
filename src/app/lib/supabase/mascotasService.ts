/**
 * Ficha clínica de mascotas del módulo Veterinaria y Mascotas.
 * Tablas `mascotas`, `mascota_peso`, `mascota_eventos` (migración 0081).
 *
 * Mismo patrón que citasGroomingService.ts: cliente_id es el negocio
 * (tenant) vinculado a esta instalación, no el dueño de la mascota. El
 * dueño se guarda como texto (propietario_nombre/telefono) igual que
 * tutor_nombre/tutor_telefono en citas_grooming, más un vínculo suave y
 * opcional (propietarioLocalId) al cliente de fidelización si ya existe.
 */
import { getSupabaseClient } from './config';
import { getLinkedClienteId } from './tenantLink';

export type EspecieMascota = 'perro' | 'gato' | 'aves' | 'generales';
export type SexoMascota = 'macho' | 'hembra' | 'desconocido';
export type TipoEventoClinico = 'vacuna' | 'desparasitacion' | 'consulta' | 'cirugia' | 'otro';

export interface Mascota {
  id: string;
  propietarioNombre: string;
  propietarioTelefono: string | null;
  propietarioLocalId: string | null;
  nombre: string;
  especie: EspecieMascota | null;
  raza: string | null;
  sexo: SexoMascota | null;
  fechaNacimiento: string | null;
  color: string | null;
  pesoActual: number | null;
  alergias: string | null;
  notas: string | null;
  activo: boolean;
  createdAt: string;
}

export interface RegistroPeso {
  id: string;
  mascotaId: string;
  peso: number;
  fecha: string;
}

export interface EventoClinico {
  id: string;
  mascotaId: string;
  tipo: TipoEventoClinico;
  descripcion: string;
  fecha: string;
  proximaFecha: string | null;
  veterinario: string | null;
  notas: string | null;
  recordatorioEnviado: boolean;
}

/** Evento próximo, con los datos de la mascota ya incluidos (para la lista de recordatorios). */
export interface EventoProximo extends EventoClinico {
  mascotaNombre: string;
  propietarioNombre: string;
  propietarioTelefono: string | null;
}

const SELECT_MASCOTA = 'id, propietario_nombre, propietario_telefono, propietario_local_id, nombre, especie, raza, sexo, fecha_nacimiento, color, peso_actual, alergias, notas, activo, created_at';
const SELECT_EVENTO = 'id, mascota_id, tipo, descripcion, fecha, proxima_fecha, veterinario, notas, recordatorio_enviado';

function mapMascota(r: any): Mascota {
  return {
    id: r.id,
    propietarioNombre: r.propietario_nombre,
    propietarioTelefono: r.propietario_telefono,
    propietarioLocalId: r.propietario_local_id,
    nombre: r.nombre,
    especie: r.especie,
    raza: r.raza,
    sexo: r.sexo,
    fechaNacimiento: r.fecha_nacimiento,
    color: r.color,
    pesoActual: r.peso_actual !== null && r.peso_actual !== undefined ? Number(r.peso_actual) : null,
    alergias: r.alergias,
    notas: r.notas,
    activo: r.activo,
    createdAt: r.created_at,
  };
}

function mapEvento(r: any): EventoClinico {
  return {
    id: r.id,
    mascotaId: r.mascota_id,
    tipo: r.tipo,
    descripcion: r.descripcion,
    fecha: r.fecha,
    proximaFecha: r.proxima_fecha,
    veterinario: r.veterinario,
    notas: r.notas,
    recordatorioEnviado: r.recordatorio_enviado,
  };
}

/** Lista/busca mascotas del negocio vinculado (por nombre de mascota o de propietario). */
export async function listarMascotas(busqueda = ''): Promise<Mascota[]> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return [];
  let query = client.from('mascotas').select(SELECT_MASCOTA).eq('cliente_id', clienteId).eq('activo', true).order('nombre');
  if (busqueda.trim()) {
    const term = busqueda.trim();
    query = query.or(`nombre.ilike.%${term}%,propietario_nombre.ilike.%${term}%`);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data as any[]) || []).map(mapMascota);
}

export async function crearMascota(datos: {
  propietarioNombre: string; propietarioTelefono?: string; propietarioLocalId?: string;
  nombre: string; especie?: EspecieMascota; raza?: string; sexo?: SexoMascota;
  fechaNacimiento?: string; color?: string; pesoActual?: number; alergias?: string; notas?: string;
}): Promise<Mascota> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) throw new Error('No hay un negocio vinculado a esta sesión');
  const { data, error } = await client.from('mascotas').insert({
    cliente_id: clienteId,
    propietario_nombre: datos.propietarioNombre,
    propietario_telefono: datos.propietarioTelefono || null,
    propietario_local_id: datos.propietarioLocalId || null,
    nombre: datos.nombre,
    especie: datos.especie || null,
    raza: datos.raza || null,
    sexo: datos.sexo || null,
    fecha_nacimiento: datos.fechaNacimiento || null,
    color: datos.color || null,
    peso_actual: datos.pesoActual ?? null,
    alergias: datos.alergias || null,
    notas: datos.notas || null,
  }).select(SELECT_MASCOTA).single();
  if (error) throw new Error(error.message);
  return mapMascota(data);
}

export async function actualizarMascota(id: string, datos: Partial<{
  propietarioNombre: string; propietarioTelefono: string; propietarioLocalId: string;
  nombre: string; especie: EspecieMascota; raza: string; sexo: SexoMascota;
  fechaNacimiento: string; color: string; pesoActual: number; alergias: string; notas: string; activo: boolean;
}>): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('nuestra base de datos no está configurada');
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (datos.propietarioNombre !== undefined) payload.propietario_nombre = datos.propietarioNombre;
  if (datos.propietarioTelefono !== undefined) payload.propietario_telefono = datos.propietarioTelefono;
  if (datos.propietarioLocalId !== undefined) payload.propietario_local_id = datos.propietarioLocalId;
  if (datos.nombre !== undefined) payload.nombre = datos.nombre;
  if (datos.especie !== undefined) payload.especie = datos.especie;
  if (datos.raza !== undefined) payload.raza = datos.raza;
  if (datos.sexo !== undefined) payload.sexo = datos.sexo;
  if (datos.fechaNacimiento !== undefined) payload.fecha_nacimiento = datos.fechaNacimiento;
  if (datos.color !== undefined) payload.color = datos.color;
  if (datos.pesoActual !== undefined) payload.peso_actual = datos.pesoActual;
  if (datos.alergias !== undefined) payload.alergias = datos.alergias;
  if (datos.notas !== undefined) payload.notas = datos.notas;
  if (datos.activo !== undefined) payload.activo = datos.activo;
  const { error } = await client.from('mascotas').update(payload).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listarPesoHistorico(mascotaId: string): Promise<RegistroPeso[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client.from('mascota_peso').select('id, mascota_id, peso, fecha')
    .eq('mascota_id', mascotaId).order('fecha');
  if (error) throw new Error(error.message);
  return ((data as any[]) || []).map((r) => ({ id: r.id, mascotaId: r.mascota_id, peso: Number(r.peso), fecha: r.fecha }));
}

/** Registra un nuevo peso y actualiza `peso_actual` en la ficha de la mascota. */
export async function registrarPeso(mascotaId: string, peso: number, fecha?: string): Promise<void> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) throw new Error('No hay un negocio vinculado a esta sesión');
  const { error } = await client.from('mascota_peso').insert({
    mascota_id: mascotaId, cliente_id: clienteId, peso, fecha: fecha || new Date().toISOString().slice(0, 10),
  });
  if (error) throw new Error(error.message);
  await client.from('mascotas').update({ peso_actual: peso, updated_at: new Date().toISOString() }).eq('id', mascotaId);
}

export async function listarEventos(mascotaId: string): Promise<EventoClinico[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client.from('mascota_eventos').select(SELECT_EVENTO)
    .eq('mascota_id', mascotaId).order('fecha', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data as any[]) || []).map(mapEvento);
}

export async function crearEvento(datos: {
  mascotaId: string; tipo: TipoEventoClinico; descripcion: string; fecha?: string;
  proximaFecha?: string; veterinario?: string; notas?: string;
}): Promise<EventoClinico> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) throw new Error('No hay un negocio vinculado a esta sesión');
  const { data, error } = await client.from('mascota_eventos').insert({
    mascota_id: datos.mascotaId, cliente_id: clienteId, tipo: datos.tipo, descripcion: datos.descripcion,
    fecha: datos.fecha || new Date().toISOString().slice(0, 10),
    proxima_fecha: datos.proximaFecha || null, veterinario: datos.veterinario || null, notas: datos.notas || null,
  }).select(SELECT_EVENTO).single();
  if (error) throw new Error(error.message);
  return mapEvento(data);
}

export async function eliminarEvento(id: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('nuestra base de datos no está configurada');
  const { error } = await client.from('mascota_eventos').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Eventos con próxima fecha (vacuna/desparasitación) dentro de `dias` días,
 * que todavía no dispararon un recordatorio. Base del sistema de alertas.
 */
export async function eventosProximos(dias = 7): Promise<EventoProximo[]> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return [];
  const limite = new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
  const { data, error } = await client.from('mascota_eventos')
    .select(`${SELECT_EVENTO}, mascotas!inner(nombre, propietario_nombre, propietario_telefono, cliente_id)`)
    .eq('mascotas.cliente_id', clienteId)
    .eq('recordatorio_enviado', false)
    .not('proxima_fecha', 'is', null)
    .lte('proxima_fecha', limite)
    .order('proxima_fecha');
  if (error) throw new Error(error.message);
  return ((data as any[]) || []).map((r) => ({
    ...mapEvento(r),
    mascotaNombre: r.mascotas?.nombre || '',
    propietarioNombre: r.mascotas?.propietario_nombre || '',
    propietarioTelefono: r.mascotas?.propietario_telefono || null,
  }));
}

export async function marcarRecordatorioEnviado(eventoId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  await client.from('mascota_eventos').update({ recordatorio_enviado: true }).eq('id', eventoId);
}
