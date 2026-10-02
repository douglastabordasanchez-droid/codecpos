/**
 * Cliente del servicio web de la DIAN (WcfDianCustomerServices) para el
 * proceso principal de Electron.
 *
 * Es el mismo sobre que usa la Edge Function `dian-emision`
 * (supabase/functions/dian-emision/soap.ts — si se corrige uno, corregir el
 * otro): SOAP 1.2 con WS-Addressing (Action + To) y WS-Security con el
 * certificado X.509 del negocio, firmando el elemento wsa:To con RSA-SHA256
 * sobre su forma canónica exclusiva. El WSDL oficial (wsHttpBinding) exige
 * las dos cosas; la versión anterior, basada en la librería `soap`, no
 * enviaba los encabezados de WS-Addressing y mandaba el XML sin comprimir.
 *
 * La firma del sobre se valida de forma independiente con xml-crypto en
 * dianSoapClient.test.js.
 *
 * ⚠️ NO PROBADO CONTRA LA DIAN REAL: eso requiere el certificado y la
 * habilitación del negocio. Ver docs/electronic-invoicing/DIAN-BLOCKERS.md.
 *
 * Corre en el proceso principal: la llave privada nunca llega al renderer.
 */

import forge from 'node-forge';
import crypto from 'crypto';
import { zipSync } from 'fflate';

export const DIAN_SOAP_ENDPOINTS = {
  habilitacion: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
  produccion: 'https://vpfe.dian.gov.co/WcfDianCustomerServices.svc',
};

const NS = {
  soap: 'http://www.w3.org/2003/05/soap-envelope',
  wcf: 'http://wcf.dian.colombia',
  wsa: 'http://www.w3.org/2005/08/addressing',
  wsse: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd',
  wsu: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd',
  ds: 'http://www.w3.org/2000/09/xmldsig#',
  ec: 'http://www.w3.org/2001/10/xml-exc-c14n#',
};
const EXC_C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const X509V3 = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3';
const BASE64 = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary';

function extraerCredencialesP12(p12Buffer, pin) {
  const p12Der = forge.util.createBuffer(p12Buffer.toString('binary'));
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, pin);

  let keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag) {
    keyBag = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
  }
  // Un .p12 trae la cadena completa (CA incluida): el certificado del
  // firmante es el que corresponde a la llave privada, no el primero.
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  const certBag = certBags.find((b) => keyBag?.key && b.cert?.publicKey?.n?.equals(keyBag.key.n)) || certBags[0];
  if (!keyBag?.key || !certBag?.cert) {
    throw new Error('El certificado .p12 no contiene una llave privada y un certificado válidos (o el PIN es incorrecto).');
  }

  return {
    privateKeyPem: forge.pki.privateKeyToPem(keyBag.key),
    certPem: forge.pki.certificateToPem(certBag.cert),
    certDerBase64: forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(certBag.cert)).getBytes()),
  };
}

const sha256Base64 = (texto) => crypto.createHash('sha256').update(texto, 'utf8').digest('base64');
const escapar = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const idAleatorio = () => crypto.randomUUID().replace(/-/g, '').toUpperCase();

/**
 * Sobre SOAP firmado para una operación. `cuerpo` es el contenido de
 * <wcf:Operacion> ya serializado.
 */
export function construirSobre(operacion, cuerpo, endpoint, credenciales, ahora = new Date()) {
  const idTo = `id-${idAleatorio()}`;
  const idCert = `X509-${idAleatorio()}`;

  // Forma canónica exclusiva de wsa:To, con los prefijos «soap wcf» incluidos
  // (namespaces en orden alfabético de prefijo, luego los atributos).
  const toCanonico =
    `<wsa:To xmlns:soap="${NS.soap}" xmlns:wcf="${NS.wcf}" xmlns:wsa="${NS.wsa}" xmlns:wsu="${NS.wsu}" wsu:Id="${idTo}">${escapar(endpoint)}</wsa:To>`;

  const signedInfo = (conNamespaces) =>
    `<ds:SignedInfo${conNamespaces ? ` xmlns:ds="${NS.ds}" xmlns:soap="${NS.soap}" xmlns:wcf="${NS.wcf}" xmlns:wsa="${NS.wsa}"` : ''}>` +
    `<ds:CanonicalizationMethod Algorithm="${EXC_C14N}"><ec:InclusiveNamespaces xmlns:ec="${NS.ec}" PrefixList="wsa soap wcf"></ec:InclusiveNamespaces></ds:CanonicalizationMethod>` +
    `<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></ds:SignatureMethod>` +
    `<ds:Reference URI="#${idTo}">` +
    `<ds:Transforms><ds:Transform Algorithm="${EXC_C14N}"><ec:InclusiveNamespaces xmlns:ec="${NS.ec}" PrefixList="soap wcf"></ec:InclusiveNamespaces></ds:Transform></ds:Transforms>` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>` +
    `<ds:DigestValue>${sha256Base64(toCanonico)}</ds:DigestValue>` +
    `</ds:Reference></ds:SignedInfo>`;

  const firma = crypto.sign('RSA-SHA256', Buffer.from(signedInfo(true), 'utf8'), credenciales.privateKeyPem).toString('base64');

  return `<soap:Envelope xmlns:soap="${NS.soap}" xmlns:wcf="${NS.wcf}">` +
    `<soap:Header xmlns:wsa="${NS.wsa}">` +
    `<wsse:Security xmlns:wsse="${NS.wsse}" xmlns:wsu="${NS.wsu}">` +
    `<wsu:Timestamp wsu:Id="TS-${idAleatorio()}"><wsu:Created>${ahora.toISOString()}</wsu:Created><wsu:Expires>${new Date(ahora.getTime() + 60 * 60000).toISOString()}</wsu:Expires></wsu:Timestamp>` +
    `<wsse:BinarySecurityToken EncodingType="${BASE64}" ValueType="${X509V3}" wsu:Id="${idCert}">${credenciales.certDerBase64}</wsse:BinarySecurityToken>` +
    `<ds:Signature Id="SIG-${idAleatorio()}" xmlns:ds="${NS.ds}">` +
    signedInfo(false) +
    `<ds:SignatureValue>${firma}</ds:SignatureValue>` +
    `<ds:KeyInfo Id="KI-${idAleatorio()}"><wsse:SecurityTokenReference wsu:Id="STR-${idAleatorio()}"><wsse:Reference URI="#${idCert}" ValueType="${X509V3}"></wsse:Reference></wsse:SecurityTokenReference></ds:KeyInfo>` +
    `</ds:Signature>` +
    `</wsse:Security>` +
    `<wsa:Action>http://wcf.dian.colombia/IWcfDianCustomerServices/${operacion}</wsa:Action>` +
    `<wsa:To wsu:Id="${idTo}" xmlns:wsu="${NS.wsu}">${escapar(endpoint)}</wsa:To>` +
    `</soap:Header>` +
    `<soap:Body><wcf:${operacion}>${cuerpo}</wcf:${operacion}></soap:Body>` +
    `</soap:Envelope>`;
}

/**
 * La DIAN no recibe el XML suelto: `contentFile` es un ZIP (en base64) con
 * el XML firmado adentro, y `fileName` es el nombre de ese ZIP (Anexo
 * Técnico v1.9 §7.8).
 */
export function empaquetarZip(fileName, xmlFirmadoBase64) {
  const base = String(fileName).replace(/\.(xml|zip)$/i, '').replace(/[^A-Za-z0-9_-]/g, '');
  const zip = zipSync({ [`${base}.xml`]: new Uint8Array(Buffer.from(xmlFirmadoBase64, 'base64')) });
  return { fileName: `${base}.zip`, contentFile: Buffer.from(zip).toString('base64') };
}

// ── Respuesta ─────────────────────────────────────────────────────────────

const etiqueta = (xml, nombre) =>
  xml.match(new RegExp(`<(?:[\\w]+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w]+:)?${nombre}>`))?.[1];

const desescapar = (v) =>
  v?.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();

/** Forma de DianResponse del WSDL: { IsValid, StatusCode, StatusDescription, StatusMessage, XmlDocumentKey, ErrorMessage: { string: [] } }. */
export function interpretarRespuesta(xml) {
  const falla = etiqueta(xml, 'Fault');
  if (falla) {
    throw new Error(`La DIAN rechazó la petición: ${desescapar(etiqueta(falla, 'Text')) || desescapar(etiqueta(falla, 'faultstring')) || 'error SOAP sin detalle'}`);
  }
  const errores = etiqueta(xml, 'ErrorMessage') || '';
  const mensajes = [...errores.matchAll(/<(?:\w+:)?string(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?string>/g)].map((m) => desescapar(m[1])).filter(Boolean);
  return {
    IsValid: etiqueta(xml, 'IsValid')?.trim() === 'true',
    StatusCode: desescapar(etiqueta(xml, 'StatusCode')),
    StatusDescription: desescapar(etiqueta(xml, 'StatusDescription')),
    StatusMessage: desescapar(etiqueta(xml, 'StatusMessage')),
    XmlDocumentKey: desescapar(etiqueta(xml, 'XmlDocumentKey')),
    XmlFileName: desescapar(etiqueta(xml, 'XmlFileName')),
    ErrorMessage: mensajes.length ? { string: mensajes } : undefined,
    ZipKey: desescapar(etiqueta(xml, 'ZipKey')),
  };
}

async function llamar(operacion, cuerpo, { p12Buffer, pin, ambiente, endpointUrl }) {
  const endpoint = endpointUrl || DIAN_SOAP_ENDPOINTS[ambiente] || DIAN_SOAP_ENDPOINTS.habilitacion;
  const respuesta = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': `application/soap+xml;charset=UTF-8;action="http://wcf.dian.colombia/IWcfDianCustomerServices/${operacion}"`,
      Accept: 'application/soap+xml, application/xml, text/xml',
    },
    body: construirSobre(operacion, cuerpo, endpoint, extraerCredencialesP12(p12Buffer, pin)),
    signal: AbortSignal.timeout(45000),
  });
  const texto = await respuesta.text();
  if (!texto.includes('Envelope')) {
    throw new Error(`La DIAN respondió ${respuesta.status} sin un mensaje SOAP (${texto.slice(0, 160) || 'respuesta vacía'}).`);
  }
  return texto;
}

/**
 * Envía un documento firmado de forma síncrona (también para contingencia:
 * Suplemento C del Anexo Técnico).
 */
export async function enviarFacturaSync({ p12Buffer, pin, ambiente, fileName, xmlFirmadoBase64, endpointUrl }) {
  const zip = empaquetarZip(fileName, xmlFirmadoBase64);
  return interpretarRespuesta(await llamar('SendBillSync',
    `<wcf:fileName>${zip.fileName}</wcf:fileName><wcf:contentFile>${zip.contentFile}</wcf:contentFile>`, { p12Buffer, pin, ambiente, endpointUrl }));
}

/** Set de pruebas de habilitación — requiere el testSetId asignado por la DIAN al negocio. */
export async function enviarSetPruebas({ p12Buffer, pin, fileName, xmlFirmadoBase64, testSetId, endpointUrl }) {
  const zip = empaquetarZip(fileName, xmlFirmadoBase64);
  return interpretarRespuesta(await llamar('SendTestSetAsync',
    `<wcf:fileName>${zip.fileName}</wcf:fileName><wcf:contentFile>${zip.contentFile}</wcf:contentFile><wcf:testSetId>${escapar(testSetId)}</wcf:testSetId>`,
    { p12Buffer, pin, ambiente: 'habilitacion', endpointUrl }));
}

export async function consultarEstado({ p12Buffer, pin, ambiente, trackId, endpointUrl }) {
  return interpretarRespuesta(await llamar('GetStatus', `<wcf:trackId>${escapar(trackId)}</wcf:trackId>`, { p12Buffer, pin, ambiente, endpointUrl }));
}

/** Resultado de un envío asíncrono (set de pruebas): se consulta con el ZipKey que devolvió. */
export async function consultarEstadoZip({ p12Buffer, pin, ambiente, trackId, endpointUrl }) {
  return interpretarRespuesta(await llamar('GetStatusZip', `<wcf:trackId>${escapar(trackId)}</wcf:trackId>`, { p12Buffer, pin, ambiente, endpointUrl }));
}

/** Rangos de numeración autorizados, cada uno con su Clave Técnica real. */
export async function consultarRangoNumeracion({ p12Buffer, pin, ambiente, accountCode, accountCodeT, softwareCode, endpointUrl }) {
  const xml = await llamar('GetNumberingRange',
    `<wcf:accountCode>${escapar(accountCode)}</wcf:accountCode><wcf:accountCodeT>${escapar(accountCodeT)}</wcf:accountCodeT><wcf:softwareCode>${escapar(softwareCode)}</wcf:softwareCode>`,
    { p12Buffer, pin, ambiente, endpointUrl });
  const falla = etiqueta(xml, 'Fault');
  if (falla) throw new Error(`La DIAN rechazó la petición: ${desescapar(etiqueta(falla, 'Text')) || 'error SOAP sin detalle'}`);
  const rangos = [...xml.matchAll(/<(?:\w+:)?NumberRangeResponse(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?NumberRangeResponse>/g)].map(([, r]) => ({
    ResolutionNumber: desescapar(etiqueta(r, 'ResolutionNumber')),
    ResolutionDate: desescapar(etiqueta(r, 'ResolutionDate')),
    Prefix: desescapar(etiqueta(r, 'Prefix')),
    FromNumber: desescapar(etiqueta(r, 'FromNumber')),
    ToNumber: desescapar(etiqueta(r, 'ToNumber')),
    ValidDateFrom: desescapar(etiqueta(r, 'ValidDateFrom')),
    ValidDateTo: desescapar(etiqueta(r, 'ValidDateTo')),
    TechnicalKey: desescapar(etiqueta(r, 'TechnicalKey')),
  }));
  return {
    OperationCode: desescapar(etiqueta(xml, 'OperationCode')),
    OperationDescription: desescapar(etiqueta(xml, 'OperationDescription')),
    ResponseList: { NumberRangeResponse: rangos },
  };
}

export const _internal = { extraerCredencialesP12 };
