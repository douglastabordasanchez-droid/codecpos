/**
 * Búsqueda predictiva de productos (caja, web y celular).
 *
 * Al escribir, primero sale lo que la persona más probablemente quiere:
 *  1. el código exacto (lector de barras);
 *  2. los que empiezan por lo escrito, luego los que tienen una palabra que
 *     empieza así, luego los que lo contienen en otra parte;
 *  3. dentro de cada grupo, lo que más se vende, y más aún lo que se vende a
 *     esta hora del día (en la mañana no se pide lo mismo que en la noche);
 *  4. lo que nunca se ha vendido, en orden alfabético natural (COMBO 2 antes de COMBO 10).
 *
 * No importan las tildes ni el orden de las palabras: «coca 400» encuentra
 * «Coca Cola 400 ml». Lo que se elige se anota en este equipo y cuenta de
 * inmediato, sin esperar a que se cierre la venta.
 */

export type Franja = 'manana' | 'mediodia' | 'tarde' | 'noche';
export type Conteo = Record<string, { total: number; franjas: Partial<Record<Franja, number>> }>;

const CLAVE_ELEGIDOS = 'codecpos_busqueda_elegidos';

export const franjaDe = (fecha: Date): Franja => {
  const h = fecha.getHours();
  return h >= 5 && h < 11 ? 'manana' : h >= 11 && h < 15 ? 'mediodia' : h >= 15 && h < 19 ? 'tarde' : 'noche';
};

/** Minúsculas y sin tildes. */
export const normalizar = (t: unknown) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function sumarConteo(c: Conteo, id: string, franja: Franja, n = 1) {
  const x = c[id] || (c[id] = { total: 0, franjas: {} });
  x.total += n;
  x.franjas[franja] = (x.franjas[franja] || 0) + n;
}

export function leerElegidos(): Conteo {
  try { const v = JSON.parse(localStorage.getItem(CLAVE_ELEGIDOS) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

/** Anota que se eligió un producto (cuenta para las próximas búsquedas). */
export function anotarElegido(id: string | number) {
  const c = leerElegidos();
  sumarConteo(c, String(id), franjaDe(new Date()));
  // Que no crezca sin fin: se quedan los 3.000 más usados.
  const ids = Object.keys(c);
  if (ids.length > 3000) {
    ids.sort((a, b) => c[a].total - c[b].total).slice(0, ids.length - 3000).forEach((id) => delete c[id]);
  }
  try { localStorage.setItem(CLAVE_ELEGIDOS, JSON.stringify(c)); } catch { /* sin almacenamiento */ }
}

/** Conteo de ventas a partir de una lista de ventas con items { id, cantidad }. */
export function conteoDeVentas(ventas: Array<{ fecha?: string; estado?: string; items?: Array<{ id?: unknown; productoId?: unknown; cantidad?: unknown }> }>): Conteo {
  const c: Conteo = {};
  for (const v of ventas || []) {
    if (!v || v.estado === 'anulada') continue;
    const franja = franjaDe(v.fecha ? new Date(v.fecha) : new Date());
    for (const it of v.items || []) {
      const id = it?.id ?? it?.productoId;
      if (id != null) sumarConteo(c, String(id), franja, 1); // una venta = un voto, no importa la cantidad
    }
  }
  return c;
}

/** Puntaje de popularidad: pesa más la franja actual y lo elegido en este equipo. */
export function crearPuntaje(historial: Conteo, elegidos: Conteo = leerElegidos()) {
  const franja = franjaDe(new Date());
  return (id: string) => {
    const h = historial[id], e = elegidos[id];
    return (h?.franjas[franja] || 0) * 3 + (h?.total || 0) + ((e?.franjas[franja] || 0) * 3 + (e?.total || 0)) * 2;
  };
}

interface ProductoBuscable { id: string | number; nombre?: string; codigo?: string | null }

/**
 * Ordena las coincidencias de `texto` en `productos`. `textos[i]` es el texto
 * normalizado donde se busca el producto i (nombre, código, categoría…).
 */
export function buscarPredictivo<P extends ProductoBuscable>(
  productos: P[],
  textos: string[],
  texto: string,
  puntaje: (id: string) => number,
  limite = 12,
  codigoDe: (p: P) => string = (p) => String(p.codigo ?? ''),
): P[] {
  const t = normalizar(texto).trim();
  if (!t) return [];
  const palabras = t.split(/\s+/).filter(Boolean);
  const exacto = productos.find((p) => normalizar(codigoDe(p)) === t);
  const encontrados: Array<{ p: P; nivel: number; pts: number; nombre: string }> = [];
  for (let i = 0; i < productos.length && encontrados.length < 2000; i++) {
    const p = productos[i];
    if (p === exacto) continue;
    const idx = textos[i];
    if (!palabras.every((w) => idx.includes(w))) continue;
    const nombre = normalizar(p.nombre);
    const nivel = nombre.startsWith(t) ? 3
      : palabras.every((w) => nombre.startsWith(w) || nombre.includes(' ' + w)) ? 2
      : 1;
    encontrados.push({ p, nivel, pts: puntaje(String(p.id)), nombre });
  }
  encontrados.sort((a, b) =>
    b.nivel - a.nivel
    || b.pts - a.pts
    || a.nombre.localeCompare(b.nombre, 'es', { numeric: true, sensitivity: 'base' }));
  return [...(exacto ? [exacto] : []), ...encontrados.slice(0, exacto ? limite - 1 : limite).map((x) => x.p)];
}

/** Los más vendidos a esta hora (para mostrar con el buscador vacío). */
export function masVendidos<P extends ProductoBuscable>(productos: P[], puntaje: (id: string) => number, limite = 8): P[] {
  return productos
    .map((p) => ({ p, n: puntaje(String(p.id)) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, limite)
    .map((x) => x.p);
}
