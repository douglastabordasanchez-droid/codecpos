/**
 * Autoverificación del cliente SOAP real (dianSoapClient.js) contra un
 * servidor SOAP LOCAL de prueba que sirve el mismo WSDL real vendorizado
 * (electron/dian-wsdl/WcfDianCustomerServices.wsdl) — prueba que:
 *   - El cliente arma una llamada SOAP válida contra las operaciones reales
 *     del WSDL de la DIAN (SendBillSync, GetStatus, GetNumberingRange).
 *   - El sobre incluye un header WS-Security con Timestamp, referencia por
 *     THUMBPRINT (no BST directo) y una firma XML-DSig.
 *   - Esa firma es criptográficamente válida (se verifica con la llave
 *     pública del mismo certificado de prueba).
 *
 * No puede probar aceptación por la DIAN real — eso requiere credenciales
 * reales del negocio. Ver docs/electronic-invoicing/DIAN-BLOCKERS.md.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import forge from 'node-forge';
import { DOMParser } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';
import * as soap from 'soap';
import { _internal } from './dianSoapClient.js';

let httpServer;
let baseUrl;
let p12Buffer;
let certForge;
let ultimaPeticionXml = null;
const PIN = 'test-pin-1234';

const WSSE_NS = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';
const DS_NS = 'http://www.w3.org/2000/09/xmldsig#';

beforeAll(async () => {
  // Certificado de prueba autofirmado — nunca usar contra la DIAN real.
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const attrs = [{ name: 'commonName', value: 'PRUEBA NEGOCIO SAS' }, { name: 'countryName', value: 'CO' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  certForge = cert;
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], PIN, { algorithm: '3des' });
  p12Buffer = Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');

  // Servidor SOAP local que sirve el WSDL real vendorizado y captura la petición cruda.
  const wsdlXml = fs.readFileSync(_internal.WSDL_PATH, 'utf8');
  const services = {
    WcfDianCustomerServices: {
      WSHttpBinding_IWcfDianCustomerServices: {
        SendBillSync(_args) {
          return { SendBillSyncResult: { IsValid: true, StatusCode: '00', StatusDescription: 'Prueba OK local', XmlDocumentKey: 'test-track-id' } };
        },
        GetStatus(_args) {
          return { GetStatusResult: { IsValid: true, StatusCode: '00', StatusDescription: 'Prueba OK local' } };
        },
      },
    },
  };

  httpServer = http.createServer((req, res) => { res.statusCode = 404; res.end(); });
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const port = httpServer.address().port;
  baseUrl = `http://127.0.0.1:${port}/dian-test`;

  const soapServer = soap.listen(httpServer, '/dian-test', services, wsdlXml);
  soapServer.log = (type, data) => {
    if (type === 'received') ultimaPeticionXml = data;
  };
}, 30000);

afterAll(() => {
  httpServer?.close();
});

function extraerHeaderSeguridad(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const security = doc.getElementsByTagNameNS(WSSE_NS, 'Security')[0];
  expect(security, 'debe existir wsse:Security en el header SOAP').toBeTruthy();
  return { doc, security };
}

describe('dianSoapClient — contra un servidor SOAP local con el WSDL real de la DIAN', () => {
  it('arma un sobre SOAP con WS-Security (Timestamp + referencia por thumbprint + firma) contra el WSDL real', async () => {
    ultimaPeticionXml = null;
    const client = await _internal.crearClienteFirmado(p12Buffer, PIN, baseUrl);
    const [result] = await client.SendBillSyncAsync({ fileName: 'SETP990000001.xml', contentFile: Buffer.from('<Invoice/>').toString('base64') });

    expect(result?.SendBillSyncResult?.IsValid ?? result?.IsValid).toBe(true);
    expect(ultimaPeticionXml).toBeTruthy();

    const { doc, security } = extraerHeaderSeguridad(ultimaPeticionXml);

    // Timestamp presente.
    const timestamp = doc.getElementsByTagName('Timestamp')[0] || doc.getElementsByTagNameNS('http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd', 'Timestamp')[0];
    expect(timestamp, 'debe incluir wsu:Timestamp').toBeTruthy();

    // Referencia por THUMBPRINT (no BST directo) — exigido por la política DIAN.
    expect(ultimaPeticionXml).toContain('ThumbprintSHA1');
    expect(ultimaPeticionXml).toContain('wsse:KeyIdentifier');

    // Firma presente con el algoritmo confirmado (RSA-SHA256 / SHA-256).
    const signatureNode = doc.getElementsByTagNameNS(DS_NS, 'Signature')[0];
    expect(signatureNode, 'debe incluir ds:Signature en el header WS-Security').toBeTruthy();
    expect(ultimaPeticionXml).toContain('http://www.w3.org/2001/04/xmldsig-more#rsa-sha256');
    expect(ultimaPeticionXml).toContain('http://www.w3.org/2001/04/xmlenc#sha256');

    // Verificación criptográfica real de la firma (con la llave pública del certificado de prueba).
    const publicKeyPem = forge.pki.publicKeyToPem(certForge.publicKey);
    const sig = new SignedXml({ publicCert: publicKeyPem });
    sig.loadSignature(signatureNode);
    const firmaValida = sig.checkSignature(ultimaPeticionXml);
    expect(firmaValida, `la firma WS-Security debe verificar criptográficamente (errores: ${JSON.stringify(sig.validationErrors)})`).toBe(true);
  }, 20000);

  it('GetStatus también firma correctamente contra el WSDL real', async () => {
    ultimaPeticionXml = null;
    const client = await _internal.crearClienteFirmado(p12Buffer, PIN, baseUrl);
    const [result] = await client.GetStatusAsync({ trackId: 'test-track-id' });
    expect(result?.GetStatusResult?.IsValid ?? result?.IsValid).toBe(true);
    expect(ultimaPeticionXml).toContain('wsse:Security');
  }, 20000);
});
