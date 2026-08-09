/**
 * Facturación Electrónica DIAN — módulo independiente (habilitación propia).
 *
 * No confundir con el stub de "proveedor externo" en ConfiguracionPage.tsx
 * (feConfig / endpointApiUrl), que sigue intacto y es una vía alterna: el
 * dueño elige UNA de las dos en Configuración → Facturación Electrónica.
 *
 * IDENTIDAD FISCAL DESACOPLADA DEL NEGOCIO: un mismo negocio (cliente_id)
 * puede tener VARIOS FiscalProfile a lo largo del tiempo (persona natural →
 * SAS), solo uno activo a la vez. Cada factura queda ligada a un perfil y
 * guarda una COPIA INMUTABLE de sus datos fiscales al momento de emitirse
 * (ver `issuer*` en FacturaElectronicaDian) — un perfil nuevo o editado
 * jamás altera facturas ya emitidas.
 *
 * Este archivo solo declara tipos — sin lógica, sin dependencias de UI.
 */

// ── Máquina de estados del ciclo de vida de un documento electrónico ──
export type EstadoDocumentoDian =
  | 'draft'
  | 'pending'
  | 'signing'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'error'
  | 'contingency'
  | 'cancelled';

export type AmbienteDian = 'habilitacion' | 'produccion';

/** Estado del PERFIL FISCAL (no del documento) — cuánto ha avanzado la
 * habilitación de ESA identidad ante la DIAN. */
export type EstadoPerfilFiscal =
  | 'NOT_CONFIGURED'
  | 'CONFIGURING'
  | 'TESTING'
  | 'READY_FOR_PRODUCTION'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'ERROR';

export type TipoPersona = 'natural' | 'juridica';

/**
 * La identidad que factura — separada del `User` que la administra. Un
 * usuario (ej. Douglas) administra uno o varios FiscalProfile; el usuario
 * en sí nunca factura, el perfil sí.
 */
export interface FiscalProfile {
  id?: string;
  clienteId: string;
  tipoPersona: TipoPersona;
  nit?: string;
  digitoVerificacion?: string;
  nombreORazonSocial: string;
  nombreComercial?: string;
  rutReferencia?: string;
  direccionFiscal?: string;
  municipioCodigo?: string;
  departamentoCodigo?: string;
  paisCodigo: string;
  responsabilidadesFiscales: string[];
  regimenFiscal?: string;
  contactoEmail?: string;
  contactoTelefono?: string;
  identificadorSoftware?: string;
  /** Clave técnica (ClTec) entregada por la DIAN en la habilitación — NO es
   * el identificadorSoftware, es un credencial aparte, requerido tal cual
   * para calcular el CUFE (Anexo Técnico v1.9 §11.6). */
  claveTecnica?: string;
  /** PIN del software (Software-PIN / SfPin) que el facturador asignó al
   * activar su software en el catálogo DIAN — DISTINTO de claveTecnica.
   * Se usa en el CUDE de notas/documento equivalente (en vez de ClTec) y en
   * SoftwareSecurityCode = SHA-384(IdSoftware + Pin + NroDocumento),
   * requerido en toda factura (Anexo Técnico v1.9 §11.4/§11.8). */
  softwarePin?: string;
  ambiente: AmbienteDian;
  estado: EstadoPerfilFiscal;
  /** true si es el perfil ACTUALMENTE activo de este negocio (solo uno a la vez). */
  activo: boolean;
  pinConfigurado: boolean;
  entregaWhatsappHabilitada: boolean;
  entregaEmailHabilitada: boolean;
  entregaEmailRemitente?: string;
}

/** Para qué tipo de documento sirve una numeración/resolución — la DIAN
 * autoriza rangos SEPARADOS por tipo de documento; una resolución de
 * facturas nunca debe usarse para numerar notas o documentos equivalentes. */
export type TipoDocumentoResolucion = 'factura' | 'documento_equivalente' | 'nota_credito' | 'nota_debito';

/** Numeración/resolución DIAN — pertenece al PERFIL, no al negocio. Un
 * perfil puede tener varias a lo largo del tiempo (una vence, se pide otra). */
export interface ResolucionDian {
  id?: string;
  perfilFiscalId: string;
  clienteId: string;
  tipoDocumento: TipoDocumentoResolucion;
  prefijo: string;
  resolucionNumero: string;
  resolucionFecha?: string;
  rangoDesde: number;
  rangoHasta: number;
  consecutivoActual: number;
  vigenciaHasta?: string;
  estado: 'activa' | 'agotada' | 'vencida';
}

/** Metadata pública de un certificado (nunca el contenido/llave privada). */
export interface CertificadoDianMeta {
  perfilFiscalId?: string;
  nombreArchivo: string;
  huellaSha256: string;
  emisor?: string;
  sujeto?: string;
  fechaEmision?: string;
  fechaVencimiento: string;
  estado: 'activo' | 'vencido' | 'revocado';
}

export interface ItemFacturaDian {
  codigo?: string;
  descripcion: string;
  cantidad: number;
  unidadMedida?: string;
  precioUnitario: number;
  subtotal: number;
  /** Código de impuesto DIAN: '01' IVA, '04' INC, '03' ICA/otros. */
  impuestos?: Array<{ codigo: '01' | '04' | '03'; porcentaje: number; valor: number }>;
}

export interface AdquirenteDian {
  /** Tipo de documento DIAN: 13 cédula, 31 NIT, 22 cédula extranjería, etc. */
  tipoDocumento: string;
  numeroDocumento: string;
  digitoVerificacion?: string;
  nombreORazonSocial: string;
  email?: string;
  telefono?: string;
  direccion?: string;
}

/** Consumidor final identificado por el valor oficial DIAN (Art. 617 E.T. / Res. 000165). */
export const NUMERO_DOCUMENTO_CONSUMIDOR_FINAL = '222222222222';

/**
 * Regla de negocio (Resolución 000165 de 2023): un comprador IDENTIFICADO
 * (NIT/cédula real, no consumidor final) siempre se factura como Factura
 * Electrónica — sin tope de valor. Un comprador SIN identificar debe
 * emitirse como Documento Equivalente Electrónico POS, no como factura.
 * Es la DIAN quien exige esta distinción, no una preferencia del sistema —
 * por eso vive aquí como una función pura, para que cualquier punto de
 * venta (Electron o PWA) tome la misma decisión sin duplicar la regla.
 */
export function decidirTipoDocumentoDian(adquirente: Pick<AdquirenteDian, 'numeroDocumento'>): TipoDocumentoFactura {
  const identificado = !!adquirente.numeroDocumento?.trim() && adquirente.numeroDocumento.trim() !== NUMERO_DOCUMENTO_CONSUMIDOR_FINAL;
  return identificado ? 'factura' : 'documento_equivalente';
}

/** Snapshot inmutable del emisor al momento de emitir — copia congelada del
 * FiscalProfile en ese instante. Si el perfil cambia después (o se activa
 * uno nuevo), esta factura sigue mostrando la identidad con la que nació. */
export interface EmisorSnapshot {
  nit?: string;
  digitoVerificacion?: string;
  nombreORazonSocial?: string;
  nombreComercial?: string;
  direccion?: string;
  municipioCodigo?: string;
  departamentoCodigo?: string;
  responsabilidadesFiscales?: string[];
  ambiente?: AmbienteDian;
}

export type TipoDocumentoFactura = 'factura' | 'documento_equivalente';

export interface FacturaElectronicaDian {
  id?: string;
  clienteId: string;
  perfilFiscalId: string;
  resolucionId?: string;
  /** 'factura' (CUFE) si el comprador está identificado; 'documento_equivalente'
   * (CUDE) si no — ver decidirTipoDocumentoDian(). */
  tipoDocumento: TipoDocumentoFactura;
  /** id de la venta en IndexedDB local (Electron) o en `ventas` de Supabase (PWA). */
  ventaReferencia: string;
  numeroFactura: string;
  prefijo?: string;
  /** CUFE si tipoDocumento='factura', CUDE si tipoDocumento='documento_equivalente'. */
  cufe?: string;
  xml?: string;
  representacionGraficaUrl?: string;
  estado: EstadoDocumentoDian;
  respuestaDian?: Record<string, unknown>;
  motivoRechazo?: string;
  intentosTransmision: number;
  contingencia: boolean;
  /** Copia congelada del emisor — NUNCA se vuelve a leer del perfil tras crear la factura. */
  emisor: EmisorSnapshot;
  adquirente: AdquirenteDian;
  items: ItemFacturaDian[];
  subtotal: number;
  totalImpuestos: number;
  total: number;
  fechaEmision: string;
  fechaValidacion?: string;
}

export type TipoNotaAjuste = 'credito' | 'debito';

/**
 * Códigos de concepto del catálogo DIAN para notas crédito/débito (Anexo
 * Técnico). Referencia útil para la UI — el campo real es texto libre
 * porque el catálogo puede variar entre versiones del anexo; verificar el
 * código exacto contra el Anexo Técnico v1.9 antes de producción.
 */
export const CONCEPTOS_NOTA_CREDITO = [
  { codigo: '1', label: 'Devolución de parte de los bienes / no aceptación del servicio' },
  { codigo: '2', label: 'Anulación de factura electrónica' },
  { codigo: '3', label: 'Rebaja o descuento parcial o total' },
  { codigo: '4', label: 'Ajuste de precio' },
  { codigo: '90', label: 'Otros' },
] as const;

export const CONCEPTOS_NOTA_DEBITO = [
  { codigo: '1', label: 'Intereses' },
  { codigo: '2', label: 'Gastos por cobrar' },
  { codigo: '3', label: 'Cambio del valor' },
  { codigo: '4', label: 'Otros' },
] as const;

/**
 * Nota de ajuste (crédito o débito) sobre una FACTURA ya emitida — nunca
 * sobre otra nota (sin encadenamiento, `facturaId` solo puede apuntar a
 * `facturas_electronicas`, la FK de la base de datos ya lo garantiza). La
 * numeración/resolución es propia de la nota (la DIAN autoriza un rango
 * distinto al de las facturas) — nunca reutiliza el consecutivo de la
 * factura original.
 */
export interface NotaAjusteDian {
  id?: string;
  clienteId: string;
  perfilFiscalId: string;
  facturaId: string;
  tipo: TipoNotaAjuste;
  numeroNota: string;
  prefijo?: string;
  resolucionId?: string;
  conceptoCodigo?: string;
  cude?: string;
  xml?: string;
  motivo: string;
  estado: EstadoDocumentoDian;
  respuestaDian?: Record<string, unknown>;
  items?: ItemFacturaDian[];
  subtotal?: number;
  totalImpuestos?: number;
  total: number;
  fechaEmision: string;
}

/** Respuesta cruda del servicio web de la DIAN (forma exacta pendiente del
 * WSDL oficial — ver TODO en dianService.ts). */
export interface DianResponse {
  ok: boolean;
  cune?: string;
  estado: 'accepted' | 'rejected' | 'error';
  mensajes?: string[];
  crudo?: unknown;
}

/** Transiciones válidas de la máquina de estados del DOCUMENTO — cualquier
 * transición no listada debe rechazarse explícitamente. */
export const TRANSICIONES_VALIDAS: Record<EstadoDocumentoDian, EstadoDocumentoDian[]> = {
  draft: ['pending', 'error'],
  pending: ['signing', 'error', 'contingency'],
  signing: ['sent', 'error'],
  sent: ['accepted', 'rejected', 'error', 'contingency'],
  accepted: ['cancelled'],
  rejected: ['draft', 'pending'],
  error: ['pending'],
  contingency: ['sent', 'pending'],
  cancelled: [],
};

export function transicionValida(actual: EstadoDocumentoDian, siguiente: EstadoDocumentoDian): boolean {
  return TRANSICIONES_VALIDAS[actual]?.includes(siguiente) ?? false;
}

/** Resultado de validateFiscalConfiguration() — qué le falta al perfil
 * activo antes de poder facturar en producción. */
export interface ResultadoValidacionFiscal {
  ready: boolean;
  missing: string[];
}
