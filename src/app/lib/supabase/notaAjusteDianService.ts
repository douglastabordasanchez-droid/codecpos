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
  };
}

export async function crearNotaAjuste(nota: NotaAjusteDian): Promise<NotaAjusteDian> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase no configurado');

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
  if (!client) throw new Error('Supabase no configurado');

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
