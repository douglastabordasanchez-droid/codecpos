/**
 * CODEC POS v2.0 — Sincronización de Alimentos y Bebidas con la nube
 *
 * En Electron este módulo son 4 claves sueltas de localStorage:
 *   codecpos_panaderia_cats   → categorías del POS táctil
 *   codecpos_panaderia_prods  → productos del POS táctil
 *   codecpos_mesas_config     → mesas del salón
 *   codecpos_mesas_cuentas    → { mesaId: ItemMesa[] } cuentas abiertas
 *
 * Aquí se publican en las tablas de la migración 0024 para que el celular
 * funcione como comandera: el mesero toma el pedido en la mesa y la caja lo
 * ve al instante, sin estar en la misma red.
 *
 * Dirección de cada cosa:
 *   • catálogo (categorías, productos, mesas) → SOLO baja de Electron. Es la
 *     configuración del negocio; se administra en el equipo, no en el celular.
 *   • cuentas de mesa → BIDIRECCIONAL. El celular abre y agrega ítems; la caja
 *     las cobra y las cierra.
 */
import { getSupabaseClient } from './config';
import { getLinkedClienteId } from './tenantLink';

export interface PanaderiaCategoria {
  id: string;
  nombre: string;
  icono?: string;
  color?: string;
}

export interface PanaderiaProducto {
  id: string;
  categoriaId: string;
  nombre: string;
  codigo?: string;
  precio: number;
  costo?: number;
  stock?: number;
  icono?: string;
  color?: string;
  tipoInventario?: 'directo' | 'receta';
  recipeId?: string;
}

export interface PanaderiaMesa {
  id: string;
  nombre: string;
  activa: boolean;
}

export interface ItemCuenta {
  producto: { id: string; nombre: string; precio: number; codigo?: string };
  cantidad: number;
}

export interface CuentaMesa {
  mesaLocalId: string;
  items: ItemCuenta[];
  total: number;
  abierta: boolean;
  meseroNombre?: string;
  actualizadoEn: 'electron' | 'pwa';
  updatedAt: string;
}

function ctx() {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return null;
  return { client, clienteId };
}

// Anti-eco (mismo patrón que tallerSyncService.ts): si esta misma terminal
// acaba de escribir la cuenta de una mesa, el cambio remoto que Supabase le
// devuelve de vuelta es el reflejo de su propio guardado, no un pedido ajeno
// — sin esto, DOS cajas Electron (no solo caja+celular) nunca se enterarían
// una de la otra, porque antes solo se aceptaba lo que viniera marcado como
// `actualizado_en: 'pwa'`.
const VENTANA_ECO_MS = 8000;
const mesasRecienGuardadas = new Map<string, number>();

function marcarMesaComoRecienGuardada(mesaLocalId: string): void {
  mesasRecienGuardadas.set(mesaLocalId, Date.now());
  if (mesasRecienGuardadas.size > 100) {
    const limite = Date.now() - VENTANA_ECO_MS;
    for (const [id, ts] of mesasRecienGuardadas) if (ts < limite) mesasRecienGuardadas.delete(id);
  }
}

export function esEcoPropioDeMesa(mesaLocalId: string): boolean {
  const ts = mesasRecienGuardadas.get(mesaLocalId);
  return !!ts && Date.now() - ts < VENTANA_ECO_MS;
}

// ── Catálogo: Electron → nube ────────────────────────────────────────────────

export async function pushCatalogoPanaderia(datos: {
  categorias: PanaderiaCategoria[];
  productos: PanaderiaProducto[];
  mesas: PanaderiaMesa[];
}): Promise<void> {
  const c = ctx();
  if (!c) return;
  const { client, clienteId } = c;

  if (datos.categorias.length > 0) {
    const { error } = await client.from('panaderia_categorias').upsert(
      datos.categorias.map((cat, i) => ({
        cliente_id: clienteId,
        local_id: cat.id,
        nombre: cat.nombre,
        icono: cat.icono || 'pan',
        color: cat.color || '#2563eb',
        orden: i,
      })),
      { onConflict: 'cliente_id,local_id' }
    );
    if (error) throw new Error(error.message);
  }

  if (datos.productos.length > 0) {
    const { error } = await client.from('panaderia_productos').upsert(
      datos.productos.map((p) => ({
        cliente_id: clienteId,
        local_id: p.id,
        categoria_local_id: p.categoriaId || null,
        nombre: p.nombre,
        codigo: p.codigo || null,
        precio: Number(p.precio) || 0,
        costo: Number(p.costo) || 0,
        stock: Number(p.stock) || 0,
        icono: p.icono || 'pan',
        color: p.color || '#2563eb',
        tipo_inventario: p.tipoInventario || 'directo',
        recipe_id: p.recipeId || null,
        activo: true,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'cliente_id,local_id' }
    );
    if (error) throw new Error(error.message);
  }

  if (datos.mesas.length > 0) {
    const { error } = await client.from('panaderia_mesas').upsert(
      datos.mesas.map((m, i) => ({
        cliente_id: clienteId,
        local_id: m.id,
        nombre: m.nombre,
        activa: m.activa !== false,
        orden: i,
      })),
      { onConflict: 'cliente_id,local_id' }
    );
    if (error) throw new Error(error.message);
  }
}

/** Lee el catálogo desde localStorage de Electron y lo publica. */
export async function sincronizarPanaderiaDesdeLocal(): Promise<{
  categorias: number; productos: number; mesas: number;
}> {
  const leer = <T,>(clave: string, porDefecto: T): T => {
    try {
      const raw = localStorage.getItem(clave);
      if (!raw) return porDefecto;
      const parsed = JSON.parse(raw);
      return parsed ?? porDefecto;
    } catch { return porDefecto; }
  };

  const categorias = leer<PanaderiaCategoria[]>('codecpos_panaderia_cats', []);
  const productos = leer<PanaderiaProducto[]>('codecpos_panaderia_prods', []);
  const mesas = leer<PanaderiaMesa[]>('codecpos_mesas_config', []);

  await pushCatalogoPanaderia({
    categorias: Array.isArray(categorias) ? categorias : [],
    productos: Array.isArray(productos) ? productos : [],
    mesas: Array.isArray(mesas) ? mesas : [],
  });

  return {
    categorias: Array.isArray(categorias) ? categorias.length : 0,
    productos: Array.isArray(productos) ? productos.length : 0,
    mesas: Array.isArray(mesas) ? mesas.length : 0,
  };
}

// ── Catálogo: nube → PWA ─────────────────────────────────────────────────────

export async function obtenerCatalogoPanaderia(clienteId: string): Promise<{
  categorias: PanaderiaCategoria[];
  productos: PanaderiaProducto[];
  mesas: PanaderiaMesa[];
}> {
  const client = getSupabaseClient();
  const vacio = { categorias: [], productos: [], mesas: [] };
  if (!client) return vacio;

  const [cats, prods, mesas] = await Promise.all([
    client.from('panaderia_categorias').select('*').eq('cliente_id', clienteId).order('orden'),
    client.from('panaderia_productos').select('*').eq('cliente_id', clienteId).eq('activo', true).order('nombre'),
    client.from('panaderia_mesas').select('*').eq('cliente_id', clienteId).order('orden'),
  ]);

  return {
    categorias: (cats.data || []).map((r: any) => ({
      id: r.local_id, nombre: r.nombre, icono: r.icono, color: r.color,
    })),
    productos: (prods.data || []).map((r: any) => ({
      id: r.local_id,
      categoriaId: r.categoria_local_id || '',
      nombre: r.nombre,
      codigo: r.codigo || undefined,
      precio: Number(r.precio) || 0,
      costo: Number(r.costo) || 0,
      stock: Number(r.stock) || 0,
      icono: r.icono,
      color: r.color,
      tipoInventario: r.tipo_inventario,
      recipeId: r.recipe_id || undefined,
    })),
    mesas: (mesas.data || [])
      .filter((r: any) => r.activa !== false)
      .map((r: any) => ({ id: r.local_id, nombre: r.nombre, activa: r.activa !== false })),
  };
}

// ── Cuentas de mesa: bidireccional ───────────────────────────────────────────

function mapCuenta(r: any): CuentaMesa {
  return {
    mesaLocalId: r.mesa_local_id,
    items: Array.isArray(r.items) ? r.items : [],
    total: Number(r.total) || 0,
    abierta: r.abierta !== false,
    meseroNombre: r.mesero_nombre || undefined,
    actualizadoEn: r.actualizado_en === 'pwa' ? 'pwa' : 'electron',
    updatedAt: r.updated_at,
  };
}

export async function obtenerCuentasMesa(clienteId: string): Promise<CuentaMesa[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client
    .from('panaderia_cuentas')
    .select('*')
    .eq('cliente_id', clienteId);
  if (error) throw new Error(error.message);
  return (data || []).map(mapCuenta);
}

export async function guardarCuentaMesa(
  clienteId: string,
  mesaLocalId: string,
  items: ItemCuenta[],
  origen: 'electron' | 'pwa',
  meseroNombre?: string
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('nuestra base de datos no está configurada');

  const total = items.reduce(
    (s, it) => s + (Number(it.producto?.precio) || 0) * (Number(it.cantidad) || 0),
    0
  );

  const { error } = await client.from('panaderia_cuentas').upsert(
    {
      cliente_id: clienteId,
      mesa_local_id: mesaLocalId,
      items,
      total,
      // Una cuenta sin ítems es una mesa libre: se marca cerrada para que el
      // salón no muestre "ocupada" con $0.
      abierta: items.length > 0,
      mesero_nombre: meseroNombre || null,
      actualizado_en: origen,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'cliente_id,mesa_local_id' }
  );
  if (error) throw new Error(error.message);
  marcarMesaComoRecienGuardada(mesaLocalId);
}

/** Realtime de cuentas — la caja ve el pedido del mesero (o de otra caja) al instante. */
export function suscribirCuentasMesa(
  clienteId: string,
  onCambio: (cuenta: CuentaMesa) => void
): () => void {
  const client = getSupabaseClient();
  if (!client) return () => {};

  const canal = client
    .channel(`panaderia-cuentas-${clienteId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'panaderia_cuentas', filter: `cliente_id=eq.${clienteId}` },
      (payload) => {
        const fila = payload.new as Record<string, unknown> | null;
        if (fila?.mesa_local_id) onCambio(mapCuenta(fila));
      }
    )
    .subscribe();

  return () => { client.removeChannel(canal); };
}

// ── Comandas de Cocina/Bar ───────────────────────────────────────────────────
//
// A diferencia de la cuenta de mesa (un solo registro que se sobrescribe),
// cada comanda es un pedido puntual que el mesero decide "enviar a
// preparar" — se inserta una fila nueva por cada envío y tiene su propio
// ciclo de vida (pendiente → preparando → listo → entregado) que la
// pantalla de Cocina/Bar actualiza.

export type EstadoComanda = 'pendiente' | 'preparando' | 'listo' | 'entregado' | 'cancelado';

export interface ItemComanda {
  nombre: string;
  cantidad: number;
  nota?: string;
}

export interface Comanda {
  id: string;
  mesaLocalId: string;
  mesaNombre?: string;
  items: ItemComanda[];
  estado: EstadoComanda;
  meseroNombre?: string;
  nota?: string;
  createdAt: string;
  updatedAt: string;
}

function mapComanda(r: any): Comanda {
  return {
    id: r.id,
    mesaLocalId: r.mesa_local_id,
    mesaNombre: r.mesa_nombre || undefined,
    items: Array.isArray(r.items) ? r.items : [],
    estado: r.estado || 'pendiente',
    meseroNombre: r.mesero_nombre || undefined,
    nota: r.nota || undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** El mesero (PWA o Electron) envía el pedido actual de la mesa a cocina/bar. */
export async function enviarComanda(
  clienteId: string,
  mesaLocalId: string,
  mesaNombre: string,
  items: ItemComanda[],
  meseroNombre?: string,
  nota?: string
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('nuestra base de datos no está configurada');
  if (items.length === 0) throw new Error('No hay ítems para enviar a cocina');

  const { error } = await client.from('panaderia_comandas').insert({
    cliente_id: clienteId,
    mesa_local_id: mesaLocalId,
    mesa_nombre: mesaNombre,
    items,
    estado: 'pendiente',
    mesero_nombre: meseroNombre || null,
    nota: nota || null,
  });
  if (error) throw new Error(error.message);
}

/** Cocina/Bar avanza el estado del pedido (pendiente → preparando → listo → entregado). */
export async function actualizarEstadoComanda(comandaId: string, estado: EstadoComanda): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('nuestra base de datos no está configurada');
  const { error } = await client
    .from('panaderia_comandas')
    .update({ estado, updated_at: new Date().toISOString() })
    .eq('id', comandaId);
  if (error) throw new Error(error.message);
}

/** Comandas activas (no entregadas ni canceladas) para poblar la pantalla al abrirla. */
export async function obtenerComandasActivas(clienteId: string): Promise<Comanda[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client
    .from('panaderia_comandas')
    .select('*')
    .eq('cliente_id', clienteId)
    .in('estado', ['pendiente', 'preparando', 'listo'])
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map(mapComanda);
}

/** Realtime de comandas — cocina/bar ve el pedido apenas el mesero lo envía. */
export function suscribirComandas(
  clienteId: string,
  onCambio: (comanda: Comanda) => void
): () => void {
  const client = getSupabaseClient();
  if (!client) return () => {};

  const canal = client
    .channel(`panaderia-comandas-${clienteId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'panaderia_comandas', filter: `cliente_id=eq.${clienteId}` },
      (payload) => {
        const fila = (payload.new || payload.old) as Record<string, unknown> | null;
        if (fila?.id) onCambio(mapComanda(fila));
      }
    )
    .subscribe();

  return () => { client.removeChannel(canal); };
}
