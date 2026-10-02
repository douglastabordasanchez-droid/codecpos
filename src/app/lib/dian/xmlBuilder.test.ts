import { describe, it, expect } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { construirXmlFactura, type DianExtensionData } from './xmlBuilder';
import { construirXmlNotaAjuste } from './notaAjusteXmlBuilder';
import { calcularDocumentoFiscal, fechaColombia, horaColombia, impuestosParaHash } from './documentoFiscal';
import { construirCadenaCufe } from './cufeCalculator';
import { digitoVerificacionNit, identificarAdquirente } from './ublComun';
import { resolverUbicacionDian } from './divipola';
import { parseDianXml } from './recepcion/parser';
import type { FacturaElectronicaDian, NotaAjusteDian } from './types';

function facturaBase(overrides: Partial<FacturaElectronicaDian> = {}): FacturaElectronicaDian {
  return {
    clienteId: 'cliente-1',
    perfilFiscalId: 'perfil-1',
    tipoDocumento: 'factura',
    ventaReferencia: 'FAC000123',
    numeroFactura: 'SETP990000001',
    prefijo: 'SETP',
    estado: 'signing',
    intentosTransmision: 0,
    contingencia: false,
    emisor: {
      nit: '900123456', digitoVerificacion: '8', nombreORazonSocial: 'Mi Negocio S.A.S', nombreComercial: 'Mi Negocio',
      direccion: 'Cra 15 # 93-47', municipioCodigo: 'Bogotá D.C.', departamentoCodigo: 'Cundinamarca',
      responsabilidadesFiscales: ['O-15 Autorretenedor', 'O-49 No responsable de IVA'], ambiente: 'habilitacion', tipoPersona: 'juridica',
    },
    adquirente: { tipoDocumento: '13', numeroDocumento: '900555111-4', nombreORazonSocial: 'Restaurante & Cía <Ltda>', email: 'compras@cliente.co' },
    items: [
      { codigo: '7701', descripcion: 'Pan baguette', cantidad: 3, precioUnitario: 3333.33, subtotal: 9999.99, impuestos: [{ codigo: '01', porcentaje: 19, valor: 0 }] },
      { descripcion: 'Leche (IVA 5 %)', cantidad: 2, precioUnitario: 4000, subtotal: 8000, impuestos: [{ codigo: '01', porcentaje: 5, valor: 400 }] },
      { descripcion: 'Huevos (excluido)', cantidad: 1, precioUnitario: 15000, subtotal: 15000 },
      { descripcion: 'Almuerzo (INC)', cantidad: 1, precioUnitario: 20000, subtotal: 20000, impuestos: [{ codigo: '04', porcentaje: 8, valor: 1600 }] },
    ],
    subtotal: 0, totalImpuestos: 0, total: 0,
    // 02-oct-2026 a las 8:30 p.m. de Colombia = 03-oct 01:30 UTC.
    fechaEmision: '2026-10-03T01:30:15.000Z',
    cufe: 'a'.repeat(96),
    pago: { metodo: 'nequi' },
    ...overrides,
  };
}

const extension: DianExtensionData = {
  invoiceAuthorization: '18764054015291',
  authorizationStartDate: '2026-01-01T00:00:00+00:00',
  authorizationEndDate: '2027-01-01',
  prefix: 'SETP',
  rangoDesde: 990000000,
  rangoHasta: 995000000,
  softwareSecurityCode: 'b'.repeat(96),
  softwareId: 'fcd8a82c-6c19-4926-a978-65381b97e891',
  qrUrl: 'https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=' + 'a'.repeat(96),
};

// ── Lector XML mínimo para las pruebas: rutas por nombre con prefijo ──────
function leer(xml: string) {
  const errores: string[] = [];
  const doc = new DOMParser({ onError: (nivel: string, msg: string) => { if (nivel !== 'warning') errores.push(msg); } } as never).parseFromString(xml, 'text/xml');
  const hijos = (n: any, nombre: string): any[] => Array.from(n.childNodes as ArrayLike<any>).filter((c: any) => c.nodeName === nombre);
  const todos = (ruta: string, desde: any = doc.documentElement): any[] =>
    ruta.split('/').reduce((nodos: any[], paso) => nodos.flatMap((n) => hijos(n, paso)), [desde]);
  const texto = (ruta: string, desde?: any) => todos(ruta, desde)[0]?.textContent?.trim();
  const num = (ruta: string, desde?: any) => Number(texto(ruta, desde));
  return { doc, errores, todos, texto, num };
}

describe('cifras fiscales (documentoFiscal)', () => {
  it('cada impuesto es base × tarifa y los totales salen de las líneas', () => {
    const f = calcularDocumentoFiscal(facturaBase().items);
    expect(f.lineas[0].impuestos[0].valor).toBe(1900); // 9999.99 × 19 % = 1899.9981 → 1900.00
    expect(f.brutoLineas).toBe(52999.99);
    expect(f.baseGravable).toBe(37999.99); // la línea excluida no es base gravable
    expect(f.tributos).toEqual([
      { codigo: '01', nombre: 'IVA', total: 2300, subtotales: [{ porcentaje: 5, base: 8000, valor: 400 }, { porcentaje: 19, base: 9999.99, valor: 1900 }] },
      { codigo: '04', nombre: 'INC', total: 1600, subtotales: [{ porcentaje: 8, base: 20000, valor: 1600 }] },
    ]);
    expect(f.totalImpuestos).toBe(3900);
    expect(f.total).toBe(56899.99);
  });

  it('la fecha y la hora son las de Colombia, sin importar la zona del equipo', () => {
    expect(fechaColombia('2026-10-03T01:30:15.000Z')).toBe('2026-10-02');
    expect(horaColombia('2026-10-03T01:30:15.000Z')).toBe('20:30:15-05:00');
  });
});

describe('construirXmlFactura — reglas de rechazo del Anexo Técnico v1.9', () => {
  const factura = facturaBase();
  const fiscal = calcularDocumentoFiscal(factura.items);
  const xml = construirXmlFactura(factura, extension);
  const x = leer(xml);

  it('es XML bien formado', () => {
    expect(x.errores).toEqual([]);
    expect(x.doc.documentElement!.nodeName).toBe('Invoice');
  });

  it('encabezado: versión, operación, perfil, ambiente y tipo (FAD01..FAD12)', () => {
    expect(x.texto('cbc:UBLVersionID')).toBe('UBL 2.1');
    expect(x.texto('cbc:CustomizationID')).toBe('10');
    expect(x.texto('cbc:ProfileID')).toBe('DIAN 2.1: Factura Electrónica de Venta');
    expect(x.texto('cbc:ProfileExecutionID')).toBe('2');
    expect(x.todos('cbc:UUID')[0].getAttribute('schemeID')).toBe('2');
    expect(x.todos('cbc:UUID')[0].getAttribute('schemeName')).toBe('CUFE-SHA384');
    expect(x.texto('cbc:InvoiceTypeCode')).toBe('01');
    expect(x.num('cbc:LineCountNumeric')).toBe(4);
  });

  it('la fecha y hora del XML son exactamente las que entran al CUFE (FAD06)', () => {
    expect(x.texto('cbc:IssueDate')).toBe('2026-10-02');
    expect(x.texto('cbc:IssueTime')).toBe('20:30:15-05:00');
    const cadena = construirCadenaCufe({
      numeroFactura: factura.numeroFactura, fecha: factura.fechaEmision, valorBruto: fiscal.brutoLineas,
      impuestos: impuestosParaHash(fiscal), valorTotal: fiscal.total, nitEmisor: '900123456',
      numeroAdquirente: identificarAdquirente(factura.adquirente).numero, claveTecnica: 'CLAVE', ambiente: 'habilitacion',
    });
    expect(cadena).toBe(
      'SETP990000001' + x.texto('cbc:IssueDate') + x.texto('cbc:IssueTime') + '52999.99' +
      '01' + '2300.00' + '04' + '1600.00' + '03' + '0.00' + '56899.99' + '900123456' + '900555111' + 'CLAVE' + '2',
    );
  });

  it('vigencia de la numeración como fecha sola y prefijo igual al del emisor (FAB07, FAB08, FAB10a)', () => {
    const control = 'ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent/sts:DianExtensions/sts:InvoiceControl';
    expect(x.texto(`${control}/sts:AuthorizationPeriod/cbc:StartDate`)).toBe('2026-01-01');
    expect(x.texto(`${control}/sts:AuthorizationPeriod/cbc:EndDate`)).toBe('2027-01-01');
    expect(x.texto(`${control}/sts:AuthorizedInvoices/sts:Prefix`))
      .toBe(x.texto('cac:AccountingSupplierParty/cac:Party/cac:PartyLegalEntity/cac:CorporateRegistrationScheme/cbc:ID'));
  });

  it('emisor: tipo de persona, NIT con DV, responsabilidades válidas y dirección con códigos DANE (FAJ)', () => {
    const p = 'cac:AccountingSupplierParty';
    expect(x.texto(`${p}/cbc:AdditionalAccountID`)).toBe('1');
    const nit = x.todos(`${p}/cac:Party/cac:PartyTaxScheme/cbc:CompanyID`)[0];
    expect([nit.textContent, nit.getAttribute('schemeID'), nit.getAttribute('schemeName')]).toEqual(['900123456', '8', '31']);
    // «O-49» no está en la lista que admite la DIAN: se descarta, queda O-15.
    expect(x.texto(`${p}/cac:Party/cac:PartyTaxScheme/cbc:TaxLevelCode`)).toBe('O-15');
    for (const grupo of ['cac:PhysicalLocation/cac:Address', 'cac:PartyTaxScheme/cac:RegistrationAddress']) {
      expect(x.texto(`${p}/cac:Party/${grupo}/cbc:ID`)).toBe('11001');
      expect(x.texto(`${p}/cac:Party/${grupo}/cbc:CountrySubentityCode`)).toBe('11');
      expect(x.texto(`${p}/cac:Party/${grupo}/cac:Country/cbc:IdentificationCode`)).toBe('CO');
      expect(x.texto(`${p}/cac:Party/${grupo}/cac:AddressLine/cbc:Line`)).toBe('Cra 15 # 93-47');
    }
    expect(x.texto(`${p}/cac:Party/cac:PartyTaxScheme/cac:TaxScheme/cbc:ID`)).toBe('01');
  });

  it('adquirente: NIT reconocido por su DV, identificación y nombre escapado (FAK)', () => {
    const p = 'cac:AccountingCustomerParty';
    expect(x.texto(`${p}/cbc:AdditionalAccountID`)).toBe('1');
    const id = x.todos(`${p}/cac:Party/cac:PartyIdentification/cbc:ID`)[0];
    expect([id.textContent, id.getAttribute('schemeID'), id.getAttribute('schemeName')]).toEqual(['900555111', '4', '31']);
    expect(x.texto(`${p}/cac:Party/cac:PartyTaxScheme/cbc:RegistrationName`)).toBe('Restaurante & Cía <Ltda>');
    expect(x.texto(`${p}/cac:Party/cac:PartyTaxScheme/cbc:CompanyID`)).toBe('900555111');
    expect(x.texto(`${p}/cac:Party/cac:Contact/cbc:ElectronicMail`)).toBe('compras@cliente.co');
  });

  it('medio de pago informado (FAN01, FAN02, FAN04)', () => {
    expect(x.texto('cac:PaymentMeans/cbc:ID')).toBe('1');
    expect(x.texto('cac:PaymentMeans/cbc:PaymentMeansCode')).toBe('47');
  });

  it('un TaxTotal por tributo, un subtotal por tarifa, y cada uno cuadra (FAS01, FAS02, FAS04, FAS07)', () => {
    const totales = x.todos('cac:TaxTotal');
    expect(totales.map((t) => x.texto('cac:TaxSubtotal/cac:TaxCategory/cac:TaxScheme/cbc:ID', t))).toEqual(['01', '04']);
    for (const t of totales) {
      const subtotales = x.todos('cac:TaxSubtotal', t);
      const suma = subtotales.reduce((a, s) => a + x.num('cbc:TaxAmount', s), 0);
      expect(x.num('cbc:TaxAmount', t)).toBeCloseTo(suma, 2);
      for (const s of subtotales) {
        const esperado = x.num('cbc:TaxableAmount', s) * x.num('cac:TaxCategory/cbc:Percent', s) / 100;
        expect(x.num('cbc:TaxAmount', s)).toBeCloseTo(esperado, 1);
        expect(x.texto('cac:TaxCategory/cac:TaxScheme/cbc:Name', s)).toMatch(/^(IVA|INC)$/);
      }
    }
    expect(x.todos('cac:TaxSubtotal', totales[0])).toHaveLength(2); // IVA al 5 % y al 19 %
  });

  it('todo tributo del encabezado existe en alguna línea (FAS01b)', () => {
    const enLineas = new Set(x.todos('cac:InvoiceLine/cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cac:TaxScheme/cbc:ID').map((n) => n.textContent));
    for (const t of x.todos('cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cac:TaxScheme/cbc:ID')) expect(enLineas.has(t.textContent)).toBe(true);
  });

  it('los totales del documento salen de las líneas (FAU02, FAU04, FAU06, FAU14)', () => {
    const lineas = x.todos('cac:InvoiceLine');
    const sumaLineas = lineas.reduce((a, l) => a + x.num('cbc:LineExtensionAmount', l), 0);
    const sumaImpuestos = x.todos('cac:TaxTotal').reduce((a, t) => a + x.num('cbc:TaxAmount', t), 0);
    const sumaBases = x.todos('cac:TaxTotal/cac:TaxSubtotal').reduce((a, s) => a + x.num('cbc:TaxableAmount', s), 0);
    const t = 'cac:LegalMonetaryTotal';
    expect(x.num(`${t}/cbc:LineExtensionAmount`)).toBeCloseTo(sumaLineas, 2);
    expect(x.num(`${t}/cbc:TaxExclusiveAmount`)).toBeCloseTo(sumaBases, 2);
    expect(x.num(`${t}/cbc:TaxInclusiveAmount`)).toBeCloseTo(sumaLineas + sumaImpuestos, 2);
    expect(x.num(`${t}/cbc:PayableAmount`)).toBeCloseTo(sumaLineas + sumaImpuestos, 2);
  });

  it('líneas consecutivas desde 1, con unidad de medida, descripción y precio coherente (FAV, FAZ)', () => {
    const lineas = x.todos('cac:InvoiceLine');
    expect(lineas.map((l) => x.texto('cbc:ID', l))).toEqual(['1', '2', '3', '4']);
    for (const l of lineas) {
      const cantidad = x.todos('cbc:InvoicedQuantity', l)[0];
      expect(cantidad.getAttribute('unitCode')).toBe('94');
      expect(Number(cantidad.textContent)).toBeGreaterThan(0);
      expect(x.texto('cac:Item/cbc:Description', l)).toBeTruthy();
      expect(x.num('cac:Price/cbc:PriceAmount', l) * Number(cantidad.textContent)).toBeCloseTo(x.num('cbc:LineExtensionAmount', l), 0);
    }
  });

  it('todos los valores van en COP y con dos decimales (FAD15, FAS03, FAU03...)', () => {
    const montos = xml.match(/<cbc:\w*Amount[^>]*>[^<]*<\/cbc:\w*Amount>/g)!;
    expect(montos.length).toBeGreaterThan(20);
    for (const m of montos) expect(m).toMatch(/currencyID="COP">\d+\.\d{2}</);
  });

  it('el motor de recepción lee de vuelta las mismas cifras', () => {
    const r = parseDianXml(xml);
    expect(r.excepciones.filter((e) => e.codigo.startsWith('DESCUADRE'))).toEqual([]);
    expect(r.documento!.totales.total).toBe(fiscal.total);
    expect(r.documento!.resumen.iva).toBe(2300);
    expect(r.documento!.resumen.inc).toBe(1600);
    expect(r.documento!.lineas).toHaveLength(4);
  });
});

describe('construirXmlFactura — otros casos', () => {
  it('producción marca ambiente 1 en ProfileExecutionID y en el UUID', () => {
    const x = leer(construirXmlFactura(facturaBase({ emisor: { ...facturaBase().emisor, ambiente: 'produccion' } }), extension));
    expect(x.texto('cbc:ProfileExecutionID')).toBe('1');
    expect(x.todos('cbc:UUID')[0].getAttribute('schemeID')).toBe('1');
  });

  it('documento equivalente POS: perfil, tipo 20, CUDE, consumidor final y bloque del fabricante del software', () => {
    const xml = construirXmlFactura(facturaBase({
      tipoDocumento: 'documento_equivalente',
      adquirente: { tipoDocumento: '13', numeroDocumento: '222222222222', nombreORazonSocial: 'Consumidor final' },
      items: [{ descripcion: 'Café', cantidad: 2, precioUnitario: 4500, subtotal: 9000 }],
      pago: { metodo: 'efectivo' },
    }), extension);
    const x = leer(xml);
    expect(x.errores).toEqual([]);
    expect(x.texto('cbc:ProfileID')).toBe('DIAN 2.1: Documento Equivalente POS');
    expect(x.texto('cbc:InvoiceTypeCode')).toBe('20');
    expect(x.todos('cbc:UUID')[0].getAttribute('schemeName')).toBe('CUDE-SHA384');
    expect(x.texto('cac:AccountingCustomerParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID')).toBe('222222222222');
    expect(x.texto('cac:AccountingCustomerParty/cbc:AdditionalAccountID')).toBe('2');
    const fabricante = 'ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent/FabricanteSoftware/InformacionDelFabricanteDelSoftware';
    expect(x.todos(`${fabricante}/Name`).map((n) => n.textContent)).toEqual(['NombreApellido', 'RazonSocial', 'NombreSoftware']);
    // Sin tributos: no hay TaxTotal de encabezado y el emisor no declara IVA.
    expect(x.todos('cac:TaxTotal')).toHaveLength(0);
    expect(x.texto('cac:AccountingSupplierParty/cac:Party/cac:PartyTaxScheme/cac:TaxScheme/cbc:ID')).toBe('ZZ');
    expect(x.texto('cac:PaymentMeans/cbc:PaymentMeansCode')).toBe('10');
  });

  it('a crédito informa forma 2 y fecha de vencimiento', () => {
    const x = leer(construirXmlFactura(facturaBase({ pago: { metodo: 'efectivo', aCredito: true, fechaVencimiento: '2026-11-01' } }), extension));
    expect(x.texto('cac:PaymentMeans/cbc:ID')).toBe('2');
    expect(x.texto('cac:PaymentMeans/cbc:PaymentDueDate')).toBe('2026-11-01');
  });

  it('frena la emisión, con un mensaje útil, si el municipio del perfil no se reconoce', () => {
    const f = facturaBase({ emisor: { ...facturaBase().emisor, municipioCodigo: 'Ciudad Gótica' } });
    expect(() => construirXmlFactura(f, extension)).toThrowError(/No se reconoce el municipio/);
  });

  it('frena si el número trae caracteres que la DIAN no admite (FAD05a)', () => {
    expect(() => construirXmlFactura(facturaBase({ numeroFactura: 'FV-2 233' }), extension)).toThrowError(/solo letras y números/);
  });

  it('frena si a la numeración le falta la vigencia (FAB07/FAB08)', () => {
    expect(() => construirXmlFactura(facturaBase(), { ...extension, authorizationEndDate: undefined })).toThrowError(/vigencia/);
  });
});

describe('construirXmlNotaAjuste', () => {
  const factura = facturaBase();
  const nota = (tipo: 'credito' | 'debito'): NotaAjusteDian => ({
    clienteId: 'cliente-1', perfilFiscalId: 'perfil-1', facturaId: 'f1', tipo, numeroNota: tipo === 'credito' ? 'NC12' : 'ND7',
    conceptoCodigo: '2', motivo: 'Anulación', estado: 'pending', cude: 'c'.repeat(96), total: 0, fechaEmision: '2026-10-03T02:00:00.000Z',
  });

  it('nota crédito: raíz, perfil, tipo 91, referencia a la factura con su CUFE y sin control de numeración', () => {
    const x = leer(construirXmlNotaAjuste(nota('credito'), factura, { ...extension, prefix: 'NC' }));
    expect(x.errores).toEqual([]);
    expect(x.doc.documentElement!.nodeName).toBe('CreditNote');
    expect(x.texto('cbc:CustomizationID')).toBe('20');
    expect(x.texto('cbc:ProfileID')).toBe('DIAN 2.1: Nota Crédito de Factura Electrónica de Venta');
    expect(x.texto('cbc:CreditNoteTypeCode')).toBe('91');
    expect(x.texto('cac:DiscrepancyResponse/cbc:ResponseCode')).toBe('2');
    expect(x.texto('cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID')).toBe('SETP990000001');
    expect(x.texto('cac:BillingReference/cac:InvoiceDocumentReference/cbc:UUID')).toBe('a'.repeat(96));
    expect(x.texto('cac:BillingReference/cac:InvoiceDocumentReference/cbc:IssueDate')).toBe('2026-10-02');
    expect(x.todos('ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent/sts:DianExtensions/sts:InvoiceControl')).toHaveLength(0);
    expect(x.todos('cac:CreditNoteLine')).toHaveLength(4);
    expect(x.todos('cac:CreditNoteLine/cbc:CreditedQuantity')).toHaveLength(4);
    expect(x.num('cac:LegalMonetaryTotal/cbc:PayableAmount')).toBe(56899.99);
  });

  it('nota débito: raíz, líneas y totales propios', () => {
    const x = leer(construirXmlNotaAjuste(nota('debito'), factura, { ...extension, prefix: 'ND' }));
    expect(x.doc.documentElement!.nodeName).toBe('DebitNote');
    expect(x.texto('cbc:CustomizationID')).toBe('30');
    expect(x.todos('cbc:CreditNoteTypeCode')).toHaveLength(0);
    expect(x.todos('cac:DebitNoteLine/cbc:DebitedQuantity')).toHaveLength(4);
    expect(x.num('cac:RequestedMonetaryTotal/cbc:PayableAmount')).toBe(56899.99);
  });
});

describe('datos de apoyo', () => {
  it('dígito de verificación del NIT (algoritmo DIAN)', () => {
    expect(digitoVerificacionNit('800197268')).toBe('4'); // NIT de la DIAN
    expect(digitoVerificacionNit('900123456')).toBe('8');
    expect(digitoVerificacionNit('860002964')).toBe('4'); // Banco de Bogotá
  });

  it('identifica al adquirente: consumidor final, cédula y NIT', () => {
    expect(identificarAdquirente({ tipoDocumento: '13', numeroDocumento: '', nombreORazonSocial: '' }))
      .toMatchObject({ numero: '222222222222', esConsumidorFinal: true, tipoPersona: '2' });
    expect(identificarAdquirente({ tipoDocumento: '13', numeroDocumento: '1.234.567', nombreORazonSocial: 'A' }))
      .toMatchObject({ tipo: '13', numero: '1234567', tipoPersona: '2' });
    expect(identificarAdquirente({ tipoDocumento: '31', numeroDocumento: '800197268', nombreORazonSocial: 'DIAN' }))
      .toMatchObject({ tipo: '31', numero: '800197268', dv: '4', tipoPersona: '1' });
  });

  it('resuelve el municipio por código, nombre oficial o nombre común', () => {
    expect(resolverUbicacionDian('11001')).toMatchObject({ municipioNombre: 'Bogotá, D.C.', departamentoCodigo: '11' });
    expect(resolverUbicacionDian('bogota')?.municipioCodigo).toBe('11001');
    expect(resolverUbicacionDian('Medellín', 'Antioquia')?.municipioCodigo).toBe('05001');
    expect(resolverUbicacionDian('Cali')?.municipioCodigo).toBe('76001');
    expect(resolverUbicacionDian('Cúcuta')?.municipioCodigo).toBe('54001');
    // Homónimos: sin departamento no adivina; con departamento sí.
    expect(resolverUbicacionDian('San Francisco')).toBeNull();
    expect(resolverUbicacionDian('San Francisco', 'Putumayo')?.municipioCodigo).toBe('86755');
    expect(resolverUbicacionDian('99999')).toBeNull();
    expect(resolverUbicacionDian('')).toBeNull();
  });
});
