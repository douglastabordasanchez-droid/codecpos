/**
 * Preferencias del menú lateral de cada usuario: orden, módulos ocultos y
 * nombres propios. Son de la PERSONA, no del equipo: se guardan en su fila
 * de `empleados` (columna preferencias_menu, migración 0102) y además en
 * localStorage para que el menú aparezca al instante, sin esperar la red.
 * Así el menú que alguien organiza en el computador es el mismo que ve en
 * su celular.
 */
import { getSupabaseClient } from '../../app/lib/supabase/config';

export interface PreferenciasMenu {
  /** Rutas en el orden elegido (por grupo se respeta el orden relativo). */
  orden: string[];
  ocultos: string[];
  nombres: Record<string, string>;
}

const VACIAS: PreferenciasMenu = { orden: [], ocultos: [], nombres: {} };
const CLAVE = 'codecpos-preferencias-menu';
/** Versión anterior: solo guardaba los ocultos, en este navegador. Se migra. */
const CLAVE_OCULTOS_ANTERIOR = 'codecpos-sidebar-modulos-ocultos';
export const EVENTO_PREFERENCIAS_MENU = 'codecpos:preferencias-menu';

function normalizar(crudo: any): PreferenciasMenu {
  return {
    orden: Array.isArray(crudo?.orden) ? crudo.orden.filter((p: unknown) => typeof p === 'string') : [],
    ocultos: Array.isArray(crudo?.ocultos) ? crudo.ocultos.filter((p: unknown) => typeof p === 'string') : [],
    nombres: crudo?.nombres && typeof crudo.nombres === 'object' ? crudo.nombres : {},
  };
}

let actuales: PreferenciasMenu = (() => {
  try {
    const guardadas = localStorage.getItem(CLAVE);
    if (guardadas) return normalizar(JSON.parse(guardadas));
    const ocultosViejos = JSON.parse(localStorage.getItem(CLAVE_OCULTOS_ANTERIOR) || '[]');
    return { ...VACIAS, ocultos: Array.isArray(ocultosViejos) ? ocultosViejos : [] };
  } catch {
    return VACIAS;
  }
})();
let empleadoActual: string | null = null;

export const obtenerPreferenciasMenu = (): PreferenciasMenu => actuales;

function publicar(nuevas: PreferenciasMenu, guardarEnNube: boolean) {
  actuales = nuevas;
  try { localStorage.setItem(CLAVE, JSON.stringify(nuevas)); } catch { /* sin almacenamiento local: queda la nube */ }
  window.dispatchEvent(new CustomEvent(EVENTO_PREFERENCIAS_MENU));
  if (!guardarEnNube || !empleadoActual) return;
  getSupabaseClient()
    ?.from('empleados')
    .update({ preferencias_menu: nuevas })
    .eq('id', empleadoActual)
    .then(({ error }) => { if (error) console.warn('[menú] No se guardaron las preferencias en la nube:', error.message); });
}

/**
 * Trae las preferencias guardadas en la nube para este usuario. Si en la nube
 * no hay nada todavía pero este navegador sí tiene (versión anterior), se
 * suben, para no perder lo que la persona ya había organizado.
 */
export async function sincronizarPreferenciasMenu(empleadoId: string): Promise<void> {
  empleadoActual = empleadoId;
  const client = getSupabaseClient();
  if (!client) return;
  const { data, error } = await client.from('empleados').select('preferencias_menu').eq('id', empleadoId).maybeSingle();
  if (error) return;
  const enNube = normalizar((data as { preferencias_menu?: unknown } | null)?.preferencias_menu);
  const nubeVacia = !enNube.orden.length && !enNube.ocultos.length && !Object.keys(enNube.nombres).length;
  const localVacio = !actuales.orden.length && !actuales.ocultos.length && !Object.keys(actuales.nombres).length;
  if (nubeVacia && !localVacio) publicar(actuales, true);
  else publicar(enNube, false);
}

export function moverModulo(path: string, direccion: -1 | 1, hermanos: string[]) {
  // `hermanos`: rutas del mismo grupo, en el orden en que se ven ahora.
  const i = hermanos.indexOf(path);
  const j = i + direccion;
  if (i < 0 || j < 0 || j >= hermanos.length) return;
  const reordenados = [...hermanos];
  [reordenados[i], reordenados[j]] = [reordenados[j], reordenados[i]];
  const resto = actuales.orden.filter((p) => !hermanos.includes(p));
  publicar({ ...actuales, orden: [...resto, ...reordenados] }, true);
}

export function alternarOculto(path: string) {
  const ocultos = actuales.ocultos.includes(path) ? actuales.ocultos.filter((p) => p !== path) : [...actuales.ocultos, path];
  publicar({ ...actuales, ocultos }, true);
}

export function renombrarModulo(path: string, nombre: string) {
  const nombres = { ...actuales.nombres };
  const limpio = nombre.trim().slice(0, 40);
  if (limpio) nombres[path] = limpio;
  else delete nombres[path];
  publicar({ ...actuales, nombres }, true);
}

export function restablecerMenu() {
  publicar(VACIAS, true);
}
