/**
 * Generador de XML UBL 2.1 para la Factura Electrónica de Venta y para el
 * Documento Equivalente Electrónico POS (ambos con raíz `Invoice`; cuál se
 * emite lo decide decidirTipoDocumentoDian() en types.ts).
 *
 * Estructura revisada contra TODAS las reglas de rechazo del Anexo Técnico
 * de Factura Electrónica v1.9 y del Anexo de Documento Equivalente v1.0
 * (vendorizados en docs/electronic-invoicing/dian-sources/). Los bloques
 * viven en ublComun.ts con el código de la regla que los exige.
 *
 * Qué corrige frente a la versión anterior, que la DIAN habría rechazado:
 *   · Impuestos del encabezado sin desglose por tributo/tarifa (FAS01/FAS04).
 *   · Sin cac:PaymentMeans (FAN01).
 *   · Emisor sin tipo de persona, dirección, responsabilidades ni prefijo
 *     (FAJ02, FAJ28, FAJ26, FAJ49); adquirente sin identificación (FAK).
 *   · ProfileID/CustomizationID/ProfileExecutionID equivocados o ausentes
 *     (FAD02, FAD03, FAD04) y UUID sin ambiente (FAD07).
 *   · Hora en UTC rotulada como -05:00, distinta de la usada en el CUFE (FAD06).
 *   · Líneas sin unidad de medida (FAV05) y totales que no salían de las
 *     líneas (FAU02..FAU14).
 *   · Documento POS emitido con el encabezado de una factura, sin el bloque
 *     FabricanteSoftware que su anexo exige.
 *
 * Determinístico: mismo input → mismo XML. La firma XAdES se agrega después,
 * sobre este XML ya construido (electron/dianXadesSigner.js o la Edge
 * Function dian-emision).
 *
 * El emisor viene del snapshot `factura.emisor`, congelado al emitir: el XML
 * de una factura vieja nunca cambia aunque el perfil fiscal se edite después.
 */
import type { FacturaElectronicaDian } from './types';
import { construirBloqueDianExtensions, NAMESPACES_DIAN, type DianExtensionData } from './dianExtensionsBlock';
import { calcularDocumentoFiscal, fechaColombia, horaColombia } from './documentoFiscal';
import {
  bloqueAdquirente, bloqueEmisor, bloqueLineas, bloquePago, bloqueTotales, bloqueTributosDocumento,
  escapeXml, MONEDA, DatosFiscalesIncompletos,
} from './ublComun';

export type { DianExtensionData };

/** Quién fabrica el software — bloque obligatorio del Documento Equivalente POS. */
const FABRICANTE_SOFTWARE = `    <ext:UBLExtension>
      <ext:ExtensionContent>
        <FabricanteSoftware>
          <InformacionDelFabricanteDelSoftware>
            <Name>NombreApellido</Name>
            <Value>Codec Studio</Value>
            <Name>RazonSocial</Name>
            <Value>Codec Studio</Value>
            <Name>NombreSoftware</Name>
            <Value>CODEC POS</Value>
          </InformacionDelFabricanteDelSoftware>
        </FabricanteSoftware>
      </ext:ExtensionContent>
    </ext:UBLExtension>`;

export function construirXmlFactura(factura: FacturaElectronicaDian, extension: DianExtensionData): string {
  const emisor = factura.emisor;
  const esPos = factura.tipoDocumento === 'documento_equivalente';
  const ambiente = emisor.ambiente === 'produccion' ? '1' : '2';

  // FAD05a: el número solo admite letras y números.
  if (!/^[A-Za-z0-9]+$/.test(factura.numeroFactura)) {
    throw new DatosFiscalesIncompletos(`El número "${factura.numeroFactura}" tiene caracteres que la DIAN no admite (solo letras y números, sin espacios ni guiones). Revisa el prefijo de la numeración.`);
  }
  if (factura.items.length === 0) throw new DatosFiscalesIncompletos('El documento no tiene ítems.');

  const doc = calcularDocumentoFiscal(factura.items);
  const fecha = fechaColombia(factura.fechaEmision);
  const cobraIva = doc.tributos.some((t) => t.codigo === '01');

  const extensiones = construirBloqueDianExtensions(emisor, extension, esPos ? FABRICANTE_SOFTWARE : '');

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
         ${NAMESPACES_DIAN}>
${extensiones}
  <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>10</cbc:CustomizationID>
  <cbc:ProfileID>${esPos ? 'DIAN 2.1: Documento Equivalente POS' : 'DIAN 2.1: Factura Electrónica de Venta'}</cbc:ProfileID>
  <cbc:ProfileExecutionID>${ambiente}</cbc:ProfileExecutionID>
  <cbc:ID>${escapeXml(factura.numeroFactura)}</cbc:ID>
  <cbc:UUID schemeID="${ambiente}" schemeName="${esPos ? 'CUDE-SHA384' : 'CUFE-SHA384'}">${escapeXml(factura.cufe || '')}</cbc:UUID>
  <cbc:IssueDate>${fecha}</cbc:IssueDate>
  <cbc:IssueTime>${horaColombia(factura.fechaEmision)}</cbc:IssueTime>
  <cbc:InvoiceTypeCode>${esPos ? '20' : '01'}</cbc:InvoiceTypeCode>
  ${MONEDA}
  <cbc:LineCountNumeric>${doc.lineas.length}</cbc:LineCountNumeric>
${bloqueEmisor(emisor, extension.prefix, cobraIva)}
${bloqueAdquirente(factura.adquirente)}
${bloquePago(factura.pago, fecha)}
${[bloqueTributosDocumento(doc), bloqueTotales(doc), bloqueLineas(doc.lineas, 'InvoiceLine', 'InvoicedQuantity')].filter(Boolean).join('\n')}
</Invoice>`;
}
