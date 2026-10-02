/**
 * Generador de XML UBL 2.1 para notas de ajuste (crédito/débito) sobre una
 * factura electrónica ya emitida. Usa los mismos bloques que la factura
 * (ublComun.ts), revisados contra las reglas de rechazo del Anexo Técnico
 * v1.9, más lo propio de una nota:
 *   · cac:DiscrepancyResponse (concepto de la corrección) y
 *     cac:BillingReference con el CUFE de la factura que ajusta — sin eso la
 *     DIAN no puede asociar la nota a su factura.
 *   · Sin sts:InvoiceControl: las notas no tienen resolución de numeración.
 *   · La nota débito totaliza en cac:RequestedMonetaryTotal.
 *
 * Recibe la nota Y la factura original — nunca relee el perfil fiscal en
 * vivo; el emisor de la nota es siempre el mismo snapshot congelado que
 * quedó en la factura que está ajustando.
 *
 * La firma XAdES se agrega después, sobre este XML ya construido.
 */
import type { NotaAjusteDian, FacturaElectronicaDian } from './types';
import { construirBloqueDianExtensions, NAMESPACES_DIAN, type DianExtensionData } from './dianExtensionsBlock';
import { calcularDocumentoFiscal, fechaColombia, horaColombia } from './documentoFiscal';
import {
  bloqueAdquirente, bloqueEmisor, bloqueLineas, bloquePago, bloqueTotales, bloqueTributosDocumento,
  escapeXml, MONEDA, DatosFiscalesIncompletos,
} from './ublComun';

export function construirXmlNotaAjuste(nota: NotaAjusteDian, facturaOriginal: FacturaElectronicaDian, extension: DianExtensionData): string {
  const emisor = facturaOriginal.emisor;
  const esCredito = nota.tipo === 'credito';
  const raiz = esCredito ? 'CreditNote' : 'DebitNote';
  const ambiente = emisor.ambiente === 'produccion' ? '1' : '2';

  const items = nota.items && nota.items.length > 0 ? nota.items : facturaOriginal.items;
  if (items.length === 0) {
    throw new DatosFiscalesIncompletos('La nota no tiene ítems: la factura original no conserva su detalle. Vuelve a abrir la factura e inténtalo de nuevo.');
  }
  if (!/^[A-Za-z0-9]+$/.test(nota.numeroNota)) {
    throw new DatosFiscalesIncompletos(`El número de nota "${nota.numeroNota}" tiene caracteres que la DIAN no admite (solo letras y números).`);
  }

  const doc = calcularDocumentoFiscal(items);
  const fecha = fechaColombia(nota.fechaEmision);
  const cobraIva = doc.tributos.some((t) => t.codigo === '01');

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<${raiz} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${raiz}-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
         ${NAMESPACES_DIAN}>
${construirBloqueDianExtensions(emisor, extension, '', false)}
  <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>${esCredito ? '20' : '30'}</cbc:CustomizationID>
  <cbc:ProfileID>DIAN 2.1: Nota ${esCredito ? 'Crédito' : 'Débito'} de Factura Electrónica de Venta</cbc:ProfileID>
  <cbc:ProfileExecutionID>${ambiente}</cbc:ProfileExecutionID>
  <cbc:ID>${escapeXml(nota.numeroNota)}</cbc:ID>
  <cbc:UUID schemeID="${ambiente}" schemeName="CUDE-SHA384">${escapeXml(nota.cude || '')}</cbc:UUID>
  <cbc:IssueDate>${fecha}</cbc:IssueDate>
  <cbc:IssueTime>${horaColombia(nota.fechaEmision)}</cbc:IssueTime>${esCredito ? `
  <cbc:CreditNoteTypeCode>91</cbc:CreditNoteTypeCode>` : ''}
  ${MONEDA}
  <cbc:LineCountNumeric>${doc.lineas.length}</cbc:LineCountNumeric>
  <cac:DiscrepancyResponse>
    <cbc:ReferenceID>${escapeXml(facturaOriginal.numeroFactura)}</cbc:ReferenceID>
    <cbc:ResponseCode>${escapeXml(nota.conceptoCodigo || '')}</cbc:ResponseCode>
    <cbc:Description>${escapeXml(nota.motivo)}</cbc:Description>
  </cac:DiscrepancyResponse>
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${escapeXml(facturaOriginal.numeroFactura)}</cbc:ID>
      <cbc:UUID schemeName="CUFE-SHA384">${escapeXml(facturaOriginal.cufe || '')}</cbc:UUID>
      <cbc:IssueDate>${fechaColombia(facturaOriginal.fechaEmision)}</cbc:IssueDate>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>
${bloqueEmisor(emisor, facturaOriginal.prefijo || extension.prefix, cobraIva)}
${bloqueAdquirente(facturaOriginal.adquirente)}
${bloquePago(facturaOriginal.pago, fecha)}
${[
    bloqueTributosDocumento(doc),
    bloqueTotales(doc, esCredito ? 'LegalMonetaryTotal' : 'RequestedMonetaryTotal'),
    bloqueLineas(doc.lineas, esCredito ? 'CreditNoteLine' : 'DebitNoteLine', esCredito ? 'CreditedQuantity' : 'DebitedQuantity'),
  ].filter(Boolean).join('\n')}
</${raiz}>`;
}
