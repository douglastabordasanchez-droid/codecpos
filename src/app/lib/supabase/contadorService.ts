/**
 * "Mi contador": conexión del negocio con su contador en Codec Document
 * (migración 0122, Edge Function contador-sync). El token de la conexión
 * nunca llega al navegador: solo se ve el estado.
 */
import { getSupabaseClient } from './config';

export interface EstadoContador {
  estado: 'activo' | 'revocado' | 'desvinculado';
  empresa: string | null;
  contador: string | null;
  vinculadoEn: string | null;
  ultimoEnvioEn: string | null;
  ultimoError: string | null;
  pendientes: number;
  enviados: number;
  rechazados: number;
}

function cliente() {
  const c = getSupabaseClient();
  if (!c) throw new Error('nuestra base de datos no está configurada');
  return c;
}

/** null = este negocio nunca se ha conectado con un contador. */
export async function obtenerEstadoContador(): Promise<EstadoContador | null> {
  const { data, error } = await cliente().rpc('mi_contador_estado');
  if (error) throw new Error(error.message);
  const fila = (data as any[] | null)?.[0];
  if (!fila) return null;
  return {
    estado: fila.estado,
    empresa: fila.empresa,
    contador: fila.contador,
    vinculadoEn: fila.vinculado_en,
    ultimoEnvioEn: fila.ultimo_envio_en,
    ultimoError: fila.ultimo_error,
    pendientes: Number(fila.pendientes) || 0,
    enviados: Number(fila.enviados) || 0,
    rechazados: Number(fila.rechazados) || 0,
  };
}

async function invocar<T>(cuerpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await cliente().functions.invoke('contador-sync', { body: cuerpo });
  if (error) {
    // supabase-js envuelve los errores HTTP: el mensaje útil viene en el cuerpo.
    let detalle = error.message;
    try {
      const cuerpoError = await (error as any).context?.json?.();
      if (cuerpoError?.error) detalle = cuerpoError.error;
    } catch { /* se queda el mensaje genérico */ }
    throw new Error(detalle);
  }
  return data as T;
}

export const conectarContador = (codigo: string) =>
  invocar<{ empresa: string | null; contador: string | null; encolados: number }>({ accion: 'vincular', codigo });

export const desconectarContador = () => invocar<{ ok: boolean }>({ accion: 'desvincular' });

/** Pregunta a Codec Document si la conexión sigue viva; si el contador la cortó, queda «revocado». */
export const verificarContador = () => invocar<{ estado: string | null }>({ accion: 'verificar' });

// ── Certificado digital al servicio del contador (migración 0139, contador-firma) ──

export interface CertificadoContador {
  tieneCertificado: boolean;
  titular: string | null;
  vence: string | null;
  compartido: boolean;
  compartidoEn: string | null;
  error: string | null;
  /** Lo último que Codec POS le anunció a Codec Document sobre la firma por encargo. */
  puedeFirmarAcuses: boolean;
  puedeFirmarNomina: boolean;
  motivoAcuses: string | null;
  motivoNomina: string | null;
  firmaError: string | null;
  firmasValidadas: number;
  firmasRechazadas: number;
}

export async function obtenerCertificadoContador(): Promise<CertificadoContador | null> {
  const { data, error } = await cliente().rpc('mi_contador_certificado');
  if (error) throw new Error(error.message);
  const f = (data as any[] | null)?.[0];
  if (!f) return null;
  const cap = f.firma_capacidad ?? {};
  return {
    tieneCertificado: !!f.tiene_certificado,
    titular: f.titular ? (String(f.titular).match(/CN=([^,]+)/)?.[1] ?? f.titular) : null,
    vence: f.vence,
    compartido: !!f.compartido,
    compartidoEn: f.compartido_en,
    error: f.error,
    puedeFirmarAcuses: !!cap.acuses?.puede_firmar,
    puedeFirmarNomina: !!cap.nomina?.puede_firmar_nomina,
    motivoAcuses: cap.acuses?.motivo ?? null,
    motivoNomina: cap.nomina?.motivo ?? null,
    firmaError: f.firma_error,
    firmasValidadas: Number(f.firmas_validadas) || 0,
    firmasRechazadas: Number(f.firmas_rechazadas) || 0,
  };
}

async function invocarFirma<T>(cuerpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await cliente().functions.invoke('contador-firma', { body: cuerpo });
  if (error) {
    let detalle = error.message;
    try {
      const cuerpoError = await (error as any).context?.json?.();
      if (cuerpoError?.error) detalle = cuerpoError.error;
    } catch { /* se queda el mensaje genérico */ }
    throw new Error(detalle);
  }
  return data as T;
}

/** Manda una copia cifrada del certificado a Codec Document (solo el administrador). */
export const compartirCertificadoContador = () => invocarFirma<{ ok: boolean; vence: string }>({ accion: 'compartir-certificado' });

export const dejarDeCompartirCertificado = () => invocarFirma<{ ok: boolean }>({ accion: 'dejar-de-compartir' });

/** Credenciales de nómina electrónica del perfil fiscal activo (son distintas de las de facturación). */
export interface DatosNomina { softwareId: string; softwarePin: string; ambiente: 'habilitacion' | 'produccion'; testSetId: string }

export async function obtenerDatosNomina(): Promise<DatosNomina | null> {
  const { data, error } = await cliente().from('perfiles_fiscales')
    .select('nomina_software_id, nomina_software_pin, nomina_ambiente, nomina_test_set_id').eq('activo', true).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    softwareId: data.nomina_software_id ?? '', softwarePin: data.nomina_software_pin ?? '',
    ambiente: data.nomina_ambiente === 'produccion' ? 'produccion' : 'habilitacion', testSetId: data.nomina_test_set_id ?? '',
  };
}

export async function guardarDatosNomina(d: DatosNomina): Promise<void> {
  const { error } = await cliente().from('perfiles_fiscales').update({
    nomina_software_id: d.softwareId.trim() || null,
    nomina_software_pin: d.softwarePin.trim() || null,
    nomina_ambiente: d.ambiente,
    nomina_test_set_id: d.testSetId.trim() || null,
    updated_at: new Date().toISOString(),
  }).eq('activo', true);
  if (error) throw new Error(error.message);
}
