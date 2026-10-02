/**
 * Modelo normalizado de un documento electrónico.
 *
 * Este es el contrato entre el motor XML y el resto de Codec Document: de
 * aquí para arriba nadie vuelve a saber qué es un namespace, un CUFE o un
 * nodo UBL. La regla del producto — "el contador supervisa, Codec procesa"
 * — empieza aquí: si un campo no está en este tipo, ninguna pantalla puede
 * depender de él.
 */

export type TipoDocumento =
  | 'factura'
  | 'nota_credito'
  | 'nota_debito'
  | 'documento_equivalente'
  | 'documento_soporte'
  | 'nomina'
  | 'evento'          // ApplicationResponse: acuses y eventos RADIAN
  | 'desconocido';

export type Direccion = 'recibido' | 'emitido' | 'desconocido';

/** Códigos de esquema tributario de la DIAN. Se guarda el código tal cual
 *  viene; este mapa es sólo para mostrar y para agrupar en los reportes.
 *  Un código que no esté aquí NO es un error: entra igual con su nombre
 *  original, que es justo lo que permite soportar un impuesto nuevo sin
 *  tocar la base de datos. */
export const IMPUESTOS_DIAN: Record<string, string> = {
  '01': 'IVA',
  '02': 'IC',
  '03': 'ICA',
  '04': 'INC',
  '05': 'ReteIVA',
  '06': 'ReteRenta',
  '07': 'ReteICA',
  '08': 'IC Porcentual',
  '20': 'FtoHorticultura',
  '21': 'Timbre',
  '22': 'Bolsas',
  '23': 'INCarbono',
  '24': 'INCombustibles',
  '25': 'Sobretasa Combustibles',
  '26': 'Sordicom',
  'ZA': 'IVA e INC',
  'ZZ': 'No aplica',
};

/** true si el código corresponde a una retención (resta, no suma). */
export const ES_RETENCION = new Set(['05', '06', '07']);

export interface Tercero {
  nit: string;
  /** Dígito de verificación, cuando el documento lo trae. */
  dv: string;
  razonSocial: string;
  nombreComercial: string;
  /** Código del tipo de documento de identidad (31 = NIT, 13 = cédula...). */
  tipoIdentificacion: string;
  regimen: string;
  ciudad: string;
  departamento: string;
  direccion: string;
  pais: string;
  email: string;
  telefono: string;
}

export interface Impuesto {
  /** 'documento' o 'linea'. */
  alcance: 'documento' | 'linea';
  /** Número de línea cuando alcance = 'linea'. */
  linea: number | null;
  codigo: string;
  nombre: string;
  baseGravable: number;
  tarifa: number;
  valor: number;
  esRetencion: boolean;
  /** Unidades, para impuestos por cantidad (bolsas) en vez de por tarifa. */
  unidades: number | null;
}

export interface LineaDocumento {
  numero: number;
  codigoVendedor: string;
  codigoEstandar: string;
  descripcion: string;
  nota: string;
  cantidad: number;
  unidadMedida: string;
  precioUnitario: number;
  descuento: number;
  recargo: number;
  /** Valor de la línea antes de impuestos. */
  valorBruto: number;
  impuestos: Impuesto[];
  totalImpuestos: number;
}

export interface TotalesDocumento {
  /** Suma de todas las líneas, antes de impuestos (LineExtensionAmount).
   *  Éste es el "subtotal" que reconoce un contador. */
  brutoLineas: number;
  /** Base GRAVABLE (TaxExclusiveAmount): sólo la porción sujeta a impuesto.
   *  NO es el total antes de impuestos — una línea excluida de IVA suma en
   *  brutoLineas y no aparece aquí. Confundir los dos hace que toda factura
   *  con productos gravados y excluidos parezca descuadrada. */
  baseImponible: number;
  totalConImpuestos: number;
  descuentos: number;
  recargos: number;
  anticipos: number;
  redondeo: number;
  /** Lo que efectivamente se paga. */
  total: number;
}

/** Resumen por tipo de impuesto, precalculado para los reportes y para las
 *  columnas denormalizadas de la tabla de documentos. */
export interface ResumenImpuestos {
  base: number;
  iva: number;
  inc: number;
  ica: number;
  bolsas: number;
  otros: number;
  reteRenta: number;
  reteIva: number;
  reteIca: number;
  totalImpuestos: number;
  totalRetenciones: number;
  /** Base gravable discriminada por tarifa de IVA, para el clasificador. */
  baseIvaPorTarifa: Record<string, number>;
}

export interface AutorizacionDian {
  /** Número de la resolución de facturación. */
  resolucion: string;
  vigenciaDesde: string;
  vigenciaHasta: string;
  prefijo: string;
  rangoDesde: string;
  rangoHasta: string;
  proveedorTecnologicoNit: string;
  softwareId: string;
  /** URL del QR impreso en la representación gráfica. */
  qr: string;
}

export interface DocumentoNormalizado {
  tipo: TipoDocumento;
  /** Código crudo de la DIAN (01, 02, 91, 92...), por si el tipo se afina. */
  tipoCodigo: string;
  direccion: Direccion;

  cufe: string;
  /** 'CUFE-SHA384' o 'CUDE-SHA384', según lo declare el documento. */
  cufeEsquema: string;
  prefijo: string;
  numero: string;
  /** Prefijo + número tal como lo ve el contador: 'FE21570'. */
  numeroCompleto: string;

  fechaEmision: string;
  horaEmision: string;
  fechaVencimiento: string;

  moneda: string;
  formaPago: string;
  medioPago: string;

  emisor: Tercero;
  receptor: Tercero;

  lineas: LineaDocumento[];
  impuestos: Impuesto[];
  totales: TotalesDocumento;
  resumen: ResumenImpuestos;
  autorizacion: AutorizacionDian;

  notas: string[];
  /** Referencia al documento afectado, en notas crédito y débito. */
  documentoReferencia: { numero: string; cufe: string; fecha: string } | null;

  /** Versión del motor que produjo este resultado. Permite saber qué
   *  documentos hay que reprocesar cuando el parser mejore, sin volver a
   *  pedirle nada a la DIAN. */
  versionMotor: string;
}

export type SeveridadExcepcion = 'error' | 'revision' | 'aviso';

export interface Excepcion {
  codigo: string;
  severidad: SeveridadExcepcion;
  mensaje: string;
  campo?: string;
  esperado?: string;
  encontrado?: string;
}

export interface ResultadoParseo {
  ok: boolean;
  documento: DocumentoNormalizado | null;
  excepciones: Excepcion[];
  /** El ApplicationResponse que la DIAN adjunta junto a la factura, cuando
   *  viene: dice si el documento fue validado y cuándo. */
  validacionDian: { validado: boolean; fecha: string; descripcion: string } | null;
}
