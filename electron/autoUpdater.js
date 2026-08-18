/**
 * Auto-actualización de Codec POS vía GitHub Releases.
 *
 * Fase 5 (ampliación), puntos 12-14: publicar una nueva versión =
 * `electron-builder --publish always` con GH_TOKEN configurado (sube el
 * instalador + el feed `latest.yml` al release de GitHub). Este módulo es
 * el lado cliente: revisa ese feed, descarga en segundo plano si hay una
 * versión nueva, y deja que el usuario decida cuándo reiniciar para
 * instalarla -- nunca interrumpe una venta en curso a la fuerza.
 *
 * Solo corre en la app empaquetada (`app.isPackaged`): en desarrollo no
 * hay `app-update.yml` (lo genera electron-builder al empaquetar), así
 * que electron-updater fallaría de inmediato si se intentara ahí.
 */

import { app } from 'electron';
import { createRequire } from 'module';
import * as fileLogger from './fileLogger.js';

const require = createRequire(import.meta.url);
const { autoUpdater } = require('electron-updater');

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

let ventanaPrincipal = null;

function notificarRenderer(evento, datos) {
  if (ventanaPrincipal && !ventanaPrincipal.isDestroyed()) {
    ventanaPrincipal.webContents.send('auto-update:evento', { evento, ...datos });
  }
}

export function iniciarAutoUpdater(mainWindow) {
  ventanaPrincipal = mainWindow;

  if (!app.isPackaged) {
    fileLogger.writeLog('INFO', 'Auto-actualización desactivada (build de desarrollo, no empaquetada)');
    return;
  }

  autoUpdater.on('checking-for-update', () => {
    fileLogger.writeLog('INFO', 'Buscando actualizaciones de Codec POS...');
  });

  autoUpdater.on('update-available', (info) => {
    fileLogger.writeLog('INFO', 'Actualización disponible', { version: info.version });
    notificarRenderer('disponible', { version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    fileLogger.writeLog('INFO', 'Codec POS ya está en la última versión', { version: app.getVersion() });
  });

  autoUpdater.on('download-progress', (progress) => {
    notificarRenderer('descargando', { porcentaje: Math.round(progress.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    fileLogger.writeLog('INFO', 'Actualización descargada, lista para instalar', { version: info.version });
    notificarRenderer('lista', { version: info.version });
  });

  autoUpdater.on('error', (error) => {
    // Un error de red al buscar actualizaciones NUNCA debe afectar el uso
    // normal del POS -- solo se registra, no se muestra como bloqueante.
    fileLogger.writeLog('WARN', 'Error buscando actualización (no afecta el uso normal de Codec POS)', { error: error?.message });
  });

  // Revisión diferida (no compite con el arranque) y luego cada 4 horas
  // mientras la app siga abierta -- suficiente para negocios que no
  // reinician la caja todos los días sin ser intrusivo.
  setTimeout(() => checarActualizaciones(), 15000);
  setInterval(() => checarActualizaciones(), 4 * 60 * 60 * 1000);
}

export function checarActualizaciones() {
  if (!app.isPackaged) return;
  autoUpdater.checkForUpdates().catch((error) => {
    fileLogger.writeLog('WARN', 'No se pudo verificar actualizaciones (sin conexión probablemente)', { error: error?.message });
  });
}

export function instalarActualizacionAhora() {
  autoUpdater.quitAndInstall();
}
