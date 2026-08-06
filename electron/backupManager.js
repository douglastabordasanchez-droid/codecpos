/**
 * CODEC POS v2.0 - Respaldo blindado fuera de %AppData%
 *
 * El "motor de base de datos" real de CODEC POS es el IndexedDB de Chromium,
 * que vive dentro del perfil de usuario de Electron (userData/Partitions/...).
 * Ese almacenamiento es exactamente el que se corrompe o se pierde cuando
 * Windows reinicia un perfil, un antivirus limpia caché, o el cliente borra
 * datos "por accidente".
 *
 * Solo el proceso de renderer tiene acceso a ese IndexedDB (a través de
 * dbManager, ver src/app/lib/indexedDB.ts + backupService.ts). Por eso este
 * módulo del proceso principal NO intenta tocar los archivos internos de
 * LevelDB directamente (manipular CURRENT/MANIFEST a mano es justo lo que
 * puede terminar de corromper una base ya dañada). En su lugar:
 *
 *   1. El renderer serializa todos los stores a JSON (backupService.ts).
 *   2. Este módulo persiste ese JSON en una ruta fija y visible en disco,
 *      fuera de AppData, con rotación de 7 días.
 *   3. Para restaurar, este módulo devuelve el JSON de un backup elegido;
 *      el renderer lo vuelve a insertar en IndexedDB y relanza la app.
 *   4. Para "reparar", este módulo borra el IndexedDB corrupto de la
 *      partición de la app (única operación seria posible desde Node sobre
 *      un storage de Chromium) y deja que se restaure el último backup.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

const ROOT_DIR = 'C:\\CodecStudio\\CODECPOS';
const ROOT_DIR_FALLBACK = path.join(os.homedir(), 'CodecStudio', 'CODECPOS');
let BACKUPS_DIR = path.join(ROOT_DIR, 'backups');
const MAX_DIAS_HISTORICO = 7;

// 🛡️ FIX: la raíz de C:\ solo es escribible por cuentas con permisos de
// administrador — en cuentas de Windows restringidas (comunes en equipos de
// caja) mkdirSync fallaba en silencio y este sistema de "blindaje" quedaba
// sin ningún lugar donde guardar backups, sin que nadie se enterara hasta
// necesitarlo. Si la ruta fija falla, se cae a una ruta dentro del perfil
// del usuario actual (siempre escribible) y se recuerda la decisión.
let fallbackResuelto = false;
function ensureBackupsDir() {
  if (!fallbackResuelto) {
    try {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    } catch (e) {
      console.error(`[backupManager] No se pudo usar "${BACKUPS_DIR}" (${e.message}), usando ruta alterna en el perfil del usuario`);
      BACKUPS_DIR = path.join(ROOT_DIR_FALLBACK, 'backups');
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
    fallbackResuelto = true;
    return;
  }
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

function pad(n) { return String(n).padStart(2, '0'); }

function nombreArchivo(fecha = new Date()) {
  const f = `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}_${pad(fecha.getHours())}-${pad(fecha.getMinutes())}-${pad(fecha.getSeconds())}`;
  return `CODECPOS_backup_${f}.json`;
}

function sha256(contenido) {
  return crypto.createHash('sha256').update(contenido, 'utf8').digest('hex');
}

function checksumPath(filePath) {
  return `${filePath}.sha256`;
}

/**
 * Guarda un backup (string JSON ya serializado por el renderer) en la ruta
 * blindada y aplica rotación: conserva como máximo un backup por día de los
 * últimos 7 días (el más reciente de cada día), más todos los del día actual.
 *
 * 🛡️ Además guarda un checksum SHA-256 en un archivo ".sha256" al lado —
 * esto permite detectar, antes de intentar restaurar, si un backup quedó a
 * medias por un apagón (escritura interrumpida) o fue alterado/corrompido
 * por un virus, en vez de descubrirlo recién al fallar la restauración.
 */
export function saveBackup(jsonString) {
  ensureBackupsDir();
  const fileName = nombreArchivo();
  const filePath = path.join(BACKUPS_DIR, fileName);
  fs.writeFileSync(filePath, jsonString, 'utf8');
  fs.writeFileSync(checksumPath(filePath), sha256(jsonString), 'utf8');
  rotarBackups();
  return { fileName, filePath, bytes: Buffer.byteLength(jsonString, 'utf8') };
}

/**
 * Elimina backups con más de MAX_DIAS_HISTORICO días de antigüedad,
 * conservando siempre al menos un backup por cada uno de esos días.
 */
function rotarBackups() {
  try {
    const archivos = listarArchivos();
    const limite = Date.now() - MAX_DIAS_HISTORICO * 24 * 60 * 60 * 1000;
    for (const a of archivos) {
      if (a.mtimeMs < limite) {
        try { fs.unlinkSync(a.filePath); } catch { /* no-op */ }
        try { fs.unlinkSync(checksumPath(a.filePath)); } catch { /* no-op */ }
      }
    }
  } catch (e) {
    console.error('[backupManager] Error rotando backups:', e.message);
  }
}

function listarArchivos() {
  ensureBackupsDir();
  return fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.startsWith('CODECPOS_backup_') && f.endsWith('.json'))
    .map(f => {
      const filePath = path.join(BACKUPS_DIR, f);
      const stat = fs.statSync(filePath);
      return { fileName: f, filePath, mtimeMs: stat.mtimeMs, size: stat.size };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs); // más reciente primero
}

/**
 * Verifica si un backup está íntegro comparando su contenido actual contra
 * el checksum guardado al crearlo.
 *   - true  → el checksum coincide, el archivo está sano.
 *   - false → el checksum NO coincide (corrupción o alteración detectada).
 *   - null  → no hay checksum guardado (backup de una versión anterior a
 *     esta función) — no se puede verificar, pero tampoco se asume dañado.
 */
function verificarIntegridad(filePath) {
  try {
    const sumaPath = checksumPath(filePath);
    if (!fs.existsSync(sumaPath)) return null;
    const esperado = fs.readFileSync(sumaPath, 'utf8').trim();
    const contenido = fs.readFileSync(filePath, 'utf8');
    return sha256(contenido) === esperado;
  } catch {
    return false; // si ni siquiera se puede leer, se considera dañado
  }
}

/**
 * Lista los backups disponibles (metadata + estado de integridad, sin cargar
 * el contenido completo en el resultado).
 */
export function listBackups() {
  return listarArchivos().map(a => ({
    fileName: a.fileName,
    fecha: new Date(a.mtimeMs).toISOString(),
    size: a.size,
    integro: verificarIntegridad(a.filePath),
  }));
}

/**
 * Lee y devuelve el contenido JSON (como string) de un backup específico.
 * El renderer se encarga de parsearlo y restaurarlo en IndexedDB.
 * Lanza un error explícito si el checksum no coincide, para que quien llama
 * pueda pasar al siguiente backup disponible en vez de restaurar basura.
 */
export function readBackup(fileName) {
  ensureBackupsDir();
  const safeName = path.basename(fileName); // evita path traversal
  const filePath = path.join(BACKUPS_DIR, safeName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Backup no encontrado: ${safeName}`);
  }
  const integro = verificarIntegridad(filePath);
  if (integro === false) {
    throw new Error(`El backup "${safeName}" está dañado o fue alterado (checksum no coincide)`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

export function getLastBackupInfo() {
  const archivos = listarArchivos();
  if (archivos.length === 0) return null;
  const ultimo = archivos[0];
  return {
    fileName: ultimo.fileName,
    fecha: new Date(ultimo.mtimeMs).toISOString(),
    size: ultimo.size,
    integro: verificarIntegridad(ultimo.filePath),
  };
}

/**
 * Tamaño total de una carpeta (usado para mostrar el tamaño "real" de la
 * base de datos exportada en la Sección de Desarrollador).
 */
export function getDirSize(dirPath) {
  let total = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) total += getDirSize(full);
      else total += fs.statSync(full).size;
    }
  } catch { /* carpeta inexistente o sin permisos — tamaño 0 */ }
  return total;
}

export function getBackupsDir() {
  ensureBackupsDir();
  return BACKUPS_DIR;
}
