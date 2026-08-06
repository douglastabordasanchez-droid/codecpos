/**
 * 🏪 SERVICIO MULTI-TIENDA — CODEC POS v2.0
 * Gestión de múltiples tiendas, stock por tienda y transferencias de inventario.
 * 100% offline — localStorage
 */

// ──────────────────────────────────────────────
//  TIPOS
// ──────────────────────────────────────────────

export interface Tienda {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string;
  color: string;          // Color de acento (hex)
  emoji: string;          // Emoji representativo
  activo: boolean;
  esPrincipal: boolean;
  fechaCreacion: string;
  notas?: string;
}

export interface ItemTransferencia {
  productoId: string;
  productoNombre: string;
  productoCodigo: string;
  cantidad: number;
  stockOrigenDisponible: number;
}

export interface Transferencia {
  id: string;
  tiendaOrigenId: string;
  tiendaOrigenNombre: string;
  tiendaDestinoId: string;
  tiendaDestinoNombre: string;
  items: ItemTransferencia[];
  estado: 'completada' | 'cancelada';
  notas: string;
  fecha: string;
  usuario: string;
  totalItems: number;
}

// Mapa de stock secundario: { tiendaId: { productoId: number } }
type StockMap = Record<string, Record<string, number>>;

// ──────────────────────────────────────────────
//  CLAVES DE STORAGE
// ──────────────────────────────────────────────

const KEY_TIENDAS        = 'multitienda_tiendas';
const KEY_STOCK          = 'multitienda_stock';         // stock de tiendas NO principales
const KEY_TRANSFERENCIAS = 'multitienda_transferencias';
const KEY_TIENDA_ACTIVA  = 'multitienda_activa_id';

// ──────────────────────────────────────────────
//  HELPERS
// ──────────────────────────────────────────────

function uid(): string {
  return `tid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getStockMap(): StockMap {
  try {
    const raw = localStorage.getItem(KEY_STOCK);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveStockMap(map: StockMap) {
  localStorage.setItem(KEY_STOCK, JSON.stringify(map));
}

// ──────────────────────────────────────────────
//  TIENDAS — CRUD
// ──────────────────────────────────────────────

export function listarTiendas(): Tienda[] {
  try {
    const raw = localStorage.getItem(KEY_TIENDAS);
    const tiendas: Tienda[] = raw ? JSON.parse(raw) : [];

    // Si no existe ninguna, crear la tienda principal automáticamente
    if (tiendas.length === 0) {
      const principal = crearTiendaPrincipalDefault();
      return [principal];
    }
    return tiendas.filter(t => t.activo !== false);
  } catch { return []; }
}

function crearTiendaPrincipalDefault(): Tienda {
  const principal: Tienda = {
    id: 'tienda_principal',
    nombre: 'Tienda Principal',
    direccion: '',
    telefono: '',
    color: '#10b981',
    emoji: '🏪',
    activo: true,
    esPrincipal: true,
    fechaCreacion: new Date().toISOString(),
  };
  saveTiendas([principal]);
  return principal;
}

function saveTiendas(tiendas: Tienda[]) {
  localStorage.setItem(KEY_TIENDAS, JSON.stringify(tiendas));
}

export function crearTienda(datos: Omit<Tienda, 'id' | 'esPrincipal' | 'fechaCreacion' | 'activo'>): Tienda {
  const tiendas = listarTiendas();
  const nueva: Tienda = {
    ...datos,
    id: uid(),
    esPrincipal: false,
    activo: true,
    fechaCreacion: new Date().toISOString(),
  };
  saveTiendas([...tiendas, nueva]);
  // Inicializar su mapa de stock vacío
  const map = getStockMap();
  if (!map[nueva.id]) map[nueva.id] = {};
  saveStockMap(map);
  return nueva;
}

export function actualizarTienda(id: string, datos: Partial<Tienda>): Tienda {
  const tiendas = listarTiendas();
  const idx = tiendas.findIndex(t => t.id === id);
  if (idx === -1) throw new Error('Tienda no encontrada');
  const actualizada = { ...tiendas[idx], ...datos, id };
  tiendas[idx] = actualizada;
  saveTiendas(tiendas);
  return actualizada;
}

export function eliminarTienda(id: string): void {
  const tiendas = listarTiendas();
  const tienda = tiendas.find(t => t.id === id);
  if (!tienda) throw new Error('Tienda no encontrada');
  if (tienda.esPrincipal) throw new Error('No puedes eliminar la tienda principal');
  // Soft-delete
  saveTiendas(tiendas.map(t => t.id === id ? { ...t, activo: false } : t));
}

// ──────────────────────────────────────────────
//  TIENDA ACTIVA
// ──────────────────────────────────────────────

export function getTiendaActivaId(): string {
  return localStorage.getItem(KEY_TIENDA_ACTIVA) || 'tienda_principal';
}

export function setTiendaActivaId(id: string): void {
  localStorage.setItem(KEY_TIENDA_ACTIVA, id);
}

export function getTiendaActiva(): Tienda | null {
  const id = getTiendaActivaId();
  const tiendas = listarTiendas();
  return tiendas.find(t => t.id === id) || tiendas[0] || null;
}

// ──────────────────────────────────────────────
//  STOCK POR TIENDA
// ──────────────────────────────────────────────

/**
 * Obtiene el stock de un producto en una tienda específica.
 * - Para la tienda principal, lee del campo `stock` del producto en pos-productos.
 * - Para otras tiendas, lee del mapa multitienda_stock.
 */
export function getStockEnTienda(productoId: string, tiendaId: string): number {
  if (tiendaId === 'tienda_principal' || esTiendaPrincipal(tiendaId)) {
    try {
      const raw = localStorage.getItem('pos-productos');
      const productos: any[] = raw ? JSON.parse(raw) : [];
      const p = productos.find((p: any) => p.id === productoId);
      return p?.stock ?? 0;
    } catch { return 0; }
  } else {
    const map = getStockMap();
    return map[tiendaId]?.[productoId] ?? 0;
  }
}

function esTiendaPrincipal(tiendaId: string): boolean {
  try {
    const tiendas: Tienda[] = JSON.parse(localStorage.getItem(KEY_TIENDAS) || '[]');
    const t = tiendas.find(t => t.id === tiendaId);
    return t?.esPrincipal === true;
  } catch { return false; }
}

/**
 * Actualiza el stock de un producto en una tienda específica.
 */
export function setStockEnTienda(productoId: string, tiendaId: string, nuevoStock: number): void {
  if (tiendaId === 'tienda_principal' || esTiendaPrincipal(tiendaId)) {
    try {
      const raw = localStorage.getItem('pos-productos');
      const productos: any[] = raw ? JSON.parse(raw) : [];
      const idx = productos.findIndex((p: any) => p.id === productoId);
      if (idx !== -1) {
        productos[idx].stock = nuevoStock;
        localStorage.setItem('pos-productos', JSON.stringify(productos));
      }
    } catch { }
  } else {
    const map = getStockMap();
    if (!map[tiendaId]) map[tiendaId] = {};
    map[tiendaId][productoId] = nuevoStock;
    saveStockMap(map);
  }
}

/**
 * Obtiene el resumen de stock de TODOS los productos en una tienda dada.
 * Retorna un objeto { productoId → stock }
 */
export function getStockResumenTienda(tiendaId: string): Record<string, number> {
  if (tiendaId === 'tienda_principal' || esTiendaPrincipal(tiendaId)) {
    try {
      const raw = localStorage.getItem('pos-productos');
      const productos: any[] = raw ? JSON.parse(raw) : [];
      const res: Record<string, number> = {};
      productos.forEach((p: any) => { res[p.id] = p.stock ?? 0; });
      return res;
    } catch { return {}; }
  } else {
    const map = getStockMap();
    return { ...(map[tiendaId] ?? {}) };
  }
}

/**
 * Enriquece un array de productos con el stock de la tienda indicada.
 */
export function productosConStockDeTienda(tiendaId: string): any[] {
  try {
    const raw = localStorage.getItem('pos-productos');
    const productos: any[] = raw ? JSON.parse(raw) : [];

    if (tiendaId === 'tienda_principal' || esTiendaPrincipal(tiendaId)) {
      return productos; // Usan el campo stock original
    }

    const map = getStockMap();
    const stockTienda = map[tiendaId] ?? {};
    return productos.map(p => ({
      ...p,
      stock: stockTienda[p.id] ?? 0,
      _stockOriginal: p.stock,
    }));
  } catch { return []; }
}

// ──────────────────────────────────────────────
//  TRANSFERENCIAS
// ──────────────────────────────────────────────

function getTransferencias(): Transferencia[] {
  try {
    const raw = localStorage.getItem(KEY_TRANSFERENCIAS);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveTransferencias(list: Transferencia[]) {
  localStorage.setItem(KEY_TRANSFERENCIAS, JSON.stringify(list));
}

export function listarTransferencias(limit = 100): Transferencia[] {
  return getTransferencias()
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    .slice(0, limit);
}

export interface SolicitudTransferencia {
  tiendaOrigenId: string;
  tiendaDestinoId: string;
  items: { productoId: string; cantidad: number }[];
  notas?: string;
}

export function ejecutarTransferencia(solicitud: SolicitudTransferencia): Transferencia {
  const tiendas = listarTiendas();
  const origen = tiendas.find(t => t.id === solicitud.tiendaOrigenId);
  const destino = tiendas.find(t => t.id === solicitud.tiendaDestinoId);
  if (!origen) throw new Error('Tienda origen no encontrada');
  if (!destino) throw new Error('Tienda destino no encontrada');
  if (solicitud.tiendaOrigenId === solicitud.tiendaDestinoId) throw new Error('Origen y destino no pueden ser iguales');

  const raw = localStorage.getItem('pos-productos');
  const productos: any[] = raw ? JSON.parse(raw) : [];

  const itemsTransferidos: ItemTransferencia[] = [];

  for (const item of solicitud.items) {
    const producto = productos.find((p: any) => p.id === item.productoId);
    if (!producto) throw new Error(`Producto ${item.productoId} no encontrado`);

    const stockOrigen = getStockEnTienda(item.productoId, solicitud.tiendaOrigenId);
    if (stockOrigen < item.cantidad) {
      throw new Error(
        `Stock insuficiente en ${origen.nombre} para "${producto.nombre}": ` +
        `disponible ${stockOrigen}, requerido ${item.cantidad}`
      );
    }

    // Descontar del origen
    setStockEnTienda(item.productoId, solicitud.tiendaOrigenId, stockOrigen - item.cantidad);

    // Sumar al destino
    const stockDestino = getStockEnTienda(item.productoId, solicitud.tiendaDestinoId);
    setStockEnTienda(item.productoId, solicitud.tiendaDestinoId, stockDestino + item.cantidad);

    itemsTransferidos.push({
      productoId: item.productoId,
      productoNombre: producto.nombre,
      productoCodigo: producto.codigo,
      cantidad: item.cantidad,
      stockOrigenDisponible: stockOrigen,
    });
  }

  const usuario = (() => {
    try { return JSON.parse(localStorage.getItem('pos-user') || '{}').username || 'sistema'; }
    catch { return 'sistema'; }
  })();

  const transferencia: Transferencia = {
    id: `transf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    tiendaOrigenId: solicitud.tiendaOrigenId,
    tiendaOrigenNombre: origen.nombre,
    tiendaDestinoId: solicitud.tiendaDestinoId,
    tiendaDestinoNombre: destino.nombre,
    items: itemsTransferidos,
    estado: 'completada',
    notas: solicitud.notas || '',
    fecha: new Date().toISOString(),
    usuario,
    totalItems: itemsTransferidos.reduce((s, i) => s + i.cantidad, 0),
  };

  const lista = getTransferencias();
  lista.unshift(transferencia);
  // Mantener solo los últimos 500
  saveTransferencias(lista.slice(0, 500));

  return transferencia;
}

// ──────────────────────────────────────────────
//  ESTADÍSTICAS
// ──────────────────────────────────────────────

export function getEstadisticasMultitienda() {
  const tiendas = listarTiendas();
  const transferencias = getTransferencias();
  const raw = localStorage.getItem('pos-productos');
  const productos: any[] = raw ? JSON.parse(raw) : [];

  const totalProductos = productos.length;
  const tiendaStats = tiendas.map(t => {
    const stockResumen = getStockResumenTienda(t.id);
    const totalStock = Object.values(stockResumen).reduce((s, n) => s + n, 0);
    const transfsOrigen = transferencias.filter(tr => tr.tiendaOrigenId === t.id).length;
    const transfsDestino = transferencias.filter(tr => tr.tiendaDestinoId === t.id).length;
    return {
      tienda: t,
      totalStock,
      transfsEnviadas: transfsOrigen,
      transfsRecibidas: transfsDestino,
      productosConStock: Object.values(stockResumen).filter(n => n > 0).length,
    };
  });

  return {
    totalTiendas: tiendas.length,
    totalTransferencias: transferencias.length,
    totalProductos,
    tiendaStats,
  };
}
