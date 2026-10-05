/**
 * Multitienda en la nube (migración 0111): inventario por sede, transferencias
 * y cargas masivas. La misma capa la usan la web, el celular y Electron (con
 * la caja vinculada). La sede principal usa productos.stock y las demás
 * tiendas_stock, igual que el resto del sistema.
 */
import { getSupabaseClient } from './supabase/config';

export const SEDE_PRINCIPAL = 'tienda_principal';

export interface Sede {
  id: string;            // local_id: 'tienda_principal' o 'tid_…'
  nombre: string;
  direccion: string;
  telefono: string;
  tipo: 'tienda' | 'bodega';
  esPrincipal: boolean;
  color: string;
  emoji: string;
}

export interface FilaInventario {
  productoId: string;
  codigo: string | null;
  nombre: string;
  categoria: string | null;
  stockMinimo: number;
  stocks: Record<string, number>;
  total: number;
}

export interface ItemTransferencia {
  producto_id: string;
  codigo: string | null;
  nombre: string;
  cantidad: number;
  cantidad_recibida?: number;
}

export interface Transferencia {
  id: string;
  numero: number;
  origenId: string;
  origenNombre: string;
  destinoId: string;
  destinoNombre: string;
  estado: 'en_camino' | 'recibida' | 'cancelada';
  items: ItemTransferencia[];
  totalUnidades: number;
  notas: string | null;
  creadoPor: string | null;
  creadoEn: string;
  recibidoPor: string | null;
  recibidoEn: string | null;
  conDiferencias: boolean;
  canceladoEn: string | null;
  motivoCancelacion: string | null;
}

function cliente() {
  const c = getSupabaseClient();
  if (!c) throw new Error('No hay conexión con la nube');
  return c;
}

/** Los mensajes de la base vienen como "No hay suficiente…": se muestran tal cual. */
function error(e: { message?: string } | null | undefined): never {
  throw new Error(e?.message?.replace(/^.*?ERROR:\s*/, '') || 'No se pudo completar');
}

export async function obtenerConfigMultitienda(): Promise<{ nube: boolean; desde: string | null }> {
  const { data, error: e } = await cliente().rpc('obtener_config_multitienda');
  if (e) error(e);
  return { nube: !!data?.nube, desde: data?.desde ?? null };
}

export async function activarMultitiendaNube(): Promise<void> {
  const { error: e } = await cliente().rpc('activar_multitienda_nube');
  if (e) error(e);
}

export async function listarSedes(clienteId: string): Promise<Sede[]> {
  const { data, error: e } = await cliente().from('tiendas')
    .select('local_id, nombre, direccion, telefono, tipo, es_principal, color, emoji, activo')
    .eq('cliente_id', clienteId).neq('activo', false)
    .order('es_principal', { ascending: false }).order('nombre');
  if (e) error(e);
  const sedes: Sede[] = (data || []).map((t: any) => ({
    id: t.local_id, nombre: t.nombre, direccion: t.direccion || '', telefono: t.telefono || '',
    tipo: t.tipo === 'bodega' ? 'bodega' : 'tienda', esPrincipal: !!t.es_principal || t.local_id === SEDE_PRINCIPAL,
    color: t.color || '#10b981', emoji: t.emoji || '🏪',
  }));
  if (!sedes.some((s) => s.id === SEDE_PRINCIPAL)) {
    sedes.unshift({ id: SEDE_PRINCIPAL, nombre: 'Tienda Principal', direccion: '', telefono: '', tipo: 'tienda', esPrincipal: true, color: '#10b981', emoji: '🏪' });
  }
  return sedes;
}

export async function guardarSede(clienteId: string, sede: Partial<Sede> & { nombre: string }): Promise<void> {
  const id = sede.id || `tid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { error: e } = await cliente().from('tiendas').upsert({
    cliente_id: clienteId, local_id: id, nombre: sede.nombre.trim(), direccion: sede.direccion || '', telefono: sede.telefono || '',
    tipo: sede.tipo || 'tienda', es_principal: id === SEDE_PRINCIPAL, color: sede.color || '#10b981', emoji: sede.emoji || (sede.tipo === 'bodega' ? '📦' : '🏪'),
    activo: true, updated_at: new Date().toISOString(),
  }, { onConflict: 'cliente_id,local_id' });
  if (e) error(e);
}

export async function buscarInventario(opciones: { busqueda?: string; sede?: string | null; soloBajo?: boolean; limite?: number; desde?: number }): Promise<{ filas: FilaInventario[]; total: number }> {
  const { data, error: e } = await cliente().rpc('buscar_inventario_sedes', {
    p_busqueda: opciones.busqueda || null, p_tienda: opciones.sede || null, p_solo_bajo: !!opciones.soloBajo,
    p_limite: opciones.limite ?? 50, p_offset: opciones.desde ?? 0,
  });
  if (e) error(e);
  const filas = (data || []).map((r: any) => ({
    productoId: r.producto_id, codigo: r.codigo, nombre: r.nombre, categoria: r.categoria, stockMinimo: Number(r.stock_minimo) || 0,
    stocks: Object.fromEntries(Object.entries(r.stocks || {}).map(([k, v]) => [k, Number(v) || 0])), total: Number(r.total) || 0,
  }));
  return { filas, total: Number(data?.[0]?.total_filas ?? 0) };
}

export async function enviarTransferencia(datos: { origen: string; destino: string; items: Array<{ producto_id: string; cantidad: number }>; notas?: string; llegaYa?: boolean }): Promise<string> {
  const { data, error: e } = await cliente().rpc('enviar_transferencia', {
    p_origen: datos.origen, p_destino: datos.destino, p_items: datos.items, p_notas: datos.notas || null, p_llega_ya: !!datos.llegaYa,
  });
  if (e) error(e);
  return data as string;
}

export async function recibirTransferencia(id: string, cantidades?: Record<string, number>): Promise<void> {
  const { error: e } = await cliente().rpc('recibir_transferencia', { p_id: id, p_cantidades: cantidades || null });
  if (e) error(e);
}

export async function cancelarTransferencia(id: string, motivo?: string): Promise<void> {
  const { error: e } = await cliente().rpc('cancelar_transferencia', { p_id: id, p_motivo: motivo || null });
  if (e) error(e);
}

export async function listarTransferencias(clienteId: string, estado: 'en_camino' | 'historial', limite = 50): Promise<Transferencia[]> {
  let q = cliente().from('transferencias_inventario').select('*').eq('cliente_id', clienteId);
  q = estado === 'en_camino' ? q.eq('estado', 'en_camino') : q.neq('estado', 'en_camino');
  const { data, error: e } = await q.order('creado_en', { ascending: false }).limit(limite);
  if (e) error(e);
  return (data || []).map((t: any) => ({
    id: t.id, numero: Number(t.numero), origenId: t.tienda_origen_id, origenNombre: t.tienda_origen_nombre || t.tienda_origen_id,
    destinoId: t.tienda_destino_id, destinoNombre: t.tienda_destino_nombre || t.tienda_destino_id, estado: t.estado,
    items: t.items || [], totalUnidades: Number(t.total_unidades) || 0, notas: t.notas, creadoPor: t.creado_por_nombre, creadoEn: t.creado_en,
    recibidoPor: t.recibido_por_nombre, recibidoEn: t.recibido_en, conDiferencias: !!t.con_diferencias,
    canceladoEn: t.cancelado_en, motivoCancelacion: t.motivo_cancelacion,
  }));
}

/** Avisa cuando cambia una transferencia (para refrescar "En camino" sin recargar). */
export function escucharTransferencias(clienteId: string, alCambiar: () => void): () => void {
  const c = getSupabaseClient();
  if (!c) return () => {};
  const canal = c.channel(`transferencias-${clienteId}-${Math.random().toString(36).slice(2, 7)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transferencias_inventario', filter: `cliente_id=eq.${clienteId}` }, alCambiar)
    .subscribe();
  return () => { c.removeChannel(canal); };
}

// ── Carga masiva desde archivo (conteo físico, exportación de Oasis…) ────

export interface FilaCarga { codigo: string; cantidad: number }

/** Lee un CSV o texto pegado de Excel: código y cantidad (separados por ; , o tabulación). */
export function leerArchivoCarga(texto: string): { filas: FilaCarga[]; invalidas: number } {
  const filas: FilaCarga[] = [];
  let invalidas = 0;
  for (const linea of texto.replace(/^﻿/, '').split(/\r?\n/)) {
    if (!linea.trim()) continue;
    const partes = linea.split(/[;\t,]/).map((p) => p.trim().replace(/^"|"$/g, ''));
    const cantidad = Number((partes[1] || '').replace(/\./g, '').replace(',', '.'));
    if (!partes[0] || !Number.isFinite(cantidad)) { invalidas++; continue; } // también descarta el encabezado
    filas.push({ codigo: partes[0], cantidad });
  }
  return { filas, invalidas: Math.max(0, invalidas) };
}

/**
 * Carga el inventario de una sede por código de producto, en lotes de 500.
 * modo 'fijar' deja exactamente esa cantidad; 'sumar' la agrega.
 */
export async function cargarInventarioSede(
  clienteId: string, sede: string, filas: FilaCarga[], modo: 'fijar' | 'sumar', progreso?: (hechas: number, total: number) => void,
): Promise<{ cargadas: number; sinCodigo: string[] }> {
  const c = cliente();
  const sinCodigo: string[] = [];
  let cargadas = 0;
  const LOTE = 500;
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE);
    const { data, error: e } = await c.from('productos').select('id, codigo_barras').eq('cliente_id', clienteId)
      .in('codigo_barras', lote.map((f) => f.codigo));
    if (e) error(e);
    const porCodigo = new Map((data || []).map((p: any) => [String(p.codigo_barras), p.id as string]));
    const items = lote.flatMap((f) => {
      const id = porCodigo.get(f.codigo);
      if (!id) { sinCodigo.push(f.codigo); return []; }
      return [{ producto_id: id, cantidad: f.cantidad }];
    });
    if (items.length > 0) {
      const { data: n, error: e2 } = await c.rpc('cargar_stock_sede', { p_tienda: sede, p_items: items, p_modo: modo });
      if (e2) error(e2);
      cargadas += Number(n) || 0;
    }
    progreso?.(Math.min(i + LOTE, filas.length), filas.length);
  }
  return { cargadas, sinCodigo };
}
