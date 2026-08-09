/**
 * CUDE del Documento Equivalente Electrónico POS (comprador NO identificado
 * — ver decidirTipoDocumentoDian() en types.ts), según el Anexo Técnico de
 * Documento Equivalente Electrónico v1.0 (Resolución DIAN 000165 de 2023),
 * §14.1.2-14.1.4.
 *
 *   CUDE = SHA-384(
 *     NumFac + FecFac + HorFac + ValFac +
 *     CodImp1 + ValImp1 + CodImp2 + ValImp2 + CodImp3 + ValImp3 +
 *     ValTot + NitOFE + NumAdq + Software-PIN + TipoAmb
 *   )
 *
 * Misma fórmula que las notas de ajuste (calcularCudeNota.ts) — usa el PIN
 * del software (Software-PIN), NO la Clave Técnica. Confirmado contra el
 * PDF oficial descargado de dian.gov.co (vendorizado en
 * docs/electronic-invoicing/dian-sources/): el documento equivalente
 * reutiliza el mismo root UBL `/Invoice/` que la factura (NO es un esquema
 * `AttachedDocument` propio como se documentó por precaución antes de
 * conseguir este anexo) — solo cambia el `schemeName` del `cbc:UUID` de
 * "CUFE-SHA384" a "CUDE-SHA384" y algunas reglas de validación.
 */
import { formatoFechaDian, formatoHoraDian, formatoValorDian, valorImpuestoDian, sha384Hex, type ImpuestoDian } from './dianHashChain';
import type { TipoAmbienteCufe } from './cufeCalculator';

export interface DatosCudeDocumentoEquivalente {
  /** Número del documento CON prefijo autorizado. */
  numeroDocumento: string;
  fecha: Date | string;
  valorBruto: number;
  impuestos: ImpuestoDian[];
  valorTotal: number;
  nitEmisor: string;
  numeroAdquirente: string;
  /** PIN del software asignado por el facturador en el catálogo DIAN — NO es la clave técnica. */
  softwarePin: string;
  ambiente: TipoAmbienteCufe;
}

export function construirCadenaCudeDocumentoEquivalente(datos: DatosCudeDocumentoEquivalente): string {
  const codImp1 = '01';
  const valImp1 = formatoValorDian(valorImpuestoDian(datos.impuestos, '01'));
  const codImp2 = '04';
  const valImp2 = formatoValorDian(valorImpuestoDian(datos.impuestos, '04'));
  const codImp3 = '03';
  const valImp3 = formatoValorDian(valorImpuestoDian(datos.impuestos, '03'));
  const tipoAmb = datos.ambiente === 'produccion' ? '1' : '2';

  return (
    datos.numeroDocumento +
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

export async function calcularCudeDocumentoEquivalente(datos: DatosCudeDocumentoEquivalente): Promise<string> {
  const cadena = construirCadenaCudeDocumentoEquivalente(datos);
  return sha384Hex(cadena);
}
