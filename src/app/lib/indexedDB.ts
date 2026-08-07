/**
 * IndexedDB Database Manager para CodecPOS v2.0
 * Almacenamiento local robusto para funcionamiento offline
 */

const DB_NAME = 'CodecPOS_DB';
// 🛡️ FIX: usuariosStorage.ts abre esta MISMA base de datos con su propia
// conexión independiente. Antes mantenía su propio número de versión a mano
// (quedó desactualizado más de una vez) — si esa conexión pedía una versión
// menor a la que ya tiene la base (la normal, ya que este archivo se carga
// primero en casi toda la app), IndexedDB la rechaza con VersionError y esa
// capa de respaldo de usuarios queda muerta sin que nadie se entere. Ahora
// usuariosStorage.ts importa esta misma constante en vez de tener la suya.
export const DB_VERSION = 6; // ✅ 'codigo' de productos ya no es índice único (ver onupgradeneeded)

// Definición de stores
export const STORES = {
  PRODUCTOS: 'productos',
  VENTAS: 'ventas',
  USUARIOS: 'usuarios',
  CONFIG: 'config',
  SYNC_QUEUE: 'sync_queue',
  LOGS: 'logs',
  CONFIRMACIONES_PAGO: 'confirmaciones_pago',
  TURNOS: 'turnos',
  // ✅ Nuevas stores para funcionalidades avanzadas
  CLIENTES: 'clientes',
  MOVIMIENTOS_PUNTOS: 'movimientosPuntos',
  PROVEEDORES: 'proveedores',
  ORDENES_COMPRA: 'ordenesCompra',
  RECEPCIONES_MERCANCIA: 'recepcionesMercancia',
  HISTORIAL_PRECIOS: 'historialPrecios',
  PROMOCIONES: 'promociones',
  COMBOS: 'combos',
  APARTADOS: 'apartados',
  CODIGOS_GENERADOS: 'codigosGenerados',
  PLANTILLAS_ETIQUETAS: 'plantillasEtiquetas',
  // ✅ Nuevas stores WhatsApp y ML
  PEDIDOS_WHATSAPP: 'pedidosWhatsApp',
  MENSAJES_WHATSAPP: 'mensajesWhatsApp',
  PLANTILLAS_WHATSAPP: 'plantillasWhatsApp',
  PREDICCIONES_ML: 'prediccionesML',
  MODELOS_ML: 'modelosML',
  // ✅ Stores módulo híbrido panadería/cafetería
  INGREDIENTES_INVENTARIO: 'ingredientesInventario',
  RECETAS: 'recetas',
  RECETA_INGREDIENTES: 'recetaIngredientes',
  MODIFICADORES_PRODUCTO: 'modificadoresProducto',
  OPCIONES_MODIFICADOR: 'opcionesModificador',
  MERMAS: 'mermas',
  MOVIMIENTOS_STOCK: 'movimientosStock',
} as const;

export interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  precio: number;
  costo: number;
  stock: number;
  stockMinimo: number;
  categoria: string;
  unidad: string;
  iva: number;
  activo: boolean;
  fechaVencimiento?: string;
  proveedor?: string;
  imagenUrl?: string;
  createdAt: number;
  updatedAt: number;
  syncStatus?: 'synced' | 'pending' | 'conflict';
  /** id real en la tabla productos de Supabase, una vez sincronizado */
  supabaseId?: string;
  // ✅ Inventario híbrido (directo/receta)
  tipoInventario?: 'directo' | 'receta';
  recipeId?: string;
  esInsumo?: boolean;
  esVendible?: boolean;
}

export interface IngredienteInventario {
  id: string;
  nombre: string;
  unidad: string;
  stockActual: number;
  stockMinimo: number;
  costoUnitario?: number;
  activo: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Receta {
  id: string;
  nombre: string;
  productoId: string;
  rendimiento: number;
  activa: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface RecetaIngrediente {
  id: string;
  recipeId: string;
  ingredientId: string;
  cantidad: number;
  unidad: string;
  mermaPct?: number;
}

export interface Venta {
  id: string;
  numero: number;
  fecha: string;
  items: Array<{
    productoId: string;
    nombre: string;
    cantidad: number;
    precio: number;
    subtotal: number;
  }>;
  subtotal: number;
  iva: number;
  total: number;
  metodoPago: string;
  metodosMultiples?: Array<{ metodo: string; monto: number }>;
  cajero: string;
  puntoVentaId: string;
  createdAt: number;
  syncStatus?: 'synced' | 'pending' | 'conflict';
  /** id real en la tabla ventas de Supabase, una vez sincronizada */
  supabaseId?: string;
}

export interface SyncQueueItem {
  id: string;
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  store: string;
  data: any;
  timestamp: number;
  retries: number;
  status: 'pending' | 'processing' | 'failed';
}

export interface ConfigItem {
  key: string;
  value: any;
  updatedAt: number;
}

class IndexedDBManager {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('❌ Error abriendo IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ IndexedDB inicializado correctamente');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = (event.target as IDBOpenDBRequest).transaction!;
        console.log('🔧 Creando/actualizando esquema de IndexedDB...');

        // Store de Productos
        if (!db.objectStoreNames.contains(STORES.PRODUCTOS)) {
          const productosStore = db.createObjectStore(STORES.PRODUCTOS, { keyPath: 'id' });
          // 🛡️ 'codigo' (código de barras) NO puede ser único: muchos
          // productos no tienen barcode y quedan con codigo:'' — con un
          // índice único, el segundo producto sin código lanza
          // "Unable to add key to index 'codigo'" y aborta TODA la
          // sincronización a mitad de camino (incluido el heartbeat que
          // marca la caja como "conectada" para la PWA).
          productosStore.createIndex('codigo', 'codigo', { unique: false });
          productosStore.createIndex('categoria', 'categoria', { unique: false });
          productosStore.createIndex('syncStatus', 'syncStatus', { unique: false });
          productosStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          console.log('✅ Store PRODUCTOS creado');
        } else {
          // Instalación existente con el índice 'codigo' todavía marcado
          // como único (versiones de esquema anteriores) — se recrea sin
          // esa restricción. deleteIndex es un no-op seguro si ya se migró.
          const productosStore = transaction.objectStore(STORES.PRODUCTOS);
          if (productosStore.indexNames.contains('codigo')) {
            productosStore.deleteIndex('codigo');
          }
          productosStore.createIndex('codigo', 'codigo', { unique: false });
          console.log('🔧 Índice "codigo" de PRODUCTOS migrado a no-único');
        }

        // Store de Ventas
        if (!db.objectStoreNames.contains(STORES.VENTAS)) {
          const ventasStore = db.createObjectStore(STORES.VENTAS, { keyPath: 'id' });
          ventasStore.createIndex('numero', 'numero', { unique: true });
          ventasStore.createIndex('fecha', 'fecha', { unique: false });
          ventasStore.createIndex('puntoVentaId', 'puntoVentaId', { unique: false });
          ventasStore.createIndex('syncStatus', 'syncStatus', { unique: false });
          ventasStore.createIndex('createdAt', 'createdAt', { unique: false });
          console.log('✅ Store VENTAS creado');
        }

        // Store de Usuarios
        if (!db.objectStoreNames.contains(STORES.USUARIOS)) {
          const usuariosStore = db.createObjectStore(STORES.USUARIOS, { keyPath: 'id' });
          usuariosStore.createIndex('username', 'username', { unique: true });
          usuariosStore.createIndex('activo', 'activo', { unique: false });
          console.log('✅ Store USUARIOS creado');
        }

        // Store de Configuración
        if (!db.objectStoreNames.contains(STORES.CONFIG)) {
          db.createObjectStore(STORES.CONFIG, { keyPath: 'key' });
          console.log('✅ Store CONFIG creado');
        }

        // Store de Cola de Sincronización
        if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
          const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id' });
          syncStore.createIndex('status', 'status', { unique: false });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
          syncStore.createIndex('store', 'store', { unique: false });
          console.log('✅ Store SYNC_QUEUE creado');
        }

        // Store de Logs
        if (!db.objectStoreNames.contains(STORES.LOGS)) {
          const logsStore = db.createObjectStore(STORES.LOGS, { keyPath: 'id', autoIncrement: true });
          logsStore.createIndex('timestamp', 'timestamp', { unique: false });
          logsStore.createIndex('type', 'type', { unique: false });
          console.log('✅ Store LOGS creado');
        }

        // Store de Confirmaciones de Pago
        if (!db.objectStoreNames.contains(STORES.CONFIRMACIONES_PAGO)) {
          const confirmacionesPagoStore = db.createObjectStore(STORES.CONFIRMACIONES_PAGO, { keyPath: 'id' });
          confirmacionesPagoStore.createIndex('ventaId', 'ventaId', { unique: true });
          confirmacionesPagoStore.createIndex('timestamp', 'timestamp', { unique: false });
          console.log('✅ Store CONFIRMACIONES_PAGO creado');
        }

        // Store de Turnos
        if (!db.objectStoreNames.contains(STORES.TURNOS)) {
          const turnosStore = db.createObjectStore(STORES.TURNOS, { keyPath: 'id' });
          turnosStore.createIndex('usuarioId', 'usuarioId', { unique: false });
          turnosStore.createIndex('fecha', 'fecha', { unique: false });
          turnosStore.createIndex('horaInicio', 'horaInicio', { unique: false });
          turnosStore.createIndex('horaFin', 'horaFin', { unique: false });
          console.log('✅ Store TURNOS creado');
        }

        // Store de Clientes
        if (!db.objectStoreNames.contains(STORES.CLIENTES)) {
          const clientesStore = db.createObjectStore(STORES.CLIENTES, { keyPath: 'id' });
          clientesStore.createIndex('nombre', 'nombre', { unique: false });
          clientesStore.createIndex('telefono', 'telefono', { unique: false });
          clientesStore.createIndex('email', 'email', { unique: false });
          console.log('✅ Store CLIENTES creado');
        }

        // Store de Movimientos de Puntos
        if (!db.objectStoreNames.contains(STORES.MOVIMIENTOS_PUNTOS)) {
          const movimientosPuntosStore = db.createObjectStore(STORES.MOVIMIENTOS_PUNTOS, { keyPath: 'id' });
          movimientosPuntosStore.createIndex('clienteId', 'clienteId', { unique: false });
          movimientosPuntosStore.createIndex('fecha', 'fecha', { unique: false });
          movimientosPuntosStore.createIndex('tipo', 'tipo', { unique: false });
          console.log('✅ Store MOVIMIENTOS_PUNTOS creado');
        }

        // Store de Proveedores
        if (!db.objectStoreNames.contains(STORES.PROVEEDORES)) {
          const proveedoresStore = db.createObjectStore(STORES.PROVEEDORES, { keyPath: 'id' });
          proveedoresStore.createIndex('nombre', 'nombre', { unique: false });
          proveedoresStore.createIndex('telefono', 'telefono', { unique: false });
          proveedoresStore.createIndex('email', 'email', { unique: false });
          console.log('✅ Store PROVEEDORES creado');
        }

        // Store de Órdenes de Compra
        if (!db.objectStoreNames.contains(STORES.ORDENES_COMPRA)) {
          const ordenesCompraStore = db.createObjectStore(STORES.ORDENES_COMPRA, { keyPath: 'id' });
          ordenesCompraStore.createIndex('proveedorId', 'proveedorId', { unique: false });
          ordenesCompraStore.createIndex('fecha', 'fecha', { unique: false });
          ordenesCompraStore.createIndex('estado', 'estado', { unique: false });
          console.log('✅ Store ORDENES_COMPRA creado');
        }

        // Store de Recepciones de Mercancia
        if (!db.objectStoreNames.contains(STORES.RECEPCIONES_MERCANCIA)) {
          const recepcionesMercanciaStore = db.createObjectStore(STORES.RECEPCIONES_MERCANCIA, { keyPath: 'id' });
          recepcionesMercanciaStore.createIndex('ordenCompraId', 'ordenCompraId', { unique: false });
          recepcionesMercanciaStore.createIndex('fecha', 'fecha', { unique: false });
          recepcionesMercanciaStore.createIndex('estado', 'estado', { unique: false });
          console.log('✅ Store RECEPCIONES_MERCANCIA creado');
        }

        // Store de Historial de Precios
        if (!db.objectStoreNames.contains(STORES.HISTORIAL_PRECIOS)) {
          const historialPreciosStore = db.createObjectStore(STORES.HISTORIAL_PRECIOS, { keyPath: 'id' });
          historialPreciosStore.createIndex('productoId', 'productoId', { unique: false });
          historialPreciosStore.createIndex('fecha', 'fecha', { unique: false });
          console.log('✅ Store HISTORIAL_PRECIOS creado');
        }

        // Store de Promociones
        if (!db.objectStoreNames.contains(STORES.PROMOCIONES)) {
          const promocionesStore = db.createObjectStore(STORES.PROMOCIONES, { keyPath: 'id' });
          promocionesStore.createIndex('nombre', 'nombre', { unique: false });
          promocionesStore.createIndex('fechaInicio', 'fechaInicio', { unique: false });
          promocionesStore.createIndex('fechaFin', 'fechaFin', { unique: false });
          console.log('✅ Store PROMOCIONES creado');
        }

        // Store de Combos
        if (!db.objectStoreNames.contains(STORES.COMBOS)) {
          const combosStore = db.createObjectStore(STORES.COMBOS, { keyPath: 'id' });
          combosStore.createIndex('nombre', 'nombre', { unique: false });
          combosStore.createIndex('precio', 'precio', { unique: false });
          console.log('✅ Store COMBOS creado');
        }

        // Store de Apartados
        if (!db.objectStoreNames.contains(STORES.APARTADOS)) {
          const apartadosStore = db.createObjectStore(STORES.APARTADOS, { keyPath: 'id' });
          apartadosStore.createIndex('clienteId', 'clienteId', { unique: false });
          apartadosStore.createIndex('fecha', 'fecha', { unique: false });
          apartadosStore.createIndex('estado', 'estado', { unique: false });
          console.log('✅ Store APARTADOS creado');
        }

        // Store de Códigos Generados
        if (!db.objectStoreNames.contains(STORES.CODIGOS_GENERADOS)) {
          const codigosGeneradosStore = db.createObjectStore(STORES.CODIGOS_GENERADOS, { keyPath: 'id' });
          codigosGeneradosStore.createIndex('tipo', 'tipo', { unique: false });
          codigosGeneradosStore.createIndex('fecha', 'fecha', { unique: false });
          console.log('✅ Store CODIGOS_GENERADOS creado');
        }

        // Store de Plantillas de Etiquetas
        if (!db.objectStoreNames.contains(STORES.PLANTILLAS_ETIQUETAS)) {
          const plantillasEtiquetasStore = db.createObjectStore(STORES.PLANTILLAS_ETIQUETAS, { keyPath: 'id' });
          plantillasEtiquetasStore.createIndex('nombre', 'nombre', { unique: false });
          console.log('✅ Store PLANTILLAS_ETIQUETAS creado');
        }

        // Store de Pedidos WhatsApp
        if (!db.objectStoreNames.contains(STORES.PEDIDOS_WHATSAPP)) {
          const pedidosWhatsAppStore = db.createObjectStore(STORES.PEDIDOS_WHATSAPP, { keyPath: 'id' });
          pedidosWhatsAppStore.createIndex('clienteId', 'clienteId', { unique: false });
          pedidosWhatsAppStore.createIndex('fecha', 'fecha', { unique: false });
          pedidosWhatsAppStore.createIndex('estado', 'estado', { unique: false });
          console.log('✅ Store PEDIDOS_WHATSAPP creado');
        }

        // Store de Mensajes WhatsApp
        if (!db.objectStoreNames.contains(STORES.MENSAJES_WHATSAPP)) {
          const mensajesWhatsAppStore = db.createObjectStore(STORES.MENSAJES_WHATSAPP, { keyPath: 'id' });
          mensajesWhatsAppStore.createIndex('pedidoId', 'pedidoId', { unique: false });
          mensajesWhatsAppStore.createIndex('fecha', 'fecha', { unique: false });
          mensajesWhatsAppStore.createIndex('tipo', 'tipo', { unique: false });
          console.log('✅ Store MENSAJES_WHATSAPP creado');
        }

        // Store de Plantillas WhatsApp
        if (!db.objectStoreNames.contains(STORES.PLANTILLAS_WHATSAPP)) {
          const plantillasWhatsAppStore = db.createObjectStore(STORES.PLANTILLAS_WHATSAPP, { keyPath: 'id' });
          plantillasWhatsAppStore.createIndex('nombre', 'nombre', { unique: false });
          console.log('✅ Store PLANTILLAS_WHATSAPP creado');
        }

        // Store de Predicciones ML
        if (!db.objectStoreNames.contains(STORES.PREDICCIONES_ML)) {
          const prediccionesMLStore = db.createObjectStore(STORES.PREDICCIONES_ML, { keyPath: 'id' });
          prediccionesMLStore.createIndex('fecha', 'fecha', { unique: false });
          prediccionesMLStore.createIndex('modeloId', 'modeloId', { unique: false });
          console.log('✅ Store PREDICCIONES_ML creado');
        }

        // Store de Modelos ML
        if (!db.objectStoreNames.contains(STORES.MODELOS_ML)) {
          const modelosMLStore = db.createObjectStore(STORES.MODELOS_ML, { keyPath: 'id' });
          modelosMLStore.createIndex('nombre', 'nombre', { unique: false });
          modelosMLStore.createIndex('fechaCreacion', 'fechaCreacion', { unique: false });
          console.log('✅ Store MODELOS_ML creado');
        }

        // Store de Ingredientes de Inventario
        if (!db.objectStoreNames.contains(STORES.INGREDIENTES_INVENTARIO)) {
          const ingredientesStore = db.createObjectStore(STORES.INGREDIENTES_INVENTARIO, { keyPath: 'id' });
          ingredientesStore.createIndex('nombre', 'nombre', { unique: false });
          ingredientesStore.createIndex('activo', 'activo', { unique: false });
          ingredientesStore.createIndex('stockActual', 'stockActual', { unique: false });
          console.log('✅ Store INGREDIENTES_INVENTARIO creado');
        }

        // Store de Recetas
        if (!db.objectStoreNames.contains(STORES.RECETAS)) {
          const recetasStore = db.createObjectStore(STORES.RECETAS, { keyPath: 'id' });
          recetasStore.createIndex('productoId', 'productoId', { unique: true });
          recetasStore.createIndex('activa', 'activa', { unique: false });
          console.log('✅ Store RECETAS creado');
        }

        // Store de Relación Receta-Ingredientes
        if (!db.objectStoreNames.contains(STORES.RECETA_INGREDIENTES)) {
          const recetaIngStore = db.createObjectStore(STORES.RECETA_INGREDIENTES, { keyPath: 'id' });
          recetaIngStore.createIndex('recipeId', 'recipeId', { unique: false });
          recetaIngStore.createIndex('ingredientId', 'ingredientId', { unique: false });
          console.log('✅ Store RECETA_INGREDIENTES creado');
        }

        // Store de Modificadores por Producto
        if (!db.objectStoreNames.contains(STORES.MODIFICADORES_PRODUCTO)) {
          const modProdStore = db.createObjectStore(STORES.MODIFICADORES_PRODUCTO, { keyPath: 'id' });
          modProdStore.createIndex('productoId', 'productoId', { unique: false });
          modProdStore.createIndex('activo', 'activo', { unique: false });
          console.log('✅ Store MODIFICADORES_PRODUCTO creado');
        }

        // Store de Opciones de Modificador
        if (!db.objectStoreNames.contains(STORES.OPCIONES_MODIFICADOR)) {
          const opcionesStore = db.createObjectStore(STORES.OPCIONES_MODIFICADOR, { keyPath: 'id' });
          opcionesStore.createIndex('modificadorId', 'modificadorId', { unique: false });
          opcionesStore.createIndex('activo', 'activo', { unique: false });
          console.log('✅ Store OPCIONES_MODIFICADOR creado');
        }

        // Store de Mermas
        if (!db.objectStoreNames.contains(STORES.MERMAS)) {
          const mermasStore = db.createObjectStore(STORES.MERMAS, { keyPath: 'id' });
          mermasStore.createIndex('fecha', 'fecha', { unique: false });
          mermasStore.createIndex('ingredientId', 'ingredientId', { unique: false });
          console.log('✅ Store MERMAS creado');
        }

        // Store de Movimientos de Stock
        if (!db.objectStoreNames.contains(STORES.MOVIMIENTOS_STOCK)) {
          const movStore = db.createObjectStore(STORES.MOVIMIENTOS_STOCK, { keyPath: 'id' });
          movStore.createIndex('fecha', 'fecha', { unique: false });
          movStore.createIndex('tipo', 'tipo', { unique: false });
          movStore.createIndex('productoId', 'productoId', { unique: false });
          movStore.createIndex('ingredientId', 'ingredientId', { unique: false });
          console.log('✅ Store MOVIMIENTOS_STOCK creado');
        }
      };
    });
  }

  async ensureDB(): Promise<IDBDatabase> {
    if (this.initPromise) {
      await this.initPromise;
    }
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  // ==================== PRODUCTOS ====================
  async addProducto(producto: Producto): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.PRODUCTOS], 'readwrite');
      const store = transaction.objectStore(STORES.PRODUCTOS);
      const request = store.add({
        ...producto,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        syncStatus: 'pending'
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async updateProducto(producto: Producto): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.PRODUCTOS], 'readwrite');
      const store = transaction.objectStore(STORES.PRODUCTOS);
      const request = store.put({
        ...producto,
        updatedAt: Date.now(),
        syncStatus: 'pending'
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Marca un producto como sincronizado con Supabase, guardando su id remoto.
   * A diferencia de updateProducto, NO fuerza syncStatus:'pending' (eso
   * revertiría el propio resultado de la sincronización).
   */
  async markProductoSynced(producto: Producto, supabaseId: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.PRODUCTOS], 'readwrite');
      const store = transaction.objectStore(STORES.PRODUCTOS);
      const request = store.put({
        ...producto,
        supabaseId,
        syncStatus: 'synced'
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Escribe un producto tal cual (usado por el motor de sync al aplicar
   * cambios recibidos desde Supabase — no reinterpreta syncStatus).
   */
  async putProductoRaw(producto: Producto): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.PRODUCTOS], 'readwrite');
      const store = transaction.objectStore(STORES.PRODUCTOS);
      const request = store.put(producto);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getProducto(id: string): Promise<Producto | null> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.PRODUCTOS], 'readonly');
      const store = transaction.objectStore(STORES.PRODUCTOS);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllProductos(): Promise<Producto[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.PRODUCTOS], 'readonly');
      const store = transaction.objectStore(STORES.PRODUCTOS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteProducto(id: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.PRODUCTOS], 'readwrite');
      const store = transaction.objectStore(STORES.PRODUCTOS);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ==================== VENTAS ====================
  async addVenta(venta: Venta): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.VENTAS], 'readwrite');
      const store = transaction.objectStore(STORES.VENTAS);
      const request = store.add({
        ...venta,
        createdAt: Date.now(),
        syncStatus: 'pending'
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async updateVenta(venta: Venta): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.VENTAS], 'readwrite');
      const store = transaction.objectStore(STORES.VENTAS);
      const request = store.put({
        ...venta,
        syncStatus: 'synced'
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllVentas(): Promise<Venta[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.VENTAS], 'readonly');
      const store = transaction.objectStore(STORES.VENTAS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getVentasByDateRange(startDate: string, endDate: string): Promise<Venta[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.VENTAS], 'readonly');
      const store = transaction.objectStore(STORES.VENTAS);
      const index = store.index('fecha');
      const range = IDBKeyRange.bound(startDate, endDate);
      const request = index.getAll(range);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // 🛡️ El número de factura se generaba SOLO desde un contador en
  // localStorage ('pos-ultima-factura'), independiente de lo que realmente
  // hay guardado en IndexedDB. Si ambos se desincronizan (backup/restore,
  // limpieza de localStorage, migración de equipo), la siguiente venta
  // reutiliza un `id`/`numero` ya existente y `addVenta` (store.add) lanza
  // ConstraintError — la venta se muestra como exitosa al cajero pero nunca
  // se guarda. Usa el índice `numero` (ya existente, único) para leer el
  // máximo real sin escanear toda la tabla.
  async getUltimoNumeroVenta(): Promise<number> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.VENTAS], 'readonly');
      const store = transaction.objectStore(STORES.VENTAS);
      const index = store.index('numero');
      const request = index.openCursor(null, 'prev');

      request.onsuccess = () => {
        const cursor = request.result;
        resolve(cursor ? (Number(cursor.value?.numero) || 0) : 0);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // ==================== CONFIGURACIÓN ====================
  async setConfig(key: string, value: any): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.CONFIG], 'readwrite');
      const store = transaction.objectStore(STORES.CONFIG);
      const request = store.put({
        key,
        value,
        updatedAt: Date.now()
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getConfig(key: string): Promise<any> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.CONFIG], 'readonly');
      const store = transaction.objectStore(STORES.CONFIG);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result?.value || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllConfigs(): Promise<Record<string, any>> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.CONFIG], 'readonly');
      const store = transaction.objectStore(STORES.CONFIG);
      const request = store.getAll();

      request.onsuccess = () => {
        const configs: Record<string, any> = {};
        for (const item of request.result) {
          configs[item.key] = item.value;
        }
        resolve(configs);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // ==================== COLA DE SINCRONIZACIÓN ====================
  async addToSyncQueue(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.SYNC_QUEUE], 'readwrite');
      const store = transaction.objectStore(STORES.SYNC_QUEUE);
      const request = store.add({
        ...item,
        id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingSyncItems(): Promise<SyncQueueItem[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.SYNC_QUEUE], 'readonly');
      const store = transaction.objectStore(STORES.SYNC_QUEUE);
      const index = store.index('status');
      const request = index.getAll('pending');

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async updateSyncItem(id: string, updates: Partial<SyncQueueItem>): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.SYNC_QUEUE], 'readwrite');
      const store = transaction.objectStore(STORES.SYNC_QUEUE);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (item) {
          const putRequest = store.put({ ...item, ...updates });
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          reject(new Error('Sync item not found'));
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async deleteSyncItem(id: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.SYNC_QUEUE], 'readwrite');
      const store = transaction.objectStore(STORES.SYNC_QUEUE);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ==================== LOGS ====================
  async addLog(type: string, message: string, data?: any): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.LOGS], 'readwrite');
      const store = transaction.objectStore(STORES.LOGS);
      const request = store.add({
        type,
        message,
        data,
        timestamp: Date.now()
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getRecentLogs(limit: number = 100): Promise<any[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.LOGS], 'readonly');
      const store = transaction.objectStore(STORES.LOGS);
      const index = store.index('timestamp');
      const request = index.openCursor(null, 'prev');
      const results: any[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  // ==================== MÉTODOS ADICIONALES ====================
  
  async getAllLogs(): Promise<any[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.LOGS], 'readonly');
      const store = transaction.objectStore(STORES.LOGS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteLog(id: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.LOGS], 'readwrite');
      const store = transaction.objectStore(STORES.LOGS);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllConfig(): Promise<ConfigItem[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.CONFIG], 'readonly');
      const store = transaction.objectStore(STORES.CONFIG);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteConfig(key: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.CONFIG], 'readwrite');
      const store = transaction.objectStore(STORES.CONFIG);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllUsuarios(): Promise<any[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.USUARIOS], 'readonly');
      const store = transaction.objectStore(STORES.USUARIOS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async addUsuario(usuario: any): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.USUARIOS], 'readwrite');
      const store = transaction.objectStore(STORES.USUARIOS);
      const request = store.add(usuario);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async updateUsuario(usuario: any): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.USUARIOS], 'readwrite');
      const store = transaction.objectStore(STORES.USUARIOS);
      const request = store.put(usuario);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ==================== UTILIDADES ====================
  async clearAllData(): Promise<void> {
    const db = await this.ensureDB();
    const stores = [STORES.PRODUCTOS, STORES.VENTAS, STORES.USUARIOS, STORES.CONFIG, STORES.SYNC_QUEUE, STORES.LOGS, STORES.CONFIRMACIONES_PAGO, STORES.TURNOS];
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(stores, 'readwrite');
      
      stores.forEach(storeName => {
        transaction.objectStore(storeName).clear();
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getStorageSize(): Promise<{ used: number; quota: number; percentage: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        quota: estimate.quota || 0,
        percentage: ((estimate.usage || 0) / (estimate.quota || 1)) * 100
      };
    }
    return { used: 0, quota: 0, percentage: 0 };
  }

  async deleteVenta(id: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.VENTAS], 'readwrite');
      const request = transaction.objectStore(STORES.VENTAS).delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteUsuario(id: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.USUARIOS], 'readwrite');
      const request = transaction.objectStore(STORES.USUARIOS).delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ==================== RESTAURACIÓN GENÉRICA (BLINDAJE) ====================
  // Usadas por backupService para vaciar y repoblar cualquier store a partir
  // de un backup blindado (C:\CodecStudio\CODECPOS\backups\), sin tener que
  // mantener un método delete*/add* dedicado por cada store nuevo.

  async clearStore(storeName: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const request = transaction.objectStore(storeName).clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /** Inserta (put, no add) una lista de registros ya existentes de un backup en un store. */
  async bulkPut(storeName: string, items: any[]): Promise<void> {
    if (!items || items.length === 0) return;
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      for (const item of items) store.put(item);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

// Exportar instancia singleton
export const dbManager = new IndexedDBManager();

// ─────────────────────────────────────────────────────────────────────────────
// GENERIC openDB API
// Todos los servicios avanzados (fidelización, apartados, proveedores, etc.)
// usan esta función para obtener un wrapper genérico con put/get/getAll/delete.
// ─────────────────────────────────────────────────────────────────────────────

interface GenericDB {
  put(storeName: string, data: any): Promise<any>;
  get(storeName: string, key: string): Promise<any>;
  getAll(storeName: string): Promise<any[]>;
  delete(storeName: string, key: string): Promise<void>;
  add(storeName: string, data: any): Promise<any>;
}

/**
 * openDB() — API genérica para operaciones CRUD en cualquier store de IndexedDB.
 * Usada por fidelizacionService, apartadosService, proveedoresService, codigosBarrasService, etc.
 */
export async function openDB(): Promise<GenericDB> {
  // Esperar a que el manager principal haya inicializado la DB con el schema completo
  await dbManager.ensureDB();

  return {
    async put(storeName: string, data: any): Promise<any> {
      const db = await dbManager.ensureDB();
      return new Promise((resolve, reject) => {
        try {
          const tx = db.transaction([storeName], 'readwrite');
          const store = tx.objectStore(storeName);
          const req = store.put(data);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        } catch (e) { reject(e); }
      });
    },

    async get(storeName: string, key: string): Promise<any> {
      const db = await dbManager.ensureDB();
      return new Promise((resolve, reject) => {
        try {
          const tx = db.transaction([storeName], 'readonly');
          const store = tx.objectStore(storeName);
          const req = store.get(key);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => reject(req.error);
        } catch (e) { reject(e); }
      });
    },

    async getAll(storeName: string): Promise<any[]> {
      const db = await dbManager.ensureDB();
      return new Promise((resolve, reject) => {
        try {
          const tx = db.transaction([storeName], 'readonly');
          const store = tx.objectStore(storeName);
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        } catch (e) { reject(e); }
      });
    },

    async delete(storeName: string, key: string): Promise<void> {
      const db = await dbManager.ensureDB();
      return new Promise((resolve, reject) => {
        try {
          const tx = db.transaction([storeName], 'readwrite');
          const store = tx.objectStore(storeName);
          const req = store.delete(key);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        } catch (e) { reject(e); }
      });
    },

    async add(storeName: string, data: any): Promise<any> {
      const db = await dbManager.ensureDB();
      return new Promise((resolve, reject) => {
        try {
          const tx = db.transaction([storeName], 'readwrite');
          const store = tx.objectStore(storeName);
          const req = store.add(data);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        } catch (e) { reject(e); }
      });
    },
  };
}
