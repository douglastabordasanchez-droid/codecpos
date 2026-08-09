/**
 * Código de Seguridad del Software y URL de consulta QR — Anexo Técnico de
 * Factura Electrónica de Venta v1.9 §11.7 (QR) y §11.8 (SoftwareSecurityCode).
 *
 *   SoftwareSecurityCode := SHA-384(IdSoftware + Pin + NroDocumento)
 *
 * Donde IdSoftware es el identificador del software asignado por la DIAN al
 * activarse (identificadorSoftware del perfil fiscal), Pin es el
 * Software-PIN que el facturador asignó en ese mismo momento (NO la Clave
 * Técnica), y NroDocumento es el número del documento que se está firmando
 * (cbc:ID de la factura, nota o documento equivalente) — confirmado y
 * verificado contra un documento real firmado y estructuralmente idéntico
 * al descrito en el anexo (ver docs/electronic-invoicing/dian-sources/).
 */
import { sha384Hex } from './dianHashChain';
import type { AmbienteDian } from './types';

export async function calcularSoftwareSecurityCode(
  identificadorSoftware: string,
  softwarePin: string,
  numeroDocumento: string
): Promise<string> {
  return sha384Hex(identificadorSoftware + softwarePin + numeroDocumento);
}

/** URL de consulta pública del documento — confirmado en §11.7.1 del anexo.
 * documentkey es el CUFE (factura) o CUDE (nota/documento equivalente). */
export function construirUrlQR(cufeOCude: string, ambiente: AmbienteDian): string {
  const host = ambiente === 'produccion' ? 'catalogo-vpfe.dian.gov.co' : 'catalogo-vpfe-hab.dian.gov.co';
  return `https://${host}/document/searchqr?documentkey=${cufeOCude}`;
}
