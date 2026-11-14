/**
 * Terminal principal de Alimentos y Bebidas (migración 0147).
 *
 * Un negocio puede marcar UNA caja como principal: sus mesas son las
 * correctas. Esa caja publica su lista completa (con el orden) y las demás
 * cajas de escritorio o Android la copian y no pueden crear ni borrar mesas.
 * El celular ya lee de la nube, así que ve exactamente lo mismo.
 *
 * Sin principal marcada, todo funciona como antes (cada caja publica lo suyo).
 */
import { getSupabaseClient } from './config';
import { getLinkedClienteId } from './tenantLink';
import type { PanaderiaMesa } from './panaderiaSyncService';

const CLAVE_EQUIPO = 'codecpos_equipo_id';
const CLAVE_PRINCIPAL = 'codecpos_terminal_principal';

export interface TerminalPrincipal {
  id: string;
  nombre: string;
  desde?: string;
}

export type RolMesas = 'principal' | 'copia' | 'sin_principal';

/** Identificador de ESTA instalación; se crea una sola vez. */
export function idEsteEquipo(): string {
  try {
    let id = localStorage.getItem(CLAVE_EQUIPO);
    if (!id) {
      id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `eq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(CLAVE_EQUIPO, id);
    }
    return id;
  } catch {
    return 'equipo-sin-almacenamiento';
  }
}

/** Nombre sugerido para este equipo (se puede cambiar al marcarlo). */
export function nombreSugeridoEsteEquipo(): string {
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) {
    const modelo = ua.match(/Android [\d.]+; ([^;)]+?)(?: Build|\))/)?.[1]?.trim();
    return modelo ? `Terminal ${modelo}` : 'Terminal Android';
  }
  if (/Electron/i.test(ua)) return 'Caja de escritorio';
  return 'Caja';
}

/** Última principal conocida (sirve sin internet). */
export function principalEnCache(): TerminalPrincipal | null {
  try {
    const raw = localStorage.getItem(CLAVE_PRINCIPAL);
    return raw ? (JSON.parse(raw) as TerminalPrincipal) : null;
  } catch {
    return null;
  }
}

function guardarCache(p: TerminalPrincipal | null): void {
  try {
    if (p) localStorage.setItem(CLAVE_PRINCIPAL, JSON.stringify(p));
    else localStorage.removeItem(CLAVE_PRINCIPAL);
  } catch { /* ignorar */ }
}

export function rolMesasDe(p: TerminalPrincipal | null): RolMesas {
  if (!p?.id) return 'sin_principal';
  return p.id === idEsteEquipo() ? 'principal' : 'copia';
}

/** Lee la principal en la nube y actualiza la copia local. Sin conexión devuelve la de caché. */
export async function obtenerTerminalPrincipal(): Promise<TerminalPrincipal | null> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return principalEnCache();
  const { data, error } = await client
    .from('panaderia_ajustes')
    .select('terminal_principal_id, terminal_principal_nombre, terminal_principal_desde')
    .eq('cliente_id', clienteId)
    .maybeSingle();
  if (error) return principalEnCache();
  const p = data?.terminal_principal_id
    ? { id: data.terminal_principal_id, nombre: data.terminal_principal_nombre || 'Terminal principal', desde: data.terminal_principal_desde || undefined }
    : null;
  guardarCache(p);
  return p;
}

/** Marca este equipo como la terminal principal del negocio. */
export async function marcarEsteEquipoComoPrincipal(nombre: string): Promise<TerminalPrincipal> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) throw new Error('Esta caja no está vinculada a la nube.');
  const p: TerminalPrincipal = { id: idEsteEquipo(), nombre: nombre.trim() || nombreSugeridoEsteEquipo(), desde: new Date().toISOString() };
  const { error } = await client.from('panaderia_ajustes').upsert(
    {
      cliente_id: clienteId,
      terminal_principal_id: p.id,
      terminal_principal_nombre: p.nombre,
      terminal_principal_desde: p.desde,
      updated_at: p.desde,
    },
    { onConflict: 'cliente_id' },
  );
  if (error) throw new Error(error.message);
  guardarCache(p);
  return p;
}

/** Avisa cuando otro equipo cambia la terminal principal. */
export function suscribirTerminalPrincipal(alCambiar: (p: TerminalPrincipal | null) => void): () => void {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return () => {};
  const canal = client
    .channel(`panaderia-ajustes-${clienteId}-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'panaderia_ajustes', filter: `cliente_id=eq.${clienteId}` }, (payload: any) => {
      const r = payload.new || {};
      const p = r.terminal_principal_id
        ? { id: r.terminal_principal_id, nombre: r.terminal_principal_nombre || 'Terminal principal', desde: r.terminal_principal_desde || undefined }
        : null;
      guardarCache(p);
      alCambiar(p);
    })
    .subscribe();
  return () => { void client.removeChannel(canal); };
}

// ── Mesas ────────────────────────────────────────────────────────────────────

/** Orden natural: "Mesa 2" antes que "Mesa 10". */
export function compararNombresMesa(a: string, b: string): number {
  return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });
}

function filaAMesa(r: any): PanaderiaMesa {
  return { id: r.local_id, nombre: r.nombre, activa: r.activa !== false, tiendaId: r.tienda_id || null };
}

/** Todas las mesas del negocio (todas las sucursales) en el orden guardado. */
export async function descargarTodasLasMesas(): Promise<PanaderiaMesa[] | null> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return null;
  const { data, error } = await client.from('panaderia_mesas').select('*').eq('cliente_id', clienteId);
  if (error) return null;
  return (data || [])
    .sort((a: any, b: any) => (Number(a.orden) || 0) - (Number(b.orden) || 0) || compararNombresMesa(a.nombre || '', b.nombre || ''))
    .map(filaAMesa);
}

/**
 * La principal publica su lista COMPLETA: orden = posición en la lista, y se
 * quitan de la nube las mesas que ya no tiene, salvo las que tengan una cuenta
 * abierta (esas se dejan para no perder un pedido en curso).
 * Devuelve los nombres de las mesas que no se pudieron quitar por eso.
 */
export async function publicarMesasCompletas(mesas: PanaderiaMesa[]): Promise<{ conservadas: string[] }> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return { conservadas: [] };

  if (mesas.length > 0) {
    const { error } = await client.from('panaderia_mesas').upsert(
      mesas.map((m, i) => ({
        cliente_id: clienteId,
        local_id: m.id,
        nombre: m.nombre,
        activa: m.activa !== false,
        orden: i,
        tienda_id: m.tiendaId || null,
      })),
      { onConflict: 'cliente_id,local_id' },
    );
    if (error) throw new Error(error.message);
  }

  const { data: enNube, error: errLeer } = await client.from('panaderia_mesas').select('local_id, nombre').eq('cliente_id', clienteId);
  if (errLeer) throw new Error(errLeer.message);
  const locales = new Set(mesas.map((m) => m.id));
  const sobrantes = (enNube || []).filter((r: any) => !locales.has(r.local_id));
  if (sobrantes.length === 0) return { conservadas: [] };

  const { data: cuentas } = await client
    .from('panaderia_cuentas')
    .select('mesa_local_id, items, abierta')
    .eq('cliente_id', clienteId)
    .in('mesa_local_id', sobrantes.map((r: any) => r.local_id));
  const conCuenta = new Set(
    (cuentas || [])
      .filter((c: any) => c.abierta !== false && Array.isArray(c.items) && c.items.length > 0)
      .map((c: any) => c.mesa_local_id),
  );
  const aBorrar = sobrantes.filter((r: any) => !conCuenta.has(r.local_id)).map((r: any) => r.local_id);
  if (aBorrar.length > 0) {
    const { error } = await client.from('panaderia_mesas').delete().eq('cliente_id', clienteId).in('local_id', aBorrar);
    if (error) throw new Error(error.message);
  }
  return { conservadas: sobrantes.filter((r: any) => conCuenta.has(r.local_id)).map((r: any) => r.nombre) };
}

/** Avisa (con un pequeño retraso para agrupar ráfagas) cuando cambian las mesas en la nube. */
export function suscribirMesasNube(alCambiar: () => void): () => void {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return () => {};
  let t: ReturnType<typeof setTimeout> | null = null;
  const canal = client
    .channel(`panaderia-mesas-${clienteId}-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'panaderia_mesas', filter: `cliente_id=eq.${clienteId}` }, () => {
      if (t) clearTimeout(t);
      t = setTimeout(alCambiar, 600);
    })
    .subscribe();
  return () => { if (t) clearTimeout(t); void client.removeChannel(canal); };
}
