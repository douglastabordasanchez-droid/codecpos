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
import { listarTiendas, getStockResumenTienda, ejecutarTransferencia, reemplazarTiendasDesdeNube, getTiendaActivaId, aplicarStockSedeDesdeNube } from './multitiendaService';
import { descargarTiendas } from './supabase/tiendasSyncService';
import { descargarConfiguracionEmpresaDesdeNube, sincronizarConfiguracionEmpresaPendiente } from './supabase/empresaConfigSyncService';
import { listarCuentasCartera, guardarCuentaCarteraRaw, registrarAbonoEnCierre, CuentaCartera } from './carteraService';
import { listarClientes, guardarClienteRaw, Cliente } from './fidelizacionService';

/**
 * Ritmo de la sincronización (antes: los 21 pasos, con todas las descargas, cada 30 s).
 *  - Cada minuto: solo se SUBE lo pendiente de esta caja y la señal de "caja
 *    conectada" (la web la da por desconectada a los 2 minutos). Sin nada
 *    pendiente no sale ninguna consulta de descarga.
 *  - En vivo: la nube avisa por Realtime cuando la web o el celular crean algo
 *    (ventas, gastos, cartera...) y se descarga solo esa parte.
 *  - Cada 20 minutos: revisión completa de respaldo, por si se perdió un aviso.
 */
const SYNC_RAPIDO_MS = 60_000;
const SYNC_COMPLETO_MS = 20 * 60_000;

/**
 * Hasta dónde se descargó cada tabla. Se guarda la fecha del SERVIDOR del
 * último registro recibido, no la hora de este computador: con la hora local,
 * un reloj adelantado (o un cambio hecho mientras corría la consulta) dejaba
 * registros por fuera para siempre (productos editados en la web que nunca
 * llegaban a la caja).
 */
async function guardarMarcaServidor(clave: string, filas: Array<Record<string, any>> | null | undefined, campo: string, anterior: unknown): Promise<void> {
  let marca = typeof anterior === 'string' ? anterior : null;
  for (const fila of filas || []) {
    const valor = fila?.[campo];
    if (typeof valor === 'string' && (!marca || Date.parse(valor) > Date.parse(marca))) marca = valor;
  }
  if (marca) await dbManager.setConfig(clave, marca);
}

/**
 * Multitienda en la nube (migración 0111): el stock de cada sede lo lleva la
 * nube. La caja deja de subir cantidades absolutas (cada venta descuenta en la
 * nube) y baja el stock de su sede. Se recuerda aquí y se refresca en cada
 * revisión completa.
 */
const CLAVE_MULTITIENDA_NUBE = 'multitienda_nube';
export function multitiendaEnNube(): boolean {
  return localStorage.getItem(CLAVE_MULTITIENDA_NUBE) === '1';
}

/** Lo vendido en esta caja que todavía no subió a la nube, por producto local (se guarda 3 s: en un lote se consulta por cada producto). */
let vendidoSinSubirCache: { hasta: number; promesa: Promise<Map<string, number>> } | null = null;
function vendidoSinSubir(): Promise<Map<string, number>> {
  if (vendidoSinSubirCache && vendidoSinSubirCache.hasta > Date.now()) return vendidoSinSubirCache.promesa;
  const promesa = calcularVendidoSinSubir();
  vendidoSinSubirCache = { hasta: Date.now() + 3000, promesa };
  return promesa;
}
async function calcularVendidoSinSubir(): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  const sumar = (items: any[] | undefined) => (items || []).forEach((it) => {
    const id = it?.productoId || it?.id;
    if (id) mapa.set(id, (mapa.get(id) || 0) + (Number(it.cantidad) || 0));
  });
  try { (await dbManager.getVentasPendientes()).forEach((v) => sumar(v.items)); } catch { /* sin base local */ }
  try { JSON.parse(localStorage.getItem('pos-ventas-pendientes') || '[]').forEach((v: any) => sumar(v?.items)); } catch { /* vacío */ }
  return mapa;
}

/** ¿Esta caja es la de la sede principal? (ahí el stock vive en productos.stock). */
function cajaEsSedePrincipal(): boolean {
  const activa = getTiendaActivaId();
  return !activa || activa === 'tienda_principal' || !!listarTiendas().find((t) => t.id === activa)?.esPrincipal;
}

/**
 * Multitienda en la nube: la caja ya no sube la cantidad absoluta (cada venta descuenta en
 * la nube). Si el stock local de un producto no cuadra con el último que dio la nube menos lo
 * vendido aquí sin subir, alguien lo ajustó a mano en esta caja (llegada de mercancía, conteo):
 * se registra en la nube como ajuste de la sede principal, con su constancia en el kardex.
 */
async function subirAjustesManualesStock(
  client: NonNullable<ReturnType<typeof getSupabaseClient>>,
  productos: Array<{ supabaseId?: string | null; id: string; stock?: number; stockNube?: number }>,
): Promise<void> {
  if (!multitiendaEnNube() || !cajaEsSedePrincipal()) return;
  const pendiente = await vendidoSinSubir();
  const ajustes = productos.flatMap((p) => {
    if (!p.supabaseId || typeof p.stockNube !== 'number') return [];
    const vendido = pendiente.get(p.id) || 0;
    const esperado = p.stockNube - vendido;
    const local = Number(p.stock) || 0;
    return Math.abs(local - esperado) > 0.0001 ? [{ producto_id: p.supabaseId, cantidad: local + vendido }] : [];
  });
  if (ajustes.length === 0) return;
  const { error } = await client.rpc('cargar_stock_sede', { p_tienda: 'tienda_principal', p_items: ajustes, p_modo: 'fijar' });
  if (error) throw error;
}
/** Posición de cada producto local por su id de la nube ("s:…") y su id local ("l:…"). */
function indiceProductos(productos: Producto[]): Map<string, number> {
  const indice = new Map<string, number>();
  productos.forEach((p, i) => {
    indice.set(`l:${p.id}`, i);
    if (p.supabaseId) indice.set(`s:${p.supabaseId}`, i);
  });
  return indice;
}

const STEP_TIMEOUT_MS = 20_000;

/**
 * 🛡️ Lápidas de productos eliminados — cierra una condición de carrera que el
 * check `remote.activo === false` (más abajo, en `aplicarCambioRemotoProducto`)
 * no alcanzaba a cubrir: `desactivarProductoEnNube`/`desactivarTodosLosProductosEnNube`
 * borran localmente y marcan `activo:false` en Supabase SIN esperar (fire and
 * forget, para no congelar el botón "Eliminar"). Si un pull o un evento de
 * Realtime llega ANTES de que ese UPDATE remoto termine de aplicarse, la fila
 * todavía viaja con `activo:true` -- el check anterior no la detiene y el
 * producto "recién eliminado" reaparece apenas se navega a otra pantalla y se
 * vuelve (exactamente lo reportado: "elimino todo, cambio de módulo, vuelvo y
 * sigue saliendo"). Estas lápidas se guardan ANTES de borrar y se consultan
 * sin importar lo que diga `remote.activo`, así que ninguna carrera de red
 * puede ganarle al borrado. TTL generoso (24h) solo para no crecer para
 * siempre; nunca afecta a un producto nuevo (id distinto) aunque reutilice el
 * mismo código de barras.
 */
const LS_TOMBSTONES_PRODUCTOS = 'codecpos_productos_eliminados_ts';
const TOMBSTONE_TTL_MS = 24 * 60 * 60 * 1000;

function leerTombstonesProductos(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LS_TOMBSTONES_PRODUCTOS);
    const mapa: Record<string, number> = raw ? JSON.parse(raw) : {};
    const ahora = Date.now();
    let cambiado = false;
    for (const id of Object.keys(mapa)) {
      if (ahora - mapa[id] > TOMBSTONE_TTL_MS) { delete mapa[id]; cambiado = true; }
    }
    if (cambiado) localStorage.setItem(LS_TOMBSTONES_PRODUCTOS, JSON.stringify(mapa));
    return mapa;
  } catch { return {}; }
}

function marcarProductoComoEliminado(localId: string): void {
  try {
    const mapa = leerTombstonesProductos();
    mapa[localId] = Date.now();
    localStorage.setItem(LS_TOMBSTONES_PRODUCTOS, JSON.stringify(mapa));
  } catch { /* no crítico */ }
}

function productoFueEliminadoRecientemente(localId: string | undefined | null): boolean {
  if (!localId) return false;
  return localId in leerTombstonesProductos();
}

/**
 * 🛡️ Hallazgo (verificado en vivo con stack trace): el módulo "Alimentos y
 * Bebidas" guarda su PROPIO catálogo aparte en `codecpos_panaderia_prods` —
 * a propósito, para que "Vaciar Inventario" no le borre iconos/colores/
 * categorías a un producto que luego se quiera recrear (ver comentario en
 * `reflejarInventarioEnAlimentos`, PanaderiaOncesPage.tsx). El problema es
 * `sincronizarConInventario` (misma página, corre CADA VEZ que se abre el
 * módulo): por cada producto que tiene ahí y NO encuentra en `pos-productos`,
 * lo vuelve a crear en el inventario general -- pensado para reparar un
 * hueco, pero sin forma de distinguir "nunca se sincronizó" de "lo acabo de
 * borrar a propósito". Resultado: "Eliminar Todo"/eliminar un producto se
 * sentía como que no hacía nada -- bastaba con abrir Alimentos y Bebidas una
 * vez para que reapareciera todo. Fix: al eliminar, se quita también de este
 * catálogo aparte -- no queda nada que "reparar".
 */
const LS_PANADERIA_PRODS = 'codecpos_panaderia_prods';

function quitarDeAlimentosBebidas(localId: string): void {
  try {
    const raw = localStorage.getItem(LS_PANADERIA_PRODS);
    if (!raw) return;
    const lista = JSON.parse(raw);
    if (!Array.isArray(lista)) return;
    const filtrada = lista.filter((p: any) => p?.id !== localId);
    if (filtrada.length !== lista.length) {
      localStorage.setItem(LS_PANADERIA_PRODS, JSON.stringify(filtrada));
    }
  } catch { /* no crítico */ }
}

function vaciarCatalogoAlimentosBebidas(): void {
  // 🛡️ Si esta clave nunca se había guardado (null), NO alcanza con "no
  // hacer nada" -- el estado inicial de PanaderiaOncesPage.tsx cae a un
  // catálogo de 7 productos de ejemplo escrito en el código fuente cuando la
  // clave no existe (`localStorage.getItem(...) || '[{...7 demo...}]'`).
  // Sin escribir explícitamente '[]' aquí, ese catálogo de ejemplo es
  // exactamente lo que reaparecía. Se escribe SIEMPRE, exista o no antes.
  try { localStorage.setItem(LS_PANADERIA_PRODS, '[]'); } catch { /* no crítico */ }
}

function withStepTimeout<T>(promise: Promise<T>, name: string): Promise<T> {
  let timer: number | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => { timer = window.setTimeout(() => reject(new Error(`El paso ${name} excedió ${STEP_TIMEOUT_MS / 1000}s`)), STEP_TIMEOUT_MS); }),
  ]).finally(() => { if (timer) window.clearTimeout(timer); });
}

/**
 * 🛡️ Hallazgo en verificación en vivo: la pantalla de venta activa
 * (POSPageNew) NO lee productos de IndexedDB — lee del array plano en
 * localStorage['pos-productos'] (mismo patrón que CodigosBarrasPageFull,
 * ver memoria de proyecto). Sin este puente, un producto sincronizado desde
 * otro dispositivo queda invisible en la caja aunque IndexedDB sí lo tenga.
 */
function construirEntradaLocalStorage(producto: Producto, existente: any | undefined): any {
  return {
    ...(existente || {}),
    id: producto.id,
    codigo: producto.codigo,
    nombre: producto.nombre,
    precio: producto.precio,
    costo: producto.costo,
    stock: producto.stock,
    // Último stock que dio la nube (multitienda en la nube): sirve para distinguir un ajuste manual de una venta.
    stockNube: (producto as any).stockNube ?? existente?.stockNube,
    stockMinimo: producto.stockMinimo,
    minStock: producto.stockMinimo,
    categoria: producto.categoria,
    unidad: producto.unidad,
    aplicaIVA: producto.iva > 0,
    activo: producto.activo,
    imagenUrl: producto.imagenUrl,
    fotosUrls: producto.fotosUrls,
    pesable: existente ? existente.pesable : false,
    tipoInventario: producto.tipoInventario || (existente ? existente.tipoInventario : 'directo'),
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
}

/** Camino de UN solo producto (usado por Realtime — un evento a la vez). */
function sincronizarProductoEnLocalStorage(producto: Producto): void {
  try {
    const raw = localStorage.getItem('pos-productos');
    const lista: any[] = raw ? JSON.parse(raw) : [];
    const idx = Array.isArray(lista) ? lista.findIndex((p) => p.id === producto.id) : -1;
    const entrada = construirEntradaLocalStorage(producto, idx >= 0 ? lista[idx] : undefined);

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

/**
 * ⚡ Camino por LOTE (usado por pullProductosRemotos — puede traer decenas de
 * productos en un solo ciclo de sync). Antes cada producto del lote hacía su
 * propio JSON.parse + JSON.stringify del catálogo COMPLETO de forma síncrona
 * en el hilo principal — con varios productos cambiados en un mismo ciclo (o
 * con más terminales/tiendas sincronizando), eso se sentía como que la caja
 * se congelaba. Aquí se parsea una sola vez, se aplican todos los cambios en
 * memoria, y se escribe una sola vez al final.
 */
function sincronizarProductosEnLocalStorageBatch(productos: Producto[]): void {
  if (productos.length === 0) return;
  try {
    const raw = localStorage.getItem('pos-productos');
    const lista: any[] = raw ? JSON.parse(raw) : [];
    const indicePorId = new Map<string, number>();
    lista.forEach((p, i) => { if (p?.id) indicePorId.set(p.id, i); });

    for (const producto of productos) {
      const idx = indicePorId.get(producto.id);
      const entrada = construirEntradaLocalStorage(producto, idx !== undefined ? lista[idx] : undefined);
      if (idx !== undefined) {
        lista[idx] = entrada;
      } else {
        indicePorId.set(producto.id, lista.length);
        lista.push(entrada);
      }
    }
    localStorage.setItem('pos-productos', JSON.stringify(lista));
  } catch (error) {
    console.error('[sync] Error sincronizando lote de productos a pos-productos:', error);
  }
}

class SyncService {
  private isSyncing = false;
  private started = false;
  private syncInterval: number | null = null;
  private syncRapidoInterval: number | null = null;
  /** Cambios de productos que llegan por Realtime, agrupados (ver setupRealtime). */
  private cambiosProductos: any[] = [];
  private esperaCambiosProductos: number | null = null;
  /** Pasos de descarga pedidos por Realtime mientras otro ciclo corría (se ejecutan al terminar). */
  private pasosPedidos = new Set<string>();
  private esperaPasosPedidos: number | null = null;
  /** Última foto de stock por tienda subida con éxito (ver pushTiendasStock). */
  private ultimaFirmaTiendasStock: string | null = null;
  /** Texto de 'pos-productos' del último ciclo sin nada pendiente de subir (ver pushProductosLocalStorage). */
  private ultimoRawProductosSinPendientes: string | null = null;
  private realtimeChannel: ReturnType<NonNullable<ReturnType<typeof getSupabaseClient>>['channel']> | null = null;
  private listeners: Set<(status: SyncStatus) => void> = new Set();

  /** Pantallas que usan la sincronización (indicador de venta, tarjeta de Configuración...). */
  private usuarios = 0;

  /** Debe llamarse una vez al entrar al POS. Cada start() lleva su stop(). */
  async start(): Promise<void> {
    this.usuarios++;
    if (this.started) return;
    this.started = true;

    await restablecerSesionSync().catch(() => {});
    this.setupRealtime();
    this.startAutoSync();
  }

  startAutoSync(): void {
    this.stopAutoSync();
    this.sync();
    this.syncInterval = window.setInterval(() => this.sync(), SYNC_COMPLETO_MS);
    this.syncRapidoInterval = window.setInterval(() => this.syncRapido(), SYNC_RAPIDO_MS);
  }

  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (this.syncRapidoInterval) {
      clearInterval(this.syncRapidoInterval);
      this.syncRapidoInterval = null;
    }
    if (this.esperaPasosPedidos) {
      clearTimeout(this.esperaPasosPedidos);
      this.esperaPasosPedidos = null;
    }
  }

  /** Una venta, gasto o cambio recién hecho en esta caja: se sube en unos segundos sin esperar el minuto. */
  subirPendientesPronto(): void {
    this.pedirPasos(['__subida__']);
  }

  /**
   * 🚀 FIX rendimiento: cierra el canal de Supabase Realtime abierto por
   * setupRealtime() y detiene el polling. Antes no existía ningún método de
   * apagado — el canal de `productos-sync-*` quedaba abierto indefinidamente
   * (única fuga real encontrada en la auditoría de canales Realtime).
   * Debe llamarse desde el cleanup del efecto que invoca start().
   */
  stop(): void {
    // Antes, salir de Configuración (que también la usa) apagaba la sincronización
    // de toda la caja aunque la pantalla de venta siguiera abierta.
    this.usuarios = Math.max(0, this.usuarios - 1);
    if (this.usuarios > 0) return;
    this.stopAutoSync();
    if (this.realtimeChannel) {
      try { getSupabaseClient()?.removeChannel(this.realtimeChannel); } catch { /* no crítico */ }
      this.realtimeChannel = null;
    }
    this.started = false;
  }

  private setupRealtime(): void {
    const client = getSupabaseClient();
    const clienteId = getLinkedClienteId();
    if (!client || !clienteId || this.realtimeChannel) return;

    const filtro = `cliente_id=eq.${clienteId}`;
    // Lo que crea esta misma caja vuelve como aviso con su local_id: se ignora (ya lo tiene).
    const deOtroLado = (payload: any) => !(payload?.new && payload.new.local_id);
    const avisos: Array<[string, string, string]> = [
      ['ventas', 'INSERT', 'pull_ventas'],
      ['gastos', 'INSERT', 'pull_gastos'],
      ['devoluciones', 'INSERT', 'pull_devoluciones'],
      ['cierres_caja', '*', 'pull_cierres'],
      ['cuentas_cartera', '*', 'pull_cartera'],
      ['clientes_fidelizacion', '*', 'pull_clientes_fidelizacion'],
      ['solicitudes_transferencia', 'INSERT', 'procesar_transferencias'],
      ['empresa_configuraciones', '*', 'pull_configuracion_empresa'],
    ];

    let canal = client
      .channel(`productos-sync-${clienteId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'productos', filter: filtro },
        (payload) => {
          // Pocos cambios (una edición en la web) se aplican uno por uno al instante; una
          // importación de miles se baja en lote con el paso normal (una sola escritura).
          this.cambiosProductos.push((payload.new ?? payload.old) as any);
          if (this.esperaCambiosProductos) return;
          this.esperaCambiosProductos = window.setTimeout(() => {
            this.esperaCambiosProductos = null;
            const lote = this.cambiosProductos.splice(0);
            if (lote.length > 20) return this.pedirPasos(['pull_productos']);
            lote.forEach((r) => this.aplicarCambioRemotoProducto(r).catch(() => {}));
          }, 1500);
        }
      );
    canal = canal.on('postgres_changes' as any, { event: '*', schema: 'public', table: 'tiendas_stock', filter: filtro } as any, (payload: any) => {
      if (multitiendaEnNube() && payload?.new?.tienda_id === getTiendaActivaId()) this.pedirPasos(['pull_stock_sede']);
    });
    for (const [tabla, evento, paso] of avisos) {
      canal = canal.on('postgres_changes' as any, { event: evento, schema: 'public', table: tabla, filter: filtro } as any, (payload: any) => {
        if (deOtroLado(payload)) this.pedirPasos([paso]);
      });
    }
    this.realtimeChannel = canal.subscribe();
  }

  /** Junta los avisos que llegan seguidos (2 s) y corre solo esos pasos. */
  private pedirPasos(pasos: string[]): void {
    pasos.forEach((p) => this.pasosPedidos.add(p));
    if (this.esperaPasosPedidos) clearTimeout(this.esperaPasosPedidos);
    this.esperaPasosPedidos = window.setTimeout(() => {
      this.esperaPasosPedidos = null;
      if (this.isSyncing) return this.pedirPasos([]); // se reintenta cuando termine el ciclo en curso
      const pedidos = [...this.pasosPedidos];
      this.pasosPedidos.clear();
      if (pedidos.length === 0) return;
      const subida = pedidos.includes('__subida__');
      const bajada = pedidos.filter((p) => p !== '__subida__');
      this.ejecutarCiclo({ bajada, subida, silencioso: true }).catch(() => {});
    }, 2000);
  }

  /** Cada minuto: sube lo pendiente de esta caja y avisa que sigue conectada. */
  async syncRapido(): Promise<void> {
    await this.ejecutarCiclo({ bajada: [], subida: true, silencioso: true });
  }

  /** Revisión completa: descarga todo lo nuevo de la nube y sube lo pendiente. */
  async sync(): Promise<void> {
    await this.ejecutarCiclo({ bajada: 'todo', subida: true, silencioso: false });
  }

  private async ejecutarCiclo(opciones: { bajada: string[] | 'todo'; subida: boolean; silencioso: boolean }): Promise<void> {
    if (this.isSyncing) return;

    if (!navigator.onLine) {
      if (!opciones.silencioso) this.notifyListeners({ status: 'offline', message: 'Sin conexión a internet', lastSync: null });
      return;
    }

    const client = getSupabaseClient();
    const clienteId = getLinkedClienteId();

    if (!client || !clienteId) {
      // ⚡ Antes se reportaba como 'error' (ícono y color de alarma en la
      // pantalla de venta principal) — pero para un negocio que nunca
      // configuró la nube esto no es un error, es simplemente el estado
      // normal. Estado neutral propio para no alarmar innecesariamente.
      if (!opciones.silencioso) this.notifyListeners({
        status: 'unlinked',
        message: 'Esperando conexión con app',
        lastSync: null,
      });
      return;
    }

    this.isSyncing = true;
    // Los ciclos rápidos no avisan "Sincronizando..." para no redibujar la pantalla de venta cada minuto.
    if (!opciones.silencioso) this.notifyListeners({ status: 'syncing', message: 'Sincronizando datos...', lastSync: null });

    // 🛡️ Antes un solo paso que fallaba (p. ej. IndexedDB rechazando un
    // producto por una restricción de índice) abortaba el resto del ciclo
    // completo dentro de un único try/catch — incluido el heartbeat que le
    // avisa a la PWA que esta caja está conectada. Cada paso ahora aísla su
    // propio error: uno fallido se registra pero no bloquea a los demás, y
    // el heartbeat siempre llega a ejecutarse.
    const pasosBajada: Array<[string, () => Promise<void>]> = [
      ['pull_configuracion_empresa', async () => { await descargarConfiguracionEmpresaDesdeNube(); }],
      ['pull_tiendas', async () => {
        const { data: cfg } = await client.rpc('obtener_config_multitienda');
        if (cfg && typeof cfg === 'object') localStorage.setItem(CLAVE_MULTITIENDA_NUBE, (cfg as any).nube ? '1' : '0');
        const tiendas = await descargarTiendas();
        if (tiendas?.length) {
          // 🚀 FIX rendimiento: antes se avisaba "tiendas sincronizadas" en
          // CADA ciclo (cada 30s) aunque nada hubiera cambiado, y eso hacía
          // re-renderizar toda la pantalla de venta (usa useMultitienda).
          // Ahora solo se avisa si las tiendas o la activa cambiaron de verdad.
          const antes = JSON.stringify([listarTiendas(), localStorage.getItem('multitienda_activa_id')]);
          reemplazarTiendasDesdeNube(tiendas);
          const despues = JSON.stringify([listarTiendas(), localStorage.getItem('multitienda_activa_id')]);
          if (antes !== despues) {
            console.log('[SYNC] tiendas-sincronizadas dispatch', performance.now());
            window.dispatchEvent(new CustomEvent('codecpos:tiendas-sincronizadas'));
          }
        }
      }],
      ['pull_productos', () => this.pullProductosRemotos(client, clienteId)],
      ['pull_stock_sede', () => this.pullStockSede(client, clienteId)],
      ['pull_ventas', () => this.pullVentasRemotas(client, clienteId)],
      ['pull_gastos', () => this.pullGastosRemotos(client, clienteId)],
      ['pull_cierres', () => this.pullCierresRemotos(client, clienteId)],
      ['pull_devoluciones', () => this.pullDevolucionesRemotas(client, clienteId)],
      ['pull_cartera', () => this.pullCarteraRemota(client, clienteId)],
      ['pull_clientes_fidelizacion', () => this.pullClientesFidelizacionRemotos(client, clienteId)],
      ['backfill_producto_id_venta_items', () => this.backfillProductoIdVentaItems(client, clienteId)],
      ['procesar_transferencias', () => this.procesarSolicitudesTransferencia(client, clienteId)],
    ];
    const pasosSubida: Array<[string, () => Promise<void>]> = [
      ['push_configuracion_empresa', async () => { await sincronizarConfiguracionEmpresaPendiente(); }],
      ['push_productos', () => this.pushProductosPendientes(client, clienteId)],
      ['push_productos_localstorage', () => this.pushProductosLocalStorage(client, clienteId)],
      ['push_gastos', () => this.pushGastosLocalStorage(client, clienteId)],
      ['push_ventas', () => this.pushVentasPendientes(client, clienteId)],
      ['push_tiendas_stock', () => this.pushTiendasStock(client, clienteId)],
      ['push_cierres', () => this.pushCierresPendientes(client, clienteId)],
      ['push_devoluciones', () => this.pushDevolucionesLocalStorage(client, clienteId)],
      ['push_cartera', () => this.pushCarteraPendiente(client, clienteId)],
      ['push_heartbeat', () => this.pushSesionActivaHeartbeat(client, clienteId)],
    ];
    const pasos = [
      ...(opciones.bajada === 'todo' ? pasosBajada : pasosBajada.filter(([nombre]) => (opciones.bajada as string[]).includes(nombre))),
      ...(opciones.subida ? pasosSubida : []),
    ];

    let primerError: unknown = null;
    for (const [nombre, paso] of pasos) {
      try {
        await withStepTimeout(paso(), nombre);
      } catch (error) {
        primerError = primerError ?? error;
        console.error(`[sync] Falló el paso "${nombre}":`, error);
        await dbManager.addLog('sync_error', `Error en paso "${nombre}"`, error);
      }
    }

    if (primerError) {
      // Un error en un ciclo rápido sí se muestra: algo no pudo subir.
      this.notifyListeners({
        status: 'error',
        message: `Error: ${primerError instanceof Error ? primerError.message : 'Desconocido'}`,
        lastSync: null,
      });
    } else if (!opciones.silencioso) {
      const lastSync = new Date().toISOString();
      await dbManager.setConfig('lastSyncTime', lastSync);
      this.notifyListeners({ status: 'success', message: 'Sincronización completada', lastSync });
    }

    this.isSyncing = false;
  }

  // ==================== PULL ====================

  private async pullProductosRemotos(client: NonNullable<ReturnType<typeof getSupabaseClient>>, clienteId: string): Promise<void> {
    const lastPull = await dbManager.getConfig('lastPullProductos');

    // Por páginas y en orden: el servidor entrega máximo 1.000 filas por consulta y, como la
    // marca guarda hasta dónde se bajó, sin esto un catálogo grande (importado desde la web)
    // se quedaba en 1.000 productos y el resto no llegaba nunca.
    const data: any[] = [];
    for (let desde = 0; ; desde += 1000) {
      let query = client.from('productos').select('*').eq('cliente_id', clienteId)
        .order('updated_at', { ascending: true }).order('id', { ascending: true })
        .range(desde, desde + 999);
      if (lastPull) query = query.gt('updated_at', lastPull);
      const { data: pagina, error } = await query;
      if (error) throw error;
      data.push(...(pagina || []));
      if (!pagina || pagina.length < 1000) break;
    }

    // ⚡ Lote: cada item se aplica a IndexedDB individualmente (async, no
    // bloquea), pero el espejo en localStorage['pos-productos'] se hace UNA
    // sola vez al final del lote (ver sincronizarProductosEnLocalStorageBatch).
    const actualizados: Producto[] = [];
    // 🚀 FIX rendimiento: el inventario local se carga UNA vez por lote (antes
    // se recargaba completo por CADA producto remoto: 500 cambios = 500
    // lecturas del inventario entero).
    const productosLocales = (data || []).length > 0 ? await dbManager.getAllProductos() : [];
    const indice = indiceProductos(productosLocales);
    for (const remote of data || []) {
      const actualizado = await this.aplicarCambioRemotoProducto(remote, { skipLocalStorageSync: true, productosLocales, indice });
      if (actualizado) actualizados.push(actualizado);
    }
    if (actualizados.length > 0) {
      sincronizarProductosEnLocalStorageBatch(actualizados);
      console.log('[SYNC] productos-sincronizados dispatch (pull batch)', actualizados.length, performance.now());
      window.dispatchEvent(new CustomEvent('codecpos:productos-sincronizados'));
    }

    await guardarMarcaServidor('lastPullProductos', data, 'updated_at', lastPull);
  }

  private async aplicarCambioRemotoProducto(
    remote: any,
    opts?: { skipLocalStorageSync?: boolean; productosLocales?: Producto[]; indice?: Map<string, number> }
  ): Promise<Producto | null> {
    if (!remote) return null;

    const productos = opts?.productosLocales ?? await dbManager.getAllProductos();
    // Con índice (lotes grandes) se busca directo; recorrer 20.000 productos por cada uno era cuadrático.
    const posicion = opts?.indice ? (opts.indice.get(`s:${remote.id}`) ?? (remote.local_id ? opts.indice.get(`l:${remote.local_id}`) : undefined)) : undefined;
    const local = opts?.indice
      ? (posicion !== undefined ? productos[posicion] : undefined)
      : productos.find((p) => p.supabaseId === remote.id || (remote.local_id && p.id === remote.local_id));
    const reemplazar = (nuevo: Producto) => {
      if (!opts?.productosLocales || !local) return;
      const i = posicion ?? opts.productosLocales.indexOf(local);
      if (i >= 0) opts.productosLocales[i] = nuevo;
    };
    const remoteUpdatedAt = new Date(remote.updated_at).getTime();
    let resultado: Producto;

    if (local) {
      // Multitienda en la nube: el stock de la sede principal lo lleva la nube. Aunque haya una
      // edición local pendiente (o los relojes no coincidan), se toma su stock menos lo vendido
      // aquí que aún no subió; el resto de la edición local se respeta.
      if (multitiendaEnNube() && (local.syncStatus === 'pending' || local.updatedAt >= remoteUpdatedAt)) {
        const pendiente = (await vendidoSinSubir()).get(local.id) || 0;
        const stockNube = Math.max(0, Number(remote.stock) - pendiente);
        if (Number(local.stock) === stockNube) return null;
        const soloStock: Producto = { ...local, stock: stockNube, supabaseId: remote.id, stockNube: Number(remote.stock) } as Producto;
        await dbManager.putProductoRaw(soloStock);
        if (!opts?.skipLocalStorageSync) sincronizarProductoEnLocalStorage(soloStock);
        reemplazar(soloStock);
        return soloStock;
      }
      // Hay una edición local sin subir todavía: no la pisamos con la remota.
      if (local.syncStatus === 'pending') return null;
      // Local ya está al día o más reciente (last-write-wins por updatedAt).
      if (local.updatedAt >= remoteUpdatedAt) return null;

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
        talla: remote.talla || local.talla,
        color: remote.color || local.color,
        marca: remote.marca || local.marca,
        esDulceria: remote.es_dulceria ?? local.esDulceria,
        permitirFraccion: remote.permitir_fraccion ?? local.permitirFraccion,
        componentesCombo: remote.componentes_combo || local.componentesCombo,
        unidadesPorBolsa: remote.unidades_por_bolsa ?? local.unidadesPorBolsa,
        ventaPorUnidad: remote.venta_por_unidad ?? local.ventaPorUnidad,
        lote: remote.lote || local.lote,
        tipoProducto: remote.tipo_producto || local.tipoProducto,
        esBulto: remote.es_bulto ?? local.esBulto,
        pesoBultoKg: remote.peso_bulto_kg ?? local.pesoBultoKg,
        precioPorKilo: remote.precio_por_kilo ?? local.precioPorKilo,
        rendimientoRaciones: remote.rendimiento_raciones ?? local.rendimientoRaciones,
        especie: remote.especie || local.especie,
        requiereReceta: remote.requiere_receta ?? local.requiereReceta,
        supabaseId: remote.id,
        updatedAt: remoteUpdatedAt,
        syncStatus: 'synced',
        stockNube: Number(remote.stock),
      } as Producto;
      await dbManager.putProductoRaw(actualizado);
      if (!opts?.skipLocalStorageSync) sincronizarProductoEnLocalStorage(actualizado);
      reemplazar(actualizado);
      resultado = actualizado;
    } else {
      const nuevoId: string = remote.local_id || `remote-${remote.id}`;

      // 🛡️ FIX: "Eliminar Todo" / eliminar un producto borra el registro
      // local (IndexedDB + pos-productos) y solo marca `activo:false` en
      // Supabase (no lo borra allá). Sin el primer check, el próximo pull
      // traía esa fila (su updated_at acababa de cambiar) y, como ya no
      // existía localmente, este bloque la RECREABA igual -- resucitando
      // productos que el usuario acababa de eliminar apenas se navegaba a
      // otra pantalla y se volvía. El segundo check (lápida) cubre además la
      // carrera donde el pull/Realtime llega ANTES de que el UPDATE remoto
      // termine de aplicarse -- en ese instante `remote.activo` todavía es
      // `true`, así que solo el check de `remote.activo` no bastaba.
      if (remote.activo === false || productoFueEliminadoRecientemente(nuevoId)) return null;
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
        talla: remote.talla || undefined,
        color: remote.color || undefined,
        marca: remote.marca || undefined,
        esDulceria: remote.es_dulceria || undefined,
        permitirFraccion: remote.permitir_fraccion || undefined,
        componentesCombo: remote.componentes_combo || undefined,
        unidadesPorBolsa: remote.unidades_por_bolsa ?? undefined,
        ventaPorUnidad: remote.venta_por_unidad ?? undefined,
        lote: remote.lote || undefined,
        tipoProducto: remote.tipo_producto || undefined,
        esBulto: remote.es_bulto || undefined,
        pesoBultoKg: remote.peso_bulto_kg ?? undefined,
        precioPorKilo: remote.precio_por_kilo ?? undefined,
        rendimientoRaciones: remote.rendimiento_raciones ?? undefined,
        especie: remote.especie || undefined,
        requiereReceta: remote.requiere_receta || undefined,
        supabaseId: remote.id,
        createdAt: new Date(remote.created_at).getTime(),
        updatedAt: remoteUpdatedAt,
        syncStatus: 'synced',
      };
      await dbManager.putProductoRaw(producto);
      if (!opts?.skipLocalStorageSync) sincronizarProductoEnLocalStorage(producto);
      if (opts?.productosLocales) {
        opts.productosLocales.push(producto);
        opts.indice?.set(`l:${producto.id}`, opts.productosLocales.length - 1);
        if (producto.supabaseId) opts.indice?.set(`s:${producto.supabaseId}`, opts.productosLocales.length - 1);
      }
      resultado = producto;
    }

    // 🔄 Las pantallas que ya cargaron su lista de productos en memoria (p.
    // ej. POSPageNew) no vuelven a leer IndexedDB solas — sin este evento,
    // un producto creado/editado en otro dispositivo (o por el escáner
    // híbrido) queda invisible hasta recargar la app. En modo lote
    // (skipLocalStorageSync) el evento lo dispara una sola vez el llamador
    // (pullProductosRemotos), tras aplicar todo el lote.
    if (!opts?.skipLocalStorageSync) {
      window.dispatchEvent(new CustomEvent('codecpos:productos-sincronizados'));
    }
    return resultado;
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
  /**
   * Multitienda en la nube, caja de una sede que no es la principal: baja el stock de SU
   * sede (solo lo que cambió desde la última vez, por la fecha del servidor) y le resta lo
   * vendido aquí que todavía no subió. La principal ya lo recibe con los productos.
   */
  private async pullStockSede(client: NonNullable<ReturnType<typeof getSupabaseClient>>, clienteId: string): Promise<void> {
    if (!multitiendaEnNube()) return;
    const sede = getTiendaActivaId();
    if (!sede || sede === 'tienda_principal' || listarTiendas().find((t) => t.id === sede)?.esPrincipal) return;

    const clave = `lastPullStockSede_${sede}`;
    const desde = await dbManager.getConfig(clave);
    const filas: Array<{ producto_id: string; cantidad: number; actualizado_en: string }> = [];
    for (let pagina = 0; ; pagina++) {
      let q = client.from('tiendas_stock').select('producto_id, cantidad, actualizado_en')
        .eq('cliente_id', clienteId).eq('tienda_id', sede)
        .order('actualizado_en', { ascending: true }).range(pagina * 1000, pagina * 1000 + 999);
      if (desde) q = q.gt('actualizado_en', desde);
      const { data, error } = await q;
      if (error) throw error;
      filas.push(...((data || []) as any[]));
      if (!data || data.length < 1000) break;
    }
    if (filas.length === 0) return;

    const mapaGuardado = (await dbManager.getConfig('productosIdMap')) as Record<string, string> | null;
    const localPorSupabase = new Map<string, string>();
    for (const [local, supa] of Object.entries(mapaGuardado || {})) localPorSupabase.set(supa, local);
    for (const p of await dbManager.getAllProductos()) if (p.supabaseId) localPorSupabase.set(p.supabaseId, p.id);

    const pendiente = await vendidoSinSubir();
    const cambios: Record<string, number> = {};
    for (const f of filas) {
      const local = localPorSupabase.get(f.producto_id);
      if (local) cambios[local] = Math.max(0, Number(f.cantidad) - (pendiente.get(local) || 0));
    }
    if (aplicarStockSedeDesdeNube(sede, cambios) > 0) {
      window.dispatchEvent(new CustomEvent('codecpos:productos-sincronizados'));
    }
    await guardarMarcaServidor(clave, filas, 'actualizado_en', desde);
  }

  private async pullVentasRemotas(client: NonNullable<ReturnType<typeof getSupabaseClient>>, clienteId: string): Promise<void> {
    const lastPull = await dbManager.getConfig('lastPullVentas');

    let query = client
      .from('ventas')
      .select('id, numero, terminal_id, cajero_nombre, total, propina, porcentaje_propina_sugerido, propina_modificada, metodo_pago, created_at')
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
      await guardarMarcaServidor('lastPullVentas', remotas, 'created_at', lastPull);
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
        propina: Number(r.propina) || 0,
        porcentajePropinaSugerido: Number(r.porcentaje_propina_sugerido) || 0,
        propinaModificada: r.propina_modificada === true,
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
    await guardarMarcaServidor('lastPullVentas', remotas, 'created_at', lastPull);
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

    await guardarMarcaServidor('lastPullGastos', remotos, 'created_at', lastPull);
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
          // Propinas por método que guarda la PWA — el historial las descuenta del ingreso del negocio.
          propinas: (r.detalle as any)?.propinas || undefined,
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

    await guardarMarcaServidor('lastPullCierres', remotos, 'created_at', lastPull);
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

    await guardarMarcaServidor('lastPullDevoluciones', remotos, 'created_at', lastPull);
  }

  /**
   * Cartera bidireccional: trae cambios hechos desde la PWA (cuentas nuevas
   * sin local_id, o abonos registrados sobre una cuenta que Electron ya
   * había subido) y resuelve conflictos "gana el más reciente" por
   * updated_at -- mismo criterio que pullProductosRemotos.
   */
  private async pullCarteraRemota(client: NonNullable<ReturnType<typeof getSupabaseClient>>, clienteId: string): Promise<void> {
    const lastPull = await dbManager.getConfig('lastPullCartera');
    let query = client.from('cuentas_cartera').select('*').eq('cliente_id', clienteId);
    if (lastPull) query = query.gt('updated_at', lastPull);

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) {
      await guardarMarcaServidor('lastPullCartera', data, 'updated_at', lastPull);
      return;
    }

    const cuentasLocales = await listarCuentasCartera();
    for (const remote of data) {
      const remoteUpdatedAt = new Date(remote.updated_at).getTime();
      const local = cuentasLocales.find((c) => c.id === remote.local_id || (remote.id && c.supabaseId === remote.id));

      if (local) {
        if ((local.updatedAt || 0) >= remoteUpdatedAt) continue; // local ya al día o más reciente

        // 🛡️ Un abono registrado desde la PWA solo llega a la cuenta de
        // cartera acá -- sin esto, ese dinero nunca aparecería en el cuadre
        // de caja de Electron (CierreCajaPage lee 'pos-abonos-cartera',
        // mecanismo aparte que solo alimentan las escrituras LOCALES).
        const idsLocales = new Set(local.abonos.map((a) => a.id));
        const abonosRemotos = (remote.abonos || []) as CuentaCartera['abonos'];
        for (const abono of abonosRemotos) {
          if (!idsLocales.has(abono.id)) {
            registrarAbonoEnCierre({ ...abono, cuentaId: local.id, clienteNombre: remote.cliente_cartera_nombre });
          }
        }

        const actualizada: CuentaCartera = {
          ...local,
          clienteNombre: remote.cliente_cartera_nombre,
          clienteTelefono: remote.cliente_cartera_telefono || undefined,
          clienteDocumento: remote.cliente_cartera_documento || undefined,
          total: Number(remote.total),
          totalAbonado: Number(remote.total_abonado),
          saldo: Number(remote.saldo),
          estado: remote.estado,
          fechaVencimiento: remote.fecha_vencimiento,
          diasCredito: Number(remote.dias_credito),
          fechaPagoCompleto: remote.fecha_pago_completo || undefined,
          notas: remote.notas || undefined,
          abonos: abonosRemotos,
          supabaseId: remote.id,
          updatedAt: remoteUpdatedAt,
        };
        await guardarCuentaCarteraRaw(actualizada);
      } else {
        // Cuenta creada desde la PWA -- se le asigna un id local nuevo.
        // `clienteId` (fidelización) se deja vacío: la PWA no depende de un
        // registro de cliente sincronizado, guarda el nombre suelto.
        const nuevaCuenta: CuentaCartera = {
          id: remote.local_id || `remote-${remote.id}`,
          ventaId: remote.venta_local_id || '',
          numeroFactura: remote.numero_factura || '',
          clienteId: '',
          clienteNombre: remote.cliente_cartera_nombre,
          clienteTelefono: remote.cliente_cartera_telefono || undefined,
          clienteDocumento: remote.cliente_cartera_documento || undefined,
          total: Number(remote.total),
          abonos: remote.abonos || [],
          totalAbonado: Number(remote.total_abonado),
          saldo: Number(remote.saldo),
          estado: remote.estado,
          fechaVenta: remote.fecha_venta,
          fechaVencimiento: remote.fecha_vencimiento,
          diasCredito: Number(remote.dias_credito),
          fechaPagoCompleto: remote.fecha_pago_completo || undefined,
          usuarioCreador: remote.usuario_creador || 'App móvil',
          notas: remote.notas || undefined,
          supabaseId: remote.id,
          updatedAt: remoteUpdatedAt,
        };
        await guardarCuentaCarteraRaw(nuevaCuenta);
        // El abono inicial (si lo hubo) también debe sumar al cuadre de caja
        // -- es dinero recibido, aunque la venta en sí se registre a crédito.
        for (const abono of nuevaCuenta.abonos) {
          registrarAbonoEnCierre({ ...abono, cuentaId: nuevaCuenta.id, clienteNombre: nuevaCuenta.clienteNombre });
        }
      }
    }

    await dbManager.addLog('pull_cartera', `${data.length} cuenta(s) de cartera sincronizadas`);
    await guardarMarcaServidor('lastPullCartera', data, 'updated_at', lastPull);
  }

  /**
   * Clientes de fidelización creados desde la PWA (FidelizacionPage.tsx) —
   * solo trae altas nuevas (la PWA no edita clientes existentes, así que no
   * hace falta resolver conflictos de última escritura aquí, a diferencia de
   * cartera/productos). Mismo patrón que pullVentasRemotas: filtra por
   * `local_id is null` y dedupe por supabaseId ya conocido localmente.
   */
  private async pullClientesFidelizacionRemotos(client: NonNullable<ReturnType<typeof getSupabaseClient>>, clienteId: string): Promise<void> {
    const lastPull = await dbManager.getConfig('lastPullClientesFidelizacion');
    let query = client.from('clientes_fidelizacion').select('*').eq('cliente_id', clienteId).is('local_id', null);
    if (lastPull) query = query.gt('updated_at', lastPull);

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) {
      await guardarMarcaServidor('lastPullClientesFidelizacion', data, 'updated_at', lastPull);
      return;
    }

    const clientesLocales = await listarClientes(false);
    const yaExisten = new Set(clientesLocales.filter((c) => c.supabaseId).map((c) => c.supabaseId));
    let nuevos = 0;
    for (const remote of data) {
      if (yaExisten.has(remote.id)) continue;
      const nuevoCliente: Cliente = {
        id: `remote-${remote.id}`,
        nombre: remote.nombre,
        documento: remote.documento || '',
        telefono: remote.telefono || undefined,
        email: remote.email || undefined,
        puntos: Number(remote.puntos) || 0,
        puntosAcumulados: Number(remote.puntos_acumulados) || 0,
        puntosRedimidos: 0,
        nivelFidelidad: remote.nivel_fidelidad || 'bronce',
        fechaRegistro: new Date().toISOString(),
        totalCompras: Number(remote.total_compras) || 0,
        numeroCompras: Number(remote.numero_compras) || 0,
        activo: remote.activo !== false,
        supabaseId: remote.id,
        updatedAt: new Date(remote.updated_at).getTime(),
      };
      await guardarClienteRaw(nuevoCliente);
      nuevos++;
    }

    if (nuevos > 0) {
      await dbManager.addLog('pull_clientes_fidelizacion', `${nuevos} cliente(s) nuevos desde la app móvil`);
    }
    await guardarMarcaServidor('lastPullClientesFidelizacion', data, 'updated_at', lastPull);
  }

  // ==================== PUSH ====================

  private async pushProductosPendientes(client: NonNullable<ReturnType<typeof getSupabaseClient>>, clienteId: string): Promise<void> {
    // ⚡ Antes escaneaba TODA la tabla (getAllProductos) para filtrar
    // 'pending' en JS, cada 30s — el índice 'syncStatus' ya existe, úsalo.
    const pendientes = await dbManager.getProductosPendientes();
    if (pendientes.length === 0) return;

    await subirAjustesManualesStock(client, pendientes as any);

    for (const p of pendientes) {
      const payload = {
        cliente_id: clienteId,
        local_id: p.id,
        codigo_barras: p.codigo || null,
        nombre: p.nombre,
        categoria: p.categoria || null,
        precio_venta: p.precio,
        costo: p.costo,
        ...(multitiendaEnNube() && p.supabaseId ? {} : { stock: p.stock }),
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
    // 🚀 FIX rendimiento: si el inventario es exactamente el mismo texto que
    // en el último ciclo que terminó sin pendientes, no hay nada que subir —
    // se evita parsear el catálogo completo y calcular una firma por producto
    // cada 30s. Cualquier cambio (venta, edición, importación) cambia el texto.
    const rawProductos = localStorage.getItem('pos-productos') || '[]';
    if (rawProductos === this.ultimoRawProductosSinPendientes) return;

    let productos: any[];
    try {
      productos = JSON.parse(rawProductos);
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
        p.tipoProducto, p.esBulto, p.pesoBultoKg, p.precioPorKilo, p.rendimientoRaciones, p.especie, p.requiereReceta,
      ]);

    const hashesPrevios: Record<string, string> = (await dbManager.getConfig('productosPushHash')) || {};
    const pendientes = productos.filter((p) => p?.id && firma(p) !== hashesPrevios[p.id]);
    if (pendientes.length === 0) {
      this.ultimoRawProductosSinPendientes = rawProductos;
      return;
    }

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
    await subirAjustesManualesStock(client, pendientes.map((p: any) => ({ ...p, supabaseId: p.supabaseId || mapaIdSupabase[p.id] })));

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
          ...(multitiendaEnNube() && mapaIdSupabase[p.id] ? {} : { stock: p.stock ?? 0 }),
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
          // Modo ropa: talla y color viajan a la nube para verse en la web (migración 0106).
          talla: p.talla || null,
          color: p.color || null,
          marca: p.marca || null,
          es_dulceria: !!p.esDulceria,
          permitir_fraccion: !!p.permitirFraccion,
          componentes_combo: p.componentesCombo || null,
          unidades_por_bolsa: p.unidadesPorBolsa ?? null,
          venta_por_unidad: p.ventaPorUnidad !== false,
          lote: p.lote || null,
          tipo_producto: p.tipoProducto || null,
          es_bulto: !!p.esBulto,
          peso_bulto_kg: p.pesoBultoKg ?? null,
          precio_por_kilo: p.precioPorKilo ?? null,
          rendimiento_raciones: p.rendimientoRaciones ?? null,
          especie: p.especie || null,
          requiere_receta: !!p.requiereReceta,
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
    // ⚡ Mismo fix que pushProductosPendientes: usa el índice 'syncStatus'
    // en vez de escanear todo el historial de ventas cada ciclo.
    const pendientes = await dbManager.getVentasPendientes();
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
            descuento: v.descuento || 0,
            propina: v.propina || 0,
            porcentaje_propina_sugerido: v.porcentajePropinaSugerido || 0,
            propina_modificada: v.propinaModificada === true,
            metodo_pago: v.metodoPago,
            metodos_multiples: v.metodosMultiples || null,
            estado: 'completada',
            tienda_id: v.tiendaId || (localStorage.getItem('multitienda_activa_id') || null),
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
      // 🐛 FIX causa raíz Utilidad=Ventas en la web: el flujo real de venta
      // (POSPageNew.tsx) guarda cada línea con el campo `id` (id local del
      // producto) — `VentaItem.productoId` (electronStore.ts) NUNCA se
      // llena; solo `indexedDB.ts` declara ambos como opcionales de forma
      // defensiva. `idMap.get(it.productoId)` leía siempre el campo vacío,
      // así que `producto_id` quedaba `null` en TODAS las líneas de TODAS
      // las ventas subidas, sin importar que el mapa producto→uuid estuviera
      // bien construido. El Dashboard web (InicioPage.tsx) calcula el costo
      // uniendo venta_items.producto_id con productos.costo — con
      // producto_id siempre null, costoTotal siempre daba 0 y Utilidad
      // terminaba mostrando exactamente lo mismo que Ventas. Se revisan
      // ambos campos por si algún flujo distinto sí llena `productoId`.
      const items = (v.items || []).map((it) => ({
        venta_id: ventaRow.id,
        producto_id: idMap.get(it.id || it.productoId) || null,
        nombre: it.nombre,
        cantidad: it.cantidad,
        // 🛡️ FIX: antes se guardaba `it.precio` (precio de CATÁLOGO) como
        // `precio_unitario` -- perdía cualquier diferencia con lo realmente
        // cobrado (modificadores, y ahora precio editado manualmente).
        // `precioVenta` es el precio unitario real de la venta; `precio`
        // queda como referencia en `precio_original` para poder mostrar el
        // descuento en reportes cross-dispositivo.
        precio_unitario: it.precioVenta ?? it.precio,
        precio_original: it.precio,
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
   * 🐛 Backfill único: las ventas subidas ANTES del fix de arriba
   * (`idMap.get(it.productoId)` leía un campo que `VentaItem` nunca tuvo)
   * quedaron con `producto_id = null` en TODAS sus líneas — el Dashboard
   * web/PWA seguirá mostrando Utilidad = Ventas para esas ventas hasta
   * corregirlas. Se re-sincronizan una sola vez (bandera en dbManager)
   * reemplazando venta_items con el producto_id correcto, sin tocar la fila
   * de la venta en sí. Idempotente y seguro de reintentar: usa el mismo
   * patrón delete+insert que ya usa pushVentasPendientes.
   */
  private async backfillProductoIdVentaItems(client: NonNullable<ReturnType<typeof getSupabaseClient>>, _clienteId: string): Promise<void> {
    const YA_HECHO_KEY = 'backfillProductoIdVentaItemsHecho';
    if (await dbManager.getConfig(YA_HECHO_KEY)) return;

    const ventas = await dbManager.getAllVentas();
    const yaSincronizadas = ventas.filter((v) => v.supabaseId);
    if (yaSincronizadas.length === 0) {
      await dbManager.setConfig(YA_HECHO_KEY, true);
      return;
    }

    const mapaGuardado = (await dbManager.getConfig('productosIdMap')) as Record<string, string> | null;
    const idMap = new Map<string, string>(Object.entries(mapaGuardado || {}));
    const productos = await dbManager.getAllProductos();
    for (const p of productos) {
      if (p.supabaseId && !idMap.has(p.id)) idMap.set(p.id, p.supabaseId);
    }

    let corregidas = 0;
    for (const v of yaSincronizadas) {
      const items = (v.items || []).map((it) => ({
        venta_id: v.supabaseId,
        producto_id: idMap.get(it.id || it.productoId) || null,
        nombre: it.nombre,
        cantidad: it.cantidad,
        precio_unitario: it.precioVenta ?? it.precio,
        precio_original: it.precio,
        subtotal: it.subtotal,
      }));
      if (items.length === 0 || !items.some((i) => i.producto_id)) continue;

      const { error: delError } = await client.from('venta_items').delete().eq('venta_id', v.supabaseId);
      if (delError) {
        console.error(`[sync] Backfill: no se pudo limpiar venta_items de venta #${v.numero}:`, delError.message);
        continue;
      }
      const { error: insError } = await client.from('venta_items').insert(items);
      if (insError) {
        console.error(`[sync] Backfill: no se pudo re-insertar venta_items de venta #${v.numero}:`, insError.message);
        continue;
      }
      corregidas++;
    }

    await dbManager.setConfig(YA_HECHO_KEY, true);
    await dbManager.addLog('backfill_producto_id_venta_items', `${corregidas} de ${yaSincronizadas.length} venta(s) corregidas con producto_id real`);
  }

  /**
   * Sube un espejo de LECTURA del stock por sucursal (multitiendaService.ts,
   * 100% local hasta ahora) a `tiendas_stock`, para que la PWA pueda mostrar
   * "cuánto hay en cada tienda" antes de pedir una transferencia. Electron
   * sigue siendo la única fuente de verdad — esto nunca se lee de vuelta
   * hacia el stock real, solo se sube.
   */
  private async pushTiendasStock(client: NonNullable<ReturnType<typeof getSupabaseClient>>, clienteId: string): Promise<void> {
    // En la nube el stock por sede lo llevan las transferencias y las ventas: subir la
    // versión de esta caja pisaría lo que hicieron las demás sedes.
    if (multitiendaEnNube()) return;
    const tiendas = listarTiendas();
    if (tiendas.length === 0) return;

    const mapaGuardado = (await dbManager.getConfig('productosIdMap')) as Record<string, string> | null;
    const idMap = new Map<string, string>(Object.entries(mapaGuardado || {}));
    const productos = await dbManager.getAllProductos();
    for (const p of productos) {
      if (p.supabaseId && !idMap.has(p.id)) idMap.set(p.id, p.supabaseId);
    }
    if (idMap.size === 0) return;

    const filas: Record<string, unknown>[] = [];
    const ahoraIso = new Date().toISOString();
    for (const tienda of tiendas) {
      const resumen = getStockResumenTienda(tienda.id);
      for (const [productoIdLocal, cantidad] of Object.entries(resumen)) {
        const productoIdSupabase = idMap.get(productoIdLocal);
        if (!productoIdSupabase) continue;
        filas.push({
          cliente_id: clienteId,
          tienda_id: tienda.id,
          tienda_nombre: tienda.nombre,
          producto_id: productoIdSupabase,
          cantidad: Number(cantidad) || 0,
          actualizado_en: ahoraIso,
        });
      }
    }
    if (filas.length === 0) return;

    // 🚀 FIX rendimiento: antes se re-subían TODAS las filas de stock cada 30s
    // aunque nada hubiera cambiado. Se compara con lo último subido con éxito
    // (sin la marca de tiempo) y solo se sube si hubo algún cambio.
    const firmaStock = JSON.stringify(filas.map((f) => [f.tienda_id, f.tienda_nombre, f.producto_id, f.cantidad]));
    if (firmaStock === this.ultimaFirmaTiendasStock) return;

    // Se trocea por si el catálogo es grande (payload por llamada limitado).
    const LOTE = 500;
    let huboError = false;
    for (let i = 0; i < filas.length; i += LOTE) {
      const lote = filas.slice(i, i + LOTE);
      const { error } = await client.from('tiendas_stock').upsert(lote, { onConflict: 'cliente_id,tienda_id,producto_id' });
      if (error) {
        console.error('[sync] Error subiendo stock por tienda:', error.message);
        huboError = true;
        break;
      }
    }
    if (!huboError) this.ultimaFirmaTiendasStock = firmaStock;
  }

  /**
   * Recoge solicitudes de transferencia creadas desde la PWA (el dueño pide
   * mover mercancía entre sucursales sin estar en el local) y las ejecuta
   * con la MISMA función que ya usa la UI local de Electron
   * (ejecutarTransferencia) — ninguna lógica de negocio nueva, solo un
   * origen distinto para la solicitud.
   */
  private async procesarSolicitudesTransferencia(client: NonNullable<ReturnType<typeof getSupabaseClient>>, clienteId: string): Promise<void> {
    const { data: pendientes, error } = await client
      .from('solicitudes_transferencia')
      .select('id, tienda_origen_id, tienda_destino_id, items, notas')
      .eq('cliente_id', clienteId)
      .eq('estado', 'pendiente');

    if (error) {
      console.error('[sync] Error leyendo solicitudes de transferencia:', error.message);
      return;
    }
    if (!pendientes || pendientes.length === 0) return;

    const mapaGuardado = (await dbManager.getConfig('productosIdMap')) as Record<string, string> | null;
    const idMapInverso = new Map<string, string>();
    for (const [local, supa] of Object.entries(mapaGuardado || {})) idMapInverso.set(supa, local);
    const productos = await dbManager.getAllProductos();
    for (const p of productos) {
      if (p.supabaseId) idMapInverso.set(p.supabaseId, p.id);
    }

    let huboExito = false;
    for (const solicitud of pendientes as any[]) {
      try {
        const itemsRemotos = (solicitud.items || []) as { producto_id: string; cantidad: number }[];
        const itemsLocales = itemsRemotos.map((it) => {
          const productoIdLocal = idMapInverso.get(it.producto_id);
          if (!productoIdLocal) throw new Error('Un producto de esta solicitud aún no se ha sincronizado en esta terminal — vuelve a intentar en unos minutos');
          return { productoId: productoIdLocal, cantidad: Number(it.cantidad) || 0 };
        });

        ejecutarTransferencia({
          tiendaOrigenId: solicitud.tienda_origen_id,
          tiendaDestinoId: solicitud.tienda_destino_id,
          items: itemsLocales,
          notas: solicitud.notas || 'Transferencia solicitada desde la app móvil',
        });

        await client
          .from('solicitudes_transferencia')
          .update({ estado: 'completada', procesado_en: new Date().toISOString(), error_mensaje: null })
          .eq('id', solicitud.id);
        huboExito = true;
      } catch (e) {
        const mensaje = e instanceof Error ? e.message : 'Error desconocido ejecutando la transferencia';
        console.error(`[sync] Error ejecutando transferencia ${solicitud.id}:`, mensaje);
        await client
          .from('solicitudes_transferencia')
          .update({ estado: 'error', error_mensaje: mensaje, procesado_en: new Date().toISOString() })
          .eq('id', solicitud.id);
      }
    }

    if (huboExito) {
      await dbManager.addLog('procesar_transferencias', 'Transferencia(s) de inventario ejecutadas desde solicitud móvil');
      await this.pushTiendasStock(client, clienteId);
    }
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
   * Sube TODAS las cuentas de cartera locales en cada ciclo (upsert por
   * cliente_id+local_id, idempotente) -- a diferencia de ventas/productos no
   * hay un índice de "pendientes" propio: el volumen de ventas a crédito es
   * bajo comparado con el de ventas normales, así que reenviar el estado
   * completo cada 30s es más simple que mantener un flag "dirty" por cuenta,
   * y cubre tanto cuentas nuevas como abonos agregados después.
   */
  private async pushCarteraPendiente(client: NonNullable<ReturnType<typeof getSupabaseClient>>, clienteId: string): Promise<void> {
    const cuentas = await listarCuentasCartera();
    if (cuentas.length === 0) return;

    for (const cuenta of cuentas) {
      const campos = {
        venta_local_id: cuenta.ventaId || null,
        numero_factura: cuenta.numeroFactura || null,
        cliente_cartera_nombre: cuenta.clienteNombre,
        cliente_cartera_telefono: cuenta.clienteTelefono || null,
        cliente_cartera_documento: cuenta.clienteDocumento || null,
        total: cuenta.total,
        total_abonado: cuenta.totalAbonado,
        saldo: cuenta.saldo,
        estado: cuenta.estado,
        fecha_venta: cuenta.fechaVenta,
        fecha_vencimiento: cuenta.fechaVencimiento,
        dias_credito: cuenta.diasCredito,
        fecha_pago_completo: cuenta.fechaPagoCompleto || null,
        usuario_creador: cuenta.usuarioCreador || null,
        notas: cuenta.notas || null,
        abonos: cuenta.abonos,
        updated_at: new Date(cuenta.updatedAt || Date.now()).toISOString(),
      };

      // 🛡️ Si ya se conoce el uuid remoto, se actualiza esa fila por id en
      // vez de volver a hacer upsert por (cliente_id, local_id) -- una cuenta
      // creada originalmente en la PWA (local_id nulo en Supabase) recibe acá
      // un id local nuevo ("remote-..."), y un upsert con ESE local_id
      // insertaría una fila DUPLICADA en vez de actualizar la existente.
      if (cuenta.supabaseId) {
        const { error } = await client.from('cuentas_cartera').update(campos).eq('id', cuenta.supabaseId);
        if (error) console.error(`[sync] Error actualizando cuenta de cartera de ${cuenta.clienteNombre}:`, error.message);
        continue;
      }

      const { data, error } = await client.from('cuentas_cartera').upsert(
        { ...campos, cliente_id: clienteId, local_id: cuenta.id },
        { onConflict: 'cliente_id,local_id' }
      ).select('id').single();

      if (error) {
        console.error(`[sync] Error subiendo cuenta de cartera de ${cuenta.clienteNombre}:`, error.message);
        continue;
      }
      if (data?.id) {
        await guardarCuentaCarteraRaw({ ...cuenta, supabaseId: data.id });
      }
    }
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
    // 🚀 FIX rendimiento: la pantalla de venta (SyncStatusIndicator) pide esto
    // en cada cambio de estado del ciclo de sync (~2 veces cada 30s). Antes
    // cargaba TODO el inventario y TODO el historial de ventas solo para
    // contarlos; ahora IndexedDB los cuenta sin deserializarlos.
    const [totalProductos, productosPendientes, totalVentas, ventasPendientes] = await Promise.all([
      dbManager.contar('productos'),
      dbManager.contar('productos', true),
      dbManager.contar('ventas'),
      dbManager.contar('ventas', true),
    ]);

    return {
      totalProductos,
      productosPendientes,
      totalVentas,
      ventasPendientes,
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
  marcarProductoComoEliminado(localId);
  quitarDeAlimentosBebidas(localId);

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
  vaciarCatalogoAlimentosBebidas();

  try {
    const locales = await dbManager.getAllProductos();
    locales.forEach((p) => marcarProductoComoEliminado(p.id));
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
