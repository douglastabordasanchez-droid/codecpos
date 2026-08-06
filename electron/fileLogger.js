/**
 * CODEC POS v2.0 - "Caja Negra" (auditoría física en disco)
 *
 * Escribe un log de texto plano por día en una ruta fija fuera de %AppData%,
 * para que sobreviva a perfiles temporales de Windows, borrados accidentales
 * del cliente o corrupción del almacenamiento interno de la app (IndexedDB).
 *
 * No se usa electron-log para no añadir una dependencia nueva al proyecto:
 * este módulo cubre exactamente lo que se necesita (escritura .log rotada por
 * día + lectura de las últimas N líneas) con `fs` puro.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const ROOT_DIR = 'C:\\CodecStudio\\CODECPOS';
const ROOT_DIR_FALLBACK = path.join(os.homedir(), 'CodecStudio', 'CODECPOS');
export let LOGS_DIR = path.join(ROOT_DIR, 'logs');

// 🛡️ FIX: la raíz de C:\ solo es escribible por cuentas con permisos de
// administrador. En una cuenta de Windows restringida (común en equipos de
// caja) esto fallaba en silencio — writeLog() simplemente no escribía nada,
// y era justo en esas máquinas donde más falta hacía poder diagnosticar un
// problema. Si la ruta fija no es escribible, se cae a una ruta dentro del
// perfil del usuario actual (siempre escribible) y se recuerda la decisión.
let fallbackResuelto = false;
function ensureLogsDir() {
  if (fallbackResuelto) {
    try { fs.mkdirSync(LOGS_DIR, { recursive: true }); return true; } catch { return false; }
  }
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    fallbackResuelto = true;
    return true;
  } catch (e) {
    console.error(`[fileLogger] No se pudo usar "${LOGS_DIR}" (${e.message}), usando ruta alterna en el perfil del usuario`);
    LOGS_DIR = path.join(ROOT_DIR_FALLBACK, 'logs');
    try {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
      fallbackResuelto = true;
      return true;
    } catch (e2) {
      console.error('[fileLogger] No se pudo crear la carpeta de logs ni en la ruta alterna:', e2.message);
      return false;
    }
  }
}

function pad(n) { return String(n).padStart(2, '0'); }

function timestamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function todayLogPath() {
  const d = new Date();
  const fileName = `codecpos-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.log`;
  return path.join(LOGS_DIR, fileName);
}

/**
 * Escribe una línea en el log físico del día actual.
 * level: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL'
 */
export function writeLog(level, message, meta) {
  if (!ensureLogsDir()) return;
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  const line = `[${timestamp()}] [${level}] ${message}${metaStr}\n`;
  try {
    fs.appendFileSync(todayLogPath(), line, 'utf8');
  } catch (e) {
    console.error('[fileLogger] No se pudo escribir el log:', e.message);
  }
}

/**
 * Lee las últimas `limit` líneas combinando los archivos de log más recientes
 * (por si el límite cruza la medianoche).
 */
export function readRecentLines(limit = 100) {
  if (!ensureLogsDir()) return [];
  try {
    const files = fs.readdirSync(LOGS_DIR)
      .filter(f => f.startsWith('codecpos-') && f.endsWith('.log'))
      .sort()
      .reverse(); // más reciente primero

    const lines = [];
    for (const file of files) {
      if (lines.length >= limit) break;
      const content = fs.readFileSync(path.join(LOGS_DIR, file), 'utf8');
      const fileLines = content.split(/\r?\n/).filter(Boolean);
      lines.unshift(...fileLines);
      if (lines.length >= limit) break;
    }
    return lines.slice(-limit);
  } catch (e) {
    console.error('[fileLogger] No se pudo leer el log:', e.message);
    return [];
  }
}

/**
 * Registra el arranque de la app: usuario de Windows activo y si corresponde
 * a un perfil temporal (indicador típico de perfiles corruptos / reinstalaciones
 * forzadas de Windows que hacen "perder" los datos del cliente).
 */
export function logAppStart(extra) {
  let username = 'desconocido';
  try { username = os.userInfo().username; } catch { /* no-op */ }

  const esPerfilTemporal = /^(TEMP|TMP)/i.test(username) || /\\TEMP\\/i.test(os.homedir() || '');

  writeLog(esPerfilTemporal ? 'WARN' : 'INFO',
    `Inicio de aplicación — usuario de Windows: "${username}"${esPerfilTemporal ? ' (⚠ PERFIL TEMPORAL DETECTADO)' : ''}`,
    { username, homedir: os.homedir(), esPerfilTemporal, ...extra }
  );

  return { username, esPerfilTemporal };
}

export function getLogsDir() {
  ensureLogsDir();
  return LOGS_DIR;
}
