/**
 * Encargos (migración 0164): tortas y pedidos por encargo con abonos.
 * La constancia vive en la nube; el dinero (abono y saldo) se cobra por la caja
 * normal para que cuadre en el cierre.
 */
import { getSupabaseClient } from './config';

export type EstadoEncargo = 'pendiente' | 'en_preparacion' | 'lista' | 'entregada' | 'cancelada';

export interface AbonoEncargo {
  monto: number;
  fecha: string;
  por?: string;
  /** 'abono' al encargar o después; 'saldo' al entregar. */
  tipo?: 'abono' | 'saldo';
}

export interface Encargo {
  id: string;
  clienteNombre: string;
  clienteTelefono?: string;
  tipo: string;
  detalle?: string;
  fechaEntrega: string; // AAAA-MM-DD
  horaEntrega?: string; // HH:MM
  total: number;
  abonos: AbonoEncargo[];
  estado: EstadoEncargo;
  creadoPor?: string;
  createdAt: string;
}

export const ESTADOS_ENCARGO: Array<{ id: EstadoEncargo; label: string; color: string }> = [
  { id: 'pendiente', label: 'Pendiente', color: '#f59e0b' },
  { id: 'en_preparacion', label: 'En preparación', color: '#0ea5e9' },
  { id: 'lista', label: 'Lista para entregar', color: '#10b981' },
  { id: 'entregada', label: 'Entregada', color: '#64748b' },
  { id: 'cancelada', label: 'Cancelada', color: '#ef4444' },
];

export const TIPOS_TORTA = ['Torta de chocolate', 'Torta de vainilla', 'Tres leches', 'Torta negra', 'Torta de zanahoria', 'Torta de frutas', 'Red velvet', 'Ponqué'];

export function abonado(e: Pick<Encargo, 'abonos'>): number {
  return e.abonos.reduce((s, a) => s + (Number(a.monto) || 0), 0);
}

export function saldo(e: Pick<Encargo, 'abonos' | 'total'>): number {
  return Math.max(0, Math.round((Number(e.total) || 0) - abonado(e)));
}

function mapear(r: any): Encargo {
  return {
    id: String(r.id),
    clienteNombre: String(r.cliente_nombre || ''),
    clienteTelefono: r.cliente_telefono || undefined,
    tipo: String(r.tipo || 'Torta'),
    detalle: r.detalle || undefined,
    fechaEntrega: String(r.fecha_entrega || ''),
    horaEntrega: r.hora_entrega ? String(r.hora_entrega).slice(0, 5) : undefined,
    total: Number(r.total) || 0,
    abonos: Array.isArray(r.abonos) ? r.abonos : [],
    estado: (r.estado || 'pendiente') as EstadoEncargo,
    creadoPor: r.creado_por || undefined,
    createdAt: String(r.created_at || ''),
  };
}

/** Encargos activos y los entregados o cancelados de los últimos 30 días. */
export async function listarEncargos(clienteId: string): Promise<Encargo[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const hace30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const { data, error } = await client.from('encargos').select('*')
    .eq('cliente_id', clienteId)
    .gte('fecha_entrega', hace30)
    .order('fecha_entrega', { ascending: true })
    .order('hora_entrega', { ascending: true, nullsFirst: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data || []).map(mapear);
}

export interface DatosEncargo {
  clienteNombre: string;
  clienteTelefono?: string;
  tipo: string;
  detalle?: string;
  fechaEntrega: string;
  horaEntrega?: string;
  total: number;
}

export async function crearEncargo(clienteId: string, datos: DatosEncargo, por?: string, abonoInicial = 0): Promise<Encargo> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Sin conexión con la nube');
  const abonos: AbonoEncargo[] = abonoInicial > 0 ? [{ monto: Math.round(abonoInicial), fecha: new Date().toISOString(), por, tipo: 'abono' }] : [];
  const { data, error } = await client.from('encargos').insert({
    cliente_id: clienteId,
    cliente_nombre: datos.clienteNombre.trim().slice(0, 80),
    cliente_telefono: datos.clienteTelefono?.trim().slice(0, 30) || null,
    tipo: datos.tipo.trim().slice(0, 80) || 'Torta',
    detalle: datos.detalle?.trim().slice(0, 1000) || null,
    fecha_entrega: datos.fechaEntrega,
    hora_entrega: datos.horaEntrega || null,
    total: Math.max(0, Math.round(datos.total)),
    abonos,
    creado_por: por || null,
  }).select('*').single();
  if (error) throw new Error(error.message);
  return mapear(data);
}

export async function actualizarEncargo(id: string, cambios: Partial<DatosEncargo> & { estado?: EstadoEncargo; abonos?: AbonoEncargo[] }): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Sin conexión con la nube');
  const fila: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (cambios.clienteNombre !== undefined) fila.cliente_nombre = cambios.clienteNombre.trim().slice(0, 80);
  if (cambios.clienteTelefono !== undefined) fila.cliente_telefono = cambios.clienteTelefono.trim().slice(0, 30) || null;
  if (cambios.tipo !== undefined) fila.tipo = cambios.tipo.trim().slice(0, 80) || 'Torta';
  if (cambios.detalle !== undefined) fila.detalle = cambios.detalle.trim().slice(0, 1000) || null;
  if (cambios.fechaEntrega !== undefined) fila.fecha_entrega = cambios.fechaEntrega;
  if (cambios.horaEntrega !== undefined) fila.hora_entrega = cambios.horaEntrega || null;
  if (cambios.total !== undefined) fila.total = Math.max(0, Math.round(cambios.total));
  if (cambios.estado !== undefined) fila.estado = cambios.estado;
  if (cambios.abonos !== undefined) fila.abonos = cambios.abonos;
  const { error } = await client.from('encargos').update(fila).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Suma un abono (o el saldo al entregar) a la constancia del encargo. */
export async function registrarAbono(e: Encargo, monto: number, por?: string, tipo: 'abono' | 'saldo' = 'abono'): Promise<AbonoEncargo[]> {
  const abonos = [...e.abonos, { monto: Math.round(monto), fecha: new Date().toISOString(), por, tipo }];
  await actualizarEncargo(e.id, { abonos, ...(tipo === 'saldo' ? { estado: 'entregada' as EstadoEncargo } : {}) });
  return abonos;
}

export function suscribirEncargos(clienteId: string, alCambiar: () => void): () => void {
  const client = getSupabaseClient();
  if (!client) return () => {};
  const canal = client.channel(`encargos-${clienteId}-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'encargos', filter: `cliente_id=eq.${clienteId}` }, () => alCambiar())
    .subscribe();
  return () => { client.removeChannel(canal); };
}

/** Línea para cobrar en la caja: «ABONO TORTA · Ana (entrega 22/11 3:00 p. m.)». */
export function lineaCobro(e: Encargo, tipo: 'abono' | 'saldo', monto: number): { id: string; nombre: string; precio: number } {
  const [, m, d] = e.fechaEntrega.split('-');
  const cuando = `${d}/${m}${e.horaEntrega ? ` ${e.horaEntrega}` : ''}`;
  return {
    id: `encargo-${tipo}-${e.id.slice(0, 8)}-${Date.now()}`,
    nombre: `${tipo === 'abono' ? 'ABONO' : 'SALDO'} ${e.tipo.toUpperCase()} · ${e.clienteNombre} (entrega ${cuando})`.slice(0, 120),
    precio: Math.round(monto),
  };
}
