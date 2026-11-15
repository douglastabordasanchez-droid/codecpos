/**
 * Billetes sugeridos para el efectivo recibido: el valor exacto y los
 * redondeos con los que la gente suele pagar (al siguiente mil, cinco mil,
 * diez mil, veinte mil, cincuenta mil y cien mil). Ejemplo: cuenta de
 * $8.500 → Exacto, $9.000, $10.000, $20.000, $50.000.
 * Lo usan Vender en la web y el cobro de la caja (Electron y terminal).
 */
export function billetesSugeridos(total: number, maximo = 5): number[] {
  const t = Math.max(0, Math.round(total));
  const opciones = new Set<number>([t]);
  for (const paso of [1000, 5000, 10000, 20000, 50000, 100000]) {
    const v = Math.ceil(t / paso) * paso;
    if (v > t) opciones.add(v);
  }
  return [...opciones].sort((a, b) => a - b).slice(0, maximo);
}
