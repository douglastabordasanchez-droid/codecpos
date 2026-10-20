/**
 * IVA de las líneas de una factura cuando el precio cobrado YA lo incluye
 * (así cobra la web: el precio de venta del producto es lo que paga el
 * cliente). La base sale de despejar el IVA, de modo que base + IVA da lo
 * cobrado, y el valor del IVA es base × tarifa, la misma cuenta que rehace
 * la DIAN (ver calcularDocumentoFiscal).
 */
import type { ItemFacturaDian } from './types';

const redondear2 = (n: number) => Math.round(n * 100) / 100;

export function lineaConIvaIncluido(
  linea: Pick<ItemFacturaDian, 'codigo' | 'descripcion' | 'cantidad'>,
  precioConIva: number,
  porcentajeIva: number,
): ItemFacturaDian {
  const cobrado = redondear2(linea.cantidad * precioConIva);
  const pct = Number(porcentajeIva) || 0;
  if (pct <= 0) {
    return { ...linea, precioUnitario: precioConIva, subtotal: cobrado };
  }
  const base = redondear2(cobrado / (1 + pct / 100));
  return {
    ...linea,
    precioUnitario: linea.cantidad > 0 ? redondear2(base / linea.cantidad) : base,
    subtotal: base,
    impuestos: [{ codigo: '01', porcentaje: pct, valor: redondear2(base * pct / 100) }],
  };
}

/**
 * Un negocio no responsable de IVA no puede facturarlo: si el producto quedó
 * marcado con IVA, lo cobrado entero es la base de la línea.
 */
export function sinIvaParaNoResponsable(items: ItemFacturaDian[]): ItemFacturaDian[] {
  return items.map((item) => {
    const iva = (item.impuestos || []).reduce((s, imp) => s + (Number(imp.valor) || 0), 0);
    if (!item.impuestos?.length) return item;
    const subtotal = redondear2(item.subtotal + iva);
    return {
      ...item,
      subtotal,
      precioUnitario: item.cantidad > 0 ? redondear2(subtotal / item.cantidad) : subtotal,
      impuestos: undefined,
    };
  });
}
