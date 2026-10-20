/**
 * Costo de lo vendido para productos a granel (Veterinaria).
 *
 * En un bulto, `costo` es lo que costó el bulto entero (ej. $95.000 los 25 kg)
 * y lo vendido se cuenta en kilos. Para la utilidad hay que usar el costo por
 * kilo; si no, vender 1,5 kg restaba $142.500 de costo en vez de $5.700.
 * Lo usan Electron (electronStore) y la web (contabilidad, inicio, dashboard).
 */
export interface ProductoConCosto {
  costo?: number | string | null;
  tipoProducto?: string | null;
  tipo_producto?: string | null;
  pesoBultoKg?: number | string | null;
  peso_bulto_kg?: number | string | null;
}

/** Costo de UNA unidad de venta: un kilo en los productos a granel, una unidad en los demás. */
export function costoPorUnidadDeVenta(p: ProductoConCosto | null | undefined): number {
  const costo = Number(p?.costo) || 0;
  const granel = (p?.tipoProducto ?? p?.tipo_producto) === 'granel';
  const pesoBulto = Number(p?.pesoBultoKg ?? p?.peso_bulto_kg) || 0;
  return granel && pesoBulto > 0 ? costo / pesoBulto : costo;
}
