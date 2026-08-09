/**
 * CRUD de perfiles fiscales (FiscalProfile) y sus resoluciones/numeración
 * contra Supabase. Reemplaza a dianConfigService.ts — la identidad fiscal
 * ya no es 1:1 con el negocio, es una entidad propia de la que puede haber
 * varias (persona natural → SAS), solo una activa a la vez.
 *
 * El contenido sensible (certificado, PIN) NUNCA pasa por aquí — vive
 * cifrado localmente (ver electron/dianSecrets.js), este servicio solo
 * mueve metadata y datos fiscales públicos.
 */
import { getSupabaseClient } from './config';
import { getLinkedClienteId } from './tenantLink';
import type {
  FiscalProfile, ResolucionDian, CertificadoDianMeta,
  AmbienteDian, EstadoPerfilFiscal, TipoPersona,
} from '../dian/types';

interface FiscalProfileRow {
  id: string;
  cliente_id: string;
  tipo_persona: TipoPersona;
  nit: string | null;
  digito_verificacion: string | null;
  nombre_o_razon_social: string;
  nombre_comercial: string | null;
  rut_referencia: string | null;
  direccion_fiscal: string | null;
  municipio_codigo: string | null;
  departamento_codigo: string | null;
  pais_codigo: string;
  responsabilidades_fiscales: string[] | null;
  regimen_fiscal: string | null;
  contacto_email: string | null;
  contacto_telefono: string | null;
  identificador_software: string | null;
  clave_tecnica: string | null;
  software_pin: string | null;
  ambiente: AmbienteDian;
  estado: EstadoPerfilFiscal;
  activo: boolean;
  pin_configurado: boolean;
  entrega_whatsapp_habilitada: boolean;
  entrega_email_habilitada: boolean;
  entrega_email_remitente: string | null;
}

function filaAPerfil(fila: FiscalProfileRow): FiscalProfile {
  return {
    id: fila.id,
    clienteId: fila.cliente_id,
    tipoPersona: fila.tipo_persona,
    nit: fila.nit ?? undefined,
    digitoVerificacion: fila.digito_verificacion ?? undefined,
    nombreORazonSocial: fila.nombre_o_razon_social,
    nombreComercial: fila.nombre_comercial ?? undefined,
    rutReferencia: fila.rut_referencia ?? undefined,
    direccionFiscal: fila.direccion_fiscal ?? undefined,
    municipioCodigo: fila.municipio_codigo ?? undefined,
    departamentoCodigo: fila.departamento_codigo ?? undefined,
    paisCodigo: fila.pais_codigo,
    responsabilidadesFiscales: fila.responsabilidades_fiscales ?? [],
    regimenFiscal: fila.regimen_fiscal ?? undefined,
    contactoEmail: fila.contacto_email ?? undefined,
    contactoTelefono: fila.contacto_telefono ?? undefined,
    identificadorSoftware: fila.identificador_software ?? undefined,
    claveTecnica: fila.clave_tecnica ?? undefined,
    softwarePin: fila.software_pin ?? undefined,
    ambiente: fila.ambiente,
    estado: fila.estado,
    activo: fila.activo,
    pinConfigurado: fila.pin_configurado,
    entregaWhatsappHabilitada: fila.entrega_whatsapp_habilitada,
    entregaEmailHabilitada: fila.entrega_email_habilitada,
    entregaEmailRemitente: fila.entrega_email_remitente ?? undefined,
  };
}

/** Todos los perfiles fiscales del negocio (histórico + activo), más
 * recientes primero. */
export async function listarPerfilesFiscales(clienteId?: string): Promise<FiscalProfile[]> {
  const cid = clienteId || getLinkedClienteId();
  if (!cid) return [];
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client.from('perfiles_fiscales').select('*').eq('cliente_id', cid).order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as FiscalProfileRow[]).map(filaAPerfil);
}

/** El perfil ACTIVO del negocio (el que factura en este momento), o null si
 * ninguno está activo todavía. */
export async function obtenerPerfilFiscalActivo(clienteId?: string): Promise<FiscalProfile | null> {
  const cid = clienteId || getLinkedClienteId();
  if (!cid) return null;
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.from('perfiles_fiscales').select('*').eq('cliente_id', cid).eq('activo', true).maybeSingle();
  if (error || !data) return null;
  return filaAPerfil(data as FiscalProfileRow);
}

/** Un perfil fiscal puntual por id — para notas de ajuste, que deben usar
 * las credenciales técnicas (softwarePin) del MISMO perfil que emitió la
 * factura original, no necesariamente el perfil activo hoy. */
export async function obtenerPerfilFiscalPorId(id: string): Promise<FiscalProfile | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.from('perfiles_fiscales').select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return filaAPerfil(data as FiscalProfileRow);
}

export type DatosPerfilFiscalForm = Partial<Omit<FiscalProfile, 'id' | 'clienteId' | 'activo' | 'pinConfigurado' | 'estado'>>;

/** Crea un perfil fiscal NUEVO (no sobrescribe uno existente — para pasar de
 * persona natural a SAS se crea otro perfil, nunca se edita el NIT de uno
 * ya usado en facturas). */
export async function crearPerfilFiscal(clienteId: string, datos: DatosPerfilFiscalForm): Promise<FiscalProfile> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase no configurado');
  if (!datos.tipoPersona || !datos.nombreORazonSocial) {
    throw new Error('Falta tipo de persona o nombre/razón social');
  }

  const { data, error } = await client
    .from('perfiles_fiscales')
    .insert({
      cliente_id: clienteId,
      tipo_persona: datos.tipoPersona,
      nit: datos.nit,
      digito_verificacion: datos.digitoVerificacion,
      nombre_o_razon_social: datos.nombreORazonSocial,
      nombre_comercial: datos.nombreComercial,
      rut_referencia: datos.rutReferencia,
      direccion_fiscal: datos.direccionFiscal,
      municipio_codigo: datos.municipioCodigo,
      departamento_codigo: datos.departamentoCodigo,
      pais_codigo: datos.paisCodigo || 'CO',
      responsabilidades_fiscales: datos.responsabilidadesFiscales || [],
      regimen_fiscal: datos.regimenFiscal,
      contacto_email: datos.contactoEmail,
      contacto_telefono: datos.contactoTelefono,
      identificador_software: datos.identificadorSoftware,
      clave_tecnica: datos.claveTecnica,
      software_pin: datos.softwarePin,
      ambiente: datos.ambiente || 'habilitacion',
      entrega_whatsapp_habilitada: datos.entregaWhatsappHabilitada ?? false,
      entrega_email_habilitada: datos.entregaEmailHabilitada ?? false,
      entrega_email_remitente: datos.entregaEmailRemitente,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return filaAPerfil(data as FiscalProfileRow);
}

/** Edita un perfil EXISTENTE que todavía no ha emitido facturas (o cuyos
 * datos no fiscales-críticos cambian, ej. datos de contacto/entrega). Las
 * facturas ya emitidas no se ven afectadas porque guardan su propio
 * snapshot — pero por seguridad, evita editar NIT/razón social de un
 * perfil que ya facturó: mejor crear uno nuevo (crearPerfilFiscal). */
export async function actualizarPerfilFiscal(id: string, datos: DatosPerfilFiscalForm): Promise<FiscalProfile> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase no configurado');

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (datos.tipoPersona !== undefined) payload.tipo_persona = datos.tipoPersona;
  if (datos.nit !== undefined) payload.nit = datos.nit;
  if (datos.digitoVerificacion !== undefined) payload.digito_verificacion = datos.digitoVerificacion;
  if (datos.nombreORazonSocial !== undefined) payload.nombre_o_razon_social = datos.nombreORazonSocial;
  if (datos.nombreComercial !== undefined) payload.nombre_comercial = datos.nombreComercial;
  if (datos.rutReferencia !== undefined) payload.rut_referencia = datos.rutReferencia;
  if (datos.direccionFiscal !== undefined) payload.direccion_fiscal = datos.direccionFiscal;
  if (datos.municipioCodigo !== undefined) payload.municipio_codigo = datos.municipioCodigo;
  if (datos.departamentoCodigo !== undefined) payload.departamento_codigo = datos.departamentoCodigo;
  if (datos.paisCodigo !== undefined) payload.pais_codigo = datos.paisCodigo;
  if (datos.responsabilidadesFiscales !== undefined) payload.responsabilidades_fiscales = datos.responsabilidadesFiscales;
  if (datos.regimenFiscal !== undefined) payload.regimen_fiscal = datos.regimenFiscal;
  if (datos.contactoEmail !== undefined) payload.contacto_email = datos.contactoEmail;
  if (datos.contactoTelefono !== undefined) payload.contacto_telefono = datos.contactoTelefono;
  if (datos.identificadorSoftware !== undefined) payload.identificador_software = datos.identificadorSoftware;
  if (datos.claveTecnica !== undefined) payload.clave_tecnica = datos.claveTecnica;
  if (datos.softwarePin !== undefined) payload.software_pin = datos.softwarePin;
  if (datos.ambiente !== undefined) payload.ambiente = datos.ambiente;
  if (datos.entregaWhatsappHabilitada !== undefined) payload.entrega_whatsapp_habilitada = datos.entregaWhatsappHabilitada;
  if (datos.entregaEmailHabilitada !== undefined) payload.entrega_email_habilitada = datos.entregaEmailHabilitada;
  if (datos.entregaEmailRemitente !== undefined) payload.entrega_email_remitente = datos.entregaEmailRemitente;

  const { data, error } = await client.from('perfiles_fiscales').update(payload).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return filaAPerfil(data as FiscalProfileRow);
}

export async function actualizarEstadoPerfilFiscal(id: string, estado: EstadoPerfilFiscal): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase no configurado');
  const { error } = await client.from('perfiles_fiscales').update({ estado, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Marca este perfil como el ACTIVO del negocio y desactiva cualquier otro
 * (vía RPC transaccional — nunca quedan dos activos a la vez). */
export async function activarPerfilFiscal(perfilId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase no configurado');
  const { error } = await client.rpc('activar_perfil_fiscal', { p_perfil_id: perfilId });
  if (error) throw new Error(error.message);
}

export async function marcarPinConfigurado(perfilId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase no configurado');
  const { error } = await client.from('perfiles_fiscales').update({ pin_configurado: true, updated_at: new Date().toISOString() }).eq('id', perfilId);
  if (error) throw new Error(error.message);
}

// ── Resoluciones / numeración (pertenecen al perfil) ──

interface ResolucionRow {
  id: string;
  perfil_fiscal_id: string;
  cliente_id: string;
  tipo_documento: 'factura' | 'documento_equivalente' | 'nota_credito' | 'nota_debito';
  prefijo: string;
  resolucion_numero: string;
  resolucion_fecha: string | null;
  rango_desde: number;
  rango_hasta: number;
  consecutivo_actual: number;
  vigencia_hasta: string | null;
  estado: 'activa' | 'agotada' | 'vencida';
}

function filaAResolucion(fila: ResolucionRow): ResolucionDian {
  return {
    id: fila.id,
    perfilFiscalId: fila.perfil_fiscal_id,
    clienteId: fila.cliente_id,
    tipoDocumento: fila.tipo_documento,
    prefijo: fila.prefijo,
    resolucionNumero: fila.resolucion_numero,
    resolucionFecha: fila.resolucion_fecha ?? undefined,
    rangoDesde: fila.rango_desde,
    rangoHasta: fila.rango_hasta,
    consecutivoActual: fila.consecutivo_actual,
    vigenciaHasta: fila.vigencia_hasta ?? undefined,
    estado: fila.estado,
  };
}

export async function listarResolucionesPerfil(perfilFiscalId: string): Promise<ResolucionDian[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client
    .from('perfiles_fiscales_resoluciones')
    .select('*')
    .eq('perfil_fiscal_id', perfilFiscalId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as ResolucionRow[]).map(filaAResolucion);
}

export async function crearResolucionDian(
  clienteId: string,
  perfilFiscalId: string,
  datos: { tipoDocumento: ResolucionDian['tipoDocumento']; prefijo: string; resolucionNumero: string; resolucionFecha?: string; rangoDesde: number; rangoHasta: number; vigenciaHasta?: string }
): Promise<ResolucionDian> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase no configurado');
  const { data, error } = await client
    .from('perfiles_fiscales_resoluciones')
    .insert({
      cliente_id: clienteId,
      perfil_fiscal_id: perfilFiscalId,
      tipo_documento: datos.tipoDocumento,
      prefijo: datos.prefijo,
      resolucion_numero: datos.resolucionNumero,
      resolucion_fecha: datos.resolucionFecha,
      rango_desde: datos.rangoDesde,
      rango_hasta: datos.rangoHasta,
      vigencia_hasta: datos.vigenciaHasta,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return filaAResolucion(data as ResolucionRow);
}

/** Consume el siguiente consecutivo de forma atómica (RPC — el UPDATE en el
 * servidor toma el row lock, así que dos ventas simultáneas nunca chocan). */
export async function siguienteConsecutivoDian(resolucionId: string): Promise<number> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase no configurado');
  const { data, error } = await client.rpc('siguiente_consecutivo_dian', { p_resolucion_id: resolucionId });
  if (error) throw new Error(error.message);
  return data as number;
}

// ── Certificados (metadata pública, pertenece al perfil) ──

export async function guardarMetadataCertificado(clienteId: string, perfilFiscalId: string, meta: CertificadoDianMeta): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase no configurado');
  const { error } = await client.from('dian_certificados').insert({
    cliente_id: clienteId,
    perfil_fiscal_id: perfilFiscalId,
    nombre_archivo: meta.nombreArchivo,
    huella_sha256: meta.huellaSha256,
    fecha_vencimiento: meta.fechaVencimiento,
    estado: meta.estado,
  });
  if (error) throw new Error(error.message);
}

export async function obtenerUltimoCertificado(perfilFiscalId: string): Promise<CertificadoDianMeta | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client
    .from('dian_certificados')
    .select('nombre_archivo, huella_sha256, fecha_vencimiento, estado, fecha_emision, emisor, sujeto')
    .eq('perfil_fiscal_id', perfilFiscalId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    nombreArchivo: data.nombre_archivo,
    huellaSha256: data.huella_sha256,
    fechaVencimiento: data.fecha_vencimiento,
    estado: data.estado,
    fechaEmision: data.fecha_emision ?? undefined,
    emisor: data.emisor ?? undefined,
    sujeto: data.sujeto ?? undefined,
  };
}
