/**
 * CODEC POS - Electron Preload Script
 * Archivo .cjs para forzar CommonJS aunque package.json tenga "type": "module"
 * Expone APIs seguras de Node.js al renderer process
 *
 * NOTA: este archivo es el que realmente carga main.js (findPreload() prefiere
 * .cjs sobre .js). Debe mantenerse en paridad con preload.js — si agregas una
 * API nueva, agrégala en AMBOS archivos.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  /**
   * Obtiene el UUID real de la máquina
   */
  getMachineId: () => ipcRenderer.invoke('get-machine-id'),

  /**
   * Verifica si la aplicación se está ejecutando con permisos de administrador
   */
  isAdmin: () => ipcRenderer.invoke('is-admin'),

  /**
   * true si este equipo fue detectado sin compositing por GPU real (ver
   * main.js) — el renderer usa esto para apagar efectos de backdrop-blur
   * costosos en equipos de bajos recursos.
   */
  isSoftwareRendering: () => ipcRenderer.invoke('system:is-software-rendering'),

  /**
   * Solicita reiniciar la aplicación con permisos de administrador
   */
  requestAdminRestart: () => ipcRenderer.invoke('request-admin-restart'),

  /**
   * Información del sistema operativo
   */
  getOSInfo: () => ipcRenderer.invoke('get-os-info'),

  /**
   * Versión instalada de la app (usada para detectar arranques post-actualización)
   */
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),

  /**
   * Versiones de runtime (Electron/Chrome/Node) -- pantalla "Acerca del
   * sistema" del panel técnico, Fase 4 punto 20.
   */
  getRuntimeVersions: () => ipcRenderer.invoke('system:get-runtime-versions'),

  /**
   * Auto-actualización (Fase 5 ampliada, puntos 12-14) -- ver
   * electron/autoUpdater.js. onUpdateEvent recibe { evento: 'disponible'
   * | 'descargando' | 'lista', ... } para que la UI muestre un aviso no
   * bloqueante y deje al usuario decidir cuándo instalar.
   */
  checarActualizaciones: () => ipcRenderer.invoke('updates:checar-ahora'),
  instalarActualizacionAhora: () => ipcRenderer.invoke('updates:instalar-ahora'),
  onUpdateEvent: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('auto-update:evento', listener);
    return () => ipcRenderer.removeListener('auto-update:evento', listener);
  },

  /**
   * Guardar backup en disco (ruta antigua, Documents/CODEC_POS_Backups)
   */
  saveBackup: (data) => ipcRenderer.invoke('save-backup', data),

  /**
   * Mostrar notificación del sistema
   */
  showNotification: (data) => ipcRenderer.invoke('show-notification', data),

  /**
   * Abrir enlaces externos en el navegador del sistema
   */
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  /**
   * Cuadro de diálogo nativo
   */
  showMessageBox: (opts) => ipcRenderer.invoke('show-message-box', opts),

  /**
   * Voz embebida (Piper TTS, es_AR-daniela-high). true si el motor y el
   * modelo están presentes en este build.
   */
  vozEmbebidaDisponible: () => ipcRenderer.invoke('voz:disponible'),

  /**
   * Sintetiza `texto` con la voz embebida. Devuelve el audio WAV en base64,
   * o null si el motor no está disponible o falló la síntesis.
   */
  sintetizarVoz: (texto) => ipcRenderer.invoke('voz:sintetizar', texto),

  /**
   * Control de pantalla completa
   */
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),
  setFullscreen: (value) => ipcRenderer.invoke('set-fullscreen', value),

  /**
   * Impresora térmica (Windows spool / ESC-POS) + Etiquetas
   */
  printer: {
    getConfig: () => ipcRenderer.invoke('printer:get-config'),
    listSystem: () => ipcRenderer.invoke('printer:list-system'),
    resolveTarget: () => ipcRenderer.invoke('printer:resolve-target'),
    checkAvailability: (printerName) => ipcRenderer.invoke('printer:check-availability', printerName),
    rawEscPos: (payload) => ipcRenderer.invoke('printer:raw-escpos', payload),
    // Compatibilidad con renderer existente
    list: () => ipcRenderer.invoke('printer:list'),
    test: (target) => ipcRenderer.invoke('printer:test', target),
    // Impresión silenciosa de etiquetas de códigos de barras
    getPrinters: () => ipcRenderer.invoke('get-printers'),
    printLabel: (data) => ipcRenderer.invoke('print-label', data),
  },

  /**
   * Detección universal de hardware
   */
  serialport: {
    list: () => ipcRenderer.invoke('serialport:list'),
    open: (path, options) => ipcRenderer.invoke('serialport:open', path, options),
    close: (path) => ipcRenderer.invoke('serialport:close', path),
    write: (path, data) => ipcRenderer.invoke('serialport:write', path, data),
  },
  usb: {
    getDevices: () => ipcRenderer.invoke('usb:getDevices'),
  },
  scale: {
    read: (port) => ipcRenderer.invoke('scale:read', port),
    test: (port) => ipcRenderer.invoke('scale:test', port),
  },

  /**
   * Eventos en tiempo real de dispositivos USB (plug / unplug)
   */
  devices: {
    onConnected: (callback) =>
      ipcRenderer.on('device:connected', (_event, data) => callback(data)),
    onDisconnected: (callback) =>
      ipcRenderer.on('device:disconnected', (_event, data) => callback(data)),
    onListUpdated: (callback) =>
      ipcRenderer.on('device:list-updated', (_event, data) => callback(data)),
    removeAllDeviceListeners: () => {
      ipcRenderer.removeAllListeners('device:connected');
      ipcRenderer.removeAllListeners('device:disconnected');
      ipcRenderer.removeAllListeners('device:list-updated');
    },
  },

  /**
   * Diagnóstico de red Wi-Fi
   */
  wifi: {
    getSsid:       () => ipcRenderer.invoke('wifi:get-ssid'),
    scanNetworks:  () => ipcRenderer.invoke('wifi:scan-networks'),
  },

  /**
   * Red — acceso directo a la tarjeta de red Wi-Fi del equipo
   */
  network: {
    getCurrentSSID:  () => ipcRenderer.invoke('network:getCurrentSSID'),
    scanAvailable:   () => ipcRenderer.invoke('network:scanAvailable'),
    scanNetworksFull:() => ipcRenderer.invoke('wifi:scan-networks'),
  },

  /**
   * Control de zoom/escala de pantalla
   */
  screen: {
    getZoom: () => ipcRenderer.invoke('app:get-zoom'),
    setZoom: (factor) => ipcRenderer.invoke('app:set-zoom', factor),
    toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
    isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),
  },

  /**
   * Red LAN local — sincronización entre terminales (Admin = Servidor, Cajeros = Clientes)
   */
  lan: {
    startServer: () => ipcRenderer.invoke('lan:start-server'),
    startClient: (opts) => ipcRenderer.invoke('lan:start-client', opts),
    stop: () => ipcRenderer.invoke('lan:stop'),
    emitEvent: (event) => ipcRenderer.invoke('lan:emit-event', event),
    getStatus: () => ipcRenderer.invoke('lan:get-status'),
    getClients: () => ipcRenderer.invoke('lan:get-clients'),
    getLocalIp: () => ipcRenderer.invoke('lan:get-local-ip'),
    sendAuditRequest: (terminalId) => ipcRenderer.invoke('lan:send-audit-request', terminalId),
    sendAuditResponse: (data) => ipcRenderer.invoke('lan:send-audit-response', data),

    startHttp: () => ipcRenderer.invoke('lan:start-http'),
    stopHttp: () => ipcRenderer.invoke('lan:stop-http'),
    getHttpStatus: () => ipcRenderer.invoke('lan:get-http-status'),

    setAuthData: (data) => ipcRenderer.invoke('lan:set-auth-data', data),
    getActiveTerminals: () => ipcRenderer.invoke('lan:get-active-terminals'),
    discoverServers: () => ipcRenderer.invoke('lan:discover-servers'),
    pushTallerOrden: (data) => ipcRenderer.invoke('lan:push-taller-orden', data),
    getTechStatus: (userId) => ipcRenderer.invoke('lan:get-tech-status', userId),

    onClientConnected: (cb) =>
      ipcRenderer.on('lan:client-connected', (_e, d) => cb(d)),
    onClientDisconnected: (cb) =>
      ipcRenderer.on('lan:client-disconnected', (_e, d) => cb(d)),
    onEventReceived: (cb) =>
      ipcRenderer.on('lan:event-received', (_e, d) => cb(d)),
    onConnectionStatus: (cb) =>
      ipcRenderer.on('lan:connection-status', (_e, d) => cb(d)),
    onAuditRequest: (cb) =>
      ipcRenderer.on('lan:audit-request', (_e, d) => cb(d)),

    removeAllListeners: () => {
      [
        'lan:client-connected', 'lan:client-disconnected', 'lan:event-received',
        'lan:connection-status', 'lan:audit-request',
      ].forEach(ch => ipcRenderer.removeAllListeners(ch));
    },
  },

  /**
   * Impresión nativa Electron — sin popup ni ventanas emergentes
   */
  print: {
    printHtml: (data) => ipcRenderer.invoke('print:html', data),
  },

  /**
   * 🛡️ BLINDAJE — Respaldo automático en ruta segura fuera de %AppData%
   * Ver electron/backupManager.js
   */
  backup: {
    // Guarda un JSON ya serializado (todas las stores de IndexedDB) en la ruta blindada
    saveSafe: (jsonString) => ipcRenderer.invoke('backup:save-safe', jsonString),
    // Lista los backups disponibles en la ruta blindada (metadata, sin contenido)
    list: () => ipcRenderer.invoke('backup:list'),
    // Lee el contenido JSON de un backup específico por nombre de archivo
    read: (fileName) => ipcRenderer.invoke('backup:read', fileName),
    // Info del último backup exitoso (fecha, tamaño)
    getLastInfo: () => ipcRenderer.invoke('backup:get-last-info'),
    // Ruta absoluta de la carpeta de backups
    getDir: () => ipcRenderer.invoke('backup:get-dir'),
    // "Reparar": limpia el storage local corrupto (IndexedDB/localStorage) de la app
    repair: () => ipcRenderer.invoke('backup:repair'),

    // El proceso Main pide un backup final antes de cerrar limpiamente la app.
    onBeforeQuitBackup: (cb) => ipcRenderer.on('app:before-quit-backup', () => cb()),
    // El renderer confirma que el backup de cierre ya terminó (o falló) para que Main pueda salir.
    notifyQuitBackupComplete: () => ipcRenderer.send('backup:on-quit-complete'),
  },

  /**
   * Facturación electrónica DIAN — certificado/PIN cifrados con safeStorage.
   * El contenido real nunca vuelve al renderer, solo metadata/booleanos.
   * Ver electron/dianSecrets.js
   */
  dian: {
    guardarCertificado: (perfilFiscalId, base64, nombreArchivo) =>
      ipcRenderer.invoke('dian:guardar-certificado', { perfilFiscalId, base64, nombreArchivo }),
    obtenerMetadataCertificado: (perfilFiscalId) => ipcRenderer.invoke('dian:obtener-metadata-certificado', perfilFiscalId),
    existeCertificado: (perfilFiscalId) => ipcRenderer.invoke('dian:existe-certificado', perfilFiscalId),
    eliminarCertificado: (perfilFiscalId) => ipcRenderer.invoke('dian:eliminar-certificado', perfilFiscalId),
    guardarPin: (perfilFiscalId, pin) => ipcRenderer.invoke('dian:guardar-pin', { perfilFiscalId, pin }),
    existePin: (perfilFiscalId) => ipcRenderer.invoke('dian:existe-pin', perfilFiscalId),
    eliminarPin: (perfilFiscalId) => ipcRenderer.invoke('dian:eliminar-pin', perfilFiscalId),
    // Firma digital XAdES-EPES real — ver electron/dianSigner.js
    firmarDocumento: (perfilFiscalId, base64) => ipcRenderer.invoke('dian:firmar-documento', perfilFiscalId, base64),
    // Transmisión SOAP real a la DIAN — ver electron/dianSoapClient.js
    enviarFacturaSync: (perfilFiscalId, fileName, xmlFirmado, ambiente) =>
      ipcRenderer.invoke('dian:enviar-factura-sync', perfilFiscalId, fileName, xmlFirmado, ambiente),
    enviarSetPruebas: (perfilFiscalId, fileName, xmlFirmado, testSetId) =>
      ipcRenderer.invoke('dian:enviar-set-pruebas', perfilFiscalId, fileName, xmlFirmado, testSetId),
    consultarEstado: (perfilFiscalId, trackId, ambiente) =>
      ipcRenderer.invoke('dian:consultar-estado', perfilFiscalId, trackId, ambiente),
    consultarRangoNumeracion: (perfilFiscalId, ambiente, accountCode, accountCodeT, softwareCode) =>
      ipcRenderer.invoke('dian:consultar-rango-numeracion', perfilFiscalId, ambiente, accountCode, accountCodeT, softwareCode),
  },

  /**
   * 🛡️ BLINDAJE — Caja negra de auditoría física (.log en disco)
   */
  logs: {
    readRecent: (limit) => ipcRenderer.invoke('logs:read-recent', limit),
    write: (level, message, meta) => ipcRenderer.invoke('logs:write', { level, message, meta }),
    getDir: () => ipcRenderer.invoke('logs:get-dir'),
  },

  /**
   * 🛡️ BLINDAJE — Telemetría del sistema para la Sección de Desarrollador
   */
  system: {
    getTelemetry: () => ipcRenderer.invoke('system:get-telemetry'),
    getDiskSpace: () => ipcRenderer.invoke('system:get-disk-space'),
  },

  /**
   * Relanzar la aplicación (usado tras restaurar/reparar la base de datos)
   */
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
});

// ✅ API para sistema de usuarios (persistencia en Electron)
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Guardar usuarios en archivo persistente de userData
   * @param {Array} usuarios - Array de usuarios a guardar
   * @returns {Promise<{success: boolean, path?: string, count?: number, error?: string}>}
   */
  guardarUsuarios: (usuarios) => ipcRenderer.invoke('guardar-usuarios', usuarios),

  /**
   * Cargar usuarios desde archivo persistente de userData
   * @returns {Promise<{success: boolean, usuarios: Array, source: string, error?: string}>}
   */
  cargarUsuarios: () => ipcRenderer.invoke('cargar-usuarios'),

  /**
   * Verificar integridad de archivos de usuarios
   * @returns {Promise<{success: boolean, mainFileExists: boolean, backupFileExists: boolean}>}
   */
  verificarUsuarios: () => ipcRenderer.invoke('verificar-usuarios'),
});

console.log('✅ CODEC POS Preload Script cargado correctamente');
