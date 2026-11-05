/**
 * Día calendario LOCAL ('YYYY-MM-DD') de una fecha guardada.
 *
 * Gastos, cierres, devoluciones y ventas se guardan con `toISOString()`, que
 * está en UTC. Cortar ese texto con `split('T')[0]` mete todo lo que pasa
 * después de las 7 p.m. (Colombia) en el día siguiente, y el reporte de un
 * día deja de coincidir con la tirilla impresa esa noche.
 */
export function diaLocal(fecha: string | null | undefined): string {
  if (!fecha) return '';
  const texto = String(fecha);
  // Solo fecha, sin hora: ya es el día.
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  const d = new Date(texto);
  if (Number.isNaN(d.getTime())) return texto.split('T')[0];
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
