/**
 * CUDE de notas de ajuste (crédito/débito) según el Anexo Técnico de
 * Factura Electrónica de Venta v1.9 (Resolución DIAN 000165 de 2023),
 * §11.4.3-11.4.6.
 *
 *   CUDE = SHA-384(
 *     NumFac + FecFac + HorFac + ValFac +
 *     CodImp1 + ValImp1 + CodImp2 + ValImp2 + CodImp3 + ValImp3 +
 *     ValTot + NitOFE + NumAdq + Software-PIN + TipoAmb
 *   )
 *
 * Misma estructura que el CUFE de facturas (cufeCalculator.ts) pero con una
 * diferencia real y confirmada: usa el PIN del software (Software-PIN,
 * asignado por el facturador al activar su software en el catálogo DIAN),
 * NO la Clave Técnica (ClTec, ligada a la resolución de numeración) — por
 * eso este archivo antes lanzaba un error explícito en vez de asumir que
 * era "la misma fórmula que CUFE".
 *
 * Fórmula verificada byte a byte contra el ejemplo oficial de nota crédito
 * del anexo (PDF descargado de dian.gov.co, vendorizado en
 * docs/electronic-invoicing/dian-sources/): mismo hash SHA-384 exacto.
 */
import { formatoFechaDian, formatoHoraDian, formatoValorDian, valorImpuestoDian, sha384Hex, type ImpuestoDian } from './dianHashChain';
import type { TipoAmbienteCufe } from './cufeCalculator';

export interface DatosCudeNota {
  /** Número de la nota CON prefijo autorizado, ej: "NC00000001". */
  numeroNota: string;
  fecha: Date | string;
  valorBruto: number;
  impuestos: ImpuestoDian[];
  valorTotal: number;
  /** NIT del Obligado a Facturar Electrónicamente (emisor), sin dígito de verificación. */
  nitEmisor: string;
  numeroAdquirente: string;
  /** PIN del software asignado por el facturador en el catálogo DIAN — NO es la clave técnica. */
  softwarePin: string;
  ambiente: TipoAmbienteCufe;
}

export function construirCadenaCudeNota(datos: DatosCudeNota): string {
  const codImp1 = '01';
  const valImp1 = formatoValorDian(valorImpuestoDian(datos.impuestos, '01'));
  const codImp2 = '04';
  const valImp2 = formatoValorDian(valorImpuestoDian(datos.impuestos, '04'));
  const codImp3 = '03';
  const valImp3 = formatoValorDian(valorImpuestoDian(datos.impuestos, '03'));
  const tipoAmb = datos.ambiente === 'produccion' ? '1' : '2';

  return (
    datos.numeroNota +
    formatoFechaDian(datos.fecha) +
    formatoHoraDian(datos.fecha) +
    formatoValorDian(datos.valorBruto) +
    codImp1 + valImp1 +
    codImp2 + valImp2 +
    codImp3 + valImp3 +
    formatoValorDian(datos.valorTotal) +
    datos.nitEmisor +
    datos.numeroAdquirente +
    datos.softwarePin +
    tipoAmb
  );
}

export async function calcularCudeNota(datos: DatosCudeNota): Promise<string> {
  const cadena = construirCadenaCudeNota(datos);
  return sha384Hex(cadena);
}
