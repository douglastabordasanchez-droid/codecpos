/**
 * Cliente SOAP real hacia el servicio web de la DIAN
 * (WcfDianCustomerServices) — implementación real, no simulada.
 *
 * Contrato, operaciones y endpoints confirmados descargando el WSDL
 * directamente de vpfe-hab.dian.gov.co / vpfe.dian.gov.co (vendorizado en
 * docs/electronic-invoicing/dian-sources/ y en electron/dian-wsdl/, que es
 * la copia que se empaqueta con la app).
 *
 * La política de seguridad WSHttpBinding del WSDL exige WS-Security con
 * token X.509 por THUMBPRINT (`sp:RequireThumbprintReference`,
 * `sp:WssX509V3Token10`, `sp:AlgorithmSuite Basic256Sha256Rsa15` →
 * RSA-SHA256 + SHA-256), confirmado también en la guía oficial DIAN de
 * consumo de web services (sección "Configurar WS-Security Signature").
 * No basta HTTPS plano: el sobre SOAP debe firmarse.
 *
 * Se usa el paquete `soap` (WSDL real ya cargado y probado) con su clase
 * `WSSecurityCert`, con el `getKeyInfoContent` reemplazado para usar
 * referencia por THUMBPRINT (SHA-1 del certificado en DER), que es lo que
 * `WSSecurityCert` no ofrece por defecto (su modo por defecto es referencia
 * directa a un BinarySecurityToken embebido).
 *
 * ⚠️ AUTOVERIFICADO CONTRA UN SERVIDOR SOAP LOCAL DE PRUEBA (mismo WSDL),
 * NO CONTRA LA DIAN REAL: se probó que el cliente arma un sobre SOAP válido
 * según el WSDL real, con la firma WS-Security completa y
 * criptográficamente verificable. NO se ha probado la aceptación real por
 * el ambiente de habilitación de la DIAN — eso requiere las credenciales
 * reales del negocio. Ver docs/electronic-invoicing/DIAN-BLOCKERS.md.
 *
 * Corre en el proceso principal de Electron: la llave privada nunca se
 * serializa hacia el renderer.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import forge from 'node-forge';
import crypto from 'crypto';
import * as soap from 'soap';
import { WSSecurityCert } from 'soap/lib/security/WSSecurityCert.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WSDL_PATH = path.join(__dirname, 'dian-wsdl', 'WcfDianCustomerServices.wsdl');

export const DIAN_SOAP_ENDPOINTS = {
  habilitacion: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
  produccion: 'https://vpfe.dian.gov.co/WcfDianCustomerServices.svc',
};

function extraerCredencialesP12(p12Buffer, pin) {
  const p12Der = forge.util.createBuffer(p12Buffer.toString('binary'));
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, pin);

  let keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag) {
    keyBag = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
  }
  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
  if (!keyBag?.key || !certBag?.cert) {
    throw new Error('El certificado .p12 no contiene una llave privada y un certificado válidos (o el PIN es incorrecto).');
  }

  const certForge = certBag.cert;
  const certDerBytes = forge.asn1.toDer(forge.pki.certificateToAsn1(certForge)).getBytes();
  return {
    privateKeyPem: forge.pki.privateKeyToPem(keyBag.key),
    certPem: forge.pki.certificateToPem(certForge),
    certDerBytes,
  };
}

function thumbprintSha1Base64(certDerBytes) {
  const md = forge.md.sha1.create();
  md.update(certDerBytes);
  return forge.util.encode64(md.digest().getBytes());
}

/**
 * Crea un cliente SOAP configurado con WS-Security (firma X.509 por
 * thumbprint, RSA-SHA256/SHA-256) contra el endpoint indicado.
 */
async function crearClienteFirmado(p12Buffer, pin, endpointUrl) {
  const { privateKeyPem, certPem, certDerBytes } = extraerCredencialesP12(p12Buffer, pin);
  const client = await soap.createClientAsync(WSDL_PATH, { endpoint: endpointUrl });
  client.setEndpoint(endpointUrl);

  const wsSecurity = new WSSecurityCert(privateKeyPem, certPem, undefined, {
    hasTimeStamp: true,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
  });

  // La política DIAN exige referencia por THUMBPRINT (sp:RequireThumbprintReference),
  // no la referencia directa a un BinarySecurityToken embebido que usa
  // WSSecurityCert por defecto — se reemplaza el KeyInfo generado.
  const thumbprint = thumbprintSha1Base64(certDerBytes);
  wsSecurity.signer.getKeyInfoContent = () =>
    `<wsse:SecurityTokenReference>` +
    `<wsse:KeyIdentifier EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary" ` +
    `ValueType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#ThumbprintSHA1">${thumbprint}</wsse:KeyIdentifier>` +
    `</wsse:SecurityTokenReference>`;

  client.setSecurity(wsSecurity);
  return client;
}

/**
 * Envía un documento (factura firmada) de forma síncrona — usado también
 * para contingencia (Suplemento C del Anexo Técnico: "El envío de los
 * instrumentos electrónicos debe realizarse a través del método SendBillSync").
 *
 * @returns {Promise<{IsValid: boolean, StatusCode?: string, StatusDescription?: string, StatusMessage?: string, ErrorMessage?: string[], XmlDocumentKey?: string}>}
 */
export async function enviarFacturaSync({ p12Buffer, pin, ambiente, fileName, xmlFirmadoBase64 }) {
  const endpoint = DIAN_SOAP_ENDPOINTS[ambiente] || DIAN_SOAP_ENDPOINTS.habilitacion;
  const client = await crearClienteFirmado(p12Buffer, pin, endpoint);
  const [result] = await client.SendBillSyncAsync({ fileName, contentFile: xmlFirmadoBase64 });
  return result?.SendBillSyncResult || result;
}

/** Set de pruebas de habilitación — requiere el testSetId asignado por la DIAN al negocio. */
export async function enviarSetPruebas({ p12Buffer, pin, fileName, xmlFirmadoBase64, testSetId }) {
  const client = await crearClienteFirmado(p12Buffer, pin, DIAN_SOAP_ENDPOINTS.habilitacion);
  const [result] = await client.SendTestSetAsyncAsync({ fileName, contentFile: xmlFirmadoBase64, testSetId });
  return result?.SendTestSetAsyncResult || result;
}

export async function consultarEstado({ p12Buffer, pin, ambiente, trackId }) {
  const endpoint = DIAN_SOAP_ENDPOINTS[ambiente] || DIAN_SOAP_ENDPOINTS.habilitacion;
  const client = await crearClienteFirmado(p12Buffer, pin, endpoint);
  const [result] = await client.GetStatusAsync({ trackId });
  return result?.GetStatusResult || result;
}

/** Devuelve la Clave Técnica real de cada rango de numeración autorizado. */
export async function consultarRangoNumeracion({ p12Buffer, pin, ambiente, accountCode, accountCodeT, softwareCode }) {
  const endpoint = DIAN_SOAP_ENDPOINTS[ambiente] || DIAN_SOAP_ENDPOINTS.habilitacion;
  const client = await crearClienteFirmado(p12Buffer, pin, endpoint);
  const [result] = await client.GetNumberingRangeAsync({ accountCode, accountCodeT, softwareCode });
  return result?.GetNumberingRangeResult || result;
}

export const _internal = { crearClienteFirmado, extraerCredencialesP12, thumbprintSha1Base64, WSDL_PATH };
