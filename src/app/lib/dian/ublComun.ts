/**
 * Bloques UBL 2.1 compartidos por factura, documento equivalente POS y notas
 * de ajuste: emisor, adquirente, medio de pago, tributos, totales y líneas.
 *
 * Cada bloque existe porque una regla de RECHAZO del Anexo Técnico de
 * Factura Electrónica v1.9 (Resolución 000165 de 2023) lo exige; el código
 * de la regla va anotado junto al elemento. La lista completa de reglas se
 * extrajo del anexo vendorizado en docs/electronic-invoicing/dian-sources/.
 *
 * ⚠️ La aceptación final solo la da la DIAN: esto se construyó contra el
 * anexo, y debe confirmarse corriendo el set de pruebas de habilitación con
 * el certificado del negocio.
 */
import type { AdquirenteDian, EmisorSnapshot } from './types';
import { NUMERO_DOCUMENTO_CONSUMIDOR_FINAL } from './types';
import { resolverUbicacionDian, type UbicacionDian } from './divipola';
import { dinero, type DocumentoFiscal, type LineaFiscal } from './documentoFiscal';

export function escapeXml(valor: string | number | undefined | null): string {
  if (valor === undefined || valor === null) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const AGENCIA = 'schemeAgencyID="195" schemeAgencyName="CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)"';

/** Error de datos del negocio que impide emitir: se le muestra al usuario tal cual. */
export class DatosFiscalesIncompletos extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'DatosFiscalesIncompletos';
  }
}

/** Dígito de verificación de un NIT (algoritmo oficial de la DIAN, módulo 11). */
export function digitoVerificacionNit(nit: string): string {
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const digitos = nit.replace(/\D/g, '').split('').reverse();
  const suma = digitos.reduce((a, d, i) => a + Number(d) * pesos[i], 0);
  const resto = suma % 11;
  return String(resto > 1 ? 11 - resto : resto);
}

// ── Identificación del adquirente ─────────────────────────────────────────

export interface IdentificacionAdquirente {
  /** Código DIAN del tipo de documento: 13 cédula, 31 NIT, 22 cédula de extranjería... */
  tipo: string;
  numero: string;
  dv?: string;
  esConsumidorFinal: boolean;
  /** 1 = persona jurídica, 2 = persona natural (FAK). */
  tipoPersona: '1' | '2';
}

/**
 * El POS captura «NIT o cédula» en un solo campo de texto. Se trata como NIT
 * cuando viene con su dígito de verificación ("900123456-7") o cuando quien
 * llama ya lo marcó como tipo 31; todo lo demás se respeta como llegó.
 */
export function identificarAdquirente(adquirente: AdquirenteDian): IdentificacionAdquirente {
  const crudo = (adquirente.numeroDocumento || '').trim();
  if (!crudo || crudo === NUMERO_DOCUMENTO_CONSUMIDOR_FINAL) {
    return { tipo: '13', numero: NUMERO_DOCUMENTO_CONSUMIDOR_FINAL, esConsumidorFinal: true, tipoPersona: '2' };
  }

  const conDv = crudo.replace(/[.\s]/g, '').match(/^(\d{6,10})-(\d)$/);
  if (conDv) return { tipo: '31', numero: conDv[1], dv: conDv[2], esConsumidorFinal: false, tipoPersona: '1' };

  const numero = crudo.replace(/[.\s-]/g, '');
  if (adquirente.tipoDocumento === '31') {
    // FAK: si es NIT, el DV es obligatorio.
    return { tipo: '31', numero, dv: adquirente.digitoVerificacion || digitoVerificacionNit(numero), esConsumidorFinal: false, tipoPersona: '1' };
  }
  return { tipo: adquirente.tipoDocumento || '13', numero, esConsumidorFinal: false, tipoPersona: '2' };
}

// ── Emisor ────────────────────────────────────────────────────────────────

/** Responsabilidades fiscales que la DIAN admite en TaxLevelCode (FAJ26 rechaza las demás). */
const RESPONSABILIDADES_VALIDAS = ['O-13', 'O-15', 'O-23', 'O-47', 'R-99-PN'];

function responsabilidades(codigos: string[] | undefined): string {
  // El perfil guarda lo que el negocio copió de su RUT ("O-49 No responsable
  // de IVA"): se queda solo con el código y solo con los que la DIAN acepta.
  const validos = (codigos || [])
    .map((c) => c.trim().toUpperCase().match(/^[OR]-\d{2}(-PN)?/)?.[0])
    .filter((c): c is string => !!c && RESPONSABILIDADES_VALIDAS.includes(c));
  return [...new Set(validos)].join(';') || 'R-99-PN';
}

export function ubicacionDelEmisor(emisor: EmisorSnapshot): UbicacionDian {
  const ubicacion = resolverUbicacionDian(emisor.municipioCodigo, emisor.departamentoCodigo);
  if (!ubicacion) {
    throw new DatosFiscalesIncompletos(
      `No se reconoce el municipio del perfil fiscal ("${emisor.municipioCodigo || 'sin municipio'}"). ` +
      'Corrígelo en Configuración → Facturación electrónica: escribe el nombre oficial o el código DANE de 5 dígitos (por ejemplo 11001 para Bogotá).',
    );
  }
  return ubicacion;
}

function direccion(ubicacion: UbicacionDian, linea: string | undefined): string {
  return `<cbc:ID>${ubicacion.municipioCodigo}</cbc:ID>
          <cbc:CityName>${escapeXml(ubicacion.municipioNombre)}</cbc:CityName>
          <cbc:CountrySubentity>${escapeXml(ubicacion.departamentoNombre)}</cbc:CountrySubentity>
          <cbc:CountrySubentityCode>${ubicacion.departamentoCodigo}</cbc:CountrySubentityCode>
          <cac:AddressLine><cbc:Line>${escapeXml(linea?.trim() || 'Sin dirección')}</cbc:Line></cac:AddressLine>
          <cac:Country>
            <cbc:IdentificationCode>CO</cbc:IdentificationCode>
            <cbc:Name languageID="es">Colombia</cbc:Name>
          </cac:Country>`;
}

/**
 * cac:AccountingSupplierParty — FAJ01..FAJ49.
 * `prefijo` es el de la numeración: debe coincidir con sts:Prefix (FAB10a).
 */
export function bloqueEmisor(emisor: EmisorSnapshot, prefijo: string, cobraIva: boolean): string {
  if (!emisor.nit) throw new DatosFiscalesIncompletos('El perfil fiscal no tiene NIT.');
  if (!emisor.nombreORazonSocial) throw new DatosFiscalesIncompletos('El perfil fiscal no tiene nombre o razón social.');

  const ubicacion = ubicacionDelEmisor(emisor);
  const dv = emisor.digitoVerificacion || digitoVerificacionNit(emisor.nit);
  const companyId = `<cbc:CompanyID ${AGENCIA} schemeID="${escapeXml(dv)}" schemeName="31">${escapeXml(emisor.nit)}</cbc:CompanyID>`;
  const razon = escapeXml(emisor.nombreORazonSocial);

  return `  <cac:AccountingSupplierParty>
    <cbc:AdditionalAccountID>${emisor.tipoPersona === 'natural' ? '2' : '1'}</cbc:AdditionalAccountID>
    <cac:Party>
      <cac:PartyName><cbc:Name>${escapeXml(emisor.nombreComercial || emisor.nombreORazonSocial)}</cbc:Name></cac:PartyName>
      <cac:PhysicalLocation>
        <cac:Address>
          ${direccion(ubicacion, emisor.direccion)}
        </cac:Address>
      </cac:PhysicalLocation>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>${razon}</cbc:RegistrationName>
        ${companyId}
        <cbc:TaxLevelCode listName="${cobraIva ? '48' : '49'}">${responsabilidades(emisor.responsabilidadesFiscales)}</cbc:TaxLevelCode>
        <cac:RegistrationAddress>
          ${direccion(ubicacion, emisor.direccion)}
        </cac:RegistrationAddress>
        <cac:TaxScheme>
          <cbc:ID>${cobraIva ? '01' : 'ZZ'}</cbc:ID>
          <cbc:Name>${cobraIva ? 'IVA' : 'No aplica'}</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${razon}</cbc:RegistrationName>
        ${companyId}
        <cac:CorporateRegistrationScheme><cbc:ID>${escapeXml(prefijo)}</cbc:ID></cac:CorporateRegistrationScheme>
      </cac:PartyLegalEntity>${emisor.email ? `
      <cac:Contact><cbc:ElectronicMail>${escapeXml(emisor.email)}</cbc:ElectronicMail></cac:Contact>` : ''}
    </cac:Party>
  </cac:AccountingSupplierParty>`;
}

// ── Adquirente ────────────────────────────────────────────────────────────

/** cac:AccountingCustomerParty — FAK05..FAK62. */
export function bloqueAdquirente(adquirente: AdquirenteDian): string {
  const id = identificarAdquirente(adquirente);
  const nombre = escapeXml(id.esConsumidorFinal ? 'consumidor final' : adquirente.nombreORazonSocial?.trim() || 'consumidor final');
  const atributosId = `${AGENCIA}${id.dv ? ` schemeID="${escapeXml(id.dv)}"` : ''} schemeName="${escapeXml(id.tipo)}"`;
  const contacto = [
    adquirente.telefono ? `<cbc:Telephone>${escapeXml(adquirente.telefono)}</cbc:Telephone>` : '',
    adquirente.email ? `<cbc:ElectronicMail>${escapeXml(adquirente.email)}</cbc:ElectronicMail>` : '',
  ].join('');

  return `  <cac:AccountingCustomerParty>
    <cbc:AdditionalAccountID>${id.tipoPersona}</cbc:AdditionalAccountID>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID${id.dv ? ` schemeID="${escapeXml(id.dv)}"` : ''} schemeName="${escapeXml(id.tipo)}">${escapeXml(id.numero)}</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${nombre}</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>${nombre}</cbc:RegistrationName>
        <cbc:CompanyID ${atributosId}>${escapeXml(id.numero)}</cbc:CompanyID>
        <cbc:TaxLevelCode listName="49">R-99-PN</cbc:TaxLevelCode>
        <cac:TaxScheme>
          <cbc:ID>ZZ</cbc:ID>
          <cbc:Name>No aplica</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${nombre}</cbc:RegistrationName>
        <cbc:CompanyID ${atributosId}>${escapeXml(id.numero)}</cbc:CompanyID>
      </cac:PartyLegalEntity>${contacto ? `
      <cac:Contact>${contacto}</cac:Contact>` : ''}
    </cac:Party>
  </cac:AccountingCustomerParty>`;
}

// ── Medio de pago ─────────────────────────────────────────────────────────

export interface PagoDian {
  /** Método que registró el POS (efectivo, tarjeta, nequi, transferencia...). */
  metodo?: string;
  aCredito?: boolean;
  /** 'YYYY-MM-DD'. Obligatoria cuando es a crédito. */
  fechaVencimiento?: string;
}

/** Tabla «Medios de pago» del anexo: 10 efectivo, 48 tarjeta crédito, 49 tarjeta débito, 47 transferencia, ZZZ otro. */
function codigoMedioPago(metodo: string | undefined): string {
  const m = (metodo || '').toLowerCase();
  if (!m || m === 'efectivo') return '10';
  if (m.includes('credito') || m.includes('crédito')) return '48';
  if (m.includes('tarjeta') || m.includes('debito') || m.includes('débito') || m === 'datafono') return '49';
  if (['transferencia', 'nequi', 'daviplata', 'bancolombia', 'bre_b', 'pse'].some((x) => m.includes(x))) return '47';
  return 'ZZZ';
}

/** cac:PaymentMeans — FAN01 (grupo obligatorio), FAN02 (1 contado / 2 crédito), FAN04 (medio). */
export function bloquePago(pago: PagoDian | undefined, fechaEmision: string): string {
  const aCredito = !!pago?.aCredito;
  return `  <cac:PaymentMeans>
    <cbc:ID>${aCredito ? '2' : '1'}</cbc:ID>
    <cbc:PaymentMeansCode>${codigoMedioPago(pago?.metodo)}</cbc:PaymentMeansCode>${aCredito ? `
    <cbc:PaymentDueDate>${escapeXml(pago?.fechaVencimiento || fechaEmision)}</cbc:PaymentDueDate>` : ''}
  </cac:PaymentMeans>`;
}

// ── Tributos y totales ────────────────────────────────────────────────────

const monto = (etiqueta: string, valor: number) => `<cbc:${etiqueta} currencyID="COP">${dinero(valor)}</cbc:${etiqueta}>`;

function subtotalTributo(codigo: string, nombre: string, s: { porcentaje: number; base: number; valor: number }, sangria: string): string {
  return `${sangria}<cac:TaxSubtotal>
${sangria}  ${monto('TaxableAmount', s.base)}
${sangria}  ${monto('TaxAmount', s.valor)}
${sangria}  <cac:TaxCategory>
${sangria}    <cbc:Percent>${s.porcentaje.toFixed(2)}</cbc:Percent>
${sangria}    <cac:TaxScheme>
${sangria}      <cbc:ID>${codigo}</cbc:ID>
${sangria}      <cbc:Name>${nombre}</cbc:Name>
${sangria}    </cac:TaxScheme>
${sangria}  </cac:TaxCategory>
${sangria}</cac:TaxSubtotal>`;
}

/** cac:TaxTotal del encabezado: un grupo por tributo (FAS01a) con un subtotal por tarifa (FAS04). */
export function bloqueTributosDocumento(doc: DocumentoFiscal): string {
  return doc.tributos
    .map((t) => `  <cac:TaxTotal>
    ${monto('TaxAmount', t.total)}
${t.subtotales.map((s) => subtotalTributo(t.codigo, t.nombre, s, '    ')).join('\n')}
  </cac:TaxTotal>`)
    .join('\n');
}

/** Totales del documento — FAU02, FAU04, FAU06, FAU14. `etiqueta` es RequestedMonetaryTotal en la nota débito. */
export function bloqueTotales(doc: DocumentoFiscal, etiqueta: 'LegalMonetaryTotal' | 'RequestedMonetaryTotal' = 'LegalMonetaryTotal'): string {
  return `  <cac:${etiqueta}>
    ${monto('LineExtensionAmount', doc.brutoLineas)}
    ${monto('TaxExclusiveAmount', doc.baseGravable)}
    ${monto('TaxInclusiveAmount', doc.total)}
    ${monto('PayableAmount', doc.total)}
  </cac:${etiqueta}>`;
}

/** Líneas — FAV (numeración consecutiva, cantidad y unidad), FAX (tributos por línea), FAZ (ítem). */
export function bloqueLineas(lineas: LineaFiscal[], contenedor: string, etiquetaCantidad: string): string {
  return lineas
    .map((l) => {
      const tributos = l.impuestos
        .map((imp) => `      <cac:TaxTotal>
        ${monto('TaxAmount', imp.valor)}
${subtotalTributo(imp.codigo, imp.codigo === '01' ? 'IVA' : imp.codigo === '04' ? 'INC' : 'ICA', imp, '        ')}
      </cac:TaxTotal>`)
        .join('\n');

      return `  <cac:${contenedor}>
    <cbc:ID>${l.numero}</cbc:ID>
    <cbc:${etiquetaCantidad} unitCode="${escapeXml(l.unidadMedida)}">${l.cantidad}</cbc:${etiquetaCantidad}>
    ${monto('LineExtensionAmount', l.base)}${tributos ? `\n${tributos}` : ''}
    <cac:Item>
      <cbc:Description>${escapeXml(l.descripcion)}</cbc:Description>
      <cac:StandardItemIdentification><cbc:ID schemeID="999">${escapeXml(l.codigo || String(l.numero))}</cbc:ID></cac:StandardItemIdentification>
    </cac:Item>
    <cac:Price>
      ${monto('PriceAmount', l.precioUnitario)}
      <cbc:BaseQuantity unitCode="${escapeXml(l.unidadMedida)}">1</cbc:BaseQuantity>
    </cac:Price>
  </cac:${contenedor}>`;
    })
    .join('\n');
}

export const MONEDA = '<cbc:DocumentCurrencyCode listAgencyID="6" listAgencyName="United Nations Economic Commission for Europe" listID="ISO 4217 Alpha">COP</cbc:DocumentCurrencyCode>';
