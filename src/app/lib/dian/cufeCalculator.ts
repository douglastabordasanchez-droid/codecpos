/**
 * Cálculo del CUFE (factura electrónica) según el Anexo Técnico de Factura
 * Electrónica de Venta v1.9 (adoptado por la Resolución DIAN 000165 del
 * 01-11-2023), §11.4.
 *
 *   CUFE = SHA-384(
 *     NumFac + FecFac + HorFac + ValFac +
 *     CodImp1 + ValImp1 + CodImp2 + ValImp2 + CodImp3 + ValImp3 +
 *     ValTot + NitOFE + NumAdq + ClTec + TipoAmb
 *   )
 *
 * Fórmula y valores confirmados contra el PDF oficial descargado de
 * dian.gov.co (vendorizado en docs/electronic-invoicing/dian-sources/) —
 * NO es el CUDE de notas de ajuste ni de documento equivalente, que usan
 * Software-PIN en vez de ClTec (ver calcularCudeNota.ts /
 * calcularCudeDocumentoEquivalente.ts, misma cadena de hash compartida en
 * dianHashChain.ts).
 *
 * Salida: cadena hexadecimal en minúsculas de 96 caracteres (SHA-384 = 48
 * bytes). Sin separadores entre campos — concatenación directa, cada campo
 * ya viene formateado a su representación textual exacta (montos con 2
 * decimales TRUNCADOS, no redondeados, por instrucción expresa del anexo).
 */
import { formatoFechaDian, formatoHoraDian, formatoValorDian, valorImpuestoDian, sha384Hex, type ImpuestoDian } from './dianHashChain';

export type TipoAmbienteCufe = 'produccion' | 'habilitacion';
export type ImpuestoCufe = ImpuestoDian;

export interface DatosCufe {
  /** Número de factura CON prefijo autorizado, ej: "SETP990000001". */
  numeroFactura: string;
  /** Fecha de emisión, Date o ya en formato YYYY-MM-DD. */
  fecha: Date | string;
  /** Valor bruto de la operación antes de impuestos/descuentos. */
  valorBruto: number;
  /** Impuestos discriminados — códigos repetidos se suman; los que falten van en 0.00. */
  impuestos: ImpuestoCufe[];
  /** Valor total de la factura (bruto + impuestos - descuentos + cargos). */
  valorTotal: number;
  /** NIT del Obligado a Facturar Electrónicamente (emisor), sin dígito de verificación. */
  nitEmisor: string;
  /** NIT/documento del adquirente. Usar NUMERO_DOCUMENTO_CONSUMIDOR_FINAL si no se identifica. */
  numeroAdquirente: string;
  /** Clave técnica asignada por la DIAN al solicitar la numeración. */
  claveTecnica: string;
  ambiente: TipoAmbienteCufe;
}

export function construirCadenaCufe(datos: DatosCufe): string {
  const codImp1 = '01';
  const valImp1 = formatoValorDian(valorImpuestoDian(datos.impuestos, '01'));
  const codImp2 = '04';
  const valImp2 = formatoValorDian(valorImpuestoDian(datos.impuestos, '04'));
  const codImp3 = '03';
  const valImp3 = formatoValorDian(valorImpuestoDian(datos.impuestos, '03'));
  const tipoAmb = datos.ambiente === 'produccion' ? '1' : '2';

  return (
    datos.numeroFactura +
    formatoFechaDian(datos.fecha) +
    formatoHoraDian(datos.fecha) +
    formatoValorDian(datos.valorBruto) +
    codImp1 + valImp1 +
    codImp2 + valImp2 +
    codImp3 + valImp3 +
    formatoValorDian(datos.valorTotal) +
    datos.nitEmisor +
    datos.numeroAdquirente +
    datos.claveTecnica +
    tipoAmb
  );
}

/** Calcula el CUFE. Usa Web Crypto (crypto.subtle) — funciona en el
 * renderer de Electron sin necesidad de IPC, porque el CUFE se calcula
 * sobre datos públicos de la factura, no involucra la llave privada. */
export async function calcularCufe(datos: DatosCufe): Promise<string> {
  const cadena = construirCadenaCufe(datos);
  return sha384Hex(cadena);
}
