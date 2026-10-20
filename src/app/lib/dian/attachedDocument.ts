/**
 * AttachedDocument (contenedor electrónico) — Anexo Técnico v1.9, §
 * «Documento AttachedDocument».
 *
 * Es lo que la ley obliga a entregarle al comprador junto con el PDF: un XML
 * que lleva adentro la factura firmada por el emisor y el ApplicationResponse
 * con el que la DIAN la validó. Se firma igual que la factura (XAdES), así
 * que sale con un ext:UBLExtensions vacío para que el firmador inserte la
 * firma.
 *
 * Los datos del emisor y del comprador se copian del XML ya validado (no del
 * perfil ni de la venta): así el contenedor dice exactamente lo mismo que la
 * factura que aceptó la DIAN.
 */
import { escapeXml } from './ublComun';
import { fechaColombia, horaColombia } from './documentoFiscal';
import type { AmbienteDian } from './types';

export interface DatosAttachedDocument {
  /** Factura firmada tal como se envió a la DIAN. */
  xmlFactura: string;
  /** ApplicationResponse que devolvió la DIAN (XmlBase64Bytes ya decodificado). */
  xmlApplicationResponse: string;
  numero: string;
  cufe: string;
  ambiente: AmbienteDian;
  ahora?: Date;
}

const sinDeclaracion = (xml: string) => xml.replace(/^﻿?\s*<\?xml[^>]*\?>\s*/, '');

/** Un XML dentro de CDATA; si trae «]]>» se parte para no cerrar el bloque antes de tiempo. */
const cdata = (xml: string) => `<![CDATA[${xml.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;

const bloque = (xml: string, nombre: string): string | undefined =>
  xml.match(new RegExp(`<(?:\\w+:)?${nombre}(?:\\s[^>]*)?>[\\s\\S]*?</(?:\\w+:)?${nombre}>`))?.[0];

const textoDe = (xml: string | undefined, nombre: string): string | undefined =>
  xml?.match(new RegExp(`<(?:\\w+:)?${nombre}(?:\\s[^>]*)?>([^<]*)</(?:\\w+:)?${nombre}>`))?.[1]?.trim();

/**
 * PartyTaxScheme de una parte de la factura (emisor o comprador), sin la
 * dirección: el contenedor solo identifica a las partes.
 */
function partyTaxScheme(xmlFactura: string, parte: 'AccountingSupplierParty' | 'AccountingCustomerParty'): string {
  const contenedor = bloque(xmlFactura, parte);
  const esquema = contenedor && bloque(contenedor, 'PartyTaxScheme');
  if (!esquema) throw new Error(`La factura no trae ${parte}/PartyTaxScheme: no se puede armar el contenedor para el cliente`);
  return esquema.replace(/<cac:RegistrationAddress>[\s\S]*?<\/cac:RegistrationAddress>/, '');
}

export function construirAttachedDocument(datos: DatosAttachedDocument): string {
  const { xmlFactura, xmlApplicationResponse, numero, cufe, ambiente } = datos;
  const ahora = datos.ahora ?? new Date();

  const codigoRespuesta = textoDe(bloque(xmlApplicationResponse, 'Response') ?? xmlApplicationResponse, 'ResponseCode');
  if (codigoRespuesta && codigoRespuesta !== '02') {
    throw new Error(`La respuesta de la DIAN no es de aceptación (código ${codigoRespuesta})`);
  }
  // Fecha y hora en que la DIAN validó: las del ApplicationResponse.
  const fechaValidacion = textoDe(xmlApplicationResponse, 'IssueDate') ?? fechaColombia(ahora);
  const horaValidacion = textoDe(xmlApplicationResponse, 'IssueTime') ?? horaColombia(ahora);
  const fechaFactura = textoDe(xmlFactura, 'IssueDate') ?? fechaValidacion;

  return '<?xml version="1.0" encoding="UTF-8" standalone="no"?>' +
    '<AttachedDocument xmlns="urn:oasis:names:specification:ubl:schema:xsd:AttachedDocument-2"' +
    ' xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"' +
    ' xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"' +
    ' xmlns:ccts="urn:un:unece:uncefact:data:specification:CoreComponentTypeSchemaModule:2"' +
    ' xmlns:ds="http://www.w3.org/2000/09/xmldsig#"' +
    ' xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"' +
    ' xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"' +
    ' xmlns:xades141="http://uri.etsi.org/01903/v1.4.1#">' +
    '<ext:UBLExtensions></ext:UBLExtensions>' +
    '<cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>' +
    '<cbc:CustomizationID>Documentos adjuntos</cbc:CustomizationID>' +
    '<cbc:ProfileID>Factura Electrónica de Venta</cbc:ProfileID>' +
    `<cbc:ProfileExecutionID>${ambiente === 'produccion' ? 1 : 2}</cbc:ProfileExecutionID>` +
    `<cbc:ID>${escapeXml(numero)}</cbc:ID>` +
    `<cbc:IssueDate>${fechaColombia(ahora)}</cbc:IssueDate>` +
    `<cbc:IssueTime>${horaColombia(ahora)}</cbc:IssueTime>` +
    '<cbc:DocumentType>Contenedor de Factura Electrónica</cbc:DocumentType>' +
    `<cbc:ParentDocumentID>${escapeXml(numero)}</cbc:ParentDocumentID>` +
    `<cac:SenderParty>${partyTaxScheme(xmlFactura, 'AccountingSupplierParty')}</cac:SenderParty>` +
    `<cac:ReceiverParty>${partyTaxScheme(xmlFactura, 'AccountingCustomerParty')}</cac:ReceiverParty>` +
    '<cac:Attachment><cac:ExternalReference>' +
    '<cbc:MimeCode>text/xml</cbc:MimeCode><cbc:EncodingCode>UTF-8</cbc:EncodingCode>' +
    `<cbc:Description>${cdata(sinDeclaracion(xmlFactura))}</cbc:Description>` +
    '</cac:ExternalReference></cac:Attachment>' +
    '<cac:ParentDocumentLineReference>' +
    '<cbc:LineID>1</cbc:LineID>' +
    '<cac:DocumentReference>' +
    `<cbc:ID>${escapeXml(numero)}</cbc:ID>` +
    `<cbc:UUID schemeName="CUFE-SHA384">${escapeXml(cufe)}</cbc:UUID>` +
    `<cbc:IssueDate>${escapeXml(fechaFactura)}</cbc:IssueDate>` +
    '<cbc:DocumentType>ApplicationResponse</cbc:DocumentType>' +
    '<cac:Attachment><cac:ExternalReference>' +
    '<cbc:MimeCode>text/xml</cbc:MimeCode><cbc:EncodingCode>UTF-8</cbc:EncodingCode>' +
    `<cbc:Description>${cdata(sinDeclaracion(xmlApplicationResponse))}</cbc:Description>` +
    '</cac:ExternalReference></cac:Attachment>' +
    '<cac:ResultOfVerification>' +
    '<cbc:ValidatorID>Unidad Especial Dirección de Impuestos y Aduanas Nacionales</cbc:ValidatorID>' +
    '<cbc:ValidationResultCode>02</cbc:ValidationResultCode>' +
    `<cbc:ValidationDate>${escapeXml(fechaValidacion)}</cbc:ValidationDate>` +
    `<cbc:ValidationTime>${escapeXml(horaValidacion)}</cbc:ValidationTime>` +
    '</cac:ResultOfVerification>' +
    '</cac:DocumentReference>' +
    '</cac:ParentDocumentLineReference>' +
    '</AttachedDocument>';
}

/**
 * Nombres de archivo de la entrega según el anexo: «ad» para el XML y «z»
 * para el ZIP, seguidos del NIT a 10 dígitos, el código del proveedor
 * tecnológico (000 en software propio), el año a 2 dígitos y un consecutivo
 * de 8 dígitos hexadecimales.
 */
export function nombresArchivoEntrega(nit: string, consecutivo: number, ahora = new Date()): { xml: string; zip: string } {
  const base = `${nit.replace(/\D/g, '').padStart(10, '0').slice(-10)}000${fechaColombia(ahora).slice(2, 4)}` +
    `${(consecutivo >>> 0).toString(16).padStart(8, '0').slice(-8)}`;
  return { xml: `ad${base}.xml`, zip: `z${base}.zip` };
}
