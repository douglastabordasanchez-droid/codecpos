/**
 * Inventario por sede (migración 0153).
 *
 * Cada producto pertenece a una sede (productos.tienda_id; vacío = Tienda
 * Principal). Si el negocio NO tiene «Inventario universal», cada sede ve
 * solo sus productos y lo que se crea con una sede elegida queda en ella.
 * Con «Inventario universal» todas las sedes comparten el catálogo.
 */
import { getSupabaseClient } from './supabase/config';

export const SEDE_PRINCIPAL = 'tienda_principal';
const CLAVE_UNIVERSAL = 'codecpos_inventario_universal';

/** ¿El producto se ve en la sede elegida? */
export function productoEnSede(tiendaDelProducto: string | null | undefined, sedeActiva: string | null | undefined, universal: boolean): boolean {
  if (universal) return true;
  const dueno = tiendaDelProducto || SEDE_PRINCIPAL;
  const sede = sedeActiva || SEDE_PRINCIPAL;
  return dueno === sede;
}

/** Sede que se guarda en un producto nuevo (null = principal o inventario universal). */
export function sedeParaProductoNuevo(sedeActiva: string | null | undefined, universal: boolean): string | null {
  if (universal || !sedeActiva || sedeActiva === SEDE_PRINCIPAL) return null;
  return sedeActiva;
}

/** Último valor conocido en este equipo (sirve sin internet). */
export function inventarioUniversalGuardado(): boolean {
  try { return localStorage.getItem(CLAVE_UNIVERSAL) === 'true'; } catch { return false; }
}

/** Lee la opción del negocio en la nube y la recuerda en este equipo. */
export async function obtenerInventarioUniversal(clienteId: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || !clienteId) return inventarioUniversalGuardado();
  const { data, error } = await client.from('clientes_pos').select('inventario_universal').eq('id', clienteId).maybeSingle();
  if (error || !data) return inventarioUniversalGuardado();
  const v = !!(data as { inventario_universal?: boolean }).inventario_universal;
  try { localStorage.setItem(CLAVE_UNIVERSAL, String(v)); } catch { /* ignorar */ }
  window.dispatchEvent(new CustomEvent('codecpos:inventario-universal', { detail: v }));
  return v;
}

export async function fijarInventarioUniversal(universal: boolean): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Sin conexión con la nube');
  const { error } = await client.rpc('fijar_inventario_universal', { p_universal: universal });
  if (error) throw new Error(error.message);
  try { localStorage.setItem(CLAVE_UNIVERSAL, String(universal)); } catch { /* ignorar */ }
  window.dispatchEvent(new CustomEvent('codecpos:inventario-universal', { detail: universal }));
}
