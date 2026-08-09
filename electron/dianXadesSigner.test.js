/**
 * Tests de autoverificación del firmador XAdES-EPES real (dianXadesSigner.js).
 *
 * No pueden probar aceptación por la DIAN real (eso requiere un certificado
 * real del negocio y el ambiente de habilitación — ver
 * docs/electronic-invoicing/DIAN-BLOCKERS.md), pero sí prueban:
 *   - Que la firma se genera con la estructura XAdES-EPES confirmada.
 *   - Que la firma es criptográficamente autoconsistente (se verifica con
 *     la misma llave pública del certificado usado para firmar).
 *   - Que manipular el documento firmado o la firma misma es detectado.
 *
 * Certificado de prueba: generado en memoria con node-forge, autofirmado,
 * usado SOLO en este test — nunca para documentos DIAN reales.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import forge from 'node-forge';
import { firmarXadesXml, verificarFirmaPropia } from './dianXadesSigner.js';

let p12Buffer;
let certForge;
const PIN = 'test-pin-1234';

function xmlDePrueba(nombreEmisor = 'Mi Negocio') {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
         xmlns:sts="dian:gov:co:facturaelectronica:Structures-2-1"
         xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
         xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"
         xmlns:xades141="http://uri.etsi.org/01903/v1.4.1#">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent>
        <sts:DianExtensions>
          <sts:SoftwareSecurityCode schemeAgencyID="195" schemeAgencyName="CO, DIAN">codigo-de-prueba</sts:SoftwareSecurityCode>
        </sts:DianExtensions>
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
  <cbc:ID>SETP990000001</cbc:ID>
  <cbc:UUID schemeName="CUFE-SHA384">${'a'.repeat(96)}</cbc:UUID>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${nombreEmisor}</cbc:Name></cac:PartyName>
    </cac:Party>
  </cac:AccountingSupplierParty>
</Invoice>`;
}

beforeAll(() => {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const attrs = [
    { name: 'commonName', value: 'PRUEBA NEGOCIO SAS' },
    { name: 'countryName', value: 'CO' },
    { shortName: 'O', value: 'PRUEBA NEGOCIO SAS' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  certForge = cert;

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], PIN, { algorithm: '3des' });
  p12Buffer = Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');
}, 20000);

describe('firmarXadesXml', () => {
  it('firma y se autoverifica sin lanzar', () => {
    const firmado = firmarXadesXml(Buffer.from(xmlDePrueba(), 'utf8'), p12Buffer, PIN);
    expect(firmado.length).toBeGreaterThan(0);
  });

  it('incluye la estructura XAdES-EPES confirmada', () => {
    const xml = firmarXadesXml(Buffer.from(xmlDePrueba(), 'utf8'), p12Buffer, PIN).toString('utf8');
    expect(xml).toContain('<ds:Signature');
    expect(xml).toContain('<ds:SignedInfo');
    expect(xml).toContain('http://www.w3.org/TR/2001/REC-xml-c14n-20010315');
    expect(xml).toContain('http://www.w3.org/2001/04/xmldsig-more#rsa-sha256');
    expect(xml).toContain('<xades:SignedProperties');
    expect(xml).toContain('<xades:SignerRole><xades:ClaimedRoles><xades:ClaimedRole>supplier</xades:ClaimedRole>');
  });

  it('usa el hash de política de firma confirmado contra un documento real', () => {
    const xml = firmarXadesXml(Buffer.from(xmlDePrueba(), 'utf8'), p12Buffer, PIN).toString('utf8');
    expect(xml).toContain('https://facturaelectronica.dian.gov.co/politicadefirma/v2/politicadefirmav2.pdf');
    expect(xml).toContain('dMoMvtcG5aIzgYo0tIsSQeVJBDnUnfSOfBpxXrmor0Y=');
  });

  it('genera exactamente 3 ds:Reference (documento, KeyInfo, SignedProperties)', () => {
    const xml = firmarXadesXml(Buffer.from(xmlDePrueba(), 'utf8'), p12Buffer, PIN).toString('utf8');
    const referencias = xml.match(/<ds:Reference /g) || [];
    expect(referencias).toHaveLength(3);
    expect(xml).toContain('Type="http://uri.etsi.org/01903#SignedProperties"');
  });

  it('rechaza un PIN incorrecto', () => {
    expect(() => firmarXadesXml(Buffer.from(xmlDePrueba(), 'utf8'), p12Buffer, 'pin-equivocado')).toThrow();
  });

  it('detecta manipulación del documento después de firmado (verificación falla)', () => {
    const xmlFirmado = firmarXadesXml(Buffer.from(xmlDePrueba(), 'utf8'), p12Buffer, PIN).toString('utf8');
    const manipulado = xmlFirmado.replace('Mi Negocio', 'Otro Negocio Fraudulento');
    expect(() => verificarFirmaPropia(manipulado, { certForge })).toThrow(/ref0|digest/i);
  });

  it('detecta manipulación de la SignatureValue (verificación falla)', () => {
    const xmlFirmado = firmarXadesXml(Buffer.from(xmlDePrueba(), 'utf8'), p12Buffer, PIN).toString('utf8');
    const firmaAlterada = xmlFirmado.replace(
      /(<ds:SignatureValue[^>]*>)([A-Za-z0-9+/=]{20})/,
      (_m, tag, primeros20) => tag + 'X' + primeros20.slice(1)
    );
    expect(() => verificarFirmaPropia(firmaAlterada, { certForge })).toThrow(/SignatureValue/);
  });
});
