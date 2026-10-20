import { describe, it, expect } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { construirAttachedDocument, nombresArchivoEntrega } from './attachedDocument';

const FACTURA = `<?xml version="1.0" encoding="UTF-8"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
<cbc:ID>SETP990000001</cbc:ID><cbc:IssueDate>2026-10-17</cbc:IssueDate>
<cac:AccountingSupplierParty><cac:Party><cac:PartyTaxScheme><cbc:RegistrationName>Negocio S.A.S.</cbc:RegistrationName><cbc:CompanyID schemeAgencyID="195" schemeID="8" schemeName="31">900123456</cbc:CompanyID><cac:RegistrationAddress><cbc:ID>11001</cbc:ID></cac:RegistrationAddress><cac:TaxScheme><cbc:ID>01</cbc:ID><cbc:Name>IVA</cbc:Name></cac:TaxScheme></cac:PartyTaxScheme></cac:Party></cac:AccountingSupplierParty>
<cac:AccountingCustomerParty><cac:Party><cac:PartyTaxScheme><cbc:RegistrationName>Comprador</cbc:RegistrationName><cbc:CompanyID schemeAgencyID="195" schemeName="13">1234567890</cbc:CompanyID><cac:TaxScheme><cbc:ID>ZZ</cbc:ID><cbc:Name>No aplica</cbc:Name></cac:TaxScheme></cac:PartyTaxScheme></cac:Party></cac:AccountingCustomerParty>
<cbc:Note>texto con ]]> adentro</cbc:Note></Invoice>`;

const RESPUESTA = `<?xml version="1.0" encoding="utf-8"?><ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><cbc:IssueDate>2026-10-17</cbc:IssueDate><cbc:IssueTime>10:15:30-05:00</cbc:IssueTime><cac:DocumentResponse><cac:Response><cbc:ResponseCode>02</cbc:ResponseCode></cac:Response></cac:DocumentResponse></ApplicationResponse>`;

const armar = (respuesta = RESPUESTA) => construirAttachedDocument({
  xmlFactura: FACTURA, xmlApplicationResponse: respuesta, numero: 'SETP990000001', cufe: 'abc', ambiente: 'habilitacion',
  ahora: new Date('2026-10-17T16:00:00Z'),
});

describe('AttachedDocument', () => {
  it('es XML bien formado y lleva factura y validación de la DIAN', () => {
    const xml = armar();
    const errores: string[] = [];
    const doc = new DOMParser({ onError: (_n: string, m: string) => errores.push(m) } as any).parseFromString(xml, 'text/xml');
    expect(errores).toEqual([]);
    expect(doc.documentElement.localName).toBe('AttachedDocument');

    const descripciones = Array.from(doc.getElementsByTagName('cbc:Description')).map((d) => d.textContent ?? '');
    expect(descripciones[0]).toContain('texto con ]]> adentro');
    expect(descripciones[0].startsWith('<Invoice')).toBe(true);
    expect(descripciones[1].startsWith('<ApplicationResponse')).toBe(true);
  });

  it('identifica a las partes sin dirección y con la hora de validación de la DIAN', () => {
    const xml = armar();
    expect(xml).toMatch(/<cac:SenderParty><cac:PartyTaxScheme><cbc:RegistrationName>Negocio S\.A\.S\.<\/cbc:RegistrationName><cbc:CompanyID[^>]*>900123456</);
    expect(xml).toMatch(/<cac:ReceiverParty><cac:PartyTaxScheme><cbc:RegistrationName>Comprador</);
    expect(xml.split('<cac:Attachment>')[0]).not.toContain('RegistrationAddress');
    expect(xml).toContain('<cbc:ValidationTime>10:15:30-05:00</cbc:ValidationTime>');
    expect(xml).toContain('<cbc:ProfileExecutionID>2</cbc:ProfileExecutionID>');
    expect(xml).toContain('<cbc:IssueTime>11:00:00-05:00</cbc:IssueTime>');
    expect(xml).toContain('<ext:UBLExtensions></ext:UBLExtensions>');
  });

  it('no arma el contenedor con una respuesta de rechazo', () => {
    expect(() => armar(RESPUESTA.replace('>02<', '>04<'))).toThrow(/código 04/);
  });

  it('nombra los archivos como pide el anexo', () => {
    expect(nombresArchivoEntrega('900123456', 255, new Date('2026-10-17T16:00:00Z')))
      .toEqual({ xml: 'ad090012345600026000000ff.xml', zip: 'z090012345600026000000ff.zip' });
  });
});
