/**
 * Propinas: se cobran junto con la venta y quedan dentro de `venta.total`,
 * pero son de los empleados. No son ingreso del negocio, así que la
 * contabilidad, el dashboard y los reportes usan la venta SIN propina y
 * muestran la propina aparte para que el administrador sepa cuánto pagar.
 */

export function propinaDe(venta: unknown): number {
  const v = venta as { propina?: unknown } | null | undefined;
  return Math.max(0, Number(v?.propina) || 0);
}

/** Lo que el negocio vendió en productos: total cobrado menos la propina. */
export function ventaSinPropina(venta: unknown): number {
  const v = venta as { total?: unknown } | null | undefined;
  return Math.max(0, (Number(v?.total) || 0) - propinaDe(venta));
}
