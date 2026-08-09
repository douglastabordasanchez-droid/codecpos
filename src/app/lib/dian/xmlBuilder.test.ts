import { describe, it, expect } from 'vitest';
import { construirXmlFactura, type DianExtensionData } from './xmlBuilder';
import type { FacturaElectronicaDian } from './types';

function facturaBase(overrides: Partial<FacturaElectronicaDian> = {}): FacturaElectronicaDian {
  return {
    clienteId: 'cliente-1',
    perfilFiscalId: 'perfil-1',
    tipoDocumento: 'factura',
    ventaReferencia: 'FAC000123',
    numeroFactura: 'SETP990000001',
    estado: 'signing',
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
    ...overrides,
  };
}

function extensionBase(overrides: Partial<DianExtensionData> = {}): DianExtensionData {
  return {
    invoiceAuthorization: '18764054015291',
    authorizationStartDate: '2026-01-01',
    authorizationEndDate: '2027-01-01',
    prefix: 'SETP',
    rangoDesde: 1,
    rangoHasta: 5000000,
    softwareSecurityCode: 'b'.repeat(96),
    softwareId: 'fcd8a82c-6c19-4926-a978-65381b97e891',
    qrUrl: 'https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=' + 'a'.repeat(96),
    ...overrides,
  };
}

describe('construirXmlFactura', () => {
  it('genera XML con la declaración correcta y las etiquetas balanceadas', () => {
    const xml = construirXmlFactura(facturaBase(), extensionBase());
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(true);
    expect(xml.trimEnd().endsWith('</Invoice>')).toBe(true);

    const contarEtiquetas = (regex: RegExp) => (xml.match(regex) || []).length;
    for (const prefijo of ['cac', 'cbc', 'ext', 'sts']) {
      const abiertas = contarEtiquetas(new RegExp(`<${prefijo}:[A-Za-z]+[ >]`, 'g'));
      const cerradas = contarEtiquetas(new RegExp(`</${prefijo}:[A-Za-z]+>`, 'g'));
      const autocerradas = contarEtiquetas(new RegExp(`<${prefijo}:[A-Za-z]+[^>]*/>`, 'g'));
      expect(abiertas - autocerradas).toBe(cerradas);
    }
  });

  it('incluye el CUFE en el elemento UUID con schemeName CUFE-SHA384 para facturas', () => {
    const xml = construirXmlFactura(facturaBase({ cufe: 'cufe-de-prueba-123' }), extensionBase());
    expect(xml).toContain('<cbc:UUID schemeName="CUFE-SHA384">cufe-de-prueba-123</cbc:UUID>');
  });

  it('usa schemeName CUDE-SHA384 para documento equivalente', () => {
    const xml = construirXmlFactura(facturaBase({ tipoDocumento: 'documento_equivalente', cufe: 'cude-de-prueba' }), extensionBase());
    expect(xml).toContain('<cbc:UUID schemeName="CUDE-SHA384">cude-de-prueba</cbc:UUID>');
  });

  it('escapa caracteres especiales en la descripción del ítem (previene XML injection)', () => {
    const xml = construirXmlFactura(
      facturaBase({ items: [{ descripcion: 'Producto <raro> & "especial"', cantidad: 1, precioUnitario: 1000, subtotal: 1000 }] }),
      extensionBase()
    );
    expect(xml).toContain('Producto &lt;raro&gt; &amp; &quot;especial&quot;');
    expect(xml).not.toContain('<raro>');
  });

  it('usa CustomizationID=2 en habilitación y 1 en producción, según el snapshot del emisor', () => {
    const xmlHab = construirXmlFactura(facturaBase({ emisor: { ...facturaBase().emisor, ambiente: 'habilitacion' } }), extensionBase());
    const xmlProd = construirXmlFactura(facturaBase({ emisor: { ...facturaBase().emisor, ambiente: 'produccion' } }), extensionBase());
    expect(xmlHab).toContain('<cbc:CustomizationID>2</cbc:CustomizationID>');
    expect(xmlProd).toContain('<cbc:CustomizationID>1</cbc:CustomizationID>');
  });

  it('usa el NIT del adquirente cuando está identificado (no consumidor final)', () => {
    const xml = construirXmlFactura(facturaBase(), extensionBase());
    expect(xml).toContain('1234567890');
  });

  it('genera una línea de factura por cada ítem', () => {
    const xml = construirXmlFactura(
      facturaBase({
        items: [
          { descripcion: 'Item 1', cantidad: 1, precioUnitario: 1000, subtotal: 1000 },
          { descripcion: 'Item 2', cantidad: 2, precioUnitario: 2000, subtotal: 4000 },
        ],
      }),
      extensionBase()
    );
    const matches = xml.match(/<cac:InvoiceLine>/g) || [];
    expect(matches).toHaveLength(2);
  });

  it('usa el NIT del snapshot del emisor, no el que pueda tener un perfil fiscal editado después', () => {
    const xml = construirXmlFactura(facturaBase({ emisor: { ...facturaBase().emisor, nit: '111111111' } }), extensionBase());
    expect(xml).toContain('111111111');
    expect(xml).not.toContain('900123456');
  });

  describe('sts:DianExtensions (Anexo Técnico v1.9 §11.7-11.8, confirmado contra un documento real)', () => {
    it('incluye InvoiceControl con la resolución, prefijo y rango vigentes', () => {
      const xml = construirXmlFactura(facturaBase(), extensionBase({ invoiceAuthorization: '18764054015291', prefix: 'SETP', rangoDesde: 1, rangoHasta: 5000000 }));
      expect(xml).toContain('<sts:InvoiceAuthorization>18764054015291</sts:InvoiceAuthorization>');
      expect(xml).toContain('<sts:Prefix>SETP</sts:Prefix>');
      expect(xml).toContain('<sts:From>1</sts:From>');
      expect(xml).toContain('<sts:To>5000000</sts:To>');
    });

    it('incluye SoftwareProvider con el NIT del emisor y el SoftwareID del perfil', () => {
      const xml = construirXmlFactura(facturaBase(), extensionBase({ softwareId: 'mi-software-id' }));
      expect(xml).toContain('<sts:ProviderID schemeAgencyID="195" schemeAgencyName="CO, DIAN (Direccion de Impuestos y Aduanas Nacionales)" schemeID="7" schemeName="31">900123456</sts:ProviderID>');
      expect(xml).toContain('<sts:SoftwareID schemeAgencyID="195" schemeAgencyName="CO, DIAN (Direccion de Impuestos y Aduanas Nacionales)">mi-software-id</sts:SoftwareID>');
    });

    it('incluye el SoftwareSecurityCode ya calculado tal cual, sin recalcularlo', () => {
      const xml = construirXmlFactura(facturaBase(), extensionBase({ softwareSecurityCode: 'codigo-de-prueba' }));
      expect(xml).toContain('<sts:SoftwareSecurityCode schemeAgencyID="195" schemeAgencyName="CO, DIAN (Direccion de Impuestos y Aduanas Nacionales)">codigo-de-prueba</sts:SoftwareSecurityCode>');
    });

    it('usa el NIT fijo de la DIAN (800197268) como AuthorizationProvider — no es un dato del negocio', () => {
      const xml = construirXmlFactura(facturaBase(), extensionBase());
      expect(xml).toContain('<sts:AuthorizationProviderID schemeAgencyID="195" schemeAgencyName="CO, DIAN (Direccion de Impuestos y Aduanas Nacionales)" schemeID="4" schemeName="31">800197268</sts:AuthorizationProviderID>');
    });

    it('incluye la URL del QR ya construida tal cual', () => {
      const xml = construirXmlFactura(facturaBase(), extensionBase({ qrUrl: 'https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=xyz' }));
      expect(xml).toContain('<sts:QRCode>https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=xyz</sts:QRCode>');
    });
  });
});
