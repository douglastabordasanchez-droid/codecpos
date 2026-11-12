import { describe, expect, it } from 'vitest';
import { identificacionCompradorDelXml } from './facturaElectronicaDianService';
import { bloqueAdquirente } from '../dian/ublComun';

const facturaANit = `<Invoice><cac:AccountingCustomerParty>
    <cbc:AdditionalAccountID>1</cbc:AdditionalAccountID>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="6" schemeName="31">816004455</cbc:ID></cac:PartyIdentification>
    </cac:Party>
  </cac:AccountingCustomerParty></Invoice>`;

describe('identificacionCompradorDelXml', () => {
  it('recupera NIT y DV de la factura para que la nota salga al mismo comprador', () => {
    const id = identificacionCompradorDelXml(facturaANit);
    expect(id).toEqual({ tipoDocumento: '31', digitoVerificacion: '6' });
    const xml = bloqueAdquirente({ ...id!, numeroDocumento: '816004455', nombreORazonSocial: 'Studio 4 Sas' });
    expect(xml).toContain('<cbc:AdditionalAccountID>1</cbc:AdditionalAccountID>');
    expect(xml).toContain('<cbc:ID schemeID="6" schemeName="31">816004455</cbc:ID>');
  });

  it('una cédula sigue siendo cédula y sin XML no inventa nada', () => {
    const cedula = facturaANit.replace('schemeID="6" schemeName="31"', 'schemeName="13"');
    expect(identificacionCompradorDelXml(cedula)).toEqual({ tipoDocumento: '13', digitoVerificacion: undefined });
    expect(identificacionCompradorDelXml(null)).toBeNull();
  });
});
