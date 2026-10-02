/**
 * Firma y transmisión a la DIAN — dos caminos, una sola interfaz.
 *
 *   · LOCAL (Electron): el certificado vive cifrado en este computador y la
 *     firma ocurre en el proceso principal. Funciona como siempre.
 *   · NUBE (web, celular, o un Electron sin certificado local): el negocio
 *     sube su certificado UNA vez y queda custodiado en el servidor, cifrado.
 *     La Edge Function `dian-emision` firma y transmite; la llave privada
 *     nunca baja a un navegador.
 *
 * Quien emite (emitirFacturaDian.ts, emitirNotaAjuste.ts, colaDian.ts) no
 * sabe ni le importa cuál de los dos se usó.
 */
import { getSupabaseClient } from '../supabase/config';
import type { AmbienteDian, DianResponse } from './types';

export interface DocumentoParaTransmitir {
  perfilFiscalId: string;
  ambiente: AmbienteDian;
  /** Número del documento (prefijo + consecutivo): da nombre al archivo. */
  numero: string;
  /** XML UBL, firmado o no. Si ya trae ds:Signature no se vuelve a firmar. */
  xml: string;
}

export interface ResultadoTransmision {
  xmlFirmado: string;
  respuesta: DianResponse;
}

export interface TransporteDian {
  readonly nombre: 'local' | 'nube';
  /** Solo firma (sin internet hacia la DIAN). Se usa para dejar el documento firmado el mismo día de la emisión. */
  firmar(doc: DocumentoParaTransmitir): Promise<string>;
  firmarYTransmitir(doc: DocumentoParaTransmitir): Promise<ResultadoTransmision>;
  consultarEstado(perfilFiscalId: string, ambiente: AmbienteDian, cufe: string): Promise<DianResponse>;
  /** Set de pruebas de habilitación: firma y envía con el TestSetId de la DIAN. Devuelve el ZipKey para consultar el resultado. */
  enviarSetDePruebas(doc: DocumentoParaTransmitir, testSetId: string): Promise<{ xmlFirmado: string; zipKey?: string; respuesta: DianResponse }>;
  consultarResultadoSet(perfilFiscalId: string, zipKey: string): Promise<DianResponse>;
}

export const xmlYaFirmado = (xml: string) => /<ds:Signature[\s>]/.test(xml);

/** Traduce la respuesta cruda del servicio de la DIAN (DianResponse del WSDL) al estado del documento. */
export function mapearRespuestaDian(cruda: any): DianResponse {
  const isValid = cruda?.IsValid === true || cruda?.IsValid === 'true';
  const errores = cruda?.ErrorMessage?.string ?? cruda?.ErrorMessage;
  const mensajes: string[] = Array.isArray(errores) ? errores.map(String) : errores ? [String(errores)] : [];
  return {
    ok: isValid,
    estado: isValid ? 'accepted' : mensajes.length > 0 ? 'rejected' : 'error',
    mensajes: [cruda?.StatusDescription, cruda?.StatusMessage, ...mensajes].filter(Boolean),
    cune: cruda?.XmlDocumentKey,
    crudo: cruda,
  };
}

// ── Local: proceso principal de Electron ──────────────────────────────────

const apiElectron = () => (typeof window !== 'undefined' ? (window as any).electron?.dian : undefined);

const aBase64 = (texto: string) => {
  const bytes = new TextEncoder().encode(texto);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const deBase64 = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

class TransporteLocal implements TransporteDian {
  readonly nombre = 'local' as const;

  async firmar(doc: DocumentoParaTransmitir): Promise<string> {
    if (xmlYaFirmado(doc.xml)) return doc.xml;
    const r = await apiElectron().firmarDocumento(doc.perfilFiscalId, aBase64(doc.xml));
    if (!r?.success) throw new Error(r?.error || 'No se pudo firmar el documento');
    return deBase64(r.base64Firmado);
  }

  async firmarYTransmitir(doc: DocumentoParaTransmitir): Promise<ResultadoTransmision> {
    const xmlFirmado = await this.firmar(doc);
    const r = await apiElectron().enviarFacturaSync(doc.perfilFiscalId, `${doc.numero}.xml`, xmlFirmado, doc.ambiente);
    if (!r?.success) throw new ErrorDeTransmision(r?.error || 'No se pudo transmitir a la DIAN', xmlFirmado);
    return { xmlFirmado, respuesta: mapearRespuestaDian(r.respuesta) };
  }

  async consultarEstado(perfilFiscalId: string, ambiente: AmbienteDian, cufe: string): Promise<DianResponse> {
    const r = await apiElectron().consultarEstado(perfilFiscalId, cufe, ambiente);
    if (!r?.success) throw new Error(r?.error || 'No se pudo consultar el estado en la DIAN');
    return mapearRespuestaDian(r.respuesta);
  }

  async enviarSetDePruebas(doc: DocumentoParaTransmitir, testSetId: string) {
    const xmlFirmado = await this.firmar(doc);
    const r = await apiElectron().enviarSetPruebas(doc.perfilFiscalId, `${doc.numero}.xml`, xmlFirmado, testSetId);
    if (!r?.success) throw new ErrorDeTransmision(r?.error || 'No se pudo enviar el set de pruebas', xmlFirmado);
    return { xmlFirmado, zipKey: r.respuesta?.ZipKey, respuesta: mapearRespuestaDian(r.respuesta) };
  }

  async consultarResultadoSet(perfilFiscalId: string, zipKey: string): Promise<DianResponse> {
    const r = await apiElectron().consultarEstadoZip(perfilFiscalId, zipKey, 'habilitacion');
    if (!r?.success) throw new Error(r?.error || 'No se pudo consultar el resultado del set de pruebas');
    return mapearRespuestaDian(r.respuesta);
  }
}

// ── Nube: Edge Function dian-emision ──────────────────────────────────────

/** La firma sí se hizo pero la DIAN no respondió: se conserva el XML firmado para no firmar dos veces. */
export class ErrorDeTransmision extends Error {
  constructor(mensaje: string, readonly xmlFirmado?: string) {
    super(mensaje);
    this.name = 'ErrorDeTransmision';
  }
}

export async function invocarDianEmision<T = any>(cuerpo: Record<string, unknown>): Promise<T> {
  const client = getSupabaseClient();
  if (!client) throw new Error('nuestra base de datos no está configurada');
  const { data, error } = await client.functions.invoke('dian-emision', { body: cuerpo });
  if (error) {
    // supabase-js envuelve los errores HTTP: el mensaje útil viene en el cuerpo.
    let detalle = error.message;
    try {
      const cuerpoError = await (error as any).context?.json?.();
      if (cuerpoError?.error) detalle = cuerpoError.error;
    } catch { /* se queda el mensaje genérico */ }
    throw new Error(detalle);
  }
  if (data?.ok === false) throw new ErrorDeTransmision(data.error || 'La operación con la DIAN falló', data.xmlFirmado);
  return data as T;
}

class TransporteNube implements TransporteDian {
  readonly nombre = 'nube' as const;

  async firmar(doc: DocumentoParaTransmitir): Promise<string> {
    if (xmlYaFirmado(doc.xml)) return doc.xml;
    const r = await invocarDianEmision<{ xmlFirmado: string }>({ accion: 'firmar', perfilFiscalId: doc.perfilFiscalId, xml: doc.xml });
    return r.xmlFirmado;
  }

  async firmarYTransmitir(doc: DocumentoParaTransmitir): Promise<ResultadoTransmision> {
    const r = await invocarDianEmision<{ xmlFirmado: string; respuesta: unknown }>({
      accion: 'firmar-enviar', perfilFiscalId: doc.perfilFiscalId, ambiente: doc.ambiente, numero: doc.numero, xml: doc.xml,
    });
    return { xmlFirmado: r.xmlFirmado, respuesta: mapearRespuestaDian(r.respuesta) };
  }

  async consultarEstado(perfilFiscalId: string, ambiente: AmbienteDian, cufe: string): Promise<DianResponse> {
    const r = await invocarDianEmision<{ respuesta: unknown }>({ accion: 'consultar-estado', perfilFiscalId, ambiente, trackId: cufe });
    return mapearRespuestaDian(r.respuesta);
  }

  async enviarSetDePruebas(doc: DocumentoParaTransmitir, testSetId: string) {
    const r = await invocarDianEmision<{ xmlFirmado: string; respuesta: any }>({
      accion: 'firmar-enviar', perfilFiscalId: doc.perfilFiscalId, ambiente: 'habilitacion', numero: doc.numero, xml: doc.xml, testSetId,
    });
    return { xmlFirmado: r.xmlFirmado, zipKey: r.respuesta?.ZipKey, respuesta: mapearRespuestaDian(r.respuesta) };
  }

  async consultarResultadoSet(perfilFiscalId: string, zipKey: string): Promise<DianResponse> {
    const r = await invocarDianEmision<{ respuesta: unknown }>({ accion: 'estado-zip', perfilFiscalId, ambiente: 'habilitacion', trackId: zipKey });
    return mapearRespuestaDian(r.respuesta);
  }
}

const local = new TransporteLocal();
const nube = new TransporteNube();

/**
 * Elige el camino para un perfil fiscal: local si este equipo es Electron y
 * tiene el certificado de ese perfil; en cualquier otro caso, la nube.
 */
export async function obtenerTransporteDian(perfilFiscalId: string): Promise<TransporteDian> {
  const api = apiElectron();
  if (api?.firmarDocumento && api?.enviarFacturaSync) {
    try {
      if ((await api.existeCertificado?.(perfilFiscalId)) === true) return local;
    } catch { /* sin respuesta del proceso principal: se usa la nube */ }
  }
  return nube;
}

// ── Certificado custodiado en la nube ─────────────────────────────────────

export interface CertificadoNube {
  existe: boolean;
  nombreArchivo?: string;
  sujeto?: string;
  emisor?: string;
  venceEl?: string;
  subidoEl?: string;
}

export const consultarCertificadoNube = (perfilFiscalId: string) =>
  invocarDianEmision<CertificadoNube>({ accion: 'estado-certificado', perfilFiscalId });

export async function subirCertificadoNube(perfilFiscalId: string, archivo: File, pin: string): Promise<CertificadoNube> {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return invocarDianEmision<CertificadoNube>({
    accion: 'guardar-certificado', perfilFiscalId, p12Base64: btoa(bin), pin, nombreArchivo: archivo.name,
  });
}

export const eliminarCertificadoNube = (perfilFiscalId: string) =>
  invocarDianEmision<CertificadoNube>({ accion: 'eliminar-certificado', perfilFiscalId });
