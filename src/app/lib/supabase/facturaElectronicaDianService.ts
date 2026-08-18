/**
 * CRUD de facturas_electronicas (DIAN directo) contra Supabase.
 *
 * Cada factura queda ligada a un perfil_fiscal_id/resolucion_id y guarda su
 * propio snapshot inmutable del emisor (columnas issuer_*) — nunca se relee
 * el perfil fiscal en vivo una vez la factura existe (ver EmisorSnapshot en
 * ../dian/types.ts).
 */
import { getSupabaseClient } from './config';
import type { FacturaElectronicaDian, EstadoDocumentoDian, EmisorSnapshot, AmbienteDian, TipoDocumentoFactura } from '../dian/types';

interface FacturaRow {
  id: string;
  cliente_id: string;
  perfil_fiscal_id: string;
  resolucion_id: string | null;
  tipo_documento: TipoDocumentoFactura;
  venta_referencia: string;
  numero_factura: string;
  prefijo: string | null;
  cufe: string | null;
  xml: string | null;
  representacion_grafica_url: string | null;
  estado: EstadoDocumentoDian;
  respuesta_dian: Record<string, unknown> | null;
  motivo_rechazo: string | null;
  intentos_transmision: number;
  contingencia: boolean;
  issuer_nit: string | null;
  issuer_dv: string | null;
  issuer_nombre_o_razon_social: string | null;
  issuer_nombre_comercial: string | null;
  issuer_direccion: string | null;
  issuer_municipio_codigo: string | null;
  issuer_departamento_codigo: string | null;
  issuer_responsabilidades_fiscales: string[] | null;
  issuer_ambiente: AmbienteDian | null;
  cliente_nit: string | null;
  cliente_nombre: string | null;
  cliente_email: string | null;
  cliente_telefono: string | null;
  subtotal: number | null;
  total_impuestos: number | null;
  total: number;
  fecha_emision: string;
  fecha_validacion: string | null;
}

function filaAFactura(fila: FacturaRow): FacturaElectronicaDian {
  const emisor: EmisorSnapshot = {
    nit: fila.issuer_nit ?? undefined,
    digitoVerificacion: fila.issuer_dv ?? undefined,
    nombreORazonSocial: fila.issuer_nombre_o_razon_social ?? undefined,
    nombreComercial: fila.issuer_nombre_comercial ?? undefined,
    direccion: fila.issuer_direccion ?? undefined,
    municipioCodigo: fila.issuer_municipio_codigo ?? undefined,
    departamentoCodigo: fila.issuer_departamento_codigo ?? undefined,
    responsabilidadesFiscales: fila.issuer_responsabilidades_fiscales ?? undefined,
    ambiente: fila.issuer_ambiente ?? undefined,
  };

  return {
    id: fila.id,
    clienteId: fila.cliente_id,
    perfilFiscalId: fila.perfil_fiscal_id,
    resolucionId: fila.resolucion_id ?? undefined,
    tipoDocumento: fila.tipo_documento || 'factura',
    ventaReferencia: fila.venta_referencia,
    numeroFactura: fila.numero_factura,
    prefijo: fila.prefijo ?? undefined,
    cufe: fila.cufe ?? undefined,
    xml: fila.xml ?? undefined,
    representacionGraficaUrl: fila.representacion_grafica_url ?? undefined,
    estado: fila.estado,
    respuestaDian: fila.respuesta_dian ?? undefined,
    motivoRechazo: fila.motivo_rechazo ?? undefined,
    intentosTransmision: fila.intentos_transmision,
    contingencia: fila.contingencia,
    emisor,
    adquirente: {
      tipoDocumento: '13',
      numeroDocumento: fila.cliente_nit || '222222222222',
      nombreORazonSocial: fila.cliente_nombre || 'Consumidor final',
      email: fila.cliente_email ?? undefined,
      telefono: fila.cliente_telefono ?? undefined,
    },
    items: [],
    subtotal: fila.subtotal ?? 0,
    totalImpuestos: fila.total_impuestos ?? 0,
    total: fila.total,
    fechaEmision: fila.fecha_emision,
    fechaValidacion: fila.fecha_validacion ?? undefined,
  };
}

/**
 * Crea la factura persistiendo el snapshot inmutable del emisor tal como
 * viene en `factura.emisor` — el llamador (el orquestador de venta) es
 * responsable de haberlo construido a partir del FiscalProfile ACTIVO en
 * ese instante. Esta función nunca vuelve a leer el perfil.
 */
export async function crearFacturaDian(factura: FacturaElectronicaDian): Promise<FacturaElectronicaDian> {
  const client = getSupabaseClient();
  if (!client) throw new Error('nuestra base de datos no está configurada');
  if (!factura.perfilFiscalId) throw new Error('La factura no tiene perfilFiscalId — no se puede emitir sin un perfil fiscal activo');

  const { data, error } = await client
    .from('facturas_electronicas')
    .insert({
      cliente_id: factura.clienteId,
      perfil_fiscal_id: factura.perfilFiscalId,
      resolucion_id: factura.resolucionId,
      tipo_documento: factura.tipoDocumento,
      venta_referencia: factura.ventaReferencia,
      numero_factura: factura.numeroFactura,
      prefijo: factura.prefijo,
      cufe: factura.cufe,
      xml: factura.xml,
      estado: factura.estado,
      motivo_rechazo: factura.motivoRechazo,
      contingencia: factura.contingencia,
      issuer_nit: factura.emisor.nit,
      issuer_dv: factura.emisor.digitoVerificacion,
      issuer_nombre_o_razon_social: factura.emisor.nombreORazonSocial,
      issuer_nombre_comercial: factura.emisor.nombreComercial,
      issuer_direccion: factura.emisor.direccion,
      issuer_municipio_codigo: factura.emisor.municipioCodigo,
      issuer_departamento_codigo: factura.emisor.departamentoCodigo,
      issuer_responsabilidades_fiscales: factura.emisor.responsabilidadesFiscales,
      issuer_ambiente: factura.emisor.ambiente,
      cliente_nit: factura.adquirente.numeroDocumento,
      cliente_nombre: factura.adquirente.nombreORazonSocial,
      cliente_email: factura.adquirente.email,
      cliente_telefono: factura.adquirente.telefono,
      subtotal: factura.subtotal,
      total_impuestos: factura.totalImpuestos,
      total: factura.total,
      fecha_emision: factura.fechaEmision,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return filaAFactura(data as FacturaRow);
}

export async function actualizarEstadoFactura(
  id: string,
  estado: EstadoDocumentoDian,
  extra: Partial<{ cufe: string; xml: string; respuestaDian: Record<string, unknown>; motivoRechazo: string; fechaValidacion: string }> = {}
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('nuestra base de datos no está configurada');

  const payload: Record<string, unknown> = { estado, updated_at: new Date().toISOString() };
  if (extra.cufe !== undefined) payload.cufe = extra.cufe;
  if (extra.xml !== undefined) payload.xml = extra.xml;
  if (extra.respuestaDian !== undefined) payload.respuesta_dian = extra.respuestaDian;
  if (extra.motivoRechazo !== undefined) payload.motivo_rechazo = extra.motivoRechazo;
  if (extra.fechaValidacion !== undefined) payload.fecha_validacion = extra.fechaValidacion;

  const { error } = await client.from('facturas_electronicas').update(payload).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function incrementarIntentosTransmision(id: string, intentosActuales: number): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  await client.from('facturas_electronicas').update({ intentos_transmision: intentosActuales + 1 }).eq('id', id);
}

export interface FiltrosHistorialFacturas {
  clienteId: string;
  perfilFiscalId?: string;
  desde?: string;
  hasta?: string;
  numeroFactura?: string;
  estado?: EstadoDocumentoDian;
  limite?: number;
}

export async function listarFacturasDian(filtros: FiltrosHistorialFacturas): Promise<FacturaElectronicaDian[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  let query = client
    .from('facturas_electronicas')
    .select('*')
    .eq('cliente_id', filtros.clienteId)
    .order('fecha_emision', { ascending: false })
    .limit(filtros.limite ?? 100);

  if (filtros.perfilFiscalId) query = query.eq('perfil_fiscal_id', filtros.perfilFiscalId);
  if (filtros.desde) query = query.gte('fecha_emision', filtros.desde);
  if (filtros.hasta) query = query.lte('fecha_emision', filtros.hasta);
  if (filtros.numeroFactura) query = query.ilike('numero_factura', `%${filtros.numeroFactura}%`);
  if (filtros.estado) query = query.eq('estado', filtros.estado);

  const { data, error } = await query;
  if (error || !data) return [];
  return (data as FacturaRow[]).map(filaAFactura);
}

export async function obtenerFacturaPorId(id: string): Promise<FacturaElectronicaDian | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client.from('facturas_electronicas').select('*').eq('id', id).maybeSingle();
  if (!data) return null;
  return filaAFactura(data as FacturaRow);
}

export async function obtenerFacturaPorVenta(clienteId: string, ventaReferencia: string): Promise<FacturaElectronicaDian | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client
    .from('facturas_electronicas')
    .select('*')
    .eq('cliente_id', clienteId)
    .eq('venta_referencia', ventaReferencia)
    .maybeSingle();
  if (!data) return null;
  return filaAFactura(data as FacturaRow);
}
