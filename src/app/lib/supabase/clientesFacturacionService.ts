/**
 * Base de clientes de facturación electrónica (tabla clientes_facturacion,
 * migración 0123). La cargan en Facturación › Clientes y la usan Electron,
 * la web y el celular al facturar: con la cédula o el NIT se llena el resto.
 */
import { getSupabaseClient } from './config';
import { normalizarDocumento } from '../dian/clientesFactura';

export interface ClienteFacturacion {
  id?: string;
  /** 13 cédula, 31 NIT, 22 cédula de extranjería, 41 pasaporte, 12 tarjeta de identidad. */
  tipoDocumento: string;
  numeroDocumento: string;
  digitoVerificacion?: string;
  nombre: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  ciudad?: string;
  agenteRetencionFuente: boolean;
  agenteRetencionIca: boolean;
  notas?: string;
}

export const TIPOS_DOCUMENTO_CLIENTE: Array<{ codigo: string; nombre: string }> = [
  { codigo: '13', nombre: 'Cédula' },
  { codigo: '31', nombre: 'NIT' },
  { codigo: '22', nombre: 'Cédula de extranjería' },
  { codigo: '41', nombre: 'Pasaporte' },
  { codigo: '12', nombre: 'Tarjeta de identidad' },
];

interface Fila {
  id: string;
  tipo_documento: string;
  numero_documento: string;
  digito_verificacion: string | null;
  nombre: string;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  ciudad: string | null;
  agente_retencion_fuente: boolean;
  agente_retencion_ica: boolean;
  notas: string | null;
}

const vacioANull = (v?: string) => (v && v.trim() ? v.trim() : null);

function filaACliente(f: Fila): ClienteFacturacion {
  return {
    id: f.id,
    tipoDocumento: f.tipo_documento,
    numeroDocumento: f.numero_documento,
    digitoVerificacion: f.digito_verificacion ?? undefined,
    nombre: f.nombre,
    email: f.email ?? undefined,
    telefono: f.telefono ?? undefined,
    direccion: f.direccion ?? undefined,
    ciudad: f.ciudad ?? undefined,
    agenteRetencionFuente: f.agente_retencion_fuente,
    agenteRetencionIca: f.agente_retencion_ica,
    notas: f.notas ?? undefined,
  };
}

/** Del NIT escrito con DV ("900123456-7") se separa el dígito de verificación. */
function separarDv(documento: string, dv?: string): { numero: string; dv: string | null } {
  const [, conDv] = (documento || '').split('-');
  return { numero: normalizarDocumento(documento), dv: vacioANull(dv) ?? vacioANull(conDv) };
}

function clienteAFila(clienteId: string, c: ClienteFacturacion) {
  const { numero, dv } = separarDv(c.numeroDocumento, c.digitoVerificacion);
  return {
    cliente_id: clienteId,
    tipo_documento: c.tipoDocumento || '13',
    numero_documento: numero,
    digito_verificacion: dv,
    nombre: c.nombre.trim(),
    email: vacioANull(c.email),
    telefono: vacioANull(c.telefono),
    direccion: vacioANull(c.direccion),
    ciudad: vacioANull(c.ciudad),
    agente_retencion_fuente: !!c.agenteRetencionFuente,
    agente_retencion_ica: !!c.agenteRetencionIca,
    notas: vacioANull(c.notas),
    updated_at: new Date().toISOString(),
  };
}

export async function listarClientesFacturacion(clienteId: string): Promise<ClienteFacturacion[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const todos: ClienteFacturacion[] = [];
  // De a 1000 (límite de cada consulta), hasta traerlos todos.
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await client
      .from('clientes_facturacion')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('nombre')
      .range(desde, desde + 999);
    if (error) throw new Error(error.message);
    todos.push(...(data as Fila[]).map(filaACliente));
    if (!data || data.length < 1000) return todos;
  }
}

/** Busca por cédula o NIT, con o sin puntos y dígito de verificación. */
export async function buscarClienteFacturacion(clienteId: string, documento: string): Promise<ClienteFacturacion | null> {
  const client = getSupabaseClient();
  const numero = normalizarDocumento(documento);
  if (!client || !numero) return null;
  const { data, error } = await client
    .from('clientes_facturacion')
    .select('*')
    .eq('cliente_id', clienteId)
    .eq('numero_documento', numero)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? filaACliente(data as Fila) : null;
}

export async function guardarClienteFacturacion(clienteId: string, cliente: ClienteFacturacion): Promise<ClienteFacturacion> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Sin conexión con la nube');
  if (!normalizarDocumento(cliente.numeroDocumento)) throw new Error('Escriba la cédula o el NIT');
  if (!cliente.nombre.trim()) throw new Error('Escriba el nombre o la razón social');
  const fila = clienteAFila(clienteId, cliente);
  const consulta = cliente.id
    ? client.from('clientes_facturacion').update(fila).eq('id', cliente.id)
    : client.from('clientes_facturacion').upsert(fila, { onConflict: 'cliente_id,numero_documento' });
  const { data, error } = await consulta.select('*').single();
  if (error) {
    if (error.code === '23505') throw new Error('Ya hay otro cliente con esa cédula o NIT');
    throw new Error(error.message);
  }
  return filaACliente(data as Fila);
}

export async function eliminarClienteFacturacion(id: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Sin conexión con la nube');
  const { error } = await client.from('clientes_facturacion').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Carga masiva (Excel): si la cédula o el NIT ya existe, se actualiza. */
export async function importarClientesFacturacion(clienteId: string, clientes: ClienteFacturacion[]): Promise<number> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Sin conexión con la nube');
  // Una misma cédula repetida en el archivo: gana la última fila.
  const porDocumento = new Map<string, ReturnType<typeof clienteAFila>>();
  for (const c of clientes) {
    const fila = clienteAFila(clienteId, c);
    if (fila.numero_documento && fila.nombre) porDocumento.set(fila.numero_documento, fila);
  }
  const filas = [...porDocumento.values()];
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await client.from('clientes_facturacion').upsert(filas.slice(i, i + 500), { onConflict: 'cliente_id,numero_documento' });
    if (error) throw new Error(error.message);
  }
  return filas.length;
}
