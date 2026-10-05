/**
 * CODEC POS · Carpeta de archivo del historial
 *
 * La caja guarda en su base local solo el último mes de ventas, gastos,
 * cierres y devoluciones (src/app/lib/retencionDatos.ts). Antes de borrar lo
 * más viejo, lo escribe en una carpeta del computador que el cliente eligió y
 * autorizó. Este módulo es lo único que toca el disco:
 *
 *   - elegirCarpeta: diálogo de Windows para escoger la carpeta.
 *   - guardar: escribe un archivo DENTRO de esa carpeta (subcarpeta
 *     "CODEC POS Archivo"); nunca fuera de ella, aunque el nombre traiga "..".
 *   - verificar: confirma que la carpeta existe y se puede escribir.
 *   - abrir: la abre en el Explorador de Windows.
 *
 * La escritura es atómica (archivo temporal y luego renombrar), así un corte
 * de luz no deja un archivo a medias que parezca bueno.
 */
import path from 'path';
import { promises as fsp } from 'fs';

export const SUBCARPETA = 'CODEC POS Archivo';

function dentroDe(base, destino) {
  const relativo = path.relative(base, destino);
  return !!relativo && !relativo.startsWith('..') && !path.isAbsolute(relativo);
}

function limpiarNombre(nombre) {
  return String(nombre || '').replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_').replace(/^\.+/, '').slice(0, 150) || 'archivo';
}

export async function elegirCarpeta(dialog, ventana) {
  const r = await dialog.showOpenDialog(ventana, {
    title: 'Carpeta donde CODEC POS guardará el historial',
    buttonLabel: 'Usar esta carpeta',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths?.[0]) return { ok: false, cancelado: true };
  const carpeta = r.filePaths[0];
  const prueba = await verificar(carpeta);
  return prueba.ok ? { ok: true, carpeta } : prueba;
}

export async function verificar(carpeta) {
  try {
    if (!carpeta || !path.isAbsolute(carpeta)) return { ok: false, error: 'Carpeta no válida' };
    const destino = path.join(carpeta, SUBCARPETA);
    await fsp.mkdir(destino, { recursive: true });
    const prueba = path.join(destino, `.prueba-${process.pid}-${Date.now()}`);
    await fsp.writeFile(prueba, 'ok', 'utf8');
    await fsp.unlink(prueba);
    return { ok: true, ruta: destino };
  } catch (e) {
    return { ok: false, error: `No se puede escribir en la carpeta: ${e.message}` };
  }
}

/** Escribe `contenido` en <carpeta>/CODEC POS Archivo/<subcarpeta>/<nombre>. */
export async function guardar(carpeta, subcarpeta, nombre, contenido) {
  try {
    if (!carpeta || !path.isAbsolute(carpeta)) return { ok: false, error: 'Carpeta no válida' };
    const base = path.join(carpeta, SUBCARPETA);
    const dir = path.join(base, limpiarNombre(subcarpeta));
    const archivo = path.join(dir, limpiarNombre(nombre));
    if (!dentroDe(base, archivo)) return { ok: false, error: 'Ruta fuera de la carpeta autorizada' };
    await fsp.mkdir(dir, { recursive: true });
    const tmp = `${archivo}.tmp`;
    await fsp.writeFile(tmp, contenido, 'utf8');
    await fsp.rename(tmp, archivo);
    const { size } = await fsp.stat(archivo);
    return { ok: true, ruta: archivo, bytes: size };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function abrir(shell, carpeta) {
  const destino = path.join(carpeta, SUBCARPETA);
  await fsp.mkdir(destino, { recursive: true }).catch(() => {});
  const error = await shell.openPath(destino);
  return error ? { ok: false, error } : { ok: true };
}
