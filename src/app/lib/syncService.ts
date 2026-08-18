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
      minStock: producto.stockMinimo,
      categoria: producto.categoria,
      unidad: producto.unidad,
      aplicaIVA: producto.iva > 0,
      activo: producto.activo,
      imagenUrl: producto.imagenUrl,
      fotosUrls: producto.fotosUrls,
      pesable: idx >= 0 ? lista[idx].pesable : false,
      tipoInventario: producto.tipoInventario || (idx >= 0 ? lista[idx].tipoInventario : 'directo'),
      // 🎈 Papelería y Piñatería — ver migración 0035.
      esPapeleriaPinateria: producto.esPapeleriaPinateria,
      categoriaEspecifica: producto.categoriaEspecifica,
      tematica: producto.tematica,
      calibreGlobo: producto.calibreGlobo,
      colorAcabado: producto.colorAcabado,
      marca: producto.marca,
      esDulceria: producto.esDulceria,
      permitirFraccion: producto.permitirFraccion,
      componentesCombo: producto.componentesCombo,
      unidadesPorBolsa: producto.unidadesPorBolsa,
      ventaPorUnidad: producto.ventaPorUnidad,
      lote: producto.lote,
      // 🛡️ Este producto ya viene DE Supabase (pull) — marcarlo evita que
      // pushProductosLocalStorage lo reinterprete como "nuevo local" y cree
      // una fila duplicada en vez de actualizar la misma.
      _supabaseSynced: true,
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
      // ⚡ Antes se reportaba como 'error' (ícono y color de alarma en la
      // pantalla de venta principal) — pero para un negocio que nunca
      // configuró la nube esto no es un error, es simplemente el estado
      // normal. Estado neutral propio para no alarmar innecesariamente.
      this.notifyListeners({
        status: 'unlinked',
        message: 'Esperando conexión con app',
        lastSync: null,
      });
      return;
    }

    this.isSyncing = true;
    this.notifyListeners({ status: 'syncing', message: 'Sincronizando datos...', lastSync: null });

    // 🛡️ Antes un solo paso que fallaba (p. ej. IndexedDB rechazando un
    // producto por una restricción de índice) abortaba el resto del ciclo
    // completo dentro de un único try/catch — incluido el heartbeat que le
    // avisa a la PWA que esta caja está conectada. Cada paso ahora aísla su
    // propio error: uno fallido se registra pero no bloquea a los demás, y
    // el heartbeat siempre llega a ejecutarse.
    const pasos: Array<[string, () => Promise<void>]> = [
      ['pull_productos', () => this.pullProductosRemotos(client, clienteId)],
      ['pull_ventas', () => this.pullVentasRemotas(client, clienteId)],
      ['pull_gastos', () => this.pullGastosRemotos(client, clienteId)],
      ['pull_cierres', () => this.pullCierresRemotos(client, clienteId)],
      ['pull_devoluciones', () => this.pullDevolucionesRemotas(client, clienteId)],
      ['push_productos', () => this.pushProductosPendientes(client, clienteId)],
      ['push_productos_localstorage', () => this.pushProductosLocalStorage(client, clienteId)],
      ['push_gastos', () => this.pushGastosLocalStorage(client, clienteId)],
      ['push_ventas', () => this.pushVentasPendientes(client, clienteId)],
      ['push_cierres', () => this.pushCierresPendientes(client, clienteId)],
      ['push_devoluciones', () => this.pushDevolucionesLocalStorage(client, clienteId)],
      ['push_heartbeat', () => this.pushSesionActivaHeartbeat(client, clienteId)],
    ];

    let primerError: unknown = null;
    for (const [nombre, paso] of pasos) {
      try {
        await paso();
      } catch (error) {
        primerError = primerError ?? error;
        console.error(`[sync] Falló el paso "${nombre}":`, error);
        await dbManager.addLog('sync_error', `Error en paso "${nombre}"`, error);
      }
    }

    if (primerError) {
      this.notifyListeners({
        status: 'error',
        message: `Error: ${primerError instanceof Error ? primerError.message : 'Desconocido'}`,
        lastSync: null,
      });
    } else {
      const lastSync = new Date().toISOString();
      await dbManager.setConfig('lastSyncTime', lastSync);
      await dbManager.addLog('sync', 'Sincronización completada exitosamente');
      this.notifyListeners({ status: 'success', message: 'Sincronización completada', lastSync });
    }

    this.isSyncing = false;
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
        fotosUrls: remote.fotos_urls || local.fotosUrls,
        proveedor: remote.proveedor || local.proveedor,
        fechaVencimiento: remote.fecha_vencimiento || local.fechaVencimiento,
        esPapeleriaPinateria: remote.es_papeleria_pinateria ?? local.esPapeleriaPinateria,
        categoriaEspecifica: remote.categoria_especifica || local.categoriaEspecifica,
        tematica: remote.tematica || local.tematica,
        calibreGlobo: remote.calibre_globo || local.calibreGlobo,
        colorAcabado: remote.color_acabado || local.colorAcabado,
        marca: remote.marca || local.marca,
        esDulceria: remote.es_dulceria ?? local.esDulceria,
        permitirFraccion: remote.permitir_fraccion ?? local.permitirFraccion,
        componentesCombo: remote.componentes_combo || local.componentesCombo,
        unidadesPorBolsa: remote.unidades_por_bolsa ?? local.unidadesPorBolsa,
        ventaPorUnidad: remote.venta_por_unidad ?? local.ventaPorUnidad,
        lote: remote.lote || local.lote,
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
        fotosUrls: remote.fotos_urls || undefined,
        proveedor: remote.proveedor || undefined,
        fechaVencimiento: remote.fecha_vencimiento || undefined,
        esPapeleriaPinateria: remote.es_papeleria_pinateria || undefined,
        categoriaEspecifica: remote.categoria_especifica || undefined,
        tematica: remote.tematica || undefined,
        calibreGlobo: remote.calibre_globo || undefined,
        colorAcabado: remote.color_acabado || undefined,
        marca: remote.marca || undefined,
        esDulceria: remote.es_dulceria || undefined,
        permitirFraccion: remote.permitir_fraccion || undefined,
        componentesCombo: remote.componentes_combo || undefined,
        unidadesPorBolsa: remote.unidades_por_bolsa ?? undefined,
        ventaPorUnidad: remote.venta_por_unidad ?? undefined,
        lote: remote.lote || undefined,
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

  /**
   * 🛡️ La PWA es una ayuda del sistema principal (Electron) — toda venta
   * hecha desde el celular debe aparecer en la caja de escritorio. El riesgo
   * real es de colisión de `numero`: Electron lo genera con un contador
   * local (ver POSPageNew) y la PWA con uno independiente basado en
   * MAX(numero) de Supabase — dos negocios nunca chocan, pero si se
   * reutilizara el numero de la PWA tal cual, sí podría chocar contra el
   * índice único local de IndexedDB. Por eso cada venta remota se guarda con
   * un numero LOCAL fresco (mismo contador que usa POSPageNew para ventas
   * nuevas) y se conserva el numero de Supabase solo como referencia.
   */
  private async pullVentasRemotas(client: NonNullable<ReturnType<typeof getSupabaseClient>>, clienteId: string): Promise<void> {
    const lastPull = await dbManager.getConfig('lastPullVentas');

    let query = client
      .from('ventas')
      .select('id, numero, terminal_id, cajero_nombre, total, metodo_pago, created_at')
      .eq('cliente_id', clienteId)
      .eq('estado', 'completada')
      .is('local_id', null); // ventas creadas por Electron siempre traen local_id — solo interesan las que no
    if (lastPull) query = query.gt('created_at', lastPull);

    const { data: remotas, error } = await query;
    if (error) throw error;
    if (!remotas || remotas.length === 0) return;

    const ventasLocales = await dbManager.getAllVentas();
    const yaExisten = new Set(ventasLocales.filter((v) => v.supabaseId).map((v) => v.supabaseId));
    const pendientesDePull = remotas.filter((r) => !yaExisten.has(r.id));
    if (pendientesDePull.length === 0) {
      await dbManager.setConfig('lastPullVentas', new Date().toISOString());
      return;
    }

    const productos = await dbManager.getAllProductos();
    const idMapInverso = new Map(productos.filter((p) => p.supabaseId).map((p) => [p.supabaseId as string, p.id]));

    let siguienteNumero = (await dbManager.getUltimoNumeroVenta()) + 1;
    const ultimaFacturaLS = parseInt(localStorage.getItem('pos-ultima-factura') || '0') || 0;
    siguienteNumero = Math.max(siguienteNumero, ultimaFacturaLS + 1);

    for (const r of pendientesDePull) {
      const { data: itemsRemotos } = await client
        .from('venta_items')
        .select('producto_id, nombre, cantidad, precio_unitario, subtotal')
        .eq('venta_id', r.id);

      const total = Number(r.total) || 0;
      const subtotal = total / 1.19;

      const ventaLocal: Venta = {
        id: r.id,
        numero: siguienteNumero,
        fecha: r.created_at,
        items: (itemsRemotos || []).map((it: any) => ({
          productoId: (it.producto_id && idMapInverso.get(it.producto_id)) || it.producto_id || '',
          nombre: it.nombre || 'Producto',
          cantidad: Number(it.cantidad),
          precio: Number(it.precio_unitario),
          subtotal: Number(it.subtotal ?? it.cantidad * it.precio_unitario),
        })),
        subtotal,
        iva: total - subtotal,
        total,
        metodoPago: r.metodo_pago || 'efectivo',
        cajero: r.cajero_nombre || 'Venta móvil',
        puntoVentaId: r.terminal_id || 'PWA',
        createdAt: new Date(r.created_at).getTime(),
        syncStatus: 'pending',
        supabaseId: r.id,
      };

      await dbManager.addVenta(ventaLocal);
      await dbManager.updateVenta({ ...ventaLocal, syncStatus: 'synced' });
      siguienteNumero += 1;
    }

    localStorage.setItem('pos-ultima-factura', String(siguienteNumero - 1));
    await dbManager.setConfig('lastPullVentas', new Date().toISOString());
    await dbManager.addLog('pull_ventas_movil', `${pendientesDePull.length} ventas de la app móvil bajadas a la caja`);
    window.dispatchEvent(new CustomEvent('codecpos:ventas-sincronizadas'));
  }

  /**
   * 🛡️ Antes push_gastos_local subía gastos, pero no existía el camino de
   * regreso: un gasto registrado desde la PWA (GastosPage.tsx, escribe
   * directo en Supabase) nunca aparecía en 'pos-gastos' de Electron. Mismo
   * criterio que ventas: `local_id IS NULL` = lo creó otro dispositivo.
   */
  private async pullGastosRemotos(client: NonNullable<ReturnType<typeof getSupabaseClient>>, clienteId: string): Promise<void> {
    const lastPull = await dbManager.getConfig('lastPullGastos');

    let query = client
      .from('gastos')
      .select('id, fecha, descripcion, categoria, monto, medio_pago, registrado_por_nombre, notas, comprobante, created_at')
      .eq('cliente_id', clienteId)
      .is('local_id', null);
    if (lastPull) query = query.gt('created_at', lastPull);

    const { data: remotos, error } = await query;
    if (error) throw error;

    if (remotos && remotos.length > 0) {
      let gastosLocales: any[];
      try {
        gastosLocales = JSON.parse(localStorage.getItem('pos-gastos') || '[]');
      } catch {
        gastosLocales = [];
      }
      if (!Array.isArray(gastosLocales)) gastosLocales = [];

      const yaExisten = new Set(gastosLocales.map((g) => g.id));
      let nuevos = 0;
      for (const r of remotos) {
        if (yaExisten.has(r.id)) continue;
        gastosLocales.push({
          id: r.id,
          fecha: r.fecha,
          descripcion: r.descripcion,
          concepto: r.descripcion,
          categoria: r.categoria || 'otros',
          monto: Number(r.monto) || 0,
          metodoPago: r.medio_pago || 'efectivo',
          medioPagoEgreso: r.medio_pago || 'efectivo',
          comprobante: r.comprobante || undefined,
          registradoPor: r.registrado_por_nombre || 'App móvil',
          notas: r.notas || undefined,
          _supabaseSynced: true,
        });
        nuevos++;
      }

      if (nuevos > 0) {
        localStorage.setItem('pos-gastos', JSON.stringify(gastosLocales));
        await dbManager.addLog('pull_gastos_movil', `${nuevos} gastos de la app móvil bajados a la caja`);
        window.dispatchEvent(new CustomEvent('codecpos:gastos-sincronizados'));
      }
    }

    await dbManager.setConfig('lastPullGastos', new Date().toISOString());
  }

  /**
   * 🛡️ La PWA tiene su PROPIA caja independiente (terminal_id='PWA',
   * CierreCajaPage.tsx) que Electron nunca veía. No se intenta fusionar
   * "sesión activa" entre dispositivos (son cajas físicamente distintas) —
   * solo se hace visible en el historial de Electron, marcado como cierre
   * "app móvil", una vez que la PWA ya lo cerró (`fecha_cierre` no nulo).
   */
  private async pullCierresRemotos(client: NonNullable<ReturnType<typeof getSupabaseClient>>, clienteId: string): Promise<void> {
    const lastPull = await dbManager.getConfig('lastPullCierres');

    let query = client
      .from('cierres_caja')
      .select('id, terminal_id, fecha_apertura, fecha_cierre, monto_apertura, monto_cierre, ventas_total, diferencia, detalle, created_at')
      .eq('cliente_id', clienteId)
      .is('local_id', null)
      .not('fecha_cierre', 'is', null);
    if (lastPull) query = query.gt('created_at', lastPull);

    const { data: remotos, error } = await query;
    if (error) throw error;

    if (remotos && remotos.length > 0) {
      let cierresLocales: any[];
      try {
        cierresLocales = JSON.parse(localStorage.getItem('pos-cierres-caja') || '[]');
      } catch {
        cierresLocales = [];
      }
      if (!Array.isArray(cierresLocales)) cierresLocales = [];

      const yaExisten = new Set(cierresLocales.map((c) => c.id));
      let nuevos = 0;
      for (const r of remotos) {
        if (yaExisten.has(r.id)) continue;
        cierresLocales.push({
          id: r.id,
          fecha: r.fecha_cierre,
          fechaApertura: r.fecha_apertura,
          cajero: (r.detalle as any)?.cajero_nombre || 'App móvil',
          baseInicial: Number(r.monto_apertura) || 0,
          totalSistema: Number(r.ventas_total) || 0,
          totalFinal: Number(r.monto_cierre) || 0,
          diferencia: Number(r.diferencia) || 0,
          origen: 'pwa',
          terminalId: r.terminal_id,
          _supabaseSynced: true,
        });
        nuevos++;
      }

      if (nuevos > 0) {
        localStorage.setItem('pos-cierres-caja', JSON.stringify(cierresLocales));
        await dbManager.addLog('pull_cierres_movil', `${nuevos} cierres de la app móvil visibles en el historial`);
        window.dispatchEvent(new CustomEvent('codecpos:cierres-sincronizados'));
      }
    }

    await dbManager.setConfig('lastPullCierres', new Date().toISOString());
  }

  /**
   * 🛡️ Devoluciones eran dos sistemas totalmente aislados: Electron 100%
   * local ('codecpos_devoluciones'), PWA 100% en Supabase — ni se enteraban
   * una de la otra. Unificado con el mismo patrón local_id que productos,
   * incluyendo sus líneas (`devolucion_items`).
   */
  private async pullDevolucionesRemotas(client: NonNullable<ReturnType<typeof getSupabaseClient>>, clienteId: string): Promise<void> {
    const lastPull = await dbManager.getConfig('lastPullDevoluciones');

    let query = client
      .from('devoluciones')
      .select('id, venta_id, numero_factura, total_devolucion, metodo_pago, procesado_por_nombre, observaciones, created_at')
      .eq('cliente_id', clienteId)
      .is('local_id', null);
    if (lastPull) query = query.gt('created_at', lastPull);

    const { data: remotos, error } = await query;
    if (error) throw error;

    if (remotos && remotos.length > 0) {
      let devolucionesLocales: any[];
      try {
        devolucionesLocales = JSON.parse(localStorage.getItem('codecpos_devoluciones') || '[]');
      } catch {
        devolucionesLocales = [];
      }
      if (!Array.isArray(devolucionesLocales)) devolucionesLocales = [];

      const ventas = await dbManager.getAllVentas();
      const idMapVenta = new Map(ventas.filter((v) => v.supabaseId).map((v) => [v.supabaseId as string, v.id]));

      const yaExisten = new Set(devolucionesLocales.map((d) => d.id));
      let nuevos = 0;
      for (const r of remotos) {
        if (yaExisten.has(r.id)) continue;

        const { data: itemsRemotos } = await client
          .from('devolucion_items')
          .select('producto_id, nombre, cantidad, precio_unitario, motivo')
          .eq('devolucion_id', r.id);

        devolucionesLocales.push({
          id: r.id,
          fecha: r.created_at,
          ventaId: (r.venta_id && idMapVenta.get(r.venta_id)) || r.venta_id || undefined,
          numeroFactura: r.numero_factura || undefined,
          totalDevolucion: Number(r.total_devolucion) || 0,
          metodoPago: r.metodo_pago || undefined,
          procesadoPor: r.procesado_por_nombre || 'App móvil',
          observaciones: r.observaciones || undefined,
          items: (itemsRemotos || []).map((it: any) => ({
            productoId: it.producto_id || '',
            nombreProducto: it.nombre,
            cantidadDevuelta: Number(it.cantidad) || 0,
            precioUnitario: Number(it.precio_unitario) || 0,
            motivo: it.motivo || undefined,
          })),
          _supabaseSynced: true,
        });
        nuevos++;
      }

      if (nuevos > 0) {
        localStorage.setItem('codecpos_devoluciones', JSON.stringify(devolucionesLocales));
        await dbManager.addLog('pull_devoluciones_movil', `${nuevos} devoluciones de la app móvil bajadas a la caja`);
        window.dispatchEvent(new CustomEvent('codecpos:devoluciones-sincronizadas'));
      }
    }

    await dbManager.setConfig('lastPullDevoluciones', new Date().toISOString());
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

  /**
   * 🛡️ Hallazgo crítico: la pantalla real de inventario (ProductosPage) NUNCA
   * escribe en IndexedDB — solo en localStorage['pos-productos'] (mismo
   * patrón que POSPageNew leyendo esa misma clave). pushProductosPendientes
   * de arriba lee de IndexedDB y por eso nunca veía estos productos: el
   * catálogo real de un negocio existente quedaba invisible para Supabase (y
   * por lo tanto para la PWA) sin que nada fallara ni avisara. Este puente
   * cierra ese hueco leyendo directamente de 'pos-productos'.
   */
  /**
   * 🛡️ Hallazgo crítico: `_supabaseSynced` solo lo pone en `true` este mismo
   * método — y NINGÚN otro de los ~20 sitios que editan 'pos-productos'
   * (venta, devolución, edición manual, importación CSV, taller, proveedores,
   * combos...) lo resetea a `false` después de cambiar algo. En la práctica,
   * un producto sincronizado una vez dejaba de subir CUALQUIER cambio
   * posterior (precio, stock por venta o devolución, etc.) para siempre —
   * confirmado revisando cada escritura a esa clave. En vez de perseguir 20
   * sitios (y confiar en que ninguno nuevo se le olvide), se compara un hash
   * de los campos que de verdad importan contra el último hash subido
   * (guardado aparte, en dbManager): cualquier cambio real se sube solo,
   * sin depender de que alguien recuerde marcar una bandera.
   */
  private async pushProductosLocalStorage(client: NonNullable<ReturnType<typeof getSupabaseClient>>, clienteId: string): Promise<void> {
    let productos: any[];
    try {
      productos = JSON.parse(localStorage.getItem('pos-productos') || '[]');
    } catch {
      return;
    }
    if (!Array.isArray(productos) || productos.length === 0) return;

    const firma = (p: any) =>
      JSON.stringify([
        p.codigo, p.nombre, p.categoria, p.precio, p.costo, p.stock, p.minStock ?? p.stockMinimo,
        p.aplicaIVA, p.fechaVencimiento, p.imagenUrl, p.activo,
        p.esPapeleriaPinateria, p.categoriaEspecifica, p.tematica, p.calibreGlobo, p.colorAcabado,
        p.marca, p.esDulceria, p.permitirFraccion, p.componentesCombo, p.unidadesPorBolsa,
        p.ventaPorUnidad, p.lote, p.fotosUrls,
      ]);

    const hashesPrevios: Record<string, string> = (await dbManager.getConfig('productosPushHash')) || {};
    const pendientes = productos.filter((p) => p?.id && firma(p) !== hashesPrevios[p.id]);
    if (pendientes.length === 0) return;

    const hashesNuevos: Record<string, string> = { ...hashesPrevios };

    // 🛡️ FIX: `pushVentasPendientes` necesita saber el UUID de Supabase de
    // cada producto vendido para poner `venta_items.producto_id` — pero
    // hasta ahora sacaba ese mapa de `dbManager.getAllProductos()`
    // (IndexedDB), un almacén DISTINTO y desactualizado frente al que de
    // verdad usa la caja (`pos-productos`, este mismo array). Resultado:
    // `producto_id` casi siempre quedaba `null`, y cualquier cálculo de
    // utilidad que dependa de esa columna (Dashboard de la PWA) veía costo
    // $0 aunque el producto sí tuviera costo registrado. Se guarda aquí,
    // en el mismo punto donde se conoce el UUID real recién asignado.
    const mapaIdSupabase: Record<string, string> = { ...((await dbManager.getConfig('productosIdMap')) || {}) };

    for (const p of pendientes) {
      const { data: filaSubida, error } = await client.from('productos').upsert(
        {
          cliente_id: clienteId,
          local_id: p.id,
          codigo_barras: p.codigo || null,
          nombre: p.nombre,
          categoria: p.categoria || null,
          precio_venta: p.precio ?? 0,
          costo: p.costo ?? 0,
          stock: p.stock ?? 0,
          stock_minimo: p.minStock ?? p.stockMinimo ?? null,
          iva: p.aplicaIVA ? 19 : 0,
          fecha_vencimiento: p.fechaVencimiento || null,
          foto_url: p.imagenUrl || (Array.isArray(p.fotosUrls) ? p.fotosUrls[0] : null) || null,
          fotos_urls: p.fotosUrls || null,
          activo: p.activo !== false,
          es_papeleria_pinateria: !!p.esPapeleriaPinateria,
          categoria_especifica: p.categoriaEspecifica || null,
          tematica: p.tematica || null,
          calibre_globo: p.calibreGlobo || null,
          color_acabado: p.colorAcabado || null,
          marca: p.marca || null,
          es_dulceria: !!p.esDulceria,
          permitir_fraccion: !!p.permitirFraccion,
          componentes_combo: p.componentesCombo || null,
          unidades_por_bolsa: p.unidadesPorBolsa ?? null,
          venta_por_unidad: p.ventaPorUnidad !== false,
          lote: p.lote || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'cliente_id,local_id' }
      ).select('id').single();

      if (error) {
        console.error(`[sync] Error subiendo producto local ${p.nombre}:`, error.message);
        continue;
      }
      p._supabaseSynced = true;
      hashesNuevos[p.id] = firma(p);
      if (filaSubida?.id) mapaIdSupabase[p.id] = filaSubida.id;
    }

    localStorage.setItem('pos-productos', JSON.stringify(productos));
    await dbManager.setConfig('productosPushHash', hashesNuevos);
    await dbManager.setConfig('productosIdMap', mapaIdSupabase);
    await dbManager.addLog('push_productos_local', `${pendientes.length} productos (inventario local) subidos`);
  }

  /**
   * 🛡️ Mismo hallazgo que productos: GastosPage.tsx solo escribe en
   * localStorage['pos-gastos'], nunca en IndexedDB — sin este puente los
   * gastos jamás llegan a Supabase ni a la PWA.
   */
  private async pushGastosLocalStorage(client: NonNullable<ReturnType<typeof getSupabaseClient>>, clienteId: string): Promise<void> {
    let gastos: any[];
    try {
      gastos = JSON.parse(localStorage.getItem('pos-gastos') || '[]');
    } catch {
      return;
    }
    if (!Array.isArray(gastos) || gastos.length === 0) return;

    const pendientes = gastos.filter((g) => !g._supabaseSynced);
    if (pendientes.length === 0) return;

    for (const g of pendientes) {
      const { error } = await client.from('gastos').upsert(
        {
          cliente_id: clienteId,
          local_id: g.id,
          fecha: g.fecha || new Date().toISOString(),
          descripcion: g.descripcion || g.concepto || 'Gasto',
          categoria: g.categoria || 'otros',
          monto: g.monto ?? 0,
          medio_pago: g.medioPagoEgreso || g.medio_pago || g.metodoPago || 'efectivo',
          comprobante: g.comprobante || null,
          registrado_por_nombre: g.registradoPor || null,
          notas: g.notas || null,
        },
        { onConflict: 'cliente_id,local_id' }
      );

      if (error) {
        console.error(`[sync] Error subiendo gasto ${g.descripcion}:`, error.message);
        continue;
      }
      g._supabaseSynced = true;
    }

    localStorage.setItem('pos-gastos', JSON.stringify(gastos));
    await dbManager.addLog('push_gastos_local', `${pendientes.length} gastos subidos`);
  }

  /** Sube devoluciones registradas en Electron (`codecpos_devoluciones`) — mismo puente que gastos/productos, con sus líneas en `devolucion_items`. */
  private async pushDevolucionesLocalStorage(client: NonNullable<ReturnType<typeof getSupabaseClient>>, clienteId: string): Promise<void> {
    let devoluciones: any[];
    try {
      devoluciones = JSON.parse(localStorage.getItem('codecpos_devoluciones') || '[]');
    } catch {
      return;
    }
    if (!Array.isArray(devoluciones) || devoluciones.length === 0) return;

    const pendientes = devoluciones.filter((d) => !d._supabaseSynced);
    if (pendientes.length === 0) return;

    const ventas = await dbManager.getAllVentas();
    const idMapVenta = new Map(ventas.filter((v) => v.supabaseId).map((v) => [v.id, v.supabaseId as string]));

    for (const d of pendientes) {
      const { data: devRow, error } = await client
        .from('devoluciones')
        .upsert(
          {
            cliente_id: clienteId,
            local_id: d.id,
            venta_id: (d.ventaId && idMapVenta.get(d.ventaId)) || null,
            numero_factura: d.numeroFactura || d.ventaId || null,
            total_devolucion: d.totalDevolucion ?? 0,
            metodo_pago: d.metodoPago || null,
            procesado_por_nombre: d.procesadoPor || null,
            observaciones: d.observaciones || d.motivo || null,
          },
          { onConflict: 'cliente_id,local_id' }
        )
        .select('id')
        .single();

      if (error) {
        console.error(`[sync] Error subiendo devolución ${d.id}:`, error.message);
        continue;
      }

      const items = Array.isArray(d.items) ? d.items : [];
      if (items.length > 0) {
        await client.from('devolucion_items').delete().eq('devolucion_id', devRow.id);
        await client.from('devolucion_items').insert(
          items.map((it: any) => ({
            devolucion_id: devRow.id,
            producto_id: null, // el id local de producto no es un uuid válido de Supabase; se referencia por nombre
            nombre: it.nombreProducto || it.nombre || 'Producto',
            cantidad: it.cantidadDevuelta ?? it.cantidad ?? 0,
            precio_unitario: it.precioUnitario ?? it.precio ?? 0,
            motivo: it.motivo || null,
          }))
        );
      }

      d._supabaseSynced = true;
    }

    localStorage.setItem('codecpos_devoluciones', JSON.stringify(devoluciones));
    await dbManager.addLog('push_devoluciones_local', `${pendientes.length} devoluciones subidas`);
  }

  private async pushVentasPendientes(client: NonNullable<ReturnType<typeof getSupabaseClient>>, clienteId: string): Promise<void> {
    const ventas = await dbManager.getAllVentas();
    const pendientes = ventas.filter((v) => v.syncStatus === 'pending');
    if (pendientes.length === 0) return;

    // Fuente principal: el mapa que `pushProductosLocalStorage` acaba de
    // llenar/actualizar en este mismo ciclo (local_id de `pos-productos` →
    // uuid real en Supabase). Se complementa con IndexedDB por si algún
    // producto viejo solo quedó registrado ahí.
    const mapaGuardado = (await dbManager.getConfig('productosIdMap')) as Record<string, string> | null;
    const idMap = new Map<string, string>(Object.entries(mapaGuardado || {}));
    const productos = await dbManager.getAllProductos();
    for (const p of productos) {
      if (p.supabaseId && !idMap.has(p.id)) idMap.set(p.id, p.supabaseId);
    }

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

/**
 * 🛡️ Hallazgo crítico: eliminar un producto (uno o "vaciar todo") en
 * ProductosPage.tsx solo tocaba `localStorage['pos-productos']` — nunca le
 * avisaba a Supabase. `pushProductosLocalStorage` sube lo que SÍ está en ese
 * array; nunca detecta lo que dejó de estar, así que la fila remota se
 * quedaba `activo:true` para siempre y la PWA (que lee directo de Supabase)
 * seguía mostrando el producto "eliminado" como si nada. Estas funciones
 * cierran ese hueco: se llaman justo después de borrar localmente.
 *
 * Es desactivación (`activo:false`), no borrado físico — mismo criterio que
 * ya usa la PWA (`handleDesactivar` en ProductoFormPage.tsx) y que preserva
 * la integridad de ventas históricas que referencian ese producto.
 */
export async function desactivarProductoEnNube(localId: string): Promise<void> {
  try {
    await dbManager.deleteProducto(localId);
  } catch { /* IndexedDB puede no tener el registro — no es un error real */ }

  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return;

  try {
    await client.from('productos').update({ activo: false, updated_at: new Date().toISOString() })
      .eq('cliente_id', clienteId).eq('local_id', localId);
  } catch (e) {
    console.warn('[sync] No se pudo desactivar el producto en la nube (quedará desactualizado hasta reconectar):', e);
  }
}

/** "Vaciar inventario" — desactiva TODO lo del negocio en Supabase de una vez. */
export async function desactivarTodosLosProductosEnNube(): Promise<void> {
  try {
    const locales = await dbManager.getAllProductos();
    await Promise.all(locales.map((p) => dbManager.deleteProducto(p.id).catch(() => {})));
  } catch { /* no crítico */ }

  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return;

  try {
    await client.from('productos').update({ activo: false, updated_at: new Date().toISOString() })
      .eq('cliente_id', clienteId);
  } catch (e) {
    console.warn('[sync] No se pudo vaciar el inventario en la nube (quedará desactualizado hasta reconectar):', e);
  }
}

export interface SyncStatus {
  status: 'syncing' | 'success' | 'error' | 'offline' | 'unlinked';
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
