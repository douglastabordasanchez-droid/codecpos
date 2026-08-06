/**
 * Motor de Sincronización Electron <-> Supabase
 * Reemplaza el scaffold REST genérico (nunca conectado a nada real) por un
 * motor real sobre Supabase: push de productos/ventas pendientes (campo
 * syncStatus ya existente en cada registro local), pull de cambios remotos
 * (polling + Realtime), resolución de conflictos last-write-wins por
 * updatedAt. Requiere que la instalación esté vinculada a un negocio
 * (ver src/app/lib/supabase/tenantLink.ts) — si no lo está, sync() reporta
 * un error claro y no rompe nada del flujo offline existente.
 */

import { dbManager, Producto, Venta } from './indexedDB';
import { getSupabaseClient } from './supabase/config';
import { getLinkedClienteId, restablecerSesionSync } from './supabase/tenantLink';

const SYNC_INTERVAL = 30000; // 30 segundos

/**
 * 🛡️ Hallazgo en verificación en vivo: la pantalla de venta activa
 * (POSPageNew) NO lee productos de IndexedDB — lee del array plano en
 * localStorage['pos-productos'] (mismo patrón que CodigosBarrasPageFull,
 * ver memoria de proyecto). Sin este puente, un producto sincronizado desde
 * otro dispositivo queda invisible en la caja aunque IndexedDB sí lo tenga.
 */
function sincronizarProductoEnLocalStorage(producto: Producto): void {
  try {
    const raw = localStorage.getItem('pos-productos');
    const lista: any[] = raw ? JSON.parse(raw) : [];
    const idx = Array.isArray(lista) ? lista.findIndex((p) => p.id === producto.id) : -1;

    const entrada = {
      ...(idx >= 0 ? lista[idx] : {}),
      id: producto.id,
      codigo: producto.codigo,
      nombre: producto.nombre,
      precio: producto.precio,
      costo: producto.costo,
      stock: producto.stock,
      stockMinimo: producto.stockMinimo,
      categoria: producto.categoria,
      unidad: producto.unidad,
      aplicaIVA: producto.iva > 0,
      activo: producto.activo,
      imagenUrl: producto.imagenUrl,
      pesable: idx >= 0 ? lista[idx].pesable : false,
      tipoInventario: producto.tipoInventario || (idx >= 0 ? lista[idx].tipoInventario : 'directo'),
    };

    if (idx >= 0) {
      lista[idx] = entrada;
    } else {
      lista.push(entrada);
    }
    localStorage.setItem('pos-productos', JSON.stringify(lista));
  } catch (error) {
    console.error('[sync] Error sincronizando producto a pos-productos:', error);
  }
}

class SyncService {
  private isSyncing = false;
  private started = false;
  private syncInterval: number | null = null;
  private realtimeChannel: ReturnType<NonNullable<ReturnType<typeof getSupabaseClient>>['channel']> | null = null;
  private listeners: Set<(status: SyncStatus) => void> = new Set();

  /** Debe llamarse una vez al entrar al POS. Idempotente. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    await restablecerSesionSync().catch(() => {});
    this.setupRealtime();
    this.startAutoSync();
  }

  startAutoSync(): void {
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.sync();
    this.syncInterval = window.setInterval(() => this.sync(), SYNC_INTERVAL);
  }

  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  private setupRealtime(): void {
    const client = getSupabaseClient();
    const clienteId = getLinkedClienteId();
    if (!client || !clienteId || this.realtimeChannel) return;

    this.realtimeChannel = client
      .channel(`productos-sync-${clienteId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'productos', filter: `cliente_id=eq.${clienteId}` },
        (payload) => {
          this.aplicarCambioRemotoProducto((payload.new ?? payload.old) as any).catch(() => {});
        }
      )
      .subscribe();
  }

  async sync(): Promise<void> {
    if (this.isSyncing) return;

    if (!navigator.onLine) {
      this.notifyListeners({ status: 'offline', message: 'Sin conexión a internet', lastSync: null });
      return;
    }

    const client = getSupabaseClient();
    const clienteId = getLinkedClienteId();

    if (!client || !clienteId) {
      this.notifyListeners({
        status: 'error',
        message: 'Esta instalación no está vinculada a un negocio en Supabase (Configuración > Sincronización)',
        lastSync: null,
      });
      return;
    }

    this.isSyncing = true;
    this.notifyListeners({ status: 'syncing', message: 'Sincronizando datos...', lastSync: null });

    try {
      await this.pullProductosRemotos(client, clienteId);
      await this.pushProductosPendientes(client, clienteId);
      await this.pushVentasPendientes(client, clienteId);
      await this.pushCierresPendientes(client, clienteId);
      await this.pushSesionActivaHeartbeat(client, clienteId);

      const lastSync = new Date().toISOString();
      await dbManager.setConfig('lastSyncTime', lastSync);
      await dbManager.addLog('sync', 'Sincronización completada exitosamente');

      this.notifyListeners({ status: 'success', message: 'Sincronización completada', lastSync });
    } catch (error) {
      await dbManager.addLog('sync_error', 'Error en sincronización', error);
      this.notifyListeners({
        status: 'error',
        message: `Error: ${error instanceof Error ? error.message : 'Desconocido'}`,
        lastSync: null,
      });
    } finally {
      this.isSyncing = false;
    }
  }

  // ==================== PULL ====================

  private async pullProductosRemotos(client: NonNullable<ReturnType<typeof getSupabaseClient>>, clienteId: string): Promise<void> {
    const lastPull = await dbManager.getConfig('lastPullProductos');

    let query = client.from('productos').select('*').eq('cliente_id', clienteId);
    if (lastPull) query = query.gt('updated_at', lastPull);

    const { data, error } = await query;
    if (error) throw error;

    for (const remote of data || []) {
      await this.aplicarCambioRemotoProducto(remote);
    }

    await dbManager.setConfig('lastPullProductos', new Date().toISOString());
  }

  private async aplicarCambioRemotoProducto(remote: any): Promise<void> {
    if (!remote) return;

    const productos = await dbManager.getAllProductos();
    const local = productos.find((p) => p.supabaseId === remote.id || (remote.local_id && p.id === remote.local_id));
    const remoteUpdatedAt = new Date(remote.updated_at).getTime();

    if (local) {
      // Hay una edición local sin subir todavía: no la pisamos con la remota.
      if (local.syncStatus === 'pending') return;
      // Local ya está al día o más reciente (last-write-wins por updatedAt).
      if (local.updatedAt >= remoteUpdatedAt) return;

      const actualizado: Producto = {
        ...local,
        codigo: remote.codigo_barras || local.codigo,
        nombre: remote.nombre,
        precio: Number(remote.precio_venta),
        costo: Number(remote.costo),
        stock: Number(remote.stock),
        stockMinimo: remote.stock_minimo != null ? Number(remote.stock_minimo) : local.stockMinimo,
        categoria: remote.categoria || local.categoria,
        unidad: remote.unidad || local.unidad,
        iva: remote.iva != null ? Number(remote.iva) : local.iva,
        activo: remote.activo,
        imagenUrl: remote.foto_url || local.imagenUrl,
        proveedor: remote.proveedor || local.proveedor,
        fechaVencimiento: remote.fecha_vencimiento || local.fechaVencimiento,
        supabaseId: remote.id,
        updatedAt: remoteUpdatedAt,
        syncStatus: 'synced',
      };
      await dbManager.putProductoRaw(actualizado);
      sincronizarProductoEnLocalStorage(actualizado);
    } else {
      const nuevoId: string = remote.local_id || `remote-${remote.id}`;
      const producto: Producto = {
        id: nuevoId,
        codigo: remote.codigo_barras || '',
        nombre: remote.nombre,
        precio: Number(remote.precio_venta),
        costo: Number(remote.costo),
        stock: Number(remote.stock),
        stockMinimo: Number(remote.stock_minimo || 0),
        categoria: remote.categoria || '',
        unidad: remote.unidad || 'unidad',
        iva: Number(remote.iva || 0),
        activo: remote.activo,
        imagenUrl: remote.foto_url || undefined,
        proveedor: remote.proveedor || undefined,
        fechaVencimiento: remote.fecha_vencimiento || undefined,
        supabaseId: remote.id,
        createdAt: new Date(remote.created_at).getTime(),
        updatedAt: remoteUpdatedAt,
        syncStatus: 'synced',
      };
      await dbManager.putProductoRaw(producto);
      sincronizarProductoEnLocalStorage(producto);
    }

    // 🔄 Las pantallas que ya cargaron su lista de productos en memoria (p.
    // ej. POSPageNew) no vuelven a leer IndexedDB solas — sin este evento,
    // un producto creado/editado en otro dispositivo (o por el escáner
    // híbrido) queda invisible hasta recargar la app.
    window.dispatchEvent(new CustomEvent('codecpos:productos-sincronizados'));
  }

  // ==================== PUSH ====================

  private async pushProductosPendientes(client: NonNullable<ReturnType<typeof getSupabaseClient>>, clienteId: string): Promise<void> {
    const productos = await dbManager.getAllProductos();
    const pendientes = productos.filter((p) => p.syncStatus === 'pending');
    if (pendientes.length === 0) return;

    for (const p of pendientes) {
      const payload = {
        cliente_id: clienteId,
        local_id: p.id,
        codigo_barras: p.codigo || null,
        nombre: p.nombre,
        categoria: p.categoria || null,
        precio_venta: p.precio,
        costo: p.costo,
        stock: p.stock,
        stock_minimo: p.stockMinimo,
        unidad: p.unidad || null,
        iva: p.iva,
        fecha_vencimiento: p.fechaVencimiento || null,
        proveedor: p.proveedor || null,
        foto_url: p.imagenUrl || null,
        activo: p.activo,
        updated_at: new Date(p.updatedAt).toISOString(),
      };

      const { data, error } = await client
        .from('productos')
        .upsert(payload, { onConflict: 'cliente_id,local_id' })
        .select('id')
        .single();

      if (error) {
        console.error(`[sync] Error subiendo producto ${p.nombre}:`, error.message);
        continue;
      }

      await dbManager.markProductoSynced(p, data.id);
    }

    await dbManager.addLog('push_productos', `${pendientes.length} productos subidos`);
  }

  private async pushVentasPendientes(client: NonNullable<ReturnType<typeof getSupabaseClient>>, clienteId: string): Promise<void> {
    const ventas = await dbManager.getAllVentas();
    const pendientes = ventas.filter((v) => v.syncStatus === 'pending');
    if (pendientes.length === 0) return;

    const productos = await dbManager.getAllProductos();
    const idMap = new Map(productos.filter((p) => p.supabaseId).map((p) => [p.id, p.supabaseId as string]));

    for (const v of pendientes) {
      const { data: ventaRow, error } = await client
        .from('ventas')
        .upsert(
          {
            cliente_id: clienteId,
            local_id: v.id,
            terminal_id: v.puntoVentaId,
            numero: v.numero,
            cajero_nombre: v.cajero,
            total: v.total,
            metodo_pago: v.metodoPago,
            metodos_multiples: v.metodosMultiples || null,
            estado: 'completada',
            created_at: new Date(v.createdAt).toISOString(),
          },
          { onConflict: 'cliente_id,local_id' }
        )
        .select('id')
        .single();

      if (error) {
        console.error(`[sync] Error subiendo venta #${v.numero}:`, error.message);
        continue;
      }

      // Reemplazo idempotente de líneas (soporta reintentos sin duplicar).
      await client.from('venta_items').delete().eq('venta_id', ventaRow.id);
      const items = (v.items || []).map((it) => ({
        venta_id: ventaRow.id,
        producto_id: idMap.get(it.productoId) || null,
        nombre: it.nombre,
        cantidad: it.cantidad,
        precio_unitario: it.precio,
        subtotal: it.subtotal,
      }));
      if (items.length > 0) {
        await client.from('venta_items').insert(items);
      }

      await dbManager.updateVenta({ ...v, supabaseId: ventaRow.id });
    }

    await dbManager.addLog('push_ventas', `${pendientes.length} ventas subidas`);
  }

  /**
   * Los cierres de caja hoy solo viven en localStorage['pos-cierres-caja']
   * (respaldo inmediato de CierreCajaPage, sin campo syncStatus como
   * productos/ventas en IndexedDB). Se marca cada cierre ya subido con
   * `_supabaseSynced` en el mismo array para no reenviarlo en cada ciclo.
   */
  private async pushCierresPendientes(client: NonNullable<ReturnType<typeof getSupabaseClient>>, clienteId: string): Promise<void> {
    let cierres: any[];
    try {
      cierres = JSON.parse(localStorage.getItem('pos-cierres-caja') || '[]');
    } catch {
      return;
    }
    if (!Array.isArray(cierres) || cierres.length === 0) return;

    const pendientes = cierres.filter((c) => !c._supabaseSynced);
    if (pendientes.length === 0) return;

    const terminalId = (await dbManager.getConfig('puntoVentaId')) || 'POS-001';

    for (const c of pendientes) {
      const { error } = await client.from('cierres_caja').upsert(
        {
          cliente_id: clienteId,
          local_id: c.id,
          terminal_id: terminalId,
          fecha_apertura: c.fechaApertura ? new Date(c.fechaApertura).toISOString() : null,
          fecha_cierre: c.fecha ? new Date(c.fecha).toISOString() : new Date().toISOString(),
          monto_apertura: c.baseInicial ?? 0,
          monto_cierre: c.totalFinal ?? 0,
          ventas_total: c.totalSistema ?? 0,
          diferencia: c.diferencia ?? 0,
          detalle: { ...c, cajero_nombre: c.cajero },
        },
        { onConflict: 'cliente_id,local_id' }
      );

      if (error) {
        console.error(`[sync] Error subiendo cierre ${c.id}:`, error.message);
        continue;
      }
      c._supabaseSynced = true;
    }

    localStorage.setItem('pos-cierres-caja', JSON.stringify(cierres));
    await dbManager.addLog('push_cierres', `${pendientes.length} cierres subidos`);
  }

  /**
   * Heartbeat "quién está usando esta caja ahora mismo", para el monitoreo
   * de empleados en el dashboard admin de la PWA. Solo lee la sesión activa
   * local (ya escrita por el flujo de login existente) — no toca AuthContext
   * ni el flujo de autenticación en absoluto.
   */
  private async pushSesionActivaHeartbeat(client: NonNullable<ReturnType<typeof getSupabaseClient>>, clienteId: string): Promise<void> {
    const terminalId = (await dbManager.getConfig('puntoVentaId')) || 'POS-001';

    let sesion: any = null;
    try {
      const raw = localStorage.getItem('codec_pos_sesion_activa');
      sesion = raw ? JSON.parse(raw) : null;
    } catch {
      sesion = null;
    }

    const { error } = await client.from('sesiones_activas').upsert(
      {
        cliente_id: clienteId,
        terminal_id: terminalId,
        terminal_nombre: terminalId,
        cajero_nombre: sesion?.nombreUsuario || null,
        iniciada_at: sesion?.horaInicio ? new Date(sesion.horaInicio).toISOString() : new Date().toISOString(),
        ultima_actividad: new Date().toISOString(),
        activa: !!sesion,
      },
      { onConflict: 'cliente_id,terminal_id' }
    );

    if (error) {
      console.error('[sync] Error subiendo heartbeat de sesión:', error.message);
    }
  }

  // ==================== LISTENERS ====================

  addListener(callback: (status: SyncStatus) => void): void {
    this.listeners.add(callback);
  }

  removeListener(callback: (status: SyncStatus) => void): void {
    this.listeners.delete(callback);
  }

  private notifyListeners(status: SyncStatus): void {
    this.listeners.forEach((callback) => callback(status));
  }

  // ==================== PÚBLICOS ====================

  async forceSyncNow(): Promise<void> {
    await this.sync();
  }

  async getLastSyncTime(): Promise<string | null> {
    return await dbManager.getConfig('lastSyncTime');
  }

  async getSyncStats(): Promise<SyncStats> {
    const productos = await dbManager.getAllProductos();
    const ventas = await dbManager.getAllVentas();

    return {
      totalProductos: productos.length,
      productosPendientes: productos.filter((p) => p.syncStatus === 'pending').length,
      totalVentas: ventas.length,
      ventasPendientes: ventas.filter((v) => v.syncStatus === 'pending').length,
      colaLength: 0,
      isOnline: navigator.onLine,
    };
  }
}

export interface SyncStatus {
  status: 'syncing' | 'success' | 'error' | 'offline';
  message: string;
  lastSync: string | null;
}

export interface SyncStats {
  totalProductos: number;
  productosPendientes: number;
  totalVentas: number;
  ventasPendientes: number;
  colaLength: number;
  isOnline: boolean;
}

// Exportar instancia singleton
export const syncService = new SyncService();
