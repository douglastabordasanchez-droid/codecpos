import { dbManager } from './indexedDB';

/**
 * CODEC POS v2.0 - Sistema de Permisos y Control de Módulos
 * Controla qué funcionalidades están disponibles para cada usuario y cliente
 */

// 🔐 Módulos/Funcionalidades del Sistema
export enum ModuloPOS {
  // ── VENTAS ──
  PUNTO_DE_VENTA    = 'punto_de_venta',
  VENTAS_HISTORIAL  = 'ventas_historial',
  DEVOLUCIONES      = 'devoluciones',
  CIERRE_CAJA       = 'cierre_caja',
  GASTOS            = 'gastos',

  // ── INVENTARIO ──
  PRODUCTOS         = 'productos',
  CODIGOS_BARRAS    = 'codigos_barras',
  ALERTAS_STOCK     = 'alertas_stock',
  PANADERIA_ONCES   = 'panaderia_onces',

  // ── CLIENTES ──
  CLIENTES          = 'clientes',
  FIDELIZACION      = 'fidelizacion',

  // ── GESTIÓN ──
  EMPLEADOS         = 'empleados',
  USUARIOS          = 'usuarios',
  PROVEEDORES       = 'proveedores',
  PROMOCIONES       = 'promociones',
  MULTITIENDA       = 'multitienda',

  // ── REPORTES Y ANÁLISIS ──
  DASHBOARD         = 'dashboard',
  REPORTES          = 'reportes',
  CONTABILIDAD      = 'contabilidad',

  // ── CONFIGURACIÓN Y HERRAMIENTAS ──
  CONFIGURACION     = 'configuracion',
  DISPOSITIVOS      = 'dispositivos',
  BACKUP_RESTORE    = 'backup_restore',
  EXPORTAR_DATOS    = 'exportar_datos',
  CONFIGURACION_IMPRESORA = 'configuracion_impresora',
  MARGEN_GANANCIA_AUTO    = 'margen_ganancia_auto',

  // ── PREMIUM / INTEGRACIONES ──
  CODEC_VERIFY         = 'codec_verify',
  INTEGRACIONES        = 'integraciones',
  TALLER_REPARACIONES  = 'taller_reparaciones',
  FACTURACION_DIAN     = 'facturacion_dian',
  INTEGRACION_SIIGO    = 'integracion_siigo',
  REPORTES_AVANZADOS   = 'reportes_avanzados',

  // ── OPERACIONES / RED ──
  MONITOREO_TERMINALES = 'monitoreo_terminales',

  // ── DESARROLLADOR ──
  AREA_DESARROLLADOR = 'area_desarrollador',
  MODO_DEBUG         = 'modo_debug',
}

// 📋 Información de cada módulo
export interface ModuloInfo {
  id: ModuloPOS;
  nombre: string;
  descripcion: string;
  icono: string;
  categoria: 'ventas' | 'inventario' | 'clientes' | 'gestion' | 'reportes' | 'configuracion' | 'premium' | 'desarrollador';
  planRequerido: 'basico' | 'premium';
  habilitadoPorDefecto: boolean;
}

// 🎯 Catálogo completo de módulos
export const MODULOS_CATALOGO: ModuloInfo[] = [
  // ========== VENTAS ==========
  {
    id: ModuloPOS.PUNTO_DE_VENTA,
    nombre: 'Punto de Venta',
    descripcion: 'Pantalla principal de cobro y atención al cliente',
    icono: '🛒',
    categoria: 'ventas',
    planRequerido: 'basico',
    habilitadoPorDefecto: true,
  },
  {
    id: ModuloPOS.VENTAS_HISTORIAL,
    nombre: 'Historial de Ventas',
    descripcion: 'Consulta y gestión del historial de transacciones',
    icono: '🧾',
    categoria: 'ventas',
    planRequerido: 'basico',
    habilitadoPorDefecto: true,
  },
  {
    id: ModuloPOS.DEVOLUCIONES,
    nombre: 'Devoluciones',
    descripcion: 'Gestión de devoluciones y cambios de productos',
    icono: '↩️',
    categoria: 'ventas',
    planRequerido: 'basico',
    habilitadoPorDefecto: true,
  },
  {
    id: ModuloPOS.CIERRE_CAJA,
    nombre: 'Cierre de Caja',
    descripcion: 'Corte y cuadre al final del turno',
    icono: '🧮',
    categoria: 'ventas',
    planRequerido: 'basico',
    habilitadoPorDefecto: true,
  },
  {
    id: ModuloPOS.GASTOS,
    nombre: 'Gastos',
    descripcion: 'Registro y control de gastos operativos',
    icono: '💸',
    categoria: 'ventas',
    planRequerido: 'basico',
    habilitadoPorDefecto: true,
  },

  // ========== INVENTARIO ==========
  {
    id: ModuloPOS.PRODUCTOS,
    nombre: 'Inventario / Productos',
    descripcion: 'Gestión de catálogo, stock y vencimientos',
    icono: '📦',
    categoria: 'inventario',
    planRequerido: 'basico',
    habilitadoPorDefecto: true,
  },
  {
    id: ModuloPOS.CODIGOS_BARRAS,
    nombre: 'Códigos de Barras',
    descripcion: 'Generador de etiquetas PLU y EAN-13',
    icono: '🔢',
    categoria: 'inventario',
    planRequerido: 'basico',
    habilitadoPorDefecto: true,
  },
  {
    id: ModuloPOS.ALERTAS_STOCK,
    nombre: 'Alertas de Stock',
    descripcion: 'Notificaciones de productos bajos o vencidos',
    icono: '🔔',
    categoria: 'inventario',
    planRequerido: 'basico',
    habilitadoPorDefecto: true,
  },
  {
    id: ModuloPOS.PANADERIA_ONCES,
    nombre: 'Alimentos y Bebidas',
    descripcion: 'Mesas, comandas, recetas, mermas y combos de cocina, cafetería y panadería',
    icono: '☕',
    categoria: 'inventario',
    planRequerido: 'basico',
    habilitadoPorDefecto: true,
  },

  // ========== CLIENTES ==========
  {
    id: ModuloPOS.CLIENTES,
    nombre: 'Clientes',
    descripcion: 'Base de datos de clientes frecuentes',
    icono: '👥',
    categoria: 'clientes',
    planRequerido: 'basico',
    habilitadoPorDefecto: true,
  },
  {
    id: ModuloPOS.FIDELIZACION,
    nombre: 'Fidelización',
    descripcion: 'Programa de puntos y recompensas para clientes',
    icono: '🎁',
    categoria: 'clientes',
    planRequerido: 'basico',
    habilitadoPorDefecto: false,
  },

  // ========== GESTIÓN ==========
  {
    id: ModuloPOS.EMPLEADOS,
    nombre: 'Empleados',
    descripcion: 'Administración de personal y nómina básica',
    icono: '👨‍💼',
    categoria: 'gestion',
    planRequerido: 'basico',
    habilitadoPorDefecto: true,
  },
  {
    id: ModuloPOS.USUARIOS,
    nombre: 'Usuarios del Sistema',
    descripcion: 'Creación y gestión de cajeros y operarios',
    icono: '🔐',
    categoria: 'gestion',
    planRequerido: 'basico',
    habilitadoPorDefecto: true,
  },
  {
    id: ModuloPOS.PROVEEDORES,
    nombre: 'Proveedores',
    descripcion: 'Directorio y pedidos a proveedores',
    icono: '🚚',
    categoria: 'gestion',
    planRequerido: 'basico',
    habilitadoPorDefecto: false,
  },
  {
    id: ModuloPOS.PROMOCIONES,
    nombre: 'Promociones',
    descripcion: '2x1, descuentos y ofertas por tiempo',
    icono: '🏷️',
    categoria: 'gestion',
    planRequerido: 'basico',
    habilitadoPorDefecto: false,
  },
  {
    id: ModuloPOS.MULTITIENDA,
    nombre: 'Multi-Tienda',
    descripcion: 'Gestión de varias sucursales desde un punto',
    icono: '🏪',
    categoria: 'gestion',
    planRequerido: 'premium',
    habilitadoPorDefecto: false,
  },

  // ========== REPORTES ==========
  {
    id: ModuloPOS.DASHBOARD,
    nombre: 'Dashboard Ejecutivo',
    descripcion: 'Panel con utilidades y métricas en tiempo real',
    icono: '📊',
    categoria: 'reportes',
    planRequerido: 'premium',
    habilitadoPorDefecto: false,
  },
  {
    id: ModuloPOS.REPORTES,
    nombre: 'Reportes',
    descripcion: 'Informes de ventas, inventario y caja',
    icono: '📄',
    categoria: 'reportes',
    planRequerido: 'basico',
    habilitadoPorDefecto: true,
  },
  {
    id: ModuloPOS.REPORTES_AVANZADOS,
    nombre: 'Reportes Avanzados',
    descripcion: 'Análisis predictivo, tendencias y exportación Excel',
    icono: '📈',
    categoria: 'reportes',
    planRequerido: 'premium',
    habilitadoPorDefecto: false,
  },
  {
    id: ModuloPOS.CONTABILIDAD,
    nombre: 'Contabilidad',
    descripcion: 'Ingresos, gastos, balance y flujo de caja editable',
    icono: '🧾',
    categoria: 'reportes',
    planRequerido: 'basico',
    habilitadoPorDefecto: true,
  },

  // ========== CONFIGURACIÓN ==========
  {
    id: ModuloPOS.CONFIGURACION,
    nombre: 'Configuración General',
    descripcion: 'Datos del negocio, impuestos y preferencias',
    icono: '⚙️',
    categoria: 'configuracion',
    planRequerido: 'basico',
    habilitadoPorDefecto: true,
  },
  {
    id: ModuloPOS.DISPOSITIVOS,
    nombre: 'Dispositivos',
    descripcion: 'Gestión de hardware conectado al POS',
    icono: '🖥️',
    categoria: 'configuracion',
    planRequerido: 'basico',
    habilitadoPorDefecto: true,
  },
  {
    id: ModuloPOS.CONFIGURACION_IMPRESORA,
    nombre: 'Impresora Térmica',
    descripcion: 'Parámetros de impresión de tiquetes',
    icono: '🖨️',
    categoria: 'configuracion',
    planRequerido: 'basico',
    habilitadoPorDefecto: true,
  },
  {
    id: ModuloPOS.BACKUP_RESTORE,
    nombre: 'Backup y Restauración',
    descripcion: 'Respaldo y recuperación de datos',
    icono: '💾',
    categoria: 'configuracion',
    planRequerido: 'premium',
    habilitadoPorDefecto: false,
  },
  {
    id: ModuloPOS.EXPORTAR_DATOS,
    nombre: 'Exportar Datos',
    descripcion: 'Descarga de datos en Excel o CSV',
    icono: '📥',
    categoria: 'configuracion',
    planRequerido: 'basico',
    habilitadoPorDefecto: true,
  },
  {
    id: ModuloPOS.MARGEN_GANANCIA_AUTO,
    nombre: 'Margen Automático',
    descripcion: 'Cálculo automático del precio de venta',
    icono: '💹',
    categoria: 'configuracion',
    planRequerido: 'premium',
    habilitadoPorDefecto: false,
  },

  // ========== PREMIUM / INTEGRACIONES ==========
  {
    id: ModuloPOS.CODEC_VERIFY,
    nombre: 'Codec Verify',
    descripcion: 'Notificaciones en tiempo real vía app móvil',
    icono: '⚡',
    categoria: 'premium',
    planRequerido: 'premium',
    habilitadoPorDefecto: false,
  },
  {
    id: ModuloPOS.INTEGRACIONES,
    nombre: 'Integraciones',
    descripcion: 'Conectores y servicios externos del sistema',
    icono: '🔗',
    categoria: 'premium',
    planRequerido: 'premium',
    habilitadoPorDefecto: false,
  },
  {
    id: ModuloPOS.TALLER_REPARACIONES,
    nombre: 'Taller de Reparaciones',
    descripcion: 'Gestión de órdenes de servicio y reparaciones',
    icono: '🔧',
    categoria: 'premium',
    planRequerido: 'premium',
    // 🛡️ FIX: con `false` este módulo completo quedaba invisible en CUALQUIER
    // instalación nueva (o cuando se reinicia la config global de módulos),
    // para TODOS los usuarios incluido el Admin — la pantalla de Configuración
    // que activa/desactiva módulos globalmente respeta este valor por
    // defecto, y no hay forma de "encontrarlo" si empieza apagado.
    habilitadoPorDefecto: true,
  },
  {
    id: ModuloPOS.MONITOREO_TERMINALES,
    nombre: 'Monitoreo de Terminales',
    descripcion: 'Supervisión en tiempo real de cajas y terminales conectadas en red local',
    icono: '📡',
    categoria: 'gestion',
    planRequerido: 'premium',
    habilitadoPorDefecto: true,
  },
  {
    id: ModuloPOS.FACTURACION_DIAN,
    nombre: 'Facturación Electrónica DIAN',
    descripcion: 'Generación de facturas válidas ante la DIAN',
    icono: '🏛️',
    categoria: 'premium',
    planRequerido: 'premium',
    habilitadoPorDefecto: false,
  },
  {
    id: ModuloPOS.INTEGRACION_SIIGO,
    nombre: 'Integración Siigo',
    descripcion: 'Sincronización automática con Siigo contabilidad',
    icono: '🔌',
    categoria: 'premium',
    planRequerido: 'premium',
    habilitadoPorDefecto: false,
  },

  // ========== DESARROLLADOR ==========
  {
    id: ModuloPOS.AREA_DESARROLLADOR,
    nombre: 'Área de Desarrollador',
    descripcion: 'Panel de licencias y gestión de clientes',
    icono: '🛡️',
    categoria: 'desarrollador',
    planRequerido: 'premium',
    habilitadoPorDefecto: true,
  },
  {
    id: ModuloPOS.MODO_DEBUG,
    nombre: 'Modo Debug',
    descripcion: 'Herramientas de depuración y diagnóstico',
    icono: '🐛',
    categoria: 'desarrollador',
    planRequerido: 'premium',
    habilitadoPorDefecto: false,
  },
];

// 🎯 Lista oficial para licenciamiento de clientes (23 módulos operativos)
export const MODULOS_CLIENTE_OFICIALES: ModuloPOS[] = [
  ModuloPOS.PUNTO_DE_VENTA,
  ModuloPOS.PRODUCTOS,
  ModuloPOS.VENTAS_HISTORIAL,
  ModuloPOS.DEVOLUCIONES,
  ModuloPOS.DASHBOARD,
  ModuloPOS.CIERRE_CAJA,
  ModuloPOS.REPORTES,
  ModuloPOS.GASTOS,
  ModuloPOS.CONTABILIDAD,
  ModuloPOS.CONFIGURACION,
  ModuloPOS.DISPOSITIVOS,
  ModuloPOS.USUARIOS,
  ModuloPOS.EMPLEADOS,
  ModuloPOS.ALERTAS_STOCK,
  ModuloPOS.PANADERIA_ONCES,
  ModuloPOS.FIDELIZACION,
  ModuloPOS.PROVEEDORES,
  ModuloPOS.PROMOCIONES,
  ModuloPOS.MULTITIENDA,
  ModuloPOS.CODIGOS_BARRAS,
  ModuloPOS.INTEGRACIONES,
  ModuloPOS.TALLER_REPARACIONES,
  ModuloPOS.CODEC_VERIFY,
  ModuloPOS.MONITOREO_TERMINALES,
];

// 👑 Lista oficial del perfil maestro (24 = 23 operativos + desarrollador)
export const MODULOS_MAESTRO_OFICIALES: ModuloPOS[] = [
  ...MODULOS_CLIENTE_OFICIALES,
  ModuloPOS.AREA_DESARROLLADOR,
];

// 🔐 Permisos de usuario (dentro de una instalación)
export interface PermisosUsuario {
  userId: string;
  modulosHabilitados: ModuloPOS[];
}

// 🌍 Configuración global de módulos (activados a nivel sistema)
export interface ConfiguracionModulosGlobal {
  modulosActivos: ModuloPOS[];
  forceGlobalModules: boolean;
  ultimaActualizacion: string;
}

export interface ConfiguracionLicenciaDesarrollador {
  soporteTecnico: boolean;
  modulosOcultos: ModuloPOS[];
  ultimaActualizacion: string;
}

// 🏪 Configuración de módulos por cliente (gestiónada por el desarrollador)
export interface ConfiguracionModulosCliente {
  clienteId: string;
  modulosActivos: ModuloPOS[];       // módulos que el dev activó para este cliente
  modulosDesactivados: ModuloPOS[];  // módulos que el dev desactivó para este cliente
  ultimaActualizacion: string;
}

export interface ConfiguracionModuloPersonalizado {
  id: ModuloPOS;
  nombre?: string;
  icono?: string;
  color?: string;
  ultimaActualizacion?: string;
}

interface ClienteDesarrollador {
  id: string;
  plan?: 'BASICO' | 'PREMIUM';
}

// 💾 LocalStorage Keys
const STORAGE_KEYS = {
  MODULOS_GLOBALES:   'codec_pos_modulos_globales',
  LICENCIA_DESARROLLADOR: 'codec_pos_licencia_desarrollador',
  MODULOS_PERSONALIZADOS: 'codec_pos_modulos_personalizados',
  PERMISOS_USUARIOS:  'codec_pos_permisos_usuarios',
  MODULOS_CLIENTE:    'codec_pos_modulos_cliente', // + _{clienteId}
};

export const EVENTO_PERMISOS_ACTUALIZADOS = 'codecpos:permisos-actualizados';
export const EVENTO_MODULOS_GLOBALES_ACTUALIZADOS = 'codecpos:modulos-globales-actualizados';
export const EVENTO_LICENCIA_DESARROLLADOR_ACTUALIZADA = 'codecpos:licencia-desarrollador-actualizada';
const INDEXEDDB_PERMISOS_KEY = 'codec_pos_permisos_usuarios';

function obtenerClienteDesarrolladorPorId(clienteId: string): ClienteDesarrollador | null {
  try {
    const raw = localStorage.getItem('codecpos_dev_clientes');
    if (!raw) return null;
    const clientes = JSON.parse(raw) as ClienteDesarrollador[];
    return clientes.find((c) => c.id === clienteId) || null;
  } catch {
    return null;
  }
}

function obtenerModulosBasePorUsuario(userId: string): ModuloPOS[] {
  const cliente = obtenerClienteDesarrolladorPorId(userId);
  if (cliente) {
    return obtenerModulosCliente(cliente.id, cliente.plan).modulosActivos;
  }

  return [...MODULOS_CLIENTE_OFICIALES];
}

// ============================================================
// FUNCIONES DE GESTIÓN GLOBAL
// ============================================================

// 🛡️ FIX ESTRUCTURAL: antes esto dependía de una lista mantenida a mano
// (MODULOS_A_FUSIONAR) que había que recordar actualizar CADA VEZ que se
// agregaba un módulo nuevo al catálogo — y durante mucho tiempo no se hizo,
// así que en cualquier instalación que ya tuviera guardada su configuración
// de módulos (como esta), TODO módulo agregado después del primer arranque
// quedaba invisible para siempre, sin importar los permisos que el Admin le
// diera a un usuario (Fidelización, Proveedores, Promociones, Multitienda,
// Dashboard, Taller, CodecVerify, etc. — más de una decena de módulos).
// Ahora la fusión es genérica: en cada arranque con una versión de fusión
// nueva, se agregan automáticamente TODOS los módulos del catálogo marcados
// `habilitadoPorDefecto: true` que aún no estén en la config guardada — sin
// tener que mantener una lista manual nunca más. Lo que el Admin haya
// apagado explícitamente después sigue respetándose (no se vuelve a forzar).
const MODULOS_MERGE_VERSION_ACTUAL = 3;
const STORAGE_KEY_MERGE_VERSION = 'codec_pos_modulos_merge_version';

export function obtenerModulosGlobales(): ConfiguracionModulosGlobal {
  const saved = localStorage.getItem(STORAGE_KEYS.MODULOS_GLOBALES);
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as Partial<ConfiguracionModulosGlobal>;
      let modulosActivos = Array.isArray(parsed.modulosActivos)
        ? parsed.modulosActivos.filter((id): id is ModuloPOS => MODULOS_CATALOGO.some((m) => m.id === id))
        : [];

      const mergeVersion = Number(localStorage.getItem(STORAGE_KEY_MERGE_VERSION) || '0');
      if (mergeVersion < MODULOS_MERGE_VERSION_ACTUAL) {
        const modulosPorDefectoIds = MODULOS_CATALOGO.filter(m => m.habilitadoPorDefecto).map(m => m.id);
        const faltantes = modulosPorDefectoIds.filter((id) => !modulosActivos.includes(id));
        if (faltantes.length > 0) modulosActivos = [...modulosActivos, ...faltantes];
        try { localStorage.setItem(STORAGE_KEY_MERGE_VERSION, String(MODULOS_MERGE_VERSION_ACTUAL)); } catch {}
      }

      const config: ConfiguracionModulosGlobal = {
        modulosActivos,
        forceGlobalModules: parsed.forceGlobalModules === true,
        ultimaActualizacion: parsed.ultimaActualizacion || new Date().toISOString(),
      };
      if (mergeVersion < MODULOS_MERGE_VERSION_ACTUAL) guardarModulosGlobales(config);
      return config;
    } catch {
      // Si el JSON no es válido, se recrea abajo con valores por defecto.
    }
  }

  const modulosPorDefecto = MODULOS_CATALOGO
    .filter(m => m.habilitadoPorDefecto)
    .map(m => m.id);

  const config: ConfiguracionModulosGlobal = {
    modulosActivos: modulosPorDefecto,
    forceGlobalModules: false,
    ultimaActualizacion: new Date().toISOString(),
  };
  guardarModulosGlobales(config);
  return config;
}

export function guardarModulosGlobales(config: ConfiguracionModulosGlobal): void {
  const normalizado: ConfiguracionModulosGlobal = {
    modulosActivos: Array.from(new Set((config.modulosActivos || []).filter((id) => MODULOS_CATALOGO.some((m) => m.id === id)))),
    forceGlobalModules: config.forceGlobalModules === true,
    ultimaActualizacion: new Date().toISOString(),
  };

  localStorage.setItem(STORAGE_KEYS.MODULOS_GLOBALES, JSON.stringify(normalizado));

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENTO_MODULOS_GLOBALES_ACTUALIZADOS, {
      detail: normalizado,
    }));
  }
}

export function obtenerLicenciaDesarrollador(): ConfiguracionLicenciaDesarrollador {
  const saved = localStorage.getItem(STORAGE_KEYS.LICENCIA_DESARROLLADOR);
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as Partial<ConfiguracionLicenciaDesarrollador>;
      return {
        soporteTecnico: parsed.soporteTecnico !== false,
        modulosOcultos: Array.isArray(parsed.modulosOcultos)
          ? parsed.modulosOcultos.filter((id): id is ModuloPOS => MODULOS_CATALOGO.some((m) => m.id === id))
          : [],
        ultimaActualizacion: parsed.ultimaActualizacion || new Date().toISOString(),
      };
    } catch {
      // Se cae al default seguro.
    }
  }

  // 🛡️ FIX: no existe ninguna pantalla en la app que llame a
  // guardarLicenciaDesarrollador() — este flag nunca se guarda desde ninguna
  // UI. Con el valor por defecto en `false`, Taller de Reparaciones (el único
  // módulo que este flag controla) quedaba invisible SIEMPRE, para
  // cualquier usuario, en cualquier instalación nueva, sin forma de
  // reactivarlo. El caso "ya existe una configuración guardada" (arriba)
  // YA asumía habilitado por defecto (`!== false`) — este fallback ahora
  // hace lo mismo para ser consistente.
  return {
    soporteTecnico: true,
    modulosOcultos: [],
    ultimaActualizacion: new Date().toISOString(),
  };
}

export function guardarLicenciaDesarrollador(config: ConfiguracionLicenciaDesarrollador): void {
  const normalizado: ConfiguracionLicenciaDesarrollador = {
    soporteTecnico: config.soporteTecnico === true,
    modulosOcultos: Array.from(new Set((config.modulosOcultos || []).filter((id) => MODULOS_CATALOGO.some((m) => m.id === id)))),
    ultimaActualizacion: new Date().toISOString(),
  };

  localStorage.setItem(STORAGE_KEYS.LICENCIA_DESARROLLADOR, JSON.stringify(normalizado));

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENTO_LICENCIA_DESARROLLADOR_ACTUALIZADA, {
      detail: normalizado,
    }));
  }
}

export function esModuloPermitidoLicenciaDesarrollador(modulo: ModuloPOS): boolean {
  const licencia = obtenerLicenciaDesarrollador();

  if (licencia.modulosOcultos.includes(modulo)) {
    return false;
  }

  if (modulo === ModuloPOS.TALLER_REPARACIONES && !licencia.soporteTecnico) {
    return false;
  }

  return true;
}

export function obtenerModulosPersonalizados(): ConfiguracionModuloPersonalizado[] {
  const saved = localStorage.getItem(STORAGE_KEYS.MODULOS_PERSONALIZADOS);
  if (!saved) return [];

  try {
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is ConfiguracionModuloPersonalizado =>
        item && typeof item.id === 'string'
      );
    }
  } catch {
    // Ignorar JSON inválido y devolver lista vacía
  }

  return [];
}

export function guardarModulosPersonalizados(configs: ConfiguracionModuloPersonalizado[]): void {
  const normalized = configs
    .filter(config => MODULOS_CATALOGO.some(modulo => modulo.id === config.id))
    .map(config => ({
      ...config,
      ultimaActualizacion: new Date().toISOString(),
    }));

  localStorage.setItem(STORAGE_KEYS.MODULOS_PERSONALIZADOS, JSON.stringify(normalized));

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('codecpos:modulos-personalizados-actualizados'));
  }
}

export function obtenerModuloPersonalizado(id: ModuloPOS): ConfiguracionModuloPersonalizado | undefined {
  return obtenerModulosPersonalizados().find(config => config.id === id);
}

export function actualizarModuloPersonalizado(config: ConfiguracionModuloPersonalizado): void {
  const current = obtenerModulosPersonalizados();
  const index = current.findIndex(item => item.id === config.id);
  const updatedConfig = {
    ...current[index],
    ...config,
    ultimaActualizacion: new Date().toISOString(),
  };

  if (index >= 0) {
    current[index] = updatedConfig;
  } else {
    current.push(updatedConfig);
  }

  guardarModulosPersonalizados(current);
}

export function resetearModuloPersonalizado(moduloId: ModuloPOS): void {
  const current = obtenerModulosPersonalizados().filter(item => item.id !== moduloId);
  guardarModulosPersonalizados(current);
}

export function toggleModuloGlobal(modulo: ModuloPOS): void {
  const config = obtenerModulosGlobales();
  if (config.modulosActivos.includes(modulo)) {
    config.modulosActivos = config.modulosActivos.filter(m => m !== modulo);
  } else {
    config.modulosActivos.push(modulo);
  }
  guardarModulosGlobales(config);
}

export function esModuloActivoGlobal(modulo: ModuloPOS): boolean {
  const config = obtenerModulosGlobales();
  return config.modulosActivos.includes(modulo);
}

// ============================================================
// FUNCIONES DE GESTIÓN POR CLIENTE (DESARROLLADOR)
// ============================================================

/**
 * Obtiene los módulos configurados por el desarrollador para un cliente específico.
 * Si no hay configuración, devuelve los módulos según el plan del cliente.
 */
export function obtenerModulosCliente(clienteId: string, plan?: 'BASICO' | 'PREMIUM'): ConfiguracionModulosCliente {
  const key = `${STORAGE_KEYS.MODULOS_CLIENTE}_${clienteId}`;
  const saved = localStorage.getItem(key);
  if (saved) return JSON.parse(saved);

  // Por defecto: módulos según plan
  const modulosPorPlan = MODULOS_CLIENTE_OFICIALES.filter((id) => {
    const modulo = MODULOS_CATALOGO.find(m => m.id === id);
    if (!modulo) return false;
    if (plan === 'PREMIUM') return true;
    // Plan BÁSICO: solo módulos básicos por defecto
    return modulo.planRequerido === 'basico';
  });

  const config: ConfiguracionModulosCliente = {
    clienteId,
    modulosActivos: modulosPorPlan,
    modulosDesactivados: [],
    ultimaActualizacion: new Date().toISOString(),
  };
  return config;
}

export function guardarModulosCliente(config: ConfiguracionModulosCliente): void {
  const key = `${STORAGE_KEYS.MODULOS_CLIENTE}_${config.clienteId}`;
  config.ultimaActualizacion = new Date().toISOString();
  localStorage.setItem(key, JSON.stringify(config));

  // 🔄 Sincronización automática: el usuario principal del cliente refleja exactamente
  // los módulos definidos en Panel de Desarrollador.
  guardarPermisosUsuario({
    userId: config.clienteId,
    modulosHabilitados: [...config.modulosActivos],
  });
}

export function toggleModuloCliente(clienteId: string, modulo: ModuloPOS, plan?: 'BASICO' | 'PREMIUM'): void {
  const config = obtenerModulosCliente(clienteId, plan);

  if (config.modulosActivos.includes(modulo)) {
    config.modulosActivos = config.modulosActivos.filter(m => m !== modulo);
    if (!config.modulosDesactivados.includes(modulo)) {
      config.modulosDesactivados.push(modulo);
    }
  } else {
    config.modulosActivos.push(modulo);
    config.modulosDesactivados = config.modulosDesactivados.filter(m => m !== modulo);
  }
  guardarModulosCliente(config);
}

export function activarTodosModulosCliente(clienteId: string): void {
  const todos = [...MODULOS_CLIENTE_OFICIALES];
  guardarModulosCliente({
    clienteId,
    modulosActivos: todos,
    modulosDesactivados: [],
    ultimaActualizacion: new Date().toISOString(),
  });
}

export function resetearModulosCliente(clienteId: string, plan: 'BASICO' | 'PREMIUM'): void {
  const modulosPorPlan = MODULOS_CLIENTE_OFICIALES.filter((id) => {
    const modulo = MODULOS_CATALOGO.find(m => m.id === id);
    if (!modulo) return false;
    if (plan === 'PREMIUM') return true;
    return modulo.planRequerido === 'basico';
  });
  guardarModulosCliente({
    clienteId,
    modulosActivos: modulosPorPlan,
    modulosDesactivados: [],
    ultimaActualizacion: new Date().toISOString(),
  });
}

// ============================================================
// FUNCIONES DE GESTIÓN DE USUARIOS (dentro de una instalación)
// ============================================================

export function obtenerPermisosUsuario(userId: string): PermisosUsuario {
  const saved = localStorage.getItem(STORAGE_KEYS.PERMISOS_USUARIOS);
  if (saved) {
    const todos: PermisosUsuario[] = JSON.parse(saved);
    const permisos = todos.find(p => p.userId === userId);
    if (permisos) return permisos;
  }

  // Fallback inteligente:
  // - Si el userId corresponde a un cliente de developer panel, usar módulos del cliente.
  // - Si no, usar catálogo oficial por defecto.
  return { userId, modulosHabilitados: obtenerModulosBasePorUsuario(userId) };
}

export function guardarPermisosUsuario(permisos: PermisosUsuario): void {
  // Blindaje: normalizar, deduplicar y validar IDs para evitar truncamientos/IDs inválidos
  const normalizados = Array.from(new Set((permisos.modulosHabilitados || []).filter((id) =>
    MODULOS_CATALOGO.some((m) => m.id === id)
  )));

  const permisosNormalizados: PermisosUsuario = {
    userId: permisos.userId,
    modulosHabilitados: normalizados,
  };

  const saved = localStorage.getItem(STORAGE_KEYS.PERMISOS_USUARIOS);
  let todos: PermisosUsuario[] = saved ? JSON.parse(saved) : [];
  const index = todos.findIndex(p => p.userId === permisos.userId);
  const antes = index >= 0 ? [...todos[index].modulosHabilitados] : [];
  if (index >= 0) {
    todos[index] = permisosNormalizados;
  } else {
    todos.push(permisosNormalizados);
  }
  localStorage.setItem(STORAGE_KEYS.PERMISOS_USUARIOS, JSON.stringify(todos));

  console.log(`[Permisos] guardarPermisosUsuario userId=${permisosNormalizados.userId}`, {
    antes,
    despues: permisosNormalizados.modulosHabilitados,
  });

  // 🛡️ FIX: "le doy todos los permisos a un usuario y no puede acceder al
  // módulo". Causa raíz: existe una segunda capa de activación —
  // codec_pos_modulos_globales, editada SOLO desde Panel Desarrollador →
  // Módulos— que POSLayoutSidebar exige ADEMÁS del permiso por usuario
  // (FILTRO 3A antes que FILTRO 3B). Varios módulos premium vienen con
  // habilitadoPorDefecto:false, así que un admin normal que solo usa
  // "Gestionar Permisos" (esta función) podía activarle el módulo a un
  // usuario, ver el toast de éxito, y aun así el módulo nunca aparecer —
  // sin ninguna señal de que hacía falta ir a otra pantalla a activarlo
  // también a nivel global. Conceder un permiso es una expresión de
  // intención clara del admin: debe funcionar. Por eso, al otorgar módulos
  // a un usuario, se activan automáticamente a nivel global si no lo
  // estaban — en un solo sentido: revocarle el permiso a ESTE usuario no
  // desactiva el módulo para los demás que ya lo tengan.
  const globales = obtenerModulosGlobales();
  const faltantesGlobal = permisosNormalizados.modulosHabilitados.filter(
    (id) => !globales.modulosActivos.includes(id)
  );
  if (faltantesGlobal.length > 0) {
    console.log(`[Permisos] Activando a nivel global (estaban apagados por instalación): ${faltantesGlobal.join(', ')}`);
    guardarModulosGlobales({
      ...globales,
      modulosActivos: [...globales.modulosActivos, ...faltantesGlobal],
    });
  }

  // Espejo en IndexedDB/Store (backend local robusto)
  dbManager.setConfig(INDEXEDDB_PERMISOS_KEY, todos).catch((error) => {
    console.error('❌ Error guardando permisos en IndexedDB:', error);
  });

  if (typeof window !== 'undefined') {
    // Disparador para refresh automático de sesión/sidebar del usuario afectado EN ESTA terminal
    window.dispatchEvent(new CustomEvent(EVENTO_PERMISOS_ACTUALIZADOS, {
      detail: {
        userId: permisosNormalizados.userId,
        modulosHabilitados: permisosNormalizados.modulosHabilitados,
        updatedAt: Date.now(),
      }
    }));

    // 🛡️ FIX SINCRONIZACIÓN LAN: este es el ÚNICO punto de entrada real que
    // persiste permisos (todo editor de permisos —PermisosUsuarioModal,
    // PersonalAdminSection del Panel Desarrollador, ClienteModulosPanel vía
    // guardarModulosCliente— termina llamando esta función). Antes, solo
    // PermisosUsuarioModal avisaba a la red manualmente con su propio
    // dispatch de 'codecpos:usuario-cambio'; los otros dos editores guardaban
    // en localStorage/IndexedDB de la terminal admin y ahí se quedaba — la
    // otra terminal nunca se enteraba porque nunca salía ningún paquete LAN.
    // Centralizar el aviso aquí, en la función raíz de guardado, garantiza
    // que CUALQUIER camino que modifique permisos —actual o futuro— se
    // propague por red sin depender de que cada pantalla lo recuerde hacer
    // por su cuenta. LanContext.tsx escucha este evento SOLO en la terminal
    // servidor (Admin) y lo reenvía por TCP como SINCRONIZAR_USUARIO.
    window.dispatchEvent(new CustomEvent('codecpos:usuario-cambio', {
      detail: {
        action: 'PERMISSIONS_UPDATE',
        data: { userId: permisosNormalizados.userId, modulosHabilitados: permisosNormalizados.modulosHabilitados },
      }
    }));
  }
}

/**
 * Guardado persistente con flush garantizado (localStorage + IndexedDB)
 */
export async function guardarPermisosUsuarioPersistente(permisos: PermisosUsuario): Promise<void> {
  guardarPermisosUsuario(permisos);

  const saved = localStorage.getItem(STORAGE_KEYS.PERMISOS_USUARIOS);
  const todos: PermisosUsuario[] = saved ? JSON.parse(saved) : [];
  await dbManager.setConfig(INDEXEDDB_PERMISOS_KEY, todos);
}

export function togglePermisoUsuario(userId: string, modulo: ModuloPOS): void {
  const permisos = obtenerPermisosUsuario(userId);
  if (permisos.modulosHabilitados.includes(modulo)) {
    permisos.modulosHabilitados = permisos.modulosHabilitados.filter(m => m !== modulo);
  } else {
    permisos.modulosHabilitados.push(modulo);
  }
  guardarPermisosUsuario(permisos);
}

export function tienePermisoModulo(userId: string, modulo: ModuloPOS): boolean {
  if (!esModuloActivoGlobal(modulo)) return false;
  const permisos = obtenerPermisosUsuario(userId);
  return permisos.modulosHabilitados.includes(modulo);
}

export function obtenerModulosDisponibles(userId: string): ModuloInfo[] {
  return MODULOS_CATALOGO.filter(modulo => tienePermisoModulo(userId, modulo.id));
}

export function asignarPermisosCompletos(userId: string): void {
  const todos = [...MODULOS_CLIENTE_OFICIALES];
  guardarPermisosUsuario({ userId, modulosHabilitados: todos });
}

export function resetearPermisosUsuario(userId: string): void {
  // Restaurar al catálogo oficial de cliente (22 módulos operativos)
  guardarPermisosUsuario({ userId, modulosHabilitados: [...MODULOS_CLIENTE_OFICIALES] });
}

// ============================================================
// ESTADÍSTICAS
// ============================================================

export function obtenerEstadisticasModulos(): {
  total: number;
  activos: number;
  inactivos: number;
  porCategoria: Record<string, number>;
} {
  const config = obtenerModulosGlobales();
  const porCategoria: Record<string, number> = {};
  MODULOS_CATALOGO.forEach(m => {
    porCategoria[m.categoria] = (porCategoria[m.categoria] || 0) + 1;
  });
  return {
    total: MODULOS_CATALOGO.length,
    activos: config.modulosActivos.length,
    inactivos: MODULOS_CATALOGO.length - config.modulosActivos.length,
    porCategoria,
  };
}
