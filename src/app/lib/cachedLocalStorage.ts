/**
 * 🚀 FIX rendimiento: generalización del patrón de caché autoinvalidante ya
 * probado en electronStore.ts (_productosLSCacheRaw/_productosLSCacheParsed).
 *
 * `pos-productos` y `codec_pos_config` (entre otras claves) se leen y
 * reparsean crudos desde localStorage en ~20-25 archivos distintos, sin
 * ninguna caché compartida — cada navegación entre módulos, cada tecla en
 * un buscador, vuelve a hacer JSON.parse del catálogo/config completos
 * aunque nada haya cambiado desde la última lectura.
 *
 * Esta caché compara el string crudo contra el último leído para esa clave:
 * si es idéntico, devuelve el valor ya parseado (sin costo); si cambió
 * (edición, importación, sync remoto, etc.), reparsea normalmente. Nunca
 * puede devolver datos obsoletos, solo evita trabajo repetido cuando nada
 * cambió. No reemplaza localStorage como fuente de verdad — es aditivo.
 */

const cache = new Map<string, { raw: string; parsed: any }>();

export function getCached<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;

  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.parsed as T;

  let parsed: T;
  try {
    parsed = JSON.parse(raw) as T;
  } catch {
    parsed = fallback;
  }
  cache.set(key, { raw, parsed });
  return parsed;
}

export function setCached<T>(key: string, value: T): void {
  const raw = JSON.stringify(value);
  try {
    localStorage.setItem(key, raw);
  } catch {
    /* storage lleno */
  }
  cache.set(key, { raw, parsed: value });
}

/** Fuerza a que la próxima lectura de esta clave reparsee desde localStorage. */
export function invalidateCached(key: string): void {
  cache.delete(key);
}
