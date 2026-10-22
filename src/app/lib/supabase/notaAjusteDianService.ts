/**
 * CRUD de notas de ajuste (crédito/débito) contra Supabase — dos tablas
 * físicas (notas_credito_electronicas / notas_debito_electronicas), una
 * sola interfaz en el dominio (`NotaAjusteDian.tipo` decide cuál tocar).
 * Nunca se relee el perfil fiscal en vivo: el emisor de la nota es siempre
 * el mismo snapshot congelado de la factura que ajusta (ver
 * notaAjusteXmlBuilder.ts).
 */
import { getSupabaseClient } from './config';
import type { NotaAjusteDian, EstadoDocumentoDian, TipoNotaAjuste, ItemFacturaDian } from '../dian/types';

interface NotaRow {
  id: string;
  cliente_id: string;
  perfil_fiscal_id: string;
  factura_id: string;
  numero_nota: string;
  prefijo: string | null;
  resolucion_id: string | null;
  concepto_codigo: string | null;
  cude: string | null;
  xml: string | null;
  motivo: string;
  estado: EstadoDocumentoDian;
  respuesta_dian: Record<string, unknown> | null;
  items: ItemFacturaDian[] | null;
  subtotal: number | null;
  total_impuestos: number | null;
  total: number;
  fecha_emision: string;
  updated_at?: string;
}

function tabla(tipo: TipoNotaAjuste) {
  return tipo === 'credito' ? 'notas_credito_electronicas' : 'notas_debito_electronicas';
}

function filaANota(fila: NotaRow, tipo: TipoNotaAjuste): NotaAjusteDian {
  return {
    id: fila.id,
    clienteId: fila.cliente_id,
    perfilFiscalId: fila.perfil_fiscal_id,
    facturaId: fila.factura_id,
    tipo,
    numeroNota: fila.numero_nota,
    prefijo: fila.prefijo ?? undefined,
    resolucionId: fila.resolucion_id ?? undefined,
    conceptoCodigo: fila.concepto_codigo ?? undefined,
    cude: fila.cude ?? undefined,
    xml: fila.xml ?? undefined,
    motivo: fila.motivo,
    estado: fila.estado,
    respuestaDian: fila.respuesta_dian ?? undefined,
    items: fila.items ?? undefined,
    subtotal: fila.subtotal ?? undefined,
    totalImpuestos: fila.total_impuestos ?? undefined,
    total: fila.total,
    fechaEmision: fila.fecha_emision,
    actualizadaEn: fila.updated_at,
  };
}

export async function crearNotaAjuste(nota: NotaAjusteDian): Promise<NotaAjusteDian> {
  const client = getSupabaseClient();
  if (!client) throw new Error('nuestra base de datos no está configurada');

  const { data, error } = await client
    .from(tabla(nota.tipo))
    .insert({
      cliente_id: nota.clienteId,
      perfil_fiscal_id: nota.perfilFiscalId,
      factura_id: nota.facturaId,
      numero_nota: nota.numeroNota,
      prefijo: nota.prefijo,
      resolucion_id: nota.resolucionId,
      concepto_codigo: nota.conceptoCodigo,
      cude: nota.cude,
      xml: nota.xml,
      motivo: nota.motivo,
      estado: nota.estado,
      items: nota.items,
      subtotal: nota.subtotal,
      total_impuestos: nota.totalImpuestos,
      total: nota.total,
      fecha_emision: nota.fechaEmision,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return filaANota(data as NotaRow, nota.tipo);
}

export async function actualizarEstadoNota(
  tipo: TipoNotaAjuste,
  id: string,
  estado: EstadoDocumentoDian,
  extra: Partial<{ cude: string; xml: string; respuestaDian: Record<string, unknown> }> = {}
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('nuestra base de datos no está configurada');

  const payload: Record<string, unknown> = { estado, updated_at: new Date().toISOString() };
  if (extra.cude !== undefined) payload.cude = extra.cude;
  if (extra.xml !== undefined) payload.xml = extra.xml;
  if (extra.respuestaDian !== undefined) payload.respuesta_dian = extra.respuestaDian;

  const { error } = await client.from(tabla(tipo)).update(payload).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listarNotasDeFactura(facturaId: string): Promise<NotaAjusteDian[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const [credito, debito] = await Promise.all([
    client.from('notas_credito_electronicas').select('*').eq('factura_id', facturaId).order('created_at', { ascending: false }),
    client.from('notas_debito_electronicas').select('*').eq('factura_id', facturaId).order('created_at', { ascending: false }),
  ]);

  const notas: NotaAjusteDian[] = [
    ...((credito.data as NotaRow[] | null) || []).map((f) => filaANota(f, 'credito')),
    ...((debito.data as NotaRow[] | null) || []).map((f) => filaANota(f, 'debito')),
  ];
  return notas.sort((a, b) => new Date(b.fechaEmision).getTime() - new Date(a.fechaEmision).getTime());
}

/** Mismo margen que las facturas: una nota en 'signing'/'sent' por más tiempo quedó abandonada. */
const MINUTOS_ENVIO_ABANDONADO = 10;

/** Notas en contingencia o abandonadas a medio envío, de las dos tablas. */
export async function listarNotasPendientesDeTransmision(clienteId: string): Promise<NotaAjusteDian[]> {
  const client = getSupabaseClient();
  if (!client) throw new Error('nuestra base de datos no está configurada');
  const limiteAbandono = new Date(Date.now() - MINUTOS_ENVIO_ABANDONADO * 60_000).toISOString();
  const filtro = `estado.eq.contingency,and(estado.in.(signing,sent),updated_at.lt.${limiteAbandono})`;
  const [credito, debito] = await Promise.all((['credito', 'debito'] as const).map((tipo) =>
    client.from(tabla(tipo)).select('*').eq('cliente_id', clienteId).or(filtro).order('fecha_emision', { ascending: true }).limit(50)));
  if (credito.error) throw new Error(credito.error.message);
  if (debito.error) throw new Error(debito.error.message);
  return [
    ...((credito.data as NotaRow[] | null) || []).map((f) => filaANota(f, 'credito')),
    ...((debito.data as NotaRow[] | null) || []).map((f) => filaANota(f, 'debito')),
  ];
}

/** Candado optimista, igual que reclamarFacturaParaTransmision: false si otra caja se adelantó. */
export async function reclamarNotaParaTransmision(tipo: TipoNotaAjuste, id: string, actualizadaEn: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  const { data, error } = await client
    .from(tabla(tipo))
    .update({ estado: 'signing', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('updated_at', actualizadaEn)
    .select('id');
  return !error && (data?.length ?? 0) > 0;
}

/** Nota con los datos de la factura que ajusta, para el listado de notas. */
export interface NotaConFactura extends NotaAjusteDian {
  factura?: { numeroFactura: string; clienteNombre: string; clienteNit: string; total: number };
}

// Sin el XML: pesa y solo se pide al descargarlo (obtenerXmlNota).
const COLUMNAS_LISTADO = 'id, cliente_id, perfil_fiscal_id, factura_id, numero_nota, prefijo, resolucion_id, concepto_codigo, cude, motivo, estado, respuesta_dian, items, subtotal, total_impuestos, total, fecha_emision, updated_at, factura:facturas_electronicas(numero_factura, cliente_nombre, cliente_nit, total)';

/** Todas las notas crédito y débito del negocio, de la más reciente a la más antigua. */
export async function listarNotasDelCliente(
  clienteId: string,
  opciones: { desde?: string; hasta?: string; limite?: number } = {},
): Promise<NotaConFactura[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const consultas = (['credito', 'debito'] as const).map((tipo) => {
    let q = client.from(tabla(tipo)).select(COLUMNAS_LISTADO).eq('cliente_id', clienteId);
    if (opciones.desde) q = q.gte('fecha_emision', opciones.desde);
    if (opciones.hasta) q = q.lte('fecha_emision', opciones.hasta);
    return q.order('fecha_emision', { ascending: false }).limit(opciones.limite ?? 300);
  });
  const [credito, debito] = await Promise.all(consultas);
  if (credito.error) throw new Error(credito.error.message);
  if (debito.error) throw new Error(debito.error.message);
  type FilaListado = NotaRow & { factura: { numero_factura: string; cliente_nombre: string | null; cliente_nit: string | null; total: number } | null };
  const convertir = (fila: FilaListado, tipo: TipoNotaAjuste): NotaConFactura => ({
    ...filaANota({ ...fila, xml: null }, tipo),
    factura: fila.factura ? {
      numeroFactura: fila.factura.numero_factura,
      clienteNombre: fila.factura.cliente_nombre || '',
      clienteNit: fila.factura.cliente_nit || '',
      total: Number(fila.factura.total) || 0,
    } : undefined,
  });
  return [
    ...((credito.data as unknown as FilaListado[] | null) || []).map((f) => convertir(f, 'credito')),
    ...((debito.data as unknown as FilaListado[] | null) || []).map((f) => convertir(f, 'debito')),
  ].sort((a, b) => new Date(b.fechaEmision).getTime() - new Date(a.fechaEmision).getTime());
}

/** XML firmado de una nota, para descargarlo. */
export async function obtenerXmlNota(tipo: TipoNotaAjuste, id: string): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.from(tabla(tipo)).select('xml').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { xml: string | null } | null)?.xml ?? null;
}
