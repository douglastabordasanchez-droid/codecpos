/**
 * Pruebas del cliente SOAP de la DIAN (dianSoapClient.js) contra un servidor
 * HTTP LOCAL que captura la petición y responde como la DIAN. Prueban que:
 *   - El sobre lleva WS-Addressing (Action + To) y WS-Security con el
 *     certificado, y que la firma es válida según OTRA implementación de
 *     XMLDSig (xml-crypto), no solo según el propio cliente.
 *   - El documento viaja dentro de un ZIP, como exige la DIAN.
 *   - Las respuestas de aceptación, rechazo y falla se interpretan bien.
 *
 * No puede probar aceptación por la DIAN real — eso requiere credenciales
 * reales del negocio. Ver docs/electronic-invoicing/DIAN-BLOCKERS.md.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import forge from 'node-forge';
import { DOMParser } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { enviarFacturaSync, enviarSetPruebas, consultarEstado, consultarRangoNumeracion } from './dianSoapClient.js';

let servidor;
let endpointUrl;
let p12Buffer;
let certPem;
let ultima = { xml: '', contentType: '' };
let respuestaServidor = '';
const PIN = 'test-pin-1234';

const sobreRespuesta = (cuerpo) => `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body>${cuerpo}</s:Body></s:Envelope>`;
const ACEPTADA = sobreRespuesta('<SendBillSyncResponse xmlns="http://wcf.dian.colombia"><SendBillSyncResult xmlns:b="http://schemas.datacontract.org/2004/07/DianResponse"><b:ErrorMessage xmlns:c="http://schemas.microsoft.com/2003/10/Serialization/Arrays"/><b:IsValid>true</b:IsValid><b:StatusCode>00</b:StatusCode><b:StatusDescription>Procesado Correctamente.</b:StatusDescription><b:XmlDocumentKey>cufe-123</b:XmlDocumentKey></SendBillSyncResult></SendBillSyncResponse>');

beforeAll(async () => {
  // Certificado de prueba autofirmado — nunca usar contra la DIAN real.
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const attrs = [{ name: 'commonName', value: 'Prueba SOAP' }, { name: 'countryName', value: 'CO' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  certPem = forge.pki.certificateToPem(cert);
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], PIN, { algorithm: '3des' });
  p12Buffer = Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');

  servidor = http.createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (c) => { cuerpo += c; });
    req.on('end', () => {
      ultima = { xml: cuerpo, contentType: req.headers['content-type'] };
      res.writeHead(200, { 'Content-Type': 'application/soap+xml; charset=utf-8' });
      res.end(respuestaServidor);
    });
  });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  endpointUrl = `http://127.0.0.1:${servidor.address().port}/WcfDianCustomerServices.svc`;
}, 60000);

afterAll(() => new Promise((r) => servidor.close(r)));

const enviar = () => enviarFacturaSync({
  p12Buffer, pin: PIN, ambiente: 'habilitacion', fileName: 'SETP990000001.xml',
  xmlFirmadoBase64: Buffer.from('<Invoice>café</Invoice>', 'utf8').toString('base64'), endpointUrl,
});

describe('cliente SOAP DIAN', () => {
  it('envía SendBillSync con WS-Addressing y una firma WS-Security que xml-crypto valida', async () => {
    respuestaServidor = ACEPTADA;
    const r = await enviar();
    expect(r).toMatchObject({ IsValid: true, StatusCode: '00', XmlDocumentKey: 'cufe-123' });

    expect(ultima.contentType).toContain('application/soap+xml');
    expect(ultima.contentType).toContain('action="http://wcf.dian.colombia/IWcfDianCustomerServices/SendBillSync"');

    const doc = new DOMParser().parseFromString(ultima.xml, 'text/xml');
    expect(doc.getElementsByTagName('wsa:Action')[0].textContent).toBe('http://wcf.dian.colombia/IWcfDianCustomerServices/SendBillSync');
    expect(doc.getElementsByTagName('wsa:To')[0].textContent).toBe(endpointUrl);
    expect(doc.getElementsByTagName('wsu:Timestamp')).toHaveLength(1);
    expect(doc.getElementsByTagName('wsse:BinarySecurityToken')).toHaveLength(1);

    const verificador = new SignedXml({ publicCert: certPem, idAttributes: ['wsu:Id', 'Id'] });
    verificador.loadSignature(doc.getElementsByTagName('ds:Signature')[0]);
    expect(verificador.checkSignature(ultima.xml)).toBe(true);
    expect(verificador.getSignedReferences()[0]).toContain(endpointUrl);
  });

  it('el documento viaja dentro de un ZIP', async () => {
    respuestaServidor = ACEPTADA;
    await enviar();
    const doc = new DOMParser().parseFromString(ultima.xml, 'text/xml');
    expect(doc.getElementsByTagName('wcf:fileName')[0].textContent).toBe('SETP990000001.zip');
    const archivos = unzipSync(new Uint8Array(Buffer.from(doc.getElementsByTagName('wcf:contentFile')[0].textContent, 'base64')));
    expect(Object.keys(archivos)).toEqual(['SETP990000001.xml']);
    expect(strFromU8(archivos['SETP990000001.xml'])).toBe('<Invoice>café</Invoice>');
  });

  it('interpreta un rechazo con las reglas que devuelve la DIAN', async () => {
    respuestaServidor = sobreRespuesta('<SendBillSyncResponse xmlns="http://wcf.dian.colombia"><SendBillSyncResult xmlns:b="http://schemas.datacontract.org/2004/07/DianResponse"><b:ErrorMessage xmlns:c="http://schemas.microsoft.com/2003/10/Serialization/Arrays"><c:string>Regla: FAD06, Rechazo: Valor del CUFE no est&#225; calculado correctamente</c:string></b:ErrorMessage><b:IsValid>false</b:IsValid><b:StatusCode>99</b:StatusCode></SendBillSyncResult></SendBillSyncResponse>');
    const r = await enviar();
    expect(r.IsValid).toBe(false);
    expect(r.ErrorMessage.string).toEqual(['Regla: FAD06, Rechazo: Valor del CUFE no está calculado correctamente']);
  });

  it('una falla SOAP se convierte en un error legible', async () => {
    respuestaServidor = sobreRespuesta('<s:Fault><s:Reason><s:Text xml:lang="en-US">An error occurred when verifying security for the message.</s:Text></s:Reason></s:Fault>');
    await expect(enviar()).rejects.toThrow(/verifying security/);
  });

  it('una respuesta que no es SOAP (proxy, caída) no se confunde con un rechazo', async () => {
    respuestaServidor = '<html>503 Service Unavailable</html>';
    await expect(enviar()).rejects.toThrow(/sin un mensaje SOAP/);
  });

  it('set de pruebas y consulta de estado usan su operación y sus parámetros', async () => {
    respuestaServidor = sobreRespuesta('<SendTestSetAsyncResponse xmlns="http://wcf.dian.colombia"><SendTestSetAsyncResult xmlns:b="x"><b:ZipKey>zip-9</b:ZipKey></SendTestSetAsyncResult></SendTestSetAsyncResponse>');
    const set = await enviarSetPruebas({ p12Buffer, pin: PIN, fileName: 'SETP1.xml', xmlFirmadoBase64: 'PGEvPg==', testSetId: 'set-abc', endpointUrl });
    expect(set.ZipKey).toBe('zip-9');
    expect(ultima.xml).toContain('<wcf:SendTestSetAsync>');
    expect(ultima.xml).toContain('<wcf:testSetId>set-abc</wcf:testSetId>');

    respuestaServidor = ACEPTADA.replace(/SendBillSync/g, 'GetStatus');
    const estado = await consultarEstado({ p12Buffer, pin: PIN, ambiente: 'habilitacion', trackId: 'cufe-123', endpointUrl });
    expect(estado.IsValid).toBe(true);
    expect(ultima.xml).toContain('<wcf:GetStatus><wcf:trackId>cufe-123</wcf:trackId></wcf:GetStatus>');
  });

  it('la consulta de rangos devuelve cada numeración con su clave técnica', async () => {
    respuestaServidor = sobreRespuesta('<GetNumberingRangeResponse xmlns="http://wcf.dian.colombia"><GetNumberingRangeResult xmlns:b="x"><b:OperationCode>100</b:OperationCode><b:OperationDescription>Acción completada OK.</b:OperationDescription><b:ResponseList xmlns:c="y"><c:NumberRangeResponse><c:FromNumber>990000000</c:FromNumber><c:Prefix>SETP</c:Prefix><c:ResolutionNumber>18760000001</c:ResolutionNumber><c:TechnicalKey>fc8eac422eba16e22ffd8c6f94b3f40a6e38162c</c:TechnicalKey><c:ToNumber>995000000</c:ToNumber><c:ValidDateFrom>2019-01-19</c:ValidDateFrom><c:ValidDateTo>2030-01-19</c:ValidDateTo></c:NumberRangeResponse></b:ResponseList></GetNumberingRangeResult></GetNumberingRangeResponse>');
    const r = await consultarRangoNumeracion({ p12Buffer, pin: PIN, ambiente: 'habilitacion', accountCode: '900123456', accountCodeT: '900123456', softwareCode: 'sw-1', endpointUrl });
    expect(r.OperationCode).toBe('100');
    expect(r.ResponseList.NumberRangeResponse).toEqual([{
      ResolutionNumber: '18760000001', ResolutionDate: undefined, Prefix: 'SETP', FromNumber: '990000000', ToNumber: '995000000',
      ValidDateFrom: '2019-01-19', ValidDateTo: '2030-01-19', TechnicalKey: 'fc8eac422eba16e22ffd8c6f94b3f40a6e38162c',
    }]);
  });
});
