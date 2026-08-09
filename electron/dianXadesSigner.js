/**
 * Firma digital XAdES-EPES de documentos electrónicos DIAN (factura, nota,
 * documento equivalente) — implementación real, no simulada.
 *
 * Estructura y valores confirmados contra fuentes oficiales descargadas de
 * dian.gov.co (vendorizadas en docs/electronic-invoicing/dian-sources/):
 *   - Anexo Técnico de Factura Electrónica de Venta v1.9, capítulo 10
 *     ("Política de Firma"): formato XMLDSig enveloped + XAdES-EPES,
 *     canonicalización C14N (NO exclusive), SignatureMethod rsa-sha256,
 *     DigestMethod sha256, 3 ds:Reference (documento completo, KeyInfo,
 *     SignedProperties).
 *   - politicadefirmav2.pdf (documento de política de firma oficial,
 *     vendorizado): su hash SHA-256 en base64 se verificó EXACTO contra un
 *     documento real, firmado y públicamente verificable (Colombia Compra
 *     Eficiente) — no se recalcula en tiempo de ejecución, se usa el valor
 *     ya confirmado para no depender de que el archivo vendorizado no
 *     cambie de bytes por accidente.
 *
 * ⚠️ AUTOVERIFICADO, NO VERIFICADO CONTRA LA DIAN REAL: este módulo firma y
 * luego verifica criptográficamente su propia firma (misma lógica de
 * canonicalización/digest en ambos sentidos) — eso confirma que la firma es
 * internamente consistente y que un validador XMLDSig genérico la aceptaría.
 * NO se ha probado contra el ambiente de habilitación real de la DIAN
 * (requiere un certificado real del negocio y ejecutar el set de pruebas
 * SendTestSetAsync) — eso solo lo puede hacer el negocio, con sus propias
 * credenciales. Ver docs/electronic-invoicing/DIAN-BLOCKERS.md.
 *
 * Corre EXCLUSIVAMENTE en el proceso principal de Electron: la llave
 * privada nunca se serializa hacia el renderer.
 */

import forge from 'node-forge';
import crypto from 'crypto';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { C14nCanonicalization } from 'xml-crypto';

const DS_NS = 'http://www.w3.org/2000/09/xmldsig#';
const XADES_NS = 'http://uri.etsi.org/01903/v1.3.2#';
const POLICY_URL = 'https://facturaelectronica.dian.gov.co/politicadefirma/v2/politicadefirmav2.pdf';
const POLICY_DESCRIPTION = 'Politica de firma para facturas electronicas de la Republica de Colombia.';
// Confirmado exacto contra un documento real firmado (ver comentario de cabecera).
const POLICY_HASH_SHA256_BASE64 = 'dMoMvtcG5aIzgYo0tIsSQeVJBDnUnfSOfBpxXrmor0Y=';

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
    certForge,
    certDerBytes, // binary string (forge "byte string"), NO utf-8
  };
}

function formatearIssuerDN(certForge) {
  return certForge.issuer.attributes
    .map((attr) => `${attr.shortName || attr.name}=${attr.value}`)
    .join(', ');
}

function sha256Base64DeBytes(byteString) {
  const md = forge.md.sha256.create();
  md.update(byteString);
  return forge.util.encode64(md.digest().getBytes());
}

function escapeXml(valor) {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function horaColombiaISO() {
  const ahora = new Date();
  const utcMs = ahora.getTime() + ahora.getTimezoneOffset() * 60000;
  const colombia = new Date(utcMs - 5 * 60 * 60000);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${colombia.getFullYear()}-${pad(colombia.getMonth() + 1)}-${pad(colombia.getDate())}` +
    `T${pad(colombia.getHours())}:${pad(colombia.getMinutes())}:${pad(colombia.getSeconds())}-05:00`
  );
}

function canonicalizar(node) {
  return new C14nCanonicalization().process(node, {});
}

/**
 * Firma un XML UBL (Invoice/CreditNote/DebitNote) ya construido, con el
 * bloque sts:DianExtensions incluido pero SIN firma todavía. Devuelve el
 * mismo XML con un segundo ext:UBLExtension conteniendo el ds:Signature
 * XAdES-EPES completo, según la estructura confirmada en el Anexo Técnico.
 *
 * @param {Buffer} xmlSinFirmar
 * @param {Buffer} p12Buffer
 * @param {string} pin
 * @returns {Buffer} XML firmado
 */
export function firmarXadesXml(xmlSinFirmar, p12Buffer, pin) {
  const { privateKeyPem, certForge, certDerBytes } = extraerCredencialesP12(p12Buffer, pin);

  const doc = new DOMParser().parseFromString(xmlSinFirmar.toString('utf8'), 'text/xml');
  const root = doc.documentElement;

  const uuid = crypto.randomUUID();
  const sigId = `xmldsig-${uuid}`;
  const ref0Id = `${sigId}-ref0`;
  const keyInfoId = `${sigId}-keyinfo`;
  const signedPropsId = `${sigId}-signedprops`;

  const certDerBase64 = forge.util.encode64(certDerBytes);
  const certDigestBase64 = sha256Base64DeBytes(certDerBytes);
  const issuerName = formatearIssuerDN(certForge);
  const serialNumber = BigInt(`0x${certForge.serialNumber}`).toString(10);
  const signingTime = horaColombiaISO();

  const ublExtensions = root.getElementsByTagName('ext:UBLExtensions')[0];
  if (!ublExtensions) {
    throw new Error('El XML a firmar no tiene ext:UBLExtensions — no se puede insertar la firma.');
  }

  // ── 1) Crear el ext:UBLExtension/ext:ExtensionContent VACÍO que más
  //      adelante contendrá la firma, e insertarlo YA en el documento antes
  //      de calcular el digest del documento completo (ref0). Un validador
  //      que siga el estándar solo remueve el nodo ds:Signature en sí (no
  //      su contenedor) al recomputar ref0 — así que ref0 debe calcularse
  //      con este contenedor vacío ya presente, para que coincida con lo
  //      que un validador ve al remover solo la firma del documento final.
  const extensionFirmaXml =
    `<ext:UBLExtension xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">` +
    `<ext:ExtensionContent></ext:ExtensionContent>` +
    `</ext:UBLExtension>`;
  const extensionFirmaNode = new DOMParser().parseFromString(extensionFirmaXml, 'text/xml').documentElement;
  ublExtensions.appendChild(extensionFirmaNode);
  const extensionContentNode = ublExtensions.lastChild.getElementsByTagName('ext:ExtensionContent')[0];

  // ── 2) Digest del documento completo (ref0), CON el contenedor vacío ya
  //      insertado pero SIN el ds:Signature todavía.
  const ref0DigestBase64 = sha256Base64DeBytes(forge.util.encodeUtf8(canonicalizar(root)));

  // ── 2) Construir KeyInfo y SignedProperties como nodos reales, insertarlos
  //      temporalmente en el documento (como descendientes de la raíz, para
  //      que hereden el mismo contexto de namespaces que tendrán en su
  //      posición final — todos los namespaces de este documento se
  //      declaran una sola vez en la raíz, así que la posición exacta
  //      dentro del árbol no cambia el resultado canónico) y calcular sus
  //      digests.
  const keyInfoXml =
    `<ds:KeyInfo xmlns:ds="${DS_NS}" Id="${keyInfoId}">` +
    `<ds:X509Data><ds:X509Certificate>${certDerBase64}</ds:X509Certificate></ds:X509Data>` +
    `</ds:KeyInfo>`;

  const signedPropertiesXml =
    `<xades:SignedProperties xmlns:xades="${XADES_NS}" xmlns:ds="${DS_NS}" Id="${signedPropsId}">` +
    `<xades:SignedSignatureProperties>` +
    `<xades:SigningTime>${signingTime}</xades:SigningTime>` +
    `<xades:SigningCertificate><xades:Cert>` +
    `<xades:CertDigest>` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>` +
    `<ds:DigestValue>${certDigestBase64}</ds:DigestValue>` +
    `</xades:CertDigest>` +
    `<xades:IssuerSerial>` +
    `<ds:X509IssuerName>${escapeXml(issuerName)}</ds:X509IssuerName>` +
    `<ds:X509SerialNumber>${serialNumber}</ds:X509SerialNumber>` +
    `</xades:IssuerSerial>` +
    `</xades:Cert></xades:SigningCertificate>` +
    `<xades:SignaturePolicyIdentifier><xades:SignaturePolicyId>` +
    `<xades:SigPolicyId>` +
    `<xades:Identifier>${POLICY_URL}</xades:Identifier>` +
    `<xades:Description>${POLICY_DESCRIPTION}</xades:Description>` +
    `</xades:SigPolicyId>` +
    `<xades:SigPolicyHash>` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>` +
    `<ds:DigestValue>${POLICY_HASH_SHA256_BASE64}</ds:DigestValue>` +
    `</xades:SigPolicyHash>` +
    `</xades:SignaturePolicyId></xades:SignaturePolicyIdentifier>` +
    `<xades:SignerRole><xades:ClaimedRoles><xades:ClaimedRole>supplier</xades:ClaimedRole></xades:ClaimedRoles></xades:SignerRole>` +
    `</xades:SignedSignatureProperties>` +
    `</xades:SignedProperties>`;

  // Contenedor temporal, hijo directo de la raíz (mismo contexto de
  // namespaces que la posición final dentro de ds:Signature).
  const scratch = doc.createElement('ScratchForDigestOnly');
  root.appendChild(scratch);
  scratch.appendChild(new DOMParser().parseFromString(keyInfoXml, 'text/xml').documentElement);
  scratch.appendChild(new DOMParser().parseFromString(signedPropertiesXml, 'text/xml').documentElement);

  const keyInfoNode = scratch.firstChild;
  const signedPropertiesNode = scratch.lastChild;

  const keyInfoDigestBase64 = sha256Base64DeBytes(forge.util.encodeUtf8(canonicalizar(keyInfoNode)));
  const signedPropertiesDigestBase64 = sha256Base64DeBytes(forge.util.encodeUtf8(canonicalizar(signedPropertiesNode)));

  root.removeChild(scratch);

  // ── 3) Construir SignedInfo con los 3 Reference, en el orden confirmado
  //      (documento, KeyInfo, SignedProperties), firmarlo con RSA-SHA256.
  const signedInfoXml =
    `<ds:SignedInfo xmlns:ds="${DS_NS}">` +
    `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
    `<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>` +
    `<ds:Reference Id="${ref0Id}" URI="">` +
    `<ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/></ds:Transforms>` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>` +
    `<ds:DigestValue>${ref0DigestBase64}</ds:DigestValue>` +
    `</ds:Reference>` +
    `<ds:Reference URI="#${keyInfoId}">` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>` +
    `<ds:DigestValue>${keyInfoDigestBase64}</ds:DigestValue>` +
    `</ds:Reference>` +
    `<ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${signedPropsId}">` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>` +
    `<ds:DigestValue>${signedPropertiesDigestBase64}</ds:DigestValue>` +
    `</ds:Reference>` +
    `</ds:SignedInfo>`;

  const signedInfoNode = new DOMParser().parseFromString(signedInfoXml, 'text/xml').documentElement;
  root.appendChild(signedInfoNode); // mismo contexto de namespaces para canonicalizar
  const signedInfoCanonical = canonicalizar(signedInfoNode);
  root.removeChild(signedInfoNode);

  const signatureValueBase64 = crypto
    .sign('RSA-SHA256', Buffer.from(signedInfoCanonical, 'utf8'), privateKeyPem)
    .toString('base64');

  // ── 4) Ensamblar el ds:Signature completo (idéntico en estructura al
  //      ejemplo real verificado) y colocarlo dentro del contenedor vacío
  //      que ya insertamos en el paso 1 — el mismo que se usó para calcular
  //      ref0, así que remover solo ds:Signature de aquí reproduce
  //      exactamente el documento sobre el que se calculó ref0.
  const signatureXml =
    `<ds:Signature xmlns:ds="${DS_NS}" Id="${sigId}">` +
    signedInfoXml +
    `<ds:SignatureValue Id="${sigId}-sigvalue">${signatureValueBase64}</ds:SignatureValue>` +
    keyInfoXml +
    `<ds:Object>` +
    `<xades:QualifyingProperties xmlns:xades="${XADES_NS}" Target="#${sigId}">` +
    signedPropertiesXml +
    `</xades:QualifyingProperties>` +
    `</ds:Object>` +
    `</ds:Signature>`;

  const signatureNode = new DOMParser().parseFromString(signatureXml, 'text/xml').documentElement;
  extensionContentNode.appendChild(signatureNode);

  const xmlFirmado = new XMLSerializer().serializeToString(doc);

  verificarFirmaPropia(xmlFirmado, { certForge });

  return Buffer.from(xmlFirmado, 'utf8');
}

/**
 * Autoverificación: recomputa los 3 digests y valida la SignatureValue con
 * la llave pública del mismo certificado, sobre el XML YA FIRMADO. Si algo
 * en la canonicalización o el ensamblado quedó mal, esto falla aquí en vez
 * de fallar en silencio del lado de la DIAN.
 */
export function verificarFirmaPropia(xmlFirmadoString, { certForge }) {
  const doc = new DOMParser().parseFromString(xmlFirmadoString, 'text/xml');
  const root = doc.documentElement;
  const signatureNode = root.getElementsByTagNameNS(DS_NS, 'Signature')[0];
  if (!signatureNode) throw new Error('Autoverificación falló: no se encontró ds:Signature en el XML firmado.');

  const signedInfoNode = signatureNode.getElementsByTagNameNS(DS_NS, 'SignedInfo')[0];
  const signatureValueB64 = signatureNode.getElementsByTagNameNS(DS_NS, 'SignatureValue')[0].textContent.trim();
  const keyInfoNode = signatureNode.getElementsByTagNameNS(DS_NS, 'KeyInfo')[0];
  const signedPropertiesNode = signatureNode.getElementsByTagNameNS(XADES_NS, 'SignedProperties')[0];

  // 1) Verificar la firma RSA sobre SignedInfo canonicalizado.
  const signedInfoCanonical = canonicalizar(signedInfoNode);
  const publicKeyPem = forge.pki.publicKeyToPem(certForge.publicKey);
  const firmaValida = crypto.verify(
    'RSA-SHA256',
    Buffer.from(signedInfoCanonical, 'utf8'),
    publicKeyPem,
    Buffer.from(signatureValueB64, 'base64')
  );
  if (!firmaValida) {
    throw new Error('Autoverificación falló: la SignatureValue no corresponde al SignedInfo canonicalizado (posible error de canonicalización).');
  }

  // 2) Verificar los 3 DigestValue declarados contra lo que existe en el documento.
  const digestsDeclarados = Array.from(signedInfoNode.getElementsByTagNameNS(DS_NS, 'DigestValue')).map((n) => n.textContent.trim());

  const keyInfoDigestRecalculado = sha256Base64DeBytes(forge.util.encodeUtf8(canonicalizar(keyInfoNode)));
  if (keyInfoDigestRecalculado !== digestsDeclarados[1]) {
    throw new Error('Autoverificación falló: el digest de KeyInfo no coincide tras re-canonicalizar el documento firmado.');
  }

  const signedPropertiesDigestRecalculado = sha256Base64DeBytes(forge.util.encodeUtf8(canonicalizar(signedPropertiesNode)));
  if (signedPropertiesDigestRecalculado !== digestsDeclarados[2]) {
    throw new Error('Autoverificación falló: el digest de SignedProperties no coincide tras re-canonicalizar el documento firmado.');
  }

  // 3) ref0 (documento completo con la firma removida) — remover el
  //    ds:Signature completo y recanonicalizar la raíz.
  signatureNode.parentNode.removeChild(signatureNode);
  const ref0DigestRecalculado = sha256Base64DeBytes(forge.util.encodeUtf8(canonicalizar(root)));
  if (ref0DigestRecalculado !== digestsDeclarados[0]) {
    throw new Error('Autoverificación falló: el digest del documento completo (ref0) no coincide tras remover la firma y re-canonicalizar.');
  }
}
