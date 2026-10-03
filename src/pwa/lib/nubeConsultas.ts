/**
 * Utilidades compartidas para leer datos del negocio desde Supabase en la
 * web y el celular (Reportes, Contabilidad...).
 */

const PAGINA = 1000;

/** PostgREST corta en 1000 filas por petición: se pagina hasta agotar, o un
 * mes de ventas de un negocio movido saldría truncado sin ningún aviso. */
export async function traerTodo<T>(armar: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await armar(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    const lote = (data as T[]) || [];
    filas.push(...lote);
    if (lote.length < PAGINA) return filas;
  }
}

/**
 * Instante → 'YYYY-MM-DDTHH:mm:ss' en hora LOCAL, sin zona. Agrupar por día
 * con la fecha UTC que devuelve Supabase metería toda venta hecha después de
 * las 7 p.m. (Colombia) en el día siguiente.
 */
export function aFechaLocal(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export const inicioDelDia = (fecha: string) => new Date(`${fecha}T00:00:00`).toISOString();
export const finDelDia = (fecha: string) => new Date(`${fecha}T23:59:59.999`).toISOString();

/** 'YYYY-MM-DD' local de una fecha. */
export function fechaLocal(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const money = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;
