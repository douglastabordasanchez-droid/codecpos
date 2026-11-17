/**
 * Claves locales del recetario (ingredientes, recetas, combos) y la marca de
 * «algo cambió aquí» que usa recetarioNube.ts para saber qué subir.
 * Vive aparte para que electronStore no dependa del cliente de Supabase.
 */
export const CLAVES_RECETARIO = {
  ingredientes: 'pos-ingredientes-inventario',
  recetas: 'pos-recetas',
  lineas: 'pos-receta-ingredientes',
  combos: 'pos-combos-onces',
} as const;

export const CLAVE_ELIMINADOS = 'pos-ingredientes-eliminados';
export const CLAVE_CAMBIO_LOCAL = 'codecpos_recetario_cambio_local';
/** Se dispara cuando alguien cambia el recetario en ESTE equipo. */
export const EVENTO_RECETARIO_CAMBIO = 'codecpos:recetario-cambio';
/** Se dispara cuando el recetario local se reemplazó con lo que bajó de la nube. */
export const EVENTO_RECETARIO_ACTUALIZADO = 'codecpos:recetario-actualizado';

export function marcarCambioRecetario(): void {
  try { localStorage.setItem(CLAVE_CAMBIO_LOCAL, String(Date.now())); } catch { /* sin almacenamiento */ }
  try { window.dispatchEvent(new Event(EVENTO_RECETARIO_CAMBIO)); } catch { /* fuera del navegador */ }
}

/** Anota un ingrediente borrado para que las otras cajas también lo quiten. */
export function anotarIngredienteEliminado(id: string): void {
  try {
    const lista: string[] = JSON.parse(localStorage.getItem(CLAVE_ELIMINADOS) || '[]');
    if (!lista.includes(id)) lista.push(id);
    localStorage.setItem(CLAVE_ELIMINADOS, JSON.stringify(lista.slice(-1000)));
  } catch { /* sin almacenamiento */ }
}
