/**
 * Firma digital XAdES-EPES de documentos electrónicos DIAN — versión de
 * servidor. Es el mismo algoritmo, paso por paso, de
 * electron/dianXadesSigner.js (ver allí el porqué de cada decisión y las
 * fuentes oficiales contra las que se confirmó): XMLDSig enveloped, C14N
 * inclusivo, RSA-SHA256, tres referencias (documento, KeyInfo,
 * SignedProperties) y la política de firma v2 de la DIAN.
 *
 * Sin APIs de Node ni de Deno: solo node-forge, xmldom y xml-crypto, que
 * resuelven igual en la Edge Function (deno.json) y en las pruebas (Node).
 * Si se corrige algo aquí, hay que corregirlo también en el de Electron.
 */
import forge from 'node-forge';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { C14nCanonicalization } from 'xml-crypto';

const DS_NS = 'http://www.w3.org/2000/09/xmldsig#';
const XADES_NS = 'http://uri.etsi.org/01903/v1.3.2#';
const POLICY_URL = 'https://facturaelectronica.dian.gov.co/politicadefirma/v2/politicadefirmav2.pdf';
const POLICY_DESCRIPTION = 'Politica de firma para facturas electronicas de la Republica de Colombia.';
const POLICY_HASH_SHA256_BASE64 = 'dMoMvtcG5aIzgYo0tIsSQeVJBDnUnfSOfBpxXrmor0Y=';

export interface Credenciales {
  llavePrivada: forge.pki.rsa.PrivateKey;
  certificado: forge.pki.Certificate;
  /** Certificado en DER, como «cadena de bytes» de forge. */
  certDer: string;
}

/** Abre el .p12/.pfx. Lanza con un mensaje claro si el archivo o la clave no sirven. */
export function abrirP12(p12Bytes: Uint8Array, pin: string): Credenciales {
  let p12;
  try {
    const der = forge.util.createBuffer(forge.util.binary.raw.encode(p12Bytes));
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), pin);
  } catch {
    throw new Error('No se pudo abrir el certificado: el archivo no es un .p12/.pfx válido o la clave es incorrecta.');
  }
  const oids = forge.pki.oids;
  const bolsaLlave = p12.getBags({ bagType: oids.pkcs8ShroudedKeyBag })[oids.pkcs8ShroudedKeyBag]?.[0]
    ?? p12.getBags({ bagType: oids.keyBag })[oids.keyBag]?.[0];
  // Un .p12 trae la cadena completa: el del firmante es el que casa con la llave privada.
  const certificados = (p12.getBags({ bagType: oids.certBag })[oids.certBag] || []).map((b) => b.cert).filter(Boolean) as forge.pki.Certificate[];
  const llave = bolsaLlave?.key as forge.pki.rsa.PrivateKey | undefined;
  const certificado = certificados.find((c) => llave && (c.publicKey as forge.pki.rsa.PublicKey).n.equals(llave.n)) ?? certificados[0];
  if (!llave || !certificado) {
    throw new Error('El certificado no contiene una llave privada y un certificado válidos.');
  }
  return { llavePrivada: llave, certificado, certDer: forge.asn1.toDer(forge.pki.certificateToAsn1(certificado)).getBytes() };
}

export function metadatosCertificado(c: Credenciales) {
  const dn = (attrs: forge.pki.CertificateField[]) => attrs.map((a) => `${a.shortName || a.name}=${a.value}`).join(', ');
  return {
    sujeto: dn(c.certificado.subject.attributes),
    emisor: dn(c.certificado.issuer.attributes),
    venceEl: c.certificado.validity.notAfter.toISOString(),
    validoDesde: c.certificado.validity.notBefore.toISOString(),
  };
}

const sha256Base64 = (bytes: string) => forge.util.encode64(forge.md.sha256.create().update(bytes).digest().getBytes());
/**
 * Namespaces que un nodo hereda de sus ancestros (el más cercano gana).
 *
 * 🛡️ La forma canónica (C14N inclusivo) de un fragmento del documento —
 * KeyInfo, SignedProperties, SignedInfo — incluye TODOS los namespaces en
 * alcance, también los declarados en la raíz, y así los recalcula cualquier
 * validador (la DIAN incluida). Antes se canonizaban sin ellos: el firmador
 * se «autoverificaba» con el mismo error y una verificación independiente
 * rechazaba la firma.
 */
function nsHeredados(nodo: any): Array<{ prefix: string; namespaceURI: string }> {
  const declaracion = (nombre: string) => nombre.match(/^xmlns(?::(.+))?$/);
  const propios = new Set<string>();
  for (let i = 0; i < (nodo.attributes?.length ?? 0); i++) {
    const m = declaracion(nodo.attributes[i].nodeName);
    if (m) propios.add(m[1] || '');
  }
  const heredados = new Map<string, string>();
  for (let p = nodo.parentNode; p && p.nodeType === 1; p = p.parentNode) {
    for (let i = 0; i < p.attributes.length; i++) {
      const m = declaracion(p.attributes[i].nodeName);
      if (m && !heredados.has(m[1] || '')) heredados.set(m[1] || '', p.attributes[i].nodeValue || '');
    }
  }
  return [...heredados].filter(([prefijo]) => !propios.has(prefijo)).map(([prefix, namespaceURI]) => ({ prefix, namespaceURI }));
}

const canonicalizar = (nodo: unknown) => new C14nCanonicalization().process(nodo as never, { ancestorNamespaces: nsHeredados(nodo) });
const digestCanonico = (nodo: unknown) => sha256Base64(forge.util.encodeUtf8(canonicalizar(nodo)));

const escapar = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** 'YYYY-MM-DDTHH:MM:SS-05:00' — hora legal de Colombia, desde el instante UTC. */
function horaColombiaISO(ahora: Date): string {
  return `${new Date(ahora.getTime() - 5 * 3600_000).toISOString().slice(0, 19)}-05:00`;
}

export const yaFirmado = (xml: string) => /<ds:Signature[\s>]/.test(xml);

/**
 * Firma un XML UBL ya construido (con sts:DianExtensions, sin firma) y
 * devuelve el mismo XML con el ds:Signature XAdES-EPES en un ext:UBLExtension
 * adicional. Se autoverifica antes de devolver: si algo no cuadra, falla
 * aquí y no en la DIAN.
 */
export function firmarXades(xml: string, credenciales: Credenciales, ahora = new Date()): string {
  const { llavePrivada, certificado, certDer } = credenciales;
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const raiz = doc.documentElement!;

  const sigId = `xmldsig-${crypto.randomUUID()}`;
  const keyInfoId = `${sigId}-keyinfo`;
  const signedPropsId = `${sigId}-signedprops`;

  const extensiones = raiz.getElementsByTagName('ext:UBLExtensions')[0];
  if (!extensiones) throw new Error('El XML a firmar no tiene ext:UBLExtensions — no se puede insertar la firma.');

  // 1) Contenedor vacío de la firma, ya dentro del documento: el digest del
  //    documento (ref0) debe calcularse con él presente, porque un validador
  //    solo retira el ds:Signature, no su contenedor.
  const parse = (s: string) => new DOMParser().parseFromString(s, 'text/xml').documentElement!;
  extensiones.appendChild(doc.importNode(parse(
    '<ext:UBLExtension xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"><ext:ExtensionContent></ext:ExtensionContent></ext:UBLExtension>',
  ), true));
  const contenedorFirma = (extensiones.lastChild as Element).getElementsByTagName('ext:ExtensionContent')[0];

  const ref0 = digestCanonico(raiz);

  // 2) KeyInfo y SignedProperties: se insertan temporalmente bajo la raíz
  //    para canonicalizarlos con el mismo contexto de namespaces que tendrán
  //    en su posición final.
  const keyInfoXml =
    `<ds:KeyInfo xmlns:ds="${DS_NS}" Id="${keyInfoId}"><ds:X509Data><ds:X509Certificate>${forge.util.encode64(certDer)}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>`;
  const emisorDn = certificado.issuer.attributes.map((a) => `${a.shortName || a.name}=${a.value}`).join(', ');
  const signedPropsXml =
    `<xades:SignedProperties xmlns:xades="${XADES_NS}" xmlns:ds="${DS_NS}" Id="${signedPropsId}">` +
    `<xades:SignedSignatureProperties>` +
    `<xades:SigningTime>${horaColombiaISO(ahora)}</xades:SigningTime>` +
    `<xades:SigningCertificate><xades:Cert>` +
    `<xades:CertDigest><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>${sha256Base64(certDer)}</ds:DigestValue></xades:CertDigest>` +
    `<xades:IssuerSerial><ds:X509IssuerName>${escapar(emisorDn)}</ds:X509IssuerName><ds:X509SerialNumber>${BigInt(`0x${certificado.serialNumber}`).toString(10)}</ds:X509SerialNumber></xades:IssuerSerial>` +
    `</xades:Cert></xades:SigningCertificate>` +
    `<xades:SignaturePolicyIdentifier><xades:SignaturePolicyId>` +
    `<xades:SigPolicyId><xades:Identifier>${POLICY_URL}</xades:Identifier><xades:Description>${POLICY_DESCRIPTION}</xades:Description></xades:SigPolicyId>` +
    `<xades:SigPolicyHash><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>${POLICY_HASH_SHA256_BASE64}</ds:DigestValue></xades:SigPolicyHash>` +
    `</xades:SignaturePolicyId></xades:SignaturePolicyIdentifier>` +
    `<xades:SignerRole><xades:ClaimedRoles><xades:ClaimedRole>supplier</xades:ClaimedRole></xades:ClaimedRoles></xades:SignerRole>` +
    `</xades:SignedSignatureProperties></xades:SignedProperties>`;

  const temporal = doc.createElement('TemporalParaDigest');
  raiz.appendChild(temporal);
  temporal.appendChild(doc.importNode(parse(keyInfoXml), true));
  temporal.appendChild(doc.importNode(parse(signedPropsXml), true));
  const digestKeyInfo = digestCanonico(temporal.firstChild);
  const digestSignedProps = digestCanonico(temporal.lastChild);
  raiz.removeChild(temporal);

  // 3) SignedInfo con las tres referencias, firmado con RSA-SHA256.
  const signedInfoXml =
    `<ds:SignedInfo xmlns:ds="${DS_NS}">` +
    `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
    `<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>` +
    `<ds:Reference Id="${sigId}-ref0" URI=""><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/></ds:Transforms>` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>${ref0}</ds:DigestValue></ds:Reference>` +
    `<ds:Reference URI="#${keyInfoId}"><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>${digestKeyInfo}</ds:DigestValue></ds:Reference>` +
    `<ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${signedPropsId}"><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>${digestSignedProps}</ds:DigestValue></ds:Reference>` +
    `</ds:SignedInfo>`;

  const signedInfoNodo = raiz.appendChild(doc.importNode(parse(signedInfoXml), true));
  const signedInfoCanonico = canonicalizar(signedInfoNodo);
  raiz.removeChild(signedInfoNodo);

  const md = forge.md.sha256.create().update(forge.util.encodeUtf8(signedInfoCanonico));
  const firma = forge.util.encode64(llavePrivada.sign(md));

  // 4) ds:Signature completo dentro del contenedor del paso 1.
  contenedorFirma.appendChild(doc.importNode(parse(
    `<ds:Signature xmlns:ds="${DS_NS}" Id="${sigId}">${signedInfoXml}` +
    `<ds:SignatureValue Id="${sigId}-sigvalue">${firma}</ds:SignatureValue>${keyInfoXml}` +
    `<ds:Object><xades:QualifyingProperties xmlns:xades="${XADES_NS}" Target="#${sigId}">${signedPropsXml}</xades:QualifyingProperties></ds:Object>` +
    `</ds:Signature>`,
  ), true));

  const firmado = new XMLSerializer().serializeToString(doc);
  verificarFirma(firmado);
  return firmado;
}

/**
 * Verificación independiente del XML YA serializado: valida la firma RSA con
 * la llave pública del certificado embebido y recalcula los tres digests.
 */
export function verificarFirma(xmlFirmado: string): void {
  const doc = new DOMParser().parseFromString(xmlFirmado, 'text/xml');
  const raiz = doc.documentElement!;
  const firma = raiz.getElementsByTagNameNS(DS_NS, 'Signature')[0];
  if (!firma) throw new Error('Verificación de firma: no se encontró ds:Signature.');

  const signedInfo = firma.getElementsByTagNameNS(DS_NS, 'SignedInfo')[0];
  const valor = firma.getElementsByTagNameNS(DS_NS, 'SignatureValue')[0].textContent!.trim();
  const keyInfo = firma.getElementsByTagNameNS(DS_NS, 'KeyInfo')[0];
  const signedProps = firma.getElementsByTagNameNS(XADES_NS, 'SignedProperties')[0];
  const certB64 = firma.getElementsByTagNameNS(DS_NS, 'X509Certificate')[0].textContent!.trim();
  const cert = forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.util.decode64(certB64)));

  const md = forge.md.sha256.create().update(forge.util.encodeUtf8(canonicalizar(signedInfo)));
  if (!(cert.publicKey as forge.pki.rsa.PublicKey).verify(md.digest().getBytes(), forge.util.decode64(valor))) {
    throw new Error('Verificación de firma: la SignatureValue no corresponde al SignedInfo.');
  }

  const digests = Array.from(signedInfo.getElementsByTagNameNS(DS_NS, 'DigestValue')).map((n) => n.textContent!.trim());
  if (digestCanonico(keyInfo) !== digests[1]) throw new Error('Verificación de firma: el digest de KeyInfo no coincide.');
  if (digestCanonico(signedProps) !== digests[2]) throw new Error('Verificación de firma: el digest de SignedProperties no coincide.');
  firma.parentNode!.removeChild(firma);
  if (digestCanonico(raiz) !== digests[0]) throw new Error('Verificación de firma: el digest del documento no coincide.');
}
