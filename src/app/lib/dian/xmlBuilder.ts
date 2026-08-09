/**
 * Generador de XML UBL 2.1 para la factura electrónica de venta / documento
 * equivalente POS (mismo root `Invoice`, ver decidirTipoDocumentoDian en
 * types.ts).
 *
 * La estructura base (Invoice, AccountingSupplierParty, AccountingCustomerParty,
 * InvoiceLine, TaxTotal, LegalMonetaryTotal) sigue el estándar OASIS UBL 2.1
 * público. El bloque `ext:UBLExtensions/sts:DianExtensions` (InvoiceControl,
 * InvoiceSource, SoftwareProvider, SoftwareSecurityCode, AuthorizationProvider,
 * QRCode) está confirmado campo a campo contra un documento real, firmado y
 * aceptado, descargado de una fuente pública verificable — no es una
 * reconstrucción a partir solo de la tabla de datos del anexo (ver
 * docs/electronic-invoicing/dian-sources/).
 *
 * ⚠️ PENDIENTE: el elemento `ds:Signature` (XAdES) todavía no se inserta
 * aquí — lo aplica electron/dianSigner.js sobre el XML ya construido, antes
 * de transmitirlo (ver signatureProvider.ts). Códigos exactos de
 * municipio/departamento (DIVIPOLA) y de unidad de medida se usan tal cual
 * vengan del snapshot del emisor, no se validan aquí.
 *
 * Determinístico: mismo input → mismo XML. Sin dependencias de UI ni de red
 * — se puede testear con datos fijos.
 *
 * Recibe SOLO la factura (no el perfil fiscal en vivo): el emisor viene del
 * snapshot `factura.emisor`, congelado al momento de emitir — así el XML
 * regenerado de una factura vieja nunca cambia aunque el perfil fiscal se
 * haya editado o reemplazado después (ver types.ts, EmisorSnapshot).
 *
 * El segundo parámetro `extension` trae los datos que solo existen en el
 * momento de la emisión (número de resolución vigente en ese instante,
 * SoftwareSecurityCode ya calculado, URL de QR) — se pasan explícitos en
 * vez de recalcularse aquí para no mezclar cómputo de hashes con
 * construcción de XML (mismo principio que ya seguía el CUFE).
 */

import type { FacturaElectronicaDian } from './types';
import { construirBloqueDianExtensions, NAMESPACES_DIAN, type DianExtensionData } from './dianExtensionsBlock';
export type { DianExtensionData };

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

export function construirXmlFactura(factura: FacturaElectronicaDian, extension: DianExtensionData): string {
  const emisor = factura.emisor;
  const fecha = new Date(factura.fechaEmision);
  const fechaISO = fecha.toISOString().slice(0, 10);
  const horaISO = fecha.toISOString().slice(11, 19);

  const lineas = factura.items
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
    <cac:InvoiceLine>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:InvoicedQuantity>${item.cantidad}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="COP">${money(item.subtotal)}</cbc:LineExtensionAmount>${impuestosLinea}
      <cac:Item>
        <cbc:Description>${escapeXml(item.descripcion)}</cbc:Description>
        ${item.codigo ? `<cac:SellersItemIdentification><cbc:ID>${escapeXml(item.codigo)}</cbc:ID></cac:SellersItemIdentification>` : ''}
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="COP">${money(item.precioUnitario)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
         ${NAMESPACES_DIAN}>
${construirBloqueDianExtensions(emisor, extension)}
  <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>${emisor.ambiente === 'produccion' ? '1' : '2'}</cbc:CustomizationID>
  <cbc:ProfileID>DIAN 2.1</cbc:ProfileID>
  <cbc:ID>${escapeXml(factura.numeroFactura)}</cbc:ID>
  <cbc:UUID schemeName="${factura.tipoDocumento === 'documento_equivalente' ? 'CUDE-SHA384' : 'CUFE-SHA384'}">${escapeXml(factura.cufe || '')}</cbc:UUID>
  <cbc:IssueDate>${fechaISO}</cbc:IssueDate>
  <cbc:IssueTime>${horaISO}-05:00</cbc:IssueTime>
  <cbc:InvoiceTypeCode>01</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${factura.items.length}</cbc:LineCountNumeric>

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
      <cac:PartyName><cbc:Name>${escapeXml(factura.adquirente.nombreORazonSocial)}</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>${escapeXml(factura.adquirente.nombreORazonSocial)}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="${escapeXml(factura.adquirente.digitoVerificacion)}">${escapeXml(factura.adquirente.numeroDocumento)}</cbc:CompanyID>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(factura.adquirente.nombreORazonSocial)}</cbc:RegistrationName>
        <cbc:CompanyID>${escapeXml(factura.adquirente.numeroDocumento)}</cbc:CompanyID>
      </cac:PartyLegalEntity>
      ${factura.adquirente.email ? `<cac:Contact><cbc:ElectronicMail>${escapeXml(factura.adquirente.email)}</cbc:ElectronicMail></cac:Contact>` : ''}
    </cac:Party>
  </cac:AccountingCustomerParty>

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="COP">${money(factura.totalImpuestos)}</cbc:TaxAmount>
  </cac:TaxTotal>

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="COP">${money(factura.subtotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="COP">${money(factura.subtotal)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="COP">${money(factura.total)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="COP">${money(factura.total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${lineas}
</Invoice>`;
}
