/**
 * Generador de XML UBL 2.1 para notas de ajuste (crédito/débito) sobre una
 * factura electrónica ya emitida. Misma base pública de UBL que
 * xmlBuilder.ts (CreditNote / DebitNote en vez de Invoice), con la
 * referencia obligatoria a la factura original (`cac:BillingReference`,
 * incluyendo su CUFE) — sin eso la DIAN no puede asociar la nota a la
 * factura que ajusta.
 *
 * El bloque `ext:UBLExtensions/sts:DianExtensions` usa la misma estructura
 * confirmada que factura/documento equivalente (ver dianExtensionsBlock.ts).
 *
 * ⚠️ PENDIENTE: la firma XAdES (ds:Signature) todavía no se inserta aquí —
 * la aplica electron/dianSigner.js sobre el XML ya construido.
 *
 * Recibe la nota Y la factura original — nunca relee el perfil fiscal en
 * vivo; el emisor de la nota es siempre el mismo snapshot congelado que
 * quedó en la factura que está ajustando (no tendría sentido fiscal emitir
 * una nota bajo una identidad distinta a la de la factura original).
 */
import type { NotaAjusteDian, FacturaElectronicaDian } from './types';
import { construirBloqueDianExtensions, NAMESPACES_DIAN, type DianExtensionData } from './dianExtensionsBlock';

function escapeXml(valor: string | number | undefined | null): string {
  if (valor === undefined || valor === null) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function money(n: number): string {
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

export function construirXmlNotaAjuste(nota: NotaAjusteDian, facturaOriginal: FacturaElectronicaDian, extension: DianExtensionData): string {
  const emisor = facturaOriginal.emisor;
  const fecha = new Date(nota.fechaEmision);
  const fechaISO = fecha.toISOString().slice(0, 10);
  const horaISO = fecha.toISOString().slice(11, 19);
  const raiz = nota.tipo === 'credito' ? 'CreditNote' : 'DebitNote';
  const nsRaiz = nota.tipo === 'credito'
    ? 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2'
    : 'urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2';
  const lineaTag = nota.tipo === 'credito' ? 'CreditNoteLine' : 'DebitNoteLine';
  const cantidadTag = nota.tipo === 'credito' ? 'CreditedQuantity' : 'DebitedQuantity';

  const items = nota.items && nota.items.length > 0 ? nota.items : facturaOriginal.items;
  const subtotal = nota.subtotal ?? facturaOriginal.subtotal;
  const totalImpuestos = nota.totalImpuestos ?? facturaOriginal.totalImpuestos;

  const lineas = items
    .map((item, i) => {
      const impuestosLinea = (item.impuestos || [])
        .map(
          (imp) => `
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="COP">${money(imp.valor)}</cbc:TaxAmount>
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="COP">${money(item.subtotal)}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="COP">${money(imp.valor)}</cbc:TaxAmount>
          <cbc:Percent>${imp.porcentaje ?? 0}</cbc:Percent>
          <cac:TaxCategory>
            <cac:TaxScheme>
              <cbc:ID>${escapeXml(imp.codigo)}</cbc:ID>
            </cac:TaxScheme>
          </cac:TaxCategory>
        </cac:TaxSubtotal>
      </cac:TaxTotal>`
        )
        .join('');

      return `
    <cac:${lineaTag}>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:${cantidadTag}>${item.cantidad}</cbc:${cantidadTag}>
      <cbc:LineExtensionAmount currencyID="COP">${money(item.subtotal)}</cbc:LineExtensionAmount>${impuestosLinea}
      <cac:Item>
        <cbc:Description>${escapeXml(item.descripcion)}</cbc:Description>
        ${item.codigo ? `<cac:SellersItemIdentification><cbc:ID>${escapeXml(item.codigo)}</cbc:ID></cac:SellersItemIdentification>` : ''}
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="COP">${money(item.precioUnitario)}</cbc:PriceAmount>
      </cac:Price>
    </cac:${lineaTag}>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<${raiz} xmlns="${nsRaiz}"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
         ${NAMESPACES_DIAN}>
${construirBloqueDianExtensions(emisor, extension)}
  <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>${emisor.ambiente === 'produccion' ? '1' : '2'}</cbc:CustomizationID>
  <cbc:ID>${escapeXml(nota.numeroNota)}</cbc:ID>
  <cbc:UUID schemeName="CUDE-SHA384">${escapeXml(nota.cude || '')}</cbc:UUID>
  <cbc:IssueDate>${fechaISO}</cbc:IssueDate>
  <cbc:IssueTime>${horaISO}-05:00</cbc:IssueTime>
  <cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode>
  <cbc:DiscrepancyResponse>
    <cbc:ReferenceID>${escapeXml(facturaOriginal.numeroFactura)}</cbc:ReferenceID>
    <cbc:ResponseCode>${escapeXml(nota.conceptoCodigo || '')}</cbc:ResponseCode>
    <cbc:Description>${escapeXml(nota.motivo)}</cbc:Description>
  </cbc:DiscrepancyResponse>

  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${escapeXml(facturaOriginal.numeroFactura)}</cbc:ID>
      <cbc:UUID schemeName="CUFE-SHA384">${escapeXml(facturaOriginal.cufe || '')}</cbc:UUID>
      <cbc:IssueDate>${new Date(facturaOriginal.fechaEmision).toISOString().slice(0, 10)}</cbc:IssueDate>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>

  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${escapeXml(emisor.nombreComercial || emisor.nombreORazonSocial)}</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>${escapeXml(emisor.nombreORazonSocial)}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="${escapeXml(emisor.digitoVerificacion)}">${escapeXml(emisor.nit)}</cbc:CompanyID>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(emisor.nombreORazonSocial)}</cbc:RegistrationName>
        <cbc:CompanyID>${escapeXml(emisor.nit)}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${escapeXml(facturaOriginal.adquirente.nombreORazonSocial)}</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>${escapeXml(facturaOriginal.adquirente.nombreORazonSocial)}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="${escapeXml(facturaOriginal.adquirente.digitoVerificacion)}">${escapeXml(facturaOriginal.adquirente.numeroDocumento)}</cbc:CompanyID>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(facturaOriginal.adquirente.nombreORazonSocial)}</cbc:RegistrationName>
        <cbc:CompanyID>${escapeXml(facturaOriginal.adquirente.numeroDocumento)}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="COP">${money(totalImpuestos)}</cbc:TaxAmount>
  </cac:TaxTotal>

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="COP">${money(subtotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="COP">${money(subtotal)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="COP">${money(nota.total)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="COP">${money(nota.total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${lineas}
</${raiz}>`;
}
