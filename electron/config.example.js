/**
 * CODEC POS - Archivo de Configuración de Ejemplo
 * 
 * INSTRUCCIONES:
 * 1. Copiar este archivo y renombrarlo a config.js
 * 2. Modificar los valores según tu instalación
 * 3. El archivo config.js será usado por main.js si existe
 * 
 * IMPORTANTE: No subir config.js a Git (ya está en .gitignore)
 */

module.exports = {
  // ============================================
  // SEGURIDAD
  // ============================================
  
  // Contraseña de administrador para salir del modo kiosko
  // CAMBIAR ESTA CONTRASEÑA EN PRODUCCIÓN
  adminPassword: 'codecstudio2024',
  
  // ============================================
  // MODO KIOSKO
  // ============================================
  
  // Activar/desactivar modo kiosko
  kioskMode: true,
  
  // Bloquear atajos del sistema (Alt+Tab, etc.)
  blockSystemShortcuts: true,
  
  // Atajo para salir (Ctrl+Shift+Q por defecto)
  exitShortcut: 'CommandOrControl+Shift+Q',
  
  // ============================================
  // BACKEND
  // ============================================
  
  // Puerto del servidor backend
  backendPort: 3969,
  
  // Host del backend (no cambiar a menos que sepas lo que haces)
  backendHost: '127.0.0.1',
  
  // ============================================
  // RED Y SINCRONIZACIÓN
  // ============================================
  
  // IP de la Caja Maestra (terminal principal)
  // Cambiar por la IP real de tu Caja Maestra
  masterBoxIP: '192.168.1.100',
  
  // Puerto de la Caja Maestra
  masterBoxPort: 3969,
  
  // Intervalo de verificación de red (en segundos)
  networkCheckInterval: 30,
  
  // Intervalo de sincronización automática (en segundos)
  autoSyncInterval: 60,
  
  // ============================================
  // PERSISTENCIA
  // ============================================
  
  // Nombre de la carpeta de datos en AppData
  // Cambiar si quieres usar un nombre diferente
  appDataFolder: 'CodecPOS',
  
  // Nombre del archivo de base de datos
  databaseFile: 'data.db',
  
  // Hacer backup automático antes de actualizar
  autoBackup: true,
  
  // ============================================
  // HARDWARE
  // ============================================
  
  // Puerto serial de la impresora (dejar null para auto-detectar)
  printerPort: null, // Ej: 'COM3' o '/dev/ttyUSB0'
  
  // Baudrate de la impresora
  printerBaudRate: 9600,
  
  // Puerto serial de la báscula (dejar null para auto-detectar)
  scalePort: null, // Ej: 'COM4' o '/dev/ttyUSB1'
  
  // Baudrate de la báscula
  scaleBaudRate: 9600,
  
  // ============================================
  // DESARROLLO
  // ============================================
  
  // Modo desarrollo (muestra DevTools)
  devMode: false,
  
  // Puerto del servidor Vite en desarrollo
  vitePort: 5173,
  
  // Logs detallados
  verboseLogs: false,
  
  // ============================================
  // VENTANA
  // ============================================
  
  // Ancho de ventana en modo normal (no kiosko)
  windowWidth: 1920,
  
  // Alto de ventana en modo normal (no kiosko)
  windowHeight: 1080,
  
  // Frame (barra de título)
  windowFrame: false,
  
  // Resizable
  windowResizable: false,
  
  // ============================================
  // SPLASH SCREEN
  // ============================================
  
  // Duración del splash screen (en milisegundos)
  splashDuration: 3000,
  
  // Ancho del splash screen
  splashWidth: 600,
  
  // Alto del splash screen
  splashHeight: 400,
  
  // ============================================
  // EMPRESA
  // ============================================
  
  // Estos valores son sobrescritos por la configuración en la app
  // Se usan solo si no hay configuración guardada
  
  company: {
    razonSocial: '',
    nombreComercial: 'Mi Minimercado',
    nit: '',
    direccion: '',
    telefono: '',
    email: '',
    ciudad: '',
  },
  
  // ============================================
  // FACTURACIÓN ELECTRÓNICA (Futuro)
  // ============================================
  
  // Habilitar facturación electrónica DIAN
  electronicInvoicing: false,
  
  // Proveedor de facturación (Ej: 'alegra', 'siigo', 'custom')
  invoicingProvider: null,
  
  // API Key del proveedor
  invoicingAPIKey: null,
  
  // ============================================
  // ACTUALIZACIONES (Futuro)
  // ============================================
  
  // Habilitar actualizaciones automáticas
  autoUpdate: false,
  
  // URL del servidor de actualizaciones
  updateServerURL: 'https://updates.codecstudio.com/codecpos',
  
  // Verificar actualizaciones al iniciar
  checkUpdatesOnStartup: true,
  
  // ============================================
  // LÍMITES Y RESTRICCIONES
  // ============================================
  
  // Máximo de usuarios por terminal
  maxUsers: 5,
  
  // Máximo de productos en inventario
  maxProducts: 10000,
  
  // Máximo de ventas en historial local
  maxSalesHistory: 5000,
  
  // Días para eliminar ventas antiguas (0 = nunca)
  daysToKeepSales: 365,
  
  // ============================================
  // TERMINAL
  // ============================================
  
  // ID único de esta terminal (auto-generado si está vacío)
  terminalID: '',
  
  // Nombre de esta terminal
  terminalName: 'Terminal 1',
  
  // Es caja maestra?
  isMasterBox: false,
};

/*
 * NOTAS:
 * 
 * 1. Este archivo es solo un ejemplo
 * 2. Copiar a config.js y personalizar
 * 3. El archivo config.js no se sube a Git por seguridad
 * 4. Si config.js no existe, se usan valores por defecto
 * 
 * SEGURIDAD:
 * - Nunca compartir config.js con contraseñas reales
 * - Cambiar adminPassword antes de producción
 * - Proteger API keys de facturación
 * 
 * SOPORTE:
 * - Web: https://codecstudio.online
 * - Email: soporte@codecstudio.com
 */
