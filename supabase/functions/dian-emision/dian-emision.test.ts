/**
 * Pruebas de la firma y del sobre SOAP de la Edge Function, con un
 * certificado de prueba generado aquí mismo. La firma se comprueba de forma
 * INDEPENDIENTE con xml-crypto (otra implementación de XMLDSig), no solo con
 * la autoverificación del propio firmador.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import forge from 'node-forge';
import { SignedXml } from 'xml-crypto';
import { DOMParser } from '@xmldom/xmldom';
import { unzipSync, strFromU8 } from 'fflate';
import { abrirP12, firmarXades, verificarFirma, metadatosCertificado, yaFirmado, type Credenciales } from './xades.ts';
import { construirSobre, empaquetarZip, interpretarRespuesta, ENDPOINTS } from './soap.ts';
import { cifrar, descifrar } from './cifrado.ts';
import { construirXmlFactura } from '../../../src/app/lib/dian/xmlBuilder';
import type { FacturaElectronicaDian } from '../../../src/app/lib/dian/types';

let p12: Uint8Array;
let credenciales: Credenciales;
let certPem: string;
const PIN = 'clave-de-prueba';

beforeAll(() => {
  const llaves = forge.pki.rsa.generateKeyPair(2048);
  const hacerCert = (cn: string, serie: string, llavePublica: forge.pki.PublicKey) => {
    const c = forge.pki.createCertificate();
    c.publicKey = llavePublica;
    c.serialNumber = serie;
    c.validity.notBefore = new Date(Date.now() - 86_400_000);
    c.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
    const sujeto = [{ name: 'commonName', value: cn }, { name: 'organizationName', value: 'Pruebas & Cía' }, { name: 'countryName', value: 'CO' }];
    c.setSubject(sujeto);
    c.setIssuer(sujeto);
    return c;
  };
  // Un .p12 real trae la cadena: primero la CA, luego el firmante. El
  // firmador debe escoger el que casa con la llave privada, no el primero.
  const llavesCa = forge.pki.rsa.generateKeyPair(1024);
  const ca = hacerCert('CA de prueba', '01', llavesCa.publicKey);
  ca.sign(llavesCa.privateKey, forge.md.sha256.create());
  const firmante = hacerCert('NEGOCIO DE PRUEBA SAS', '0a1b2c', llaves.publicKey);
  firmante.sign(llaves.privateKey, forge.md.sha256.create());
  certPem = forge.pki.certificateToPem(firmante);

  const asn1 = forge.pkcs12.toPkcs12Asn1(llaves.privateKey, [ca, firmante], PIN, { algorithm: '3des' });
  p12 = Uint8Array.from(forge.asn1.toDer(asn1).getBytes(), (ch) => ch.charCodeAt(0));
  credenciales = abrirP12(p12, PIN);
}, 60_000);

const factura: FacturaElectronicaDian = {
  clienteId: 'c', perfilFiscalId: 'p', tipoDocumento: 'factura', ventaReferencia: 'v', numeroFactura: 'SETP990000001', prefijo: 'SETP',
  estado: 'pending', intentosTransmision: 0, contingencia: false,
  emisor: { nit: '900123456', digitoVerificacion: '8', nombreORazonSocial: 'Negocio de Prueba S.A.S.', municipioCodigo: '11001', direccion: 'Calle 1', ambiente: 'habilitacion', tipoPersona: 'juridica' },
  adquirente: { tipoDocumento: '13', numeroDocumento: '1032456789', nombreORazonSocial: 'María Ñáñez' },
  items: [{ descripcion: 'Producto con tilde: café', cantidad: 2, precioUnitario: 5000, subtotal: 10000, impuestos: [{ codigo: '01', porcentaje: 19, valor: 1900 }] }],
  subtotal: 10000, totalImpuestos: 1900, total: 11900, fechaEmision: '2026-10-02T15:00:00.000Z', cufe: 'a'.repeat(96),
};
const xmlSinFirmar = () => construirXmlFactura(factura, {
  invoiceAuthorization: '18764054015291', authorizationStartDate: '2026-01-01', authorizationEndDate: '2027-01-01', prefix: 'SETP',
  rangoDesde: 990000000, rangoHasta: 995000000, softwareSecurityCode: 'b'.repeat(96), softwareId: 'sw-1', qrUrl: 'https://catalogo-vpfe-hab.dian.gov.co/x',
});

describe('certificado', () => {
  it('escoge el certificado del firmante aunque el .p12 traiga primero la CA', () => {
    expect(metadatosCertificado(credenciales).sujeto).toContain('NEGOCIO DE PRUEBA SAS');
  });

  it('rechaza una clave equivocada con un mensaje claro', () => {
    expect(() => abrirP12(p12, 'otra-clave')).toThrowError(/clave es incorrecta/);
    expect(() => abrirP12(new Uint8Array([1, 2, 3]), PIN)).toThrowError(/no es un \.p12/);
  });

  it('se cifra en reposo: sin la llave correcta o en otro perfil no se puede leer', async () => {
    const llave = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    const otra = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    const sobre = await cifrar(p12, llave, 'p12:perfil-1');
    expect(sobre).not.toContain(btoa(String.fromCharCode(...p12.subarray(0, 30))));
    expect(await descifrar(sobre, llave, 'p12:perfil-1')).toEqual(p12);
    await expect(descifrar(sobre, otra, 'p12:perfil-1')).rejects.toThrow();
    await expect(descifrar(sobre, llave, 'p12:perfil-2')).rejects.toThrow();
    // Dos cifrados del mismo dato no son iguales (IV aleatorio).
    expect(await cifrar(p12, llave, 'p12:perfil-1')).not.toBe(sobre);
  });
});

describe('firma XAdES del documento', () => {
  it('firma, se autoverifica y queda con la estructura que exige la política de la DIAN', () => {
    const firmado = firmarXades(xmlSinFirmar(), credenciales, new Date('2026-10-02T15:00:05Z'));
    expect(yaFirmado(firmado)).toBe(true);
    expect(() => verificarFirma(firmado)).not.toThrow();

    const doc = new DOMParser().parseFromString(firmado, 'text/xml');
    const extensiones = doc.getElementsByTagName('ext:UBLExtension');
    expect(extensiones).toHaveLength(2); // DianExtensions + firma
    expect(extensiones[1].getElementsByTagName('ds:Signature')).toHaveLength(1);
    expect(doc.getElementsByTagName('ds:Reference')).toHaveLength(3);
    expect(doc.getElementsByTagName('xades:SigningTime')[0].textContent).toBe('2026-10-02T10:00:05-05:00');
    expect(doc.getElementsByTagName('xades:Identifier')[0].textContent).toContain('politicadefirmav2.pdf');
    expect(doc.getElementsByTagName('ds:X509SerialNumber')[0].textContent).toBe(String(0x0a1b2c));
    // El contenido del documento no cambia al firmar.
    expect(doc.getElementsByTagName('cbc:Description')[0].textContent).toBe('Producto con tilde: café');
  });

  it('una verificación independiente (xml-crypto) valida la firma y sus tres referencias', () => {
    const firmado = firmarXades(xmlSinFirmar(), credenciales);
    const doc = new DOMParser().parseFromString(firmado, 'text/xml');
    const verificador = new SignedXml({ publicCert: certPem, idAttributes: ['Id'] });
    verificador.loadSignature(doc.getElementsByTagName('ds:Signature')[0] as never);
    expect(verificador.checkSignature(firmado)).toBe(true);
    expect(verificador.getSignedReferences()).toHaveLength(3);
  });

  it('detecta cualquier alteración posterior a la firma', () => {
    const firmado = firmarXades(xmlSinFirmar(), credenciales);
    expect(() => verificarFirma(firmado.replace('>11900.00<', '>1.00<'))).toThrowError(/digest del documento/);
    expect(() => verificarFirma(firmado.replace('<xades:ClaimedRole>supplier', '<xades:ClaimedRole>otro'))).toThrowError(/SignedProperties/);
  });
});

describe('sobre SOAP para la DIAN', () => {
  it('lleva WS-Addressing, el certificado y una firma WS-Security que xml-crypto valida', () => {
    const endpoint = ENDPOINTS.habilitacion;
    const sobre = construirSobre('SendBillSync', '<wcf:fileName>a.zip</wcf:fileName><wcf:contentFile>QUJD</wcf:contentFile>', endpoint, credenciales);
    const doc = new DOMParser().parseFromString(sobre, 'text/xml');

    expect(doc.getElementsByTagName('wsa:Action')[0].textContent).toBe('http://wcf.dian.colombia/IWcfDianCustomerServices/SendBillSync');
    expect(doc.getElementsByTagName('wsa:To')[0].textContent).toBe(endpoint);
    expect(doc.getElementsByTagName('wsu:Created')).toHaveLength(1);
    expect(doc.getElementsByTagName('wcf:contentFile')[0].textContent).toBe('QUJD');

    const token = doc.getElementsByTagName('wsse:BinarySecurityToken')[0];
    expect(forge.util.decode64(token.textContent!)).toBe(credenciales.certDer);
    expect(doc.getElementsByTagName('wsse:Reference')[0].getAttribute('URI')).toBe(`#${token.getAttribute('wsu:Id')}`);

    const verificador = new SignedXml({ publicCert: certPem, idAttributes: ['wsu:Id', 'Id'] });
    verificador.loadSignature(doc.getElementsByTagName('ds:Signature')[0] as never);
    expect(verificador.checkSignature(sobre)).toBe(true);
    // Lo firmado es el destinatario (wsa:To).
    expect(verificador.getSignedReferences()[0]).toContain(endpoint);
  });

  it('empaqueta el XML firmado dentro de un ZIP, que es lo que recibe la DIAN', () => {
    const { fileName, contentFile } = empaquetarZip('SETP990000001', '<Invoice>ñ</Invoice>');
    expect(fileName).toBe('SETP990000001.zip');
    const archivos = unzipSync(Uint8Array.from(atob(contentFile), (c) => c.charCodeAt(0)));
    expect(Object.keys(archivos)).toEqual(['SETP990000001.xml']);
    expect(strFromU8(archivos['SETP990000001.xml'])).toBe('<Invoice>ñ</Invoice>');
  });

  it('interpreta una respuesta de aceptación', () => {
    const r = interpretarRespuesta(`<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><SendBillSyncResponse xmlns="http://wcf.dian.colombia"><SendBillSyncResult xmlns:b="http://schemas.datacontract.org/2004/07/DianResponse" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><b:ErrorMessage xmlns:c="http://schemas.microsoft.com/2003/10/Serialization/Arrays"/><b:IsValid>true</b:IsValid><b:StatusCode>00</b:StatusCode><b:StatusDescription>Procesado Correctamente.</b:StatusDescription><b:StatusMessage>La Factura electrónica SETP990000001, ha sido autorizada.</b:StatusMessage><b:XmlDocumentKey>abc123</b:XmlDocumentKey></SendBillSyncResult></SendBillSyncResponse></s:Body></s:Envelope>`);
    expect(r).toMatchObject({ IsValid: true, StatusCode: '00', StatusDescription: 'Procesado Correctamente.', XmlDocumentKey: 'abc123' });
    expect(r.ErrorMessage).toBeUndefined();
  });

  it('interpreta un rechazo con sus reglas', () => {
    const r = interpretarRespuesta(`<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><SendBillSyncResponse xmlns="http://wcf.dian.colombia"><SendBillSyncResult xmlns:b="http://schemas.datacontract.org/2004/07/DianResponse"><b:ErrorMessage xmlns:c="http://schemas.microsoft.com/2003/10/Serialization/Arrays"><c:string>Regla: FAD06, Rechazo: Valor del CUFE no est&#225; calculado correctamente</c:string><c:string>Regla: FAJ43b, Notificaci&#243;n: Nombre &lt;informado&gt; No corresponde</c:string></b:ErrorMessage><b:IsValid>false</b:IsValid><b:StatusCode>99</b:StatusCode><b:StatusDescription>Validaci&#243;n contiene errores en campos mandatorios.</b:StatusDescription></SendBillSyncResult></SendBillSyncResponse></s:Body></s:Envelope>`);
    expect(r.IsValid).toBe(false);
    expect(r.StatusCode).toBe('99');
    expect(r.ErrorMessage!.string).toHaveLength(2);
    expect(r.ErrorMessage!.string[0]).toContain('Regla: FAD06');
    expect(r.ErrorMessage!.string[1]).toContain('<informado>');
  });

  it('convierte una falla SOAP en un error legible', () => {
    expect(() => interpretarRespuesta(`<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><s:Fault><s:Code><s:Value>s:Sender</s:Value></s:Code><s:Reason><s:Text xml:lang="en-US">An error occurred when verifying security for the message.</s:Text></s:Reason></s:Fault></s:Body></s:Envelope>`))
      .toThrowError(/verifying security/);
  });
});
