/**
 * Firma digital XAdES-EPES del XML de factura/nota/documento equivalente
 * DIAN — implementación real, ver dianXadesSigner.js para la lógica
 * criptográfica completa y las fuentes oficiales verificadas.
 *
 * El certificado y el PIN se leen cifrados desde dianSecrets.js
 * (safeStorage) y se descifran SOLO en memoria, durante esta operación —
 * nunca se escriben a disco en claro ni se envían al renderer.
 */

import * as dianSecrets from './dianSecrets.js';
import { firmarXadesXml } from './dianXadesSigner.js';

/**
 * @param {string} perfilFiscalId
 * @param {Buffer} xmlSinFirmar
 * @returns {Promise<Buffer>}
 */
export async function firmarXml(perfilFiscalId, xmlSinFirmar) {
  if (!dianSecrets.existeCertificado(perfilFiscalId)) {
    throw new Error('No hay certificado digital configurado para este perfil fiscal.');
  }
  if (!dianSecrets.existePin(perfilFiscalId)) {
    throw new Error('No hay PIN del certificado configurado para este perfil fiscal.');
  }
  // La llave y el PIN se descifran aquí, en memoria, únicamente para esta operación.
  const certificadoBuffer = dianSecrets.leerCertificadoParaFirma(perfilFiscalId);
  const pin = dianSecrets.leerPinParaFirma(perfilFiscalId);

  return firmarXadesXml(xmlSinFirmar, certificadoBuffer, pin);
}
