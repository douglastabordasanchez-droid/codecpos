/**
 * Documentos que Codec POS firma por encargo de Codec Document (B6 y B7 del
 * contrato): el ApplicationResponse de los acuses DIAN de una compra y la
 * nómina electrónica que llega armada y sin firma. Solo texto y SHA-384:
 * sin red ni base de datos, lo prueba vitest (documentos.test.ts).
 */
import forge from 'node-forge';

export const sha384Hex = (texto: string) => forge.md.sha384.create().update(forge.util.encodeUtf8(texto)).digest().toHex();

const escapar = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const DIAN = 'CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)';

/** Fecha y hora de Colombia: { fecha: '2026-11-03', hora: '10:15:00-05:00' }. */
export function ahoraColombia(ahora = new Date()) {
  const local = new Date(ahora.getTime() - 5 * 3600_000).toISOString();
  return { fecha: local.slice(0, 10), hora: `${local.slice(11, 19)}-05:00` };
}

const qr = (ambiente: '1' | '2', clave: string) =>
  `https://${ambiente === '1' ? 'catalogo-vpfe' : 'catalogo-vpfe-hab'}.dian.gov.co/document/searchqr?documentkey=${clave}`;

// ── B6: acuses de una factura de compra ─────────────────────────────────

export interface ParteFactura {
  nit: string; dv?: string | null; nombre: string;
  /** Código DIAN del documento (31 NIT, 13 cédula…). Codec Document manda "31". */
  tipo_doc?: string | null;
  /** 1 jurídica, 2 natural (regla AAF20 y AAG23). */
  tipo_persona?: string | null;
}
export interface EventoAcuse {
  id: string;
  codigo: '030' | '031' | '032' | '033';
  /** URL exacta para sts:QRCode (con el CUFE de la factura), la manda Codec Document. */
  qr?: string | null;
  motivo_reclamo?: string | null;
  nota?: string | null;
  recibio?: { nombres: string; apellidos: string; tipo_doc: string; numero_doc: string; cargo?: string | null } | null;
  factura: {
    cufe: string; numero: string; prefijo?: string | null; tipo?: string | null;
    vendedor: ParteFactura; comprador: ParteFactura;
  };
}

const DESCRIPCION_EVENTO: Record<string, string> = {
  '030': 'Acuse de recibo de Factura Electrónica de Venta',
  '031': 'Reclamo de la Factura Electrónica de Venta',
  '032': 'Recibo del bien y/o prestación del servicio',
  '033': 'Aceptación expresa',
};
const MOTIVO_RECLAMO: Record<string, string> = {
  '01': 'Documento con inconsistencias',
  '02': 'Mercancía no entregada totalmente',
  '03': 'Mercancía no entregada parcialmente',
  '04': 'Servicio no prestado',
};

const soloDigitos = (v: unknown) => String(v ?? '').split('-')[0].replace(/\D/g, '');

/** Dígito de verificación de un NIT (módulo 11 de la DIAN). */
export function digitoVerificacion(nit: string): string {
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const digitos = soloDigitos(nit).split('').reverse();
  const suma = digitos.reduce((s, d, i) => s + Number(d) * (pesos[i] ?? 0), 0);
  const r = suma % 11;
  return String(r > 1 ? 11 - r : r);
}

const dvDe = (p: { nit: string; dv?: string | null }) => {
  const dv = String(p.dv ?? '').replace(/\D/g, '');
  return dv || digitoVerificacion(p.nit);
};

/** Código DIAN del tipo de documento de una persona (regla AAH19): nunca "CC". */
export function codigoDocumentoDian(tipo: unknown): string {
  const t = String(tipo ?? '').trim().toUpperCase().replace(/\./g, '');
  if (/^\d{2}$/.test(t)) return t;
  const mapa: Record<string, string> = {
    CC: '13', CEDULA: '13', 'CÉDULA': '13', CE: '22', PA: '41', PAS: '41', PASAPORTE: '41',
    NIT: '31', TI: '12', RC: '11', TE: '21', NUIP: '91', PEP: '47', PPT: '48', DIE: '50',
  };
  return mapa[t] ?? '13';
}

/**
 * Tipo de persona (1 jurídica, 2 natural). Si no viene, un NIT de 9 dígitos
 * que empieza por 8 o 9 es de empresa; lo demás (cédulas) es persona natural.
 */
export function tipoPersona(p: { nit: string; tipo_persona?: string | null }): string {
  const t = String(p.tipo_persona ?? '').trim();
  if (t === '1' || t === '2') return t;
  const n = soloDigitos(p.nit);
  return n.length === 9 && /^[89]/.test(n) ? '1' : '2';
}

/**
 * CUDE del evento (Anexo Técnico de Factura Electrónica, eventos del
 * ApplicationResponse): SHA-384 de NumDE + FecEmi + HorEmi + NitFE (quien
 * envía el evento) + DocAdq (quien lo recibe) + ResponseCode + ID de la
 * factura + DocumentTypeCode + Software-PIN.
 */
export function cudeEvento(p: {
  numero: string; fecha: string; hora: string; nitEmisor: string; nitReceptor: string;
  codigo: string; facturaId: string; tipoDocumento: string; softwarePin: string;
}): string {
  return sha384Hex(p.numero + p.fecha + p.hora + p.nitEmisor + p.nitReceptor + p.codigo + p.facturaId + p.tipoDocumento + p.softwarePin);
}

const parte = (etiqueta: 'SenderParty' | 'ReceiverParty', p: ParteFactura) =>
  `<cac:${etiqueta}><cac:PartyTaxScheme>` +
  `<cbc:RegistrationName>${escapar(p.nombre)}</cbc:RegistrationName>` +
  `<cbc:CompanyID schemeAgencyID="195" schemeAgencyName="${DIAN}" schemeID="${escapar(dvDe(p))}" schemeName="${escapar(p.tipo_doc || '31')}" schemeVersionID="${tipoPersona(p)}">${escapar(soloDigitos(p.nit))}</cbc:CompanyID>` +
  `<cac:TaxScheme><cbc:ID>01</cbc:ID><cbc:Name>IVA</cbc:Name></cac:TaxScheme>` +
  `</cac:PartyTaxScheme></cac:${etiqueta}>`;

/**
 * ApplicationResponse UBL 2.1 sin firma. Lo envía el comprador (el negocio)
 * al vendedor de la factura. Devuelve el XML y su CUDE.
 */
export function construirApplicationResponse(
  e: EventoAcuse,
  o: { numero: string; softwareId: string; softwarePin: string; ambiente: '1' | '2'; ahora?: Date },
): { xml: string; cude: string } {
  const { fecha, hora } = ahoraColombia(o.ahora);
  const comprador = e.factura.comprador;
  const vendedor = e.factura.vendedor;
  const tipoDocumento = e.factura.tipo || '01';
  const cude = cudeEvento({
    numero: o.numero, fecha, hora, nitEmisor: soloDigitos(comprador.nit), nitReceptor: soloDigitos(vendedor.nit),
    codigo: e.codigo, facturaId: e.factura.numero, tipoDocumento, softwarePin: o.softwarePin,
  });
  const ssc = sha384Hex(o.softwareId + o.softwarePin + o.numero);

  const codigoRespuesta = e.codigo === '031' && e.motivo_reclamo
    ? `<cbc:ResponseCode listID="${escapar(e.motivo_reclamo)}" name="${escapar(MOTIVO_RECLAMO[e.motivo_reclamo] ?? '')}">031</cbc:ResponseCode>`
    : `<cbc:ResponseCode>${e.codigo}</cbc:ResponseCode>`;

  // 030 y 032 dicen quién recibió (la persona del negocio).
  const quienRecibio = (e.codigo === '030' || e.codigo === '032') && e.recibio
    ? `<cac:IssuerParty><cac:Person>` +
      (codigoDocumentoDian(e.recibio.tipo_doc) === '31'
        ? `<cbc:ID schemeAgencyID="195" schemeAgencyName="${DIAN}" schemeID="${digitoVerificacion(e.recibio.numero_doc)}" schemeName="31">${escapar(soloDigitos(e.recibio.numero_doc))}</cbc:ID>`
        : `<cbc:ID schemeAgencyID="195" schemeAgencyName="${DIAN}" schemeName="${codigoDocumentoDian(e.recibio.tipo_doc)}">${escapar(soloDigitos(e.recibio.numero_doc))}</cbc:ID>`) +
      `<cbc:FirstName>${escapar(e.recibio.nombres)}</cbc:FirstName>` +
      `<cbc:FamilyName>${escapar(e.recibio.apellidos)}</cbc:FamilyName>` +
      `<cbc:JobTitle>${escapar(e.recibio.cargo || 'Recibe')}</cbc:JobTitle>` +
      `<cbc:OrganizationDepartment>${escapar(e.recibio.cargo || 'Compras')}</cbc:OrganizationDepartment>` +
      `</cac:Person></cac:IssuerParty>`
    : '';

  const xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>` +
    `<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2"` +
    ` xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"` +
    ` xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"` +
    ` xmlns:ds="http://www.w3.org/2000/09/xmldsig#"` +
    ` xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"` +
    ` xmlns:sts="dian:gov:co:facturaelectronica:Structures-2-1"` +
    ` xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"` +
    ` xmlns:xades141="http://uri.etsi.org/01903/v1.4.1#">` +
    `<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent><sts:DianExtensions>` +
    `<sts:InvoiceSource><cbc:IdentificationCode listAgencyID="6" listAgencyName="United Nations Economic Commission for Europe" listSchemeURI="urn:oasis:names:specification:ubl:codelist:gc:CountryIdentificationCode-2.1">CO</cbc:IdentificationCode></sts:InvoiceSource>` +
    `<sts:SoftwareProvider>` +
    `<sts:ProviderID schemeAgencyID="195" schemeAgencyName="${DIAN}" schemeID="${escapar(dvDe(comprador))}" schemeName="31">${escapar(soloDigitos(comprador.nit))}</sts:ProviderID>` +
    `<sts:SoftwareID schemeAgencyID="195" schemeAgencyName="${DIAN}">${escapar(o.softwareId)}</sts:SoftwareID>` +
    `</sts:SoftwareProvider>` +
    `<sts:SoftwareSecurityCode schemeAgencyID="195" schemeAgencyName="${DIAN}">${ssc}</sts:SoftwareSecurityCode>` +
    `<sts:AuthorizationProvider><sts:AuthorizationProviderID schemeAgencyID="195" schemeAgencyName="${DIAN}" schemeID="4" schemeName="31">800197268</sts:AuthorizationProviderID></sts:AuthorizationProvider>` +
    // Regla AAB36: el QR lleva la URL con el CUFE de la FACTURA, no el CUDE del evento.
    `<sts:QRCode>${escapar(e.qr || qr(o.ambiente, e.factura.cufe))}</sts:QRCode>` +
    `</sts:DianExtensions></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>` +
    `<cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>` +
    `<cbc:CustomizationID>1</cbc:CustomizationID>` +
    `<cbc:ProfileID>DIAN 2.1: ApplicationResponse de la Factura Electrónica de Venta</cbc:ProfileID>` +
    `<cbc:ProfileExecutionID>${o.ambiente}</cbc:ProfileExecutionID>` +
    `<cbc:ID>${escapar(o.numero)}</cbc:ID>` +
    `<cbc:UUID schemeID="${o.ambiente}" schemeName="CUDE-SHA384">${cude}</cbc:UUID>` +
    `<cbc:IssueDate>${fecha}</cbc:IssueDate>` +
    `<cbc:IssueTime>${hora}</cbc:IssueTime>` +
    (e.nota ? `<cbc:Note>${escapar(e.nota)}</cbc:Note>` : '') +
    parte('SenderParty', comprador) +
    parte('ReceiverParty', vendedor) +
    `<cac:DocumentResponse>` +
    `<cac:Response>${codigoRespuesta}<cbc:Description>${DESCRIPCION_EVENTO[e.codigo]}</cbc:Description></cac:Response>` +
    `<cac:DocumentReference><cbc:ID>${escapar(e.factura.numero)}</cbc:ID>` +
    `<cbc:UUID schemeName="CUFE-SHA384">${escapar(e.factura.cufe)}</cbc:UUID>` +
    `<cbc:DocumentTypeCode>${escapar(tipoDocumento)}</cbc:DocumentTypeCode></cac:DocumentReference>` +
    quienRecibio +
    `</cac:DocumentResponse>` +
    `</ApplicationResponse>`;
  return { xml, cude };
}

// ── B7: nómina electrónica ──────────────────────────────────────────────

export interface CuneDatos {
  num_ne: string; fec_ne: string; hor_ne: string; val_dev: string; val_ded: string; val_tol_ne: string;
  nit_ne: string; doc_emp: string; tipo_xml: string;
}

/** CUNE = SHA-384(NumNE + FecNE + HorNE + ValDev + ValDed + ValTolNE + NitNE + DocEmp + TipoXML + SoftwarePin + TipAmb). */
export function calcularCune(d: CuneDatos, softwarePin: string, ambiente: '1' | '2'): string {
  return sha384Hex(d.num_ne + d.fec_ne + d.hor_ne + d.val_dev + d.val_ded + d.val_tol_ne + d.nit_ne + d.doc_emp + d.tipo_xml + softwarePin + ambiente);
}

/** Pone o reemplaza un atributo en la primera etiqueta <nombre …> del XML. */
function conAtributo(xml: string, etiqueta: string, atributo: string, valor: string): string {
  const re = new RegExp(`<((?:\\w+:)?${etiqueta})(\\s[^>]*?)?(\\/?)>`);
  const m = xml.match(re);
  if (!m) throw new Error(`La nómina no trae <${etiqueta}>`);
  let attrs = m[2] ?? '';
  const reAttr = new RegExp(`\\s${atributo}="[^"]*"`);
  attrs = reAttr.test(attrs) ? attrs.replace(reAttr, ` ${atributo}="${escapar(valor)}"`) : `${attrs} ${atributo}="${escapar(valor)}"`;
  return xml.replace(re, `<${m[1]}${attrs}${m[3]}>`);
}

const atributo = (xml: string, etiqueta: string, nombre: string) =>
  xml.match(new RegExp(`<(?:\\w+:)?${etiqueta}\\s[^>]*?\\b${nombre}="([^"]*)"`))?.[1] ?? null;

/** Quita el ext:UBLExtension vacío que Codec Document deja para la firma: firmarXades agrega el suyo. */
export function quitarExtensionVacia(xml: string): string {
  return xml.replace(/<ext:UBLExtension>\s*<ext:ExtensionContent\s*\/>\s*<\/ext:UBLExtension>/, '')
    .replace(/<ext:UBLExtension>\s*<ext:ExtensionContent>\s*<\/ext:ExtensionContent>\s*<\/ext:UBLExtension>/, '');
}

/**
 * Deja la nómina lista para firmar: SoftwareID y SoftwareSC en ProveedorXML,
 * el Ambiente, el CUNE definitivo (calculado con el PIN de nómina) en
 * InformacionGeneral y en el CodigoQR, sin el contenedor de firma vacío.
 */
export function prepararNomina(
  xml: string, datos: CuneDatos, o: { softwareId: string; softwarePin: string; ambiente: '1' | '2' },
): { xml: string; cune: string } {
  const cune = calcularCune(datos, o.softwarePin, o.ambiente);
  const provisional = atributo(xml, 'InformacionGeneral', 'CUNE');
  let x = conAtributo(xml, 'ProveedorXML', 'SoftwareID', o.softwareId);
  x = conAtributo(x, 'ProveedorXML', 'SoftwareSC', sha384Hex(o.softwareId + o.softwarePin + datos.num_ne));
  x = conAtributo(x, 'InformacionGeneral', 'Ambiente', o.ambiente);
  x = conAtributo(x, 'InformacionGeneral', 'CUNE', cune);
  if (provisional && provisional !== cune) x = x.split(provisional).join(cune);
  // El QR apunta al catálogo del ambiente en que se envía.
  const host = o.ambiente === '1' ? 'catalogo-vpfe.dian.gov.co' : 'catalogo-vpfe-hab.dian.gov.co';
  x = x.replace(/<((?:\w+:)?CodigoQR)>([\s\S]*?)<\/\1>/, (_m, et, contenido) =>
    `<${et}>${String(contenido).replace(/catalogo-vpfe(?:-hab)?\.dian\.gov\.co/g, host)}</${et}>`);
  return { xml: quitarExtensionVacia(x), cune };
}
