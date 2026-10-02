/**
 * Cliente del servicio web de la DIAN (WcfDianCustomerServices) para la
 * Edge Function: arma el sobre SOAP 1.2 con WS-Addressing y lo firma con
 * WS-Security (X.509, RSA-SHA256), que es lo que exige el WSDL oficial.
 *
 * El sobre se escribe ya en forma canónica (exclusive C14N) y se firma el
 * elemento wsa:To — el mismo esquema que usan las integraciones en
 * producción con la DIAN. La firma se comprueba de forma independiente con
 * xml-crypto en soap.test.ts.
 *
 * `fetch` y Web Crypto solamente: corre igual en Deno y en Node.
 */
import forge from 'node-forge';
import { zipSync, strToU8 } from 'fflate';
import type { Credenciales } from './xades.ts';

export const ENDPOINTS = {
  habilitacion: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
  produccion: 'https://vpfe.dian.gov.co/WcfDianCustomerServices.svc',
} as const;
export type Ambiente = keyof typeof ENDPOINTS;

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

const sha256Base64 = (texto: string) => forge.util.encode64(forge.md.sha256.create().update(forge.util.encodeUtf8(texto)).digest().getBytes());
const escapar = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const idAleatorio = () => crypto.randomUUID().replace(/-/g, '').toUpperCase();

/**
 * Sobre SOAP firmado para una operación. `cuerpo` es el contenido de
 * <wcf:Operacion> ya serializado (elementos wcf:*).
 */
export function construirSobre(operacion: string, cuerpo: string, endpoint: string, credenciales: Credenciales, ahora = new Date()): string {
  const idTo = `id-${idAleatorio()}`;
  const idCert = `X509-${idAleatorio()}`;
  const creado = ahora.toISOString();
  const vence = new Date(ahora.getTime() + 60 * 60_000).toISOString();

  // Forma canónica exclusiva de wsa:To, con los prefijos «soap wcf» incluidos
  // (namespaces en orden alfabético de prefijo, luego los atributos).
  const toCanonico =
    `<wsa:To xmlns:soap="${NS.soap}" xmlns:wcf="${NS.wcf}" xmlns:wsa="${NS.wsa}" xmlns:wsu="${NS.wsu}" wsu:Id="${idTo}">${escapar(endpoint)}</wsa:To>`;

  const signedInfo = (conNamespaces: boolean) =>
    `<ds:SignedInfo${conNamespaces ? ` xmlns:ds="${NS.ds}" xmlns:soap="${NS.soap}" xmlns:wcf="${NS.wcf}" xmlns:wsa="${NS.wsa}"` : ''}>` +
    `<ds:CanonicalizationMethod Algorithm="${EXC_C14N}"><ec:InclusiveNamespaces xmlns:ec="${NS.ec}" PrefixList="wsa soap wcf"></ec:InclusiveNamespaces></ds:CanonicalizationMethod>` +
    `<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></ds:SignatureMethod>` +
    `<ds:Reference URI="#${idTo}">` +
    `<ds:Transforms><ds:Transform Algorithm="${EXC_C14N}"><ec:InclusiveNamespaces xmlns:ec="${NS.ec}" PrefixList="soap wcf"></ec:InclusiveNamespaces></ds:Transform></ds:Transforms>` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>` +
    `<ds:DigestValue>${sha256Base64(toCanonico)}</ds:DigestValue>` +
    `</ds:Reference></ds:SignedInfo>`;

  const md = forge.md.sha256.create().update(forge.util.encodeUtf8(signedInfo(true)));
  const firma = forge.util.encode64(credenciales.llavePrivada.sign(md));

  return `<soap:Envelope xmlns:soap="${NS.soap}" xmlns:wcf="${NS.wcf}">` +
    `<soap:Header xmlns:wsa="${NS.wsa}">` +
    `<wsse:Security xmlns:wsse="${NS.wsse}" xmlns:wsu="${NS.wsu}">` +
    `<wsu:Timestamp wsu:Id="TS-${idAleatorio()}"><wsu:Created>${creado}</wsu:Created><wsu:Expires>${vence}</wsu:Expires></wsu:Timestamp>` +
    `<wsse:BinarySecurityToken EncodingType="${BASE64}" ValueType="${X509V3}" wsu:Id="${idCert}">${forge.util.encode64(credenciales.certDer)}</wsse:BinarySecurityToken>` +
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

/** ZIP (base64) con el XML firmado adentro: es lo que la DIAN recibe en contentFile. */
export function empaquetarZip(numero: string, xmlFirmado: string): { fileName: string; contentFile: string } {
  const base = numero.replace(/[^A-Za-z0-9_-]/g, '');
  const zip = zipSync({ [`${base}.xml`]: strToU8(xmlFirmado) });
  return { fileName: `${base}.zip`, contentFile: forge.util.encode64(forge.util.binary.raw.encode(zip)) };
}

// ── Respuesta ─────────────────────────────────────────────────────────────

const etiqueta = (xml: string, nombre: string): string | undefined =>
  xml.match(new RegExp(`<(?:[\\w]+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w]+:)?${nombre}>`))?.[1];

const desescapar = (v: string | undefined) =>
  v?.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();

/** Forma de DianResponse del WSDL, igual a la que entrega el cliente de Electron. */
export interface RespuestaDian {
  IsValid: boolean;
  StatusCode?: string;
  StatusDescription?: string;
  StatusMessage?: string;
  XmlDocumentKey?: string;
  XmlFileName?: string;
  ErrorMessage?: { string: string[] };
  /** Solo SendTestSetAsync: identificador para consultar el resultado del set. */
  ZipKey?: string;
}

export function interpretarRespuesta(xml: string): RespuestaDian {
  const falla = etiqueta(xml, 'Fault');
  if (falla) {
    throw new Error(`La DIAN rechazó la petición: ${desescapar(etiqueta(falla, 'Text')) || desescapar(etiqueta(falla, 'faultstring')) || 'error SOAP sin detalle'}`);
  }
  const errores = etiqueta(xml, 'ErrorMessage') || '';
  const mensajes = [...errores.matchAll(/<(?:\w+:)?string(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?string>/g)].map((m) => desescapar(m[1])!).filter(Boolean);
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

async function llamar(operacion: string, cuerpo: string, ambiente: Ambiente, credenciales: Credenciales): Promise<RespuestaDian> {
  const endpoint = ENDPOINTS[ambiente] ?? ENDPOINTS.habilitacion;
  const respuesta = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': `application/soap+xml;charset=UTF-8;action="http://wcf.dian.colombia/IWcfDianCustomerServices/${operacion}"`,
      Accept: 'application/soap+xml, application/xml, text/xml',
    },
    body: construirSobre(operacion, cuerpo, endpoint, credenciales),
    signal: AbortSignal.timeout(45_000),
  });
  const texto = await respuesta.text();
  if (!texto.includes('Envelope')) {
    throw new Error(`La DIAN respondió ${respuesta.status} sin un mensaje SOAP (${texto.slice(0, 160) || 'respuesta vacía'}).`);
  }
  return interpretarRespuesta(texto);
}

export function enviarDocumento(numero: string, xmlFirmado: string, ambiente: Ambiente, credenciales: Credenciales): Promise<RespuestaDian> {
  const { fileName, contentFile } = empaquetarZip(numero, xmlFirmado);
  return llamar('SendBillSync', `<wcf:fileName>${fileName}</wcf:fileName><wcf:contentFile>${contentFile}</wcf:contentFile>`, ambiente, credenciales);
}

/** Set de pruebas de habilitación: siempre contra el ambiente de habilitación. */
export function enviarSetDePruebas(numero: string, xmlFirmado: string, testSetId: string, credenciales: Credenciales): Promise<RespuestaDian> {
  const { fileName, contentFile } = empaquetarZip(numero, xmlFirmado);
  return llamar('SendTestSetAsync', `<wcf:fileName>${fileName}</wcf:fileName><wcf:contentFile>${contentFile}</wcf:contentFile><wcf:testSetId>${escapar(testSetId)}</wcf:testSetId>`, 'habilitacion', credenciales);
}

/** Resultado de un envío asíncrono (set de pruebas): se consulta con el ZipKey que devolvió. */
export function consultarEstadoZip(zipKey: string, ambiente: Ambiente, credenciales: Credenciales): Promise<RespuestaDian> {
  return llamar('GetStatusZip', `<wcf:trackId>${escapar(zipKey)}</wcf:trackId>`, ambiente, credenciales);
}

export function consultarEstado(trackId: string, ambiente: Ambiente, credenciales: Credenciales): Promise<RespuestaDian> {
  return llamar('GetStatus', `<wcf:trackId>${escapar(trackId)}</wcf:trackId>`, ambiente, credenciales);
}
