import { describe, it, expect } from 'vitest';
import { construirXmlNotaAjuste } from './notaAjusteXmlBuilder';
import type { FacturaElectronicaDian, NotaAjusteDian } from './types';
import type { DianExtensionData } from './dianExtensionsBlock';

function facturaBase(): FacturaElectronicaDian {
  return {
    clienteId: 'cliente-1',
    perfilFiscalId: 'perfil-1',
    tipoDocumento: 'factura',
    ventaReferencia: 'FAC000123',
    numeroFactura: 'SETP990000001',
    estado: 'accepted',
    intentosTransmision: 0,
    contingencia: false,
    emisor: {
      nit: '900123456',
      digitoVerificacion: '7',
      nombreORazonSocial: 'Mi Negocio S.A.S',
      nombreComercial: 'Mi Negocio',
      ambiente: 'habilitacion',
    },
    adquirente: {
      tipoDocumento: '13',
      numeroDocumento: '1234567890',
      nombreORazonSocial: 'Juan Pérez',
      email: 'juan@example.com',
    },
    items: [
      { descripcion: 'Producto de prueba', cantidad: 2, precioUnitario: 50000, subtotal: 100000, impuestos: [{ codigo: '01', porcentaje: 19, valor: 19000 }] },
    ],
    subtotal: 100000,
    totalImpuestos: 19000,
    total: 119000,
    fechaEmision: new Date(2026, 0, 15, 14, 30, 0).toISOString(),
    cufe: 'a'.repeat(96),
  };
}

function notaBase(overrides: Partial<NotaAjusteDian> = {}): NotaAjusteDian {
  return {
    clienteId: 'cliente-1',
    perfilFiscalId: 'perfil-1',
    facturaId: 'factura-1',
    tipo: 'credito',
    numeroNota: 'NC00000001',
    prefijo: 'NC',
    resolucionId: 'resolucion-nc-1',
    conceptoCodigo: '2',
    motivo: 'Anulación de factura electrónica',
    estado: 'pending',
    total: 119000,
    fechaEmision: new Date(2026, 0, 16, 9, 0, 0).toISOString(),
    cude: 'b'.repeat(96),
    ...overrides,
  };
}

function extensionBase(overrides: Partial<DianExtensionData> = {}): DianExtensionData {
  return {
    invoiceAuthorization: '18764054015291',
    authorizationStartDate: '2026-01-01',
    authorizationEndDate: '2027-01-01',
    prefix: 'NC',
    rangoDesde: 1,
    rangoHasta: 5000,
    softwareSecurityCode: 'c'.repeat(96),
    softwareId: 'fcd8a82c-6c19-4926-a978-65381b97e891',
    qrUrl: 'https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=' + 'b'.repeat(96),
    ...overrides,
  };
}

describe('construirXmlNotaAjuste', () => {
  it('genera CreditNote para tipo credito y DebitNote para tipo debito', () => {
    const xmlCredito = construirXmlNotaAjuste(notaBase({ tipo: 'credito' }), facturaBase(), extensionBase());
    const xmlDebito = construirXmlNotaAjuste(notaBase({ tipo: 'debito' }), facturaBase(), extensionBase());
    expect(xmlCredito).toContain('<CreditNote ');
    expect(xmlCredito.trimEnd().endsWith('</CreditNote>')).toBe(true);
    expect(xmlDebito).toContain('<DebitNote ');
    expect(xmlDebito.trimEnd().endsWith('</DebitNote>')).toBe(true);
  });

  it('las etiquetas cac/cbc/ext/sts quedan balanceadas', () => {
    const xml = construirXmlNotaAjuste(notaBase(), facturaBase(), extensionBase());
    const contarEtiquetas = (regex: RegExp) => (xml.match(regex) || []).length;
    for (const prefijo of ['cac', 'cbc', 'ext', 'sts']) {
      const abiertas = contarEtiquetas(new RegExp(`<${prefijo}:[A-Za-z]+[ >]`, 'g'));
      const cerradas = contarEtiquetas(new RegExp(`</${prefijo}:[A-Za-z]+>`, 'g'));
      const autocerradas = contarEtiquetas(new RegExp(`<${prefijo}:[A-Za-z]+[^>]*/>`, 'g'));
      expect(abiertas - autocerradas).toBe(cerradas);
    }
  });

  it('incluye el bloque sts:DianExtensions (SoftwareSecurityCode, QR)', () => {
    const xml = construirXmlNotaAjuste(notaBase(), facturaBase(), extensionBase({ softwareSecurityCode: 'codigo-nota' }));
    expect(xml).toContain('<sts:SoftwareSecurityCode');
    expect(xml).toContain('codigo-nota');
  });

  it('referencia la factura original por número y CUFE en BillingReference', () => {
    const xml = construirXmlNotaAjuste(notaBase(), facturaBase(), extensionBase());
    expect(xml).toContain('<cac:BillingReference>');
    expect(xml).toContain('<cbc:ID>SETP990000001</cbc:ID>');
    expect(xml).toContain(`CUFE-SHA384">${'a'.repeat(96)}</cbc:UUID>`);
  });

  it('incluye el CUDE de la nota en el elemento UUID raíz, distinto del CUFE de la factura', () => {
    const xml = construirXmlNotaAjuste(notaBase({ cude: 'cude-de-prueba' }), facturaBase(), extensionBase());
    expect(xml).toContain('<cbc:UUID schemeName="CUDE-SHA384">cude-de-prueba</cbc:UUID>');
  });

  it('usa el emisor snapshot de la FACTURA original, nunca uno distinto', () => {
    const factura = facturaBase();
    factura.emisor.nit = '111111111';
    const xml = construirXmlNotaAjuste(notaBase(), factura, extensionBase());
    expect(xml).toContain('111111111');
  });

  it('sin items propios, ajusta la factura completa (hereda sus items)', () => {
    const xml = construirXmlNotaAjuste(notaBase(), facturaBase(), extensionBase());
    const matches = xml.match(/<cac:CreditNoteLine>/g) || [];
    expect(matches).toHaveLength(1);
  });

  it('con items propios (nota parcial), usa solo esos items', () => {
    const xml = construirXmlNotaAjuste(
      notaBase({ items: [
        { descripcion: 'Solo una unidad', cantidad: 1, precioUnitario: 50000, subtotal: 50000 },
      ] }),
      facturaBase(),
      extensionBase()
    );
    const matches = xml.match(/<cac:CreditNoteLine>/g) || [];
    expect(matches).toHaveLength(1);
    expect(xml).toContain('Solo una unidad');
  });

  it('escapa caracteres especiales en el motivo', () => {
    const xml = construirXmlNotaAjuste(notaBase({ motivo: 'Ajuste "urgente" & <especial>' }), facturaBase(), extensionBase());
    expect(xml).toContain('Ajuste &quot;urgente&quot; &amp; &lt;especial&gt;');
  });
});
