/**
 * Cifras fiscales de un documento electrónico, calculadas UNA sola vez y de
 * una sola forma.
 *
 * La DIAN recalcula todo y rechaza si algo no cuadra (Anexo Técnico v1.9):
 *   · FAX/FAS07  el impuesto de cada tarifa = base × tarifa
 *   · FAS02      el total de un tributo = suma de sus subtotales
 *   · FAS01b     todo tributo del encabezado existe en alguna línea
 *   · FAU02/04/06/14  los totales del documento = suma de las líneas
 *   · FAD06      el CUFE se calcula con esas mismas cifras
 *
 * Antes cada cifra venía de un sitio distinto (el subtotal del carrito, el
 * IVA calculado por el POS, el total con propina incluida) y nada garantizaba
 * que sumaran. Aquí todo se deriva de las líneas: lo que se firma, lo que va
 * al CUFE y lo que se guarda en la base son siempre los mismos números.
 *
 * Lo que NO entra: la propina. Es voluntaria y no hace parte de la base ni
 * del total de la factura.
 */
import type { ItemFacturaDian } from './types';

export type CodigoTributo = '01' | '04' | '03';

export const NOMBRE_TRIBUTO: Record<CodigoTributo, string> = { '01': 'IVA', '04': 'INC', '03': 'ICA' };

/** Redondeo a centavos «mitad hacia arriba», estable frente al error binario (1.005 → 1.01). */
export const redondear2 = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const dinero = (n: number): string => redondear2(Number.isFinite(n) ? n : 0).toFixed(2);

export interface ImpuestoLinea {
  codigo: CodigoTributo;
  porcentaje: number;
  base: number;
  valor: number;
}

export interface LineaFiscal {
  numero: number;
  codigo?: string;
  descripcion: string;
  cantidad: number;
  unidadMedida: string;
  precioUnitario: number;
  /** Valor de la línea antes de impuestos (LineExtensionAmount). */
  base: number;
  impuestos: ImpuestoLinea[];
}

export interface TributoDocumento {
  codigo: CodigoTributo;
  nombre: string;
  total: number;
  /** Un subtotal por tarifa (FAS04). */
  subtotales: Array<{ porcentaje: number; base: number; valor: number }>;
}

export interface DocumentoFiscal {
  lineas: LineaFiscal[];
  tributos: TributoDocumento[];
  /** Suma de las líneas antes de impuestos (LineExtensionAmount). */
  brutoLineas: number;
  /** Suma de las bases de las líneas que tienen algún tributo (TaxExclusiveAmount). */
  baseGravable: number;
  totalImpuestos: number;
  /** brutoLineas + totalImpuestos (TaxInclusiveAmount y PayableAmount). */
  total: number;
}

/** '94' = unidad, en la lista de unidades de medida de la DIAN (FAV05 rechaza las que no estén). */
const UNIDAD_POR_DEFECTO = '94';

export function calcularDocumentoFiscal(items: ItemFacturaDian[]): DocumentoFiscal {
  const lineas: LineaFiscal[] = items.map((item, i) => {
    const cantidad = Number(item.cantidad) || 0;
    const base = redondear2(item.subtotal);
    const impuestos: ImpuestoLinea[] = (item.impuestos || [])
      .filter((imp) => Number(imp.porcentaje) > 0)
      .map((imp) => ({
        codigo: imp.codigo,
        porcentaje: Number(imp.porcentaje),
        base,
        // Siempre base × tarifa: es exactamente la cuenta que rehace la DIAN.
        valor: redondear2(base * Number(imp.porcentaje) / 100),
      }));
    return {
      numero: i + 1,
      codigo: item.codigo?.trim() || undefined,
      descripcion: (item.descripcion || '').trim() || `Ítem ${i + 1}`,
      cantidad,
      unidadMedida: item.unidadMedida?.trim() || UNIDAD_POR_DEFECTO,
      // Precio unitario coherente con la base (descuentos por línea ya aplicados).
      precioUnitario: cantidad > 0 ? redondear2(base / cantidad) : redondear2(item.precioUnitario),
      base,
      impuestos,
    };
  });

  const porTributo = new Map<CodigoTributo, Map<number, { base: number; valor: number }>>();
  for (const l of lineas) {
    for (const imp of l.impuestos) {
      const porTarifa = porTributo.get(imp.codigo) || new Map();
      const acumulado = porTarifa.get(imp.porcentaje) || { base: 0, valor: 0 };
      porTarifa.set(imp.porcentaje, { base: acumulado.base + imp.base, valor: acumulado.valor + imp.valor });
      porTributo.set(imp.codigo, porTarifa);
    }
  }

  const tributos: TributoDocumento[] = [...porTributo.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([codigo, porTarifa]) => {
      const subtotales = [...porTarifa.entries()]
        .sort(([a], [b]) => a - b)
        .map(([porcentaje, s]) => ({ porcentaje, base: redondear2(s.base), valor: redondear2(s.valor) }));
      return { codigo, nombre: NOMBRE_TRIBUTO[codigo], subtotales, total: redondear2(subtotales.reduce((a, s) => a + s.valor, 0)) };
    });

  const brutoLineas = redondear2(lineas.reduce((a, l) => a + l.base, 0));
  const baseGravable = redondear2(lineas.filter((l) => l.impuestos.length > 0).reduce((a, l) => a + l.base, 0));
  const totalImpuestos = redondear2(tributos.reduce((a, t) => a + t.total, 0));

  return { lineas, tributos, brutoLineas, baseGravable, totalImpuestos, total: redondear2(brutoLineas + totalImpuestos) };
}

/** Tributos en la forma que piden las fórmulas de CUFE/CUDE (un valor por código). */
export function impuestosParaHash(doc: DocumentoFiscal): Array<{ codigo: CodigoTributo; valor: number }> {
  return doc.tributos.map((t) => ({ codigo: t.codigo, valor: t.total }));
}

// ── Fecha y hora oficiales ────────────────────────────────────────────────
// La hora legal de Colombia es UTC-05:00 todo el año. Se calcula desde el
// instante UTC, NO desde el reloj/zona del equipo: el mismo documento debe
// dar la misma fecha y el mismo CUFE en una caja en Bogotá, en un navegador
// en otro país y en el servidor (que corre en UTC).

function partesColombia(instante: Date | string): { fecha: string; hora: string } {
  const d = new Date(new Date(instante).getTime() - 5 * 60 * 60 * 1000);
  const iso = d.toISOString();
  return { fecha: iso.slice(0, 10), hora: iso.slice(11, 19) };
}

/** 'YYYY-MM-DD' en hora de Colombia. */
export const fechaColombia = (instante: Date | string): string => partesColombia(instante).fecha;

/** 'HH:MM:SS-05:00' en hora de Colombia. */
export const horaColombia = (instante: Date | string): string => `${partesColombia(instante).hora}-05:00`;
