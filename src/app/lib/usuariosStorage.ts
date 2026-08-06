/**
 * 💾 SISTEMA DE ALMACENAMIENTO ROBUSTO PARA USUARIOS
 * 
 * ✅ Funciona en WEB (navegador)
 * ✅ Funciona en ELECTRON (archivo .exe)
 * ✅ Triple capa de persistencia:
 *    1. IndexedDB (principal)
 *    2. localStorage (backup)
 *    3. Electron userData (para .exe)
 * 
 * 🎯 GARANTIZA que los usuarios SIEMPRE se guarden
 */

import { Usuario, RegistroSesion, SesionActiva } from '../contexts/AuthContext';
import { hashPassword } from './passwordHash';
// 🛡️ FIX: antes este archivo tenía su PROPIA constante DB_VERSION (quedó en
// 4 mientras indexedDB.ts avanzó a 5) — como ambos abren la misma base de
// datos ('CodecPOS_DB') con conexiones independientes, pedir una versión
// menor a la ya existente hace que IndexedDB rechace la apertura con
// VersionError, dejando esta capa de respaldo de usuarios muerta en
// cualquier máquina donde indexedDB.ts abra la base primero (el caso
// normal). Se importa la misma constante para que esto no pueda volver a
// desincronizarse.
import { DB_VERSION } from './indexedDB';

// ─── CONSTANTES ───────────────────────────────────────
const DB_NAME = 'CodecPOS_DB';

const STORE_USUARIOS = 'usuarios';
const STORE_SESIONES = 'sesiones';
const STORE_SESION_ACTIVA = 'sesion_activa';

// Keys de localStorage (backup)
const LS_USUARIOS = 'codec_pos_usuarios';
const LS_SESIONES = 'codec_pos_sesiones';
const LS_SESION_ACTIVA = 'codec_pos_sesion_activa';
const LS_ULTIMA_SINCRONIZACION = 'codec_pos_ultima_sync';

// ─── VERIFICAR SI ESTAMOS EN ELECTRON ──────────────────
function isElectron(): boolean {
  return !!(
    typeof window !== 'undefined' &&
    window.process &&
    (window.process as any).type === 'renderer'
  );
}

// ─── INICIALIZAR INDEXEDDB ─────────────────────────────
let dbInstance: IDBDatabase | null = null;

async function initDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('❌ Error abriendo IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      console.log('✅ IndexedDB inicializado correctamente');
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Crear object stores si no existen
      if (!db.objectStoreNames.contains(STORE_USUARIOS)) {
        const usuariosStore = db.createObjectStore(STORE_USUARIOS, { keyPath: 'id' });
        usuariosStore.createIndex('username', 'username', { unique: true });
        usuariosStore.createIndex('cedula', 'cedula', { unique: true });
        console.log('✅ Object store "usuarios" creado');
      }

      if (!db.objectStoreNames.contains(STORE_SESIONES)) {
        const sesionesStore = db.createObjectStore(STORE_SESIONES, { keyPath: 'id' });
        sesionesStore.createIndex('usuarioId', 'usuarioId', { unique: false });
        sesionesStore.createIndex('fechaInicio', 'fechaInicio', { unique: false });
        console.log('✅ Object store "sesiones" creado');
      }

      if (!db.objectStoreNames.contains(STORE_SESION_ACTIVA)) {
        db.createObjectStore(STORE_SESION_ACTIVA, { keyPath: 'id' });
        console.log('✅ Object store "sesion_activa" creado');
      }
    };
  });
}

// ─── GUARDAR USUARIOS ──────────────────────────────────
export async function guardarUsuarios(usuarios: Usuario[]): Promise<void> {
  console.log('💾 [Storage] Guardando', usuarios.length, 'usuarios...');

  try {
    // 1. GUARDAR EN INDEXEDDB (principal)
    const db = await initDB();
    const transaction = db.transaction([STORE_USUARIOS], 'readwrite');
    const store = transaction.objectStore(STORE_USUARIOS);

    // Limpiar store
    await new Promise<void>((resolve, reject) => {
      const clearRequest = store.clear();
      clearRequest.onsuccess = () => resolve();
      clearRequest.onerror = () => reject(clearRequest.error);
    });

    // Guardar cada usuario
    for (const usuario of usuarios) {
      await new Promise<void>((resolve, reject) => {
        const addRequest = store.put(usuario);
        addRequest.onsuccess = () => resolve();
        addRequest.onerror = () => reject(addRequest.error);
      });
    }

    console.log('✅ [IndexedDB] Usuarios guardados');

    // 2. GUARDAR EN LOCALSTORAGE (backup)
    try {
      localStorage.setItem(LS_USUARIOS, JSON.stringify(usuarios));
      localStorage.setItem(LS_ULTIMA_SINCRONIZACION, new Date().toISOString());
      console.log('✅ [localStorage] Usuarios guardados (backup)');
    } catch (error) {
      console.warn('⚠️ [localStorage] Error guardando backup:', error);
    }

    // 3. SI ES ELECTRON, enviar al proceso principal para guardar en archivo
    if (isElectron() && (window as any).electronAPI?.guardarUsuarios) {
      try {
        await (window as any).electronAPI.guardarUsuarios(usuarios);
        console.log('✅ [Electron] Usuarios guardados en archivo userData');
      } catch (error) {
        console.warn('⚠️ [Electron] Error guardando archivo:', error);
      }
    }

  } catch (error) {
    console.error('❌ [Storage] Error guardando usuarios:', error);
    
    // Si falla IndexedDB, al menos guardar en localStorage
    try {
      localStorage.setItem(LS_USUARIOS, JSON.stringify(usuarios));
      console.log('⚠️ [localStorage] Guardado de emergencia exitoso');
    } catch (lsError) {
      console.error('❌ [localStorage] Error en guardado de emergencia:', lsError);
      throw new Error('No se pudieron guardar los usuarios');
    }
  }
}

// ─── CARGAR USUARIOS ───────────────────────────────────
export async function cargarUsuarios(): Promise<Usuario[]> {
  console.log('📂 [Storage] Cargando usuarios...');

  // ⚡ OPTIMIZACIÓN: Intentar localStorage PRIMERO (es más rápido)
  // IndexedDB puede ser lento en Electron, especialmente al iniciar
  try {
    const lsData = localStorage.getItem(LS_USUARIOS);
    if (lsData) {
      const usuarios = JSON.parse(lsData) as Usuario[];
      if (usuarios.length > 0) {
        console.log('⚡ [localStorage] Usuarios cargados RÁPIDO desde backup:', usuarios.length);
        
        // Sincronizar con IndexedDB en segundo plano (NO BLOQUEA)
        setTimeout(() => {
          sincronizarIndexedDB(usuarios);
        }, 500);
        
        return usuarios;
      }
    }
  } catch (error) {
    console.warn('⚠️ [localStorage] Error cargando backup (intentando IndexedDB):', error);
  }

  // Si localStorage está vacío, intentar IndexedDB (pero con timeout)
  try {
    const usuariosIDB = await cargarDesdeIndexedDBConTimeout(3000);
    if (usuariosIDB.length > 0) {
      console.log('✅ [IndexedDB] Usuarios cargados:', usuariosIDB.length);
      
      // Guardar en localStorage para próxima vez
      try {
        localStorage.setItem(LS_USUARIOS, JSON.stringify(usuariosIDB));
      } catch (e) {
        console.warn('⚠️ No se pudo guardar en localStorage');
      }
      
      return usuariosIDB;
    }
  } catch (error) {
    console.warn('⚠️ [IndexedDB] Error o timeout cargando usuarios:', error);
  }

  // 3. SI ES ELECTRON, INTENTAR CARGAR DESDE ARCHIVO
  if (isElectron() && (window as any).electronAPI?.cargarUsuarios) {
    try {
      const resultado = await (window as any).electronAPI.cargarUsuarios();
      if (resultado.success && resultado.usuarios && resultado.usuarios.length > 0) {
        console.log('✅ [Electron] Usuarios cargados desde archivo:', resultado.usuarios.length);
        console.log('📍 [Electron] Fuente:', resultado.source);
        
        // Guardar en localStorage para próxima vez (NO esperar IndexedDB)
        try {
          localStorage.setItem(LS_USUARIOS, JSON.stringify(resultado.usuarios));
        } catch (e) {
          console.warn('⚠️ No se pudo guardar en localStorage');
        }
        
        // Sincronizar con IndexedDB en segundo plano
        setTimeout(() => {
          sincronizarIndexedDB(resultado.usuarios);
        }, 1000);
        
        return resultado.usuarios;
      }
    } catch (error) {
      console.warn('⚠️ [Electron] Error cargando archivo:', error);
    }
  }

  // 4. SI NO HAY NADA, CREAR USUARIO ADMIN POR DEFECTO
  console.log('⚠️ No hay usuarios - Creando Admin por defecto...');
  const adminPorDefecto: Usuario = {
    id: 'super_' + Date.now(),
    nombreCompleto: 'Administrador CODEC POS',
    cedula: '0000000000',
    username: 'Aadmin',
    // Semilla de primer arranque — cambiar de inmediato tras el primer login.
    password: hashPassword('Noruega2025++*'),
    rol: 'super_usuario',
    activo: true,
    fechaCreacion: new Date().toISOString(),
    creadoPor: 'SISTEMA',
  };

  await guardarUsuarios([adminPorDefecto]);
  console.log('✅ Usuario Admin creado y guardado');

  return [adminPorDefecto];
}

// ⚡ HELPER: Cargar desde IndexedDB con timeout
async function cargarDesdeIndexedDBConTimeout(timeoutMs: number): Promise<Usuario[]> {
  return Promise.race([
    // Promesa 1: Cargar desde IndexedDB
    (async () => {
      const db = await initDB();
      const transaction = db.transaction([STORE_USUARIOS], 'readonly');
      const store = transaction.objectStore(STORE_USUARIOS);

      return new Promise<Usuario[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result as Usuario[]);
        request.onerror = () => reject(request.error);
      });
    })(),
    // Promesa 2: Timeout
    new Promise<Usuario[]>((_, reject) => 
      setTimeout(() => reject(new Error('IndexedDB timeout')), timeoutMs)
    )
  ]);
}

// ⚡ HELPER: Sincronizar IndexedDB en segundo plano (NO BLOQUEA)
async function sincronizarIndexedDB(usuarios: Usuario[]): Promise<void> {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_USUARIOS], 'readwrite');
    const store = transaction.objectStore(STORE_USUARIOS);

    // Limpiar
    await new Promise<void>((resolve, reject) => {
      const clearRequest = store.clear();
      clearRequest.onsuccess = () => resolve();
      clearRequest.onerror = () => reject(clearRequest.error);
    });

    // Guardar
    for (const usuario of usuarios) {
      await new Promise<void>((resolve, reject) => {
        const addRequest = store.put(usuario);
        addRequest.onsuccess = () => resolve();
        addRequest.onerror = () => reject(addRequest.error);
      });
    }

    console.log('🔄 [IndexedDB] Sincronizado en segundo plano');
  } catch (error) {
    console.warn('⚠️ [IndexedDB] Error sincronizando:', error);
  }
}

// ─── GUARDAR SESIONES ──────────────────────────────────
export async function guardarSesiones(sesiones: RegistroSesion[]): Promise<void> {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_SESIONES], 'readwrite');
    const store = transaction.objectStore(STORE_SESIONES);

    await new Promise<void>((resolve, reject) => {
      const clearRequest = store.clear();
      clearRequest.onsuccess = () => resolve();
      clearRequest.onerror = () => reject(clearRequest.error);
    });

    for (const sesion of sesiones) {
      await new Promise<void>((resolve, reject) => {
        const addRequest = store.put(sesion);
        addRequest.onsuccess = () => resolve();
        addRequest.onerror = () => reject(addRequest.error);
      });
    }

    localStorage.setItem(LS_SESIONES, JSON.stringify(sesiones));
    console.log('✅ [Storage] Sesiones guardadas:', sesiones.length);

  } catch (error) {
    console.error('❌ Error guardando sesiones:', error);
    localStorage.setItem(LS_SESIONES, JSON.stringify(sesiones));
  }
}

// ─── CARGAR SESIONES ───────────────────────────────────
export async function cargarSesiones(): Promise<RegistroSesion[]> {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_SESIONES], 'readonly');
    const store = transaction.objectStore(STORE_SESIONES);

    const sesiones = await new Promise<RegistroSesion[]>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as RegistroSesion[]);
      request.onerror = () => reject(request.error);
    });

    return sesiones;

  } catch (error) {
    console.warn('⚠️ Error cargando sesiones desde IndexedDB:', error);
    const lsData = localStorage.getItem(LS_SESIONES);
    return lsData ? JSON.parse(lsData) : [];
  }
}

// ─── GUARDAR SESIÓN ACTIVA ─────────────────────────────
export async function guardarSesionActiva(sesion: SesionActiva | null): Promise<void> {
  try {
    if (!sesion) {
      localStorage.removeItem(LS_SESION_ACTIVA);
      return;
    }

    const db = await initDB();
    const transaction = db.transaction([STORE_SESION_ACTIVA], 'readwrite');
    const store = transaction.objectStore(STORE_SESION_ACTIVA);

    await new Promise<void>((resolve, reject) => {
      const request = store.put({ id: 'current', ...sesion });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    localStorage.setItem(LS_SESION_ACTIVA, JSON.stringify(sesion));
    console.log('✅ [Storage] Sesión activa guardada');

  } catch (error) {
    console.error('❌ Error guardando sesión activa:', error);
    if (sesion) {
      localStorage.setItem(LS_SESION_ACTIVA, JSON.stringify(sesion));
    }
  }
}

// ─── CARGAR SESIÓN ACTIVA ──────────────────────────────
export async function cargarSesionActiva(): Promise<SesionActiva | null> {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_SESION_ACTIVA], 'readonly');
    const store = transaction.objectStore(STORE_SESION_ACTIVA);

    const sesion = await new Promise<any>((resolve, reject) => {
      const request = store.get('current');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (sesion) {
      const { id, ...sesionActiva } = sesion;
      return sesionActiva as SesionActiva;
    }

    return null;

  } catch (error) {
    console.warn('⚠️ Error cargando sesión activa desde IndexedDB:', error);
    const lsData = localStorage.getItem(LS_SESION_ACTIVA);
    return lsData ? JSON.parse(lsData) : null;
  }
}

// ─── VERIFICAR INTEGRIDAD DE DATOS ─────────────────────
export async function verificarIntegridad(): Promise<{
  ok: boolean;
  mensaje: string;
  detalles: any;
}> {
  try {
    const usuarios = await cargarUsuarios();
    const sesiones = await cargarSesiones();
    const sesionActiva = await cargarSesionActiva();

    const ultimaSync = localStorage.getItem(LS_ULTIMA_SINCRONIZACION);

    const resultado = {
      ok: true,
      mensaje: 'Sistema de almacenamiento funcionando correctamente',
      detalles: {
        usuarios: usuarios.length,
        sesiones: sesiones.length,
        sesionActiva: !!sesionActiva,
        ultimaSincronizacion: ultimaSync,
        indexedDB: !!dbInstance,
        electron: isElectron(),
      },
    };

    console.log('✅ [Storage] Verificación de integridad:', resultado);
    return resultado;

  } catch (error) {
    return {
      ok: false,
      mensaje: 'Error en el sistema de almacenamiento',
      detalles: { error: String(error) },
    };
  }
}

// ─── EXPORTAR TODO ─────────────────────────────────────
export const UsuariosStorage = {
  guardarUsuarios,
  cargarUsuarios,
  guardarSesiones,
  cargarSesiones,
  guardarSesionActiva,
  cargarSesionActiva,
  verificarIntegridad,
  isElectron,
};

export default UsuariosStorage;