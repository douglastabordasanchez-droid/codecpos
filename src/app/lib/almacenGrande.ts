/**
 * Claves grandes de localStorage guardadas en IndexedDB.
 *
 * localStorage de Chromium tiene un tope de unos 10 MB por origen (unos 5
 * millones de caracteres). El catálogo de la caja ('pos-productos') ocupa
 * cerca de 700 caracteres por producto: con 20.000 referencias son ~14
 * millones y `setItem` empieza a fallar en silencio (los productos dejan de
 * guardarse). Hay más de 60 lecturas síncronas de esa clave en el código.
 *
 * En vez de reescribirlas todas, al arrancar se cargan estas claves de
 * IndexedDB a memoria y se intercepta getItem/setItem/removeItem de
 * localStorage SOLO para ellas: quien lee sigue leyendo igual (síncrono y
 * desde memoria), y cada escritura se guarda en IndexedDB (agrupada, sin
 * tope práctico). En localStorage queda solo una marca, así quien recorre
 * las claves (cambio de empresa, reinicio) las sigue viendo.
 *
 * Debe ejecutarse ANTES de cargar la app (ver src/index.tsx).
 */
const CLAVES_GRANDES = ['pos-productos', 'multitienda_stock'];
const MARCA = '__codecpos_idb__';
const DB = 'codecpos_almacen_grande';
const STORE = 'claves';

const memoria = new Map<string, string>();
const pendientes = new Map<string, string | null>();
let db: IDBDatabase | null = null;
let temporizador: ReturnType<typeof setTimeout> | null = null;
let instalado = false;

/** 'pos-productos' y sus copias archivadas por empresa ('…__pos-productos', ver tenantSwap.ts). */
export function esClaveGrande(clave: string): boolean {
  return CLAVES_GRANDES.some((c) => clave === c || clave.endsWith(`__${c}`));
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function leerTodo(base: IDBDatabase): Promise<Array<[string, string]>> {
  return new Promise((resolve, reject) => {
    const tx = base.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const claves = store.getAllKeys();
    const valores = store.getAll();
    tx.oncomplete = () => resolve((claves.result as IDBValidKey[]).map((k, i) => [String(k), String(valores.result[i])]));
    tx.onerror = () => reject(tx.error);
  });
}

/** Escribe en IndexedDB lo pendiente (las escrituras seguidas se juntan en una). */
function volcar(): Promise<void> {
  temporizador = null;
  if (!db || pendientes.size === 0) return Promise.resolve();
  const lote = new Map(pendientes);
  pendientes.clear();
  return new Promise((resolve) => {
    const tx = db!.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    lote.forEach((valor, clave) => (valor === null ? store.delete(clave) : store.put(valor, clave)));
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      console.error('[almacén] No se pudo guardar en IndexedDB:', tx.error);
      lote.forEach((v, k) => { if (!pendientes.has(k)) pendientes.set(k, v); }); // se reintenta
      programar(2000);
      resolve();
    };
  });
}

function programar(espera = 400): void {
  if (temporizador) return;
  temporizador = setTimeout(() => { volcar(); }, espera);
}

const parseados = new Map<string, { raw: string; valor: unknown }>();

/**
 * JSON de una clave ya interpretado, sin volver a leer 14 MB si no cambió:
 * mientras nadie escriba la clave, getItem devuelve el mismo texto y aquí se
 * reutiliza lo ya interpretado. Es de SOLO LECTURA: quien quiera cambiarlo
 * debe copiarlo y guardarlo con setItem.
 */
export function leerJSONGrande<T>(clave: string, porDefecto: T): T {
  const raw = localStorage.getItem(clave);
  if (raw === null) return porDefecto;
  const hit = parseados.get(clave);
  if (hit && hit.raw === raw) return hit.valor as T;
  let valor: unknown;
  try { valor = JSON.parse(raw); } catch { valor = porDefecto; }
  parseados.set(clave, { raw, valor });
  return valor as T;
}

/** Guarda ya lo pendiente (por ejemplo antes de cerrar la caja). */
export function guardarAlmacenGrandeAhora(): Promise<void> {
  if (temporizador) clearTimeout(temporizador);
  return volcar();
}

export async function prepararAlmacenGrande(): Promise<void> {
  if (instalado || typeof window === 'undefined' || !window.indexedDB || !window.localStorage) return;
  try {
    db = await abrir();
    for (const [clave, valor] of await leerTodo(db)) memoria.set(clave, valor);
  } catch (e) {
    console.error('[almacén] IndexedDB no disponible; se sigue con localStorage normal:', e);
    return;
  }

  const proto = Storage.prototype;
  const getOriginal = proto.getItem;
  const setOriginal = proto.setItem;
  const removeOriginal = proto.removeItem;
  const ls = window.localStorage;

  // Migración: lo que todavía está completo en localStorage pasa a IndexedDB y libera el espacio.
  for (const clave of Object.keys(ls)) {
    if (!esClaveGrande(clave)) continue;
    const valor = getOriginal.call(ls, clave);
    if (valor !== null && valor !== MARCA) {
      memoria.set(clave, valor);
      pendientes.set(clave, valor);
      setOriginal.call(ls, clave, MARCA);
    } else if (valor === MARCA && !memoria.has(clave)) {
      removeOriginal.call(ls, clave); // marca sin datos (IndexedDB borrado): que se vea como vacía
    }
  }
  // Datos en IndexedDB sin marca (por ejemplo tras limpiar localStorage): se repone la marca.
  memoria.forEach((_, clave) => { if (getOriginal.call(ls, clave) === null) setOriginal.call(ls, clave, MARCA); });
  if (pendientes.size > 0) await volcar();

  proto.getItem = function (this: Storage, clave: string) {
    if (this === ls && esClaveGrande(String(clave))) return memoria.has(String(clave)) ? memoria.get(String(clave))! : null;
    return getOriginal.call(this, clave);
  };
  proto.setItem = function (this: Storage, clave: string, valor: string) {
    const k = String(clave);
    if (this === ls && esClaveGrande(k)) {
      const v = String(valor);
      memoria.set(k, v);
      pendientes.set(k, v);
      if (getOriginal.call(ls, k) !== MARCA) setOriginal.call(ls, k, MARCA);
      programar();
      return;
    }
    return setOriginal.call(this, clave, valor);
  };
  proto.removeItem = function (this: Storage, clave: string) {
    const k = String(clave);
    if (this === ls && esClaveGrande(k)) {
      memoria.delete(k);
      pendientes.set(k, null);
      programar();
    }
    return removeOriginal.call(this, clave);
  };

  // Al cerrar o recargar se intenta guardar lo último.
  window.addEventListener('pagehide', () => { guardarAlmacenGrandeAhora(); });
  instalado = true;
}
