import { describe, expect, it } from 'vitest';
import forge from 'node-forge';
import { DOMParser } from '@xmldom/xmldom';
import {
  ahoraColombia, calcularCune, construirApplicationResponse, cudeEvento, prepararNomina, quitarExtensionVacia, sha384Hex,
} from './documentos';
import { abrirP12, firmarXades, verificarFirma } from '../dian-emision/xades';

const ahora = new Date('2026-11-03T15:20:00Z');

const evento = {
  id: 'e-1', codigo: '030' as const, motivo_reclamo: null, nota: null,
  recibio: { nombres: 'Luis Carlos', apellidos: 'Bohorquez Vaca', tipo_doc: '13', numero_doc: '1049796031', cargo: 'Propietario' },
  factura: {
    cufe: 'f'.repeat(96), numero: 'FE0301895445', prefijo: 'FE', tipo: '01',
    vendedor: { nit: '800020706', dv: '9', nombre: 'PROVEEDOR S.A.S.' },
    comprador: { nit: '1049796031', dv: '3', nombre: 'LUIS CARLOS BOHORQUEZ VACA' },
  },
};

/** Certificado de prueba hecho aquí mismo (no es de ningún negocio). */
function credencialesDePrueba() {
  const llaves = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = llaves.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date('2026-01-01');
  cert.validity.notAfter = new Date('2030-01-01');
  const attrs = [{ name: 'commonName', value: 'PRUEBA' }];
  cert.setSubject(attrs); cert.setIssuer(attrs);
  cert.sign(llaves.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(llaves.privateKey, [cert], 'clave', { algorithm: '3des' });
  const bytes = forge.asn1.toDer(p12).getBytes();
  return abrirP12(Uint8Array.from(bytes, (c) => c.charCodeAt(0)), 'clave');
}

describe('acuses (B6)', () => {
  it('fecha y hora en Colombia', () => {
    expect(ahoraColombia(ahora)).toEqual({ fecha: '2026-11-03', hora: '10:20:00-05:00' });
  });

  it('arma el ApplicationResponse del 030 con su CUDE y quién recibió', () => {
    const { xml, cude } = construirApplicationResponse(evento, { numero: 'EV00000001', softwareId: 'sw', softwarePin: '12345', ambiente: '2', ahora });
    expect(cude).toBe(cudeEvento({
      numero: 'EV00000001', fecha: '2026-11-03', hora: '10:20:00-05:00', nitEmisor: '1049796031', nitReceptor: '800020706',
      codigo: '030', facturaId: 'FE0301895445', tipoDocumento: '01', softwarePin: '12345',
    }));
    expect(cude).toMatch(/^[0-9a-f]{96}$/);
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    expect(doc.documentElement!.localName).toBe('ApplicationResponse');
    expect(xml).toContain('<cbc:ResponseCode>030</cbc:ResponseCode>');
    expect(xml).toContain('<cbc:ProfileExecutionID>2</cbc:ProfileExecutionID>');
    expect(xml).toContain('catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=' + cude);
    expect(xml).toContain(`<sts:SoftwareSecurityCode schemeAgencyID="195" schemeAgencyName="CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)">${sha384Hex('sw12345EV00000001')}</sts:SoftwareSecurityCode>`);
    expect(xml).toMatch(/<cac:SenderParty>.*1049796031.*<\/cac:SenderParty><cac:ReceiverParty>.*800020706/);
    expect(xml).toContain('<cbc:FirstName>Luis Carlos</cbc:FirstName>');
  });

  it('el 033 no lleva persona y el 031 lleva el motivo', () => {
    const acepta = construirApplicationResponse({ ...evento, codigo: '033', recibio: null }, { numero: 'EV2', softwareId: 'sw', softwarePin: 'p', ambiente: '1', ahora });
    expect(acepta.xml).not.toContain('IssuerParty');
    expect(acepta.xml).toContain('catalogo-vpfe.dian.gov.co');
    const reclamo = construirApplicationResponse({ ...evento, codigo: '031', motivo_reclamo: '02', recibio: null }, { numero: 'EV3', softwareId: 'sw', softwarePin: 'p', ambiente: '1', ahora });
    expect(reclamo.xml).toContain('<cbc:ResponseCode listID="02" name="Mercancía no entregada totalmente">031</cbc:ResponseCode>');
  });

  it('se firma con el rol de tercero y la firma verifica', () => {
    const { xml } = construirApplicationResponse(evento, { numero: 'EV1', softwareId: 'sw', softwarePin: 'p', ambiente: '2', ahora });
    const firmado = firmarXades(xml, credencialesDePrueba(), ahora, 'third party');
    expect(firmado).toContain('<xades:ClaimedRole>third party</xades:ClaimedRole>');
    expect(() => verificarFirma(firmado)).not.toThrow();
  });
});

describe('nómina (B7)', () => {
  const datos = {
    num_ne: 'NE1', fec_ne: '2026-10-31', hor_ne: '10:00:00-05:00', val_dev: '2101719.00', val_ded: '148210.00',
    val_tol_ne: '1953509.00', nit_ne: '1049796031', doc_emp: '1022925002', tipo_xml: '102',
  };
  const provisional = 'a'.repeat(96);
  const xml =
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>' +
    '<NominaIndividual xmlns="dian:gov:co:facturaelectronica:NominaIndividual" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:xades="http://uri.etsi.org/01903/v1.3.2#">' +
    '<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent/></ext:UBLExtension></ext:UBLExtensions>' +
    '<NumeroSecuenciaXML Prefijo="NE" Consecutivo="1" Numero="NE1"/>' +
    '<ProveedorXML RazonSocial="DISTRIBUCIONES BM" NIT="1049796031" DV="3" SoftwareID=""/>' +
    `<CodigoQR>https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${provisional}</CodigoQR>` +
    `<InformacionGeneral Version="V1.0: Documento Soporte de Pago de Nómina Electrónica" Ambiente="1" TipoXML="102" CUNE="${provisional}" EncripCUNE="CUNE-SHA384" FechaGen="2026-10-31" HoraGen="10:00:00-05:00"/>` +
    '</NominaIndividual>';

  it('pone SoftwareID, SoftwareSC, Ambiente y el CUNE con el PIN de nómina', () => {
    const r = prepararNomina(xml, datos, { softwareId: 'swn', softwarePin: '777', ambiente: '2' });
    expect(r.cune).toBe(calcularCune(datos, '777', '2'));
    expect(r.cune).toBe(sha384Hex('NE12026-10-3110:00:00-05:002101719.00148210.001953509.00104979603110229250021027772'));
    expect(r.xml).toContain(`SoftwareID="swn" SoftwareSC="${sha384Hex('swn777NE1')}"`);
    expect(r.xml).toContain(`Ambiente="2"`);
    expect(r.xml).toContain(`CUNE="${r.cune}"`);
    expect(r.xml).toContain(`<CodigoQR>https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=${r.cune}</CodigoQR>`);
    expect(r.xml).not.toContain(provisional);
    expect(r.xml).not.toContain('<ext:ExtensionContent/>');
  });

  it('la nómina preparada se firma y verifica', () => {
    const r = prepararNomina(xml, datos, { softwareId: 'swn', softwarePin: '777', ambiente: '2' });
    const firmado = firmarXades(r.xml, credencialesDePrueba(), ahora);
    expect(() => verificarFirma(firmado)).not.toThrow();
    expect(firmado.match(/<ext:UBLExtension[s>]/g)?.length).toBe(1);
  });

  it('quitarExtensionVacia no toca extensiones con contenido', () => {
    const conDatos = '<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent><x/></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>';
    expect(quitarExtensionVacia(conDatos)).toBe(conDatos);
  });
});
