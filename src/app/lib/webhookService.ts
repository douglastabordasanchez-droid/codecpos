/**
 * CODEC POS v2.0 — Motor de Webhooks
 * Integración híbrida con Zapier y n8n
 *
 * Arquitectura:
 *  1. El POS emite eventos internos (dispararEvento)
 *  2. El motor busca webhooks configurados para ese tipo de evento
 *  3. Hace POST a la URL (Zapier Catch Hook / n8n Webhook node)
 *  4. Si no hay red → encola en localStorage → reintenta al reconectar
 */

// ─────────────────────────────────────────────
// TIPOS DE EVENTOS
// ─────────────────────────────────────────────
export type TipoEvento =
  | 'venta_completada'
  | 'devolucion_registrada'
  | 'stock_bajo'
  | 'producto_vencido'
  | 'cierre_caja'
  | 'nuevo_cliente'
  | 'gasto_registrado'
  | 'ingreso_extra_registrado'
  | 'proveedor_pedido'
  | 'promocion_activada'
  | 'usuario_creado'
  | 'alerta_sistema'
  | 'turno_abierto'
  | 'turno_cerrado';

export interface TipoEventoInfo {
  id: TipoEvento;
  nombre: string;
  descripcion: string;
  icono: string;
  categoria: 'ventas' | 'inventario' | 'gestion' | 'sistema';
  payloadEjemplo: Record<string, unknown>;
}

export const EVENTOS_CATALOGO: TipoEventoInfo[] = [
  {
    id: 'venta_completada',
    nombre: 'Venta Completada',
    descripcion: 'Se dispara cada vez que se cierra una venta exitosa',
    icono: '💰',
    categoria: 'ventas',
    payloadEjemplo: {
      evento: 'venta_completada',
      tienda: 'Minimercado Ejemplo',
      total: 45800,
      metodoPago: 'Efectivo',
      productos: 3,
      cajero: 'maria_cajera',
      timestamp: new Date().toISOString(),
    },
  },
  {
    id: 'devolucion_registrada',
    nombre: 'Devolución Registrada',
    descripcion: 'Se dispara cuando un cliente realiza una devolución',
    icono: '↩️',
    categoria: 'ventas',
    payloadEjemplo: {
      evento: 'devolucion_registrada',
      tienda: 'Minimercado Ejemplo',
      monto: 12000,
      motivo: 'Producto dañado',
      timestamp: new Date().toISOString(),
    },
  },
  {
    id: 'stock_bajo',
    nombre: 'Stock Bajo',
    descripcion: 'Se dispara cuando un producto cae por debajo del mínimo',
    icono: '⚠️',
    categoria: 'inventario',
    payloadEjemplo: {
      evento: 'stock_bajo',
      tienda: 'Minimercado Ejemplo',
      producto: 'Arroz Diana 500g',
      stockActual: 3,
      stockMinimo: 10,
      timestamp: new Date().toISOString(),
    },
  },
  {
    id: 'producto_vencido',
    nombre: 'Producto Vencido / Por Vencer',
    descripcion: 'Alerta cuando un producto está vencido o vence en los próximos días',
    icono: '🗓️',
    categoria: 'inventario',
    payloadEjemplo: {
      evento: 'producto_vencido',
      tienda: 'Minimercado Ejemplo',
      producto: 'Leche Entera 1L',
      fechaVencimiento: '2026-03-05',
      diasRestantes: 2,
      timestamp: new Date().toISOString(),
    },
  },
  {
    id: 'cierre_caja',
    nombre: 'Cierre de Caja',
    descripcion: 'Se dispara al realizar el corte de caja del turno',
    icono: '🧮',
    categoria: 'ventas',
    payloadEjemplo: {
      evento: 'cierre_caja',
      tienda: 'Minimercado Ejemplo',
      totalVentas: 1250000,
      totalTransacciones: 87,
      cajero: 'maria_cajera',
      turno: 'Mañana',
      timestamp: new Date().toISOString(),
    },
  },
  {
    id: 'nuevo_cliente',
    nombre: 'Nuevo Cliente Registrado',
    descripcion: 'Se dispara cuando se registra un cliente en el sistema',
    icono: '👤',
    categoria: 'gestion',
    payloadEjemplo: {
      evento: 'nuevo_cliente',
      tienda: 'Minimercado Ejemplo',
      nombre: 'Carlos Martínez',
      telefono: '3001234567',
      timestamp: new Date().toISOString(),
    },
  },
  {
    id: 'gasto_registrado',
    nombre: 'Gasto Registrado',
    descripcion: 'Se dispara al registrar un gasto operativo',
    icono: '💸',
    categoria: 'gestion',
    payloadEjemplo: {
      evento: 'gasto_registrado',
      tienda: 'Minimercado Ejemplo',
      concepto: 'Servicio de agua',
      monto: 85000,
      categoria: 'Servicios',
      timestamp: new Date().toISOString(),
    },
  },
  {
    id: 'ingreso_extra_registrado',
    nombre: 'Ingreso Extra Registrado',
    descripcion: 'Se dispara al registrar un ingreso contable fuera de una venta (préstamo, aporte, etc.)',
    icono: '💰',
    categoria: 'gestion',
    payloadEjemplo: {
      evento: 'ingreso_extra_registrado',
      tienda: 'Minimercado Ejemplo',
      concepto: 'Aporte de socio',
      monto: 500000,
      categoria: 'Aporte de Socio/Capital',
      timestamp: new Date().toISOString(),
    },
  },
  {
    id: 'proveedor_pedido',
    nombre: 'Pedido a Proveedor',
    descripcion: 'Se dispara cuando se genera un pedido a un proveedor',
    icono: '🚚',
    categoria: 'gestion',
    payloadEjemplo: {
      evento: 'proveedor_pedido',
      tienda: 'Minimercado Ejemplo',
      proveedor: 'Distribuidora La 14',
      total: 450000,
      productos: 12,
      timestamp: new Date().toISOString(),
    },
  },
  {
    id: 'promocion_activada',
    nombre: 'Promoción Activada',
    descripcion: 'Se dispara cuando se activa o desactiva una promoción',
    icono: '🏷️',
    categoria: 'gestion',
    payloadEjemplo: {
      evento: 'promocion_activada',
      tienda: 'Minimercado Ejemplo',
      promocion: '2x1 en gaseosas',
      tipo: 'activada',
      timestamp: new Date().toISOString(),
    },
  },
  {
    id: 'alerta_sistema',
    nombre: 'Alerta del Sistema',
    descripcion: 'Alertas críticas del sistema (errores, desconexiones, etc.)',
    icono: '🔔',
    categoria: 'sistema',
    payloadEjemplo: {
      evento: 'alerta_sistema',
      tienda: 'Minimercado Ejemplo',
      tipo: 'advertencia',
      mensaje: 'Impresora desconectada',
      timestamp: new Date().toISOString(),
    },
  },
  {
    id: 'turno_abierto',
    nombre: 'Turno Abierto',
    descripcion: 'Se dispara al iniciar un turno de trabajo',
    icono: '▶️',
    categoria: 'sistema',
    payloadEjemplo: {
      evento: 'turno_abierto',
      tienda: 'Minimercado Ejemplo',
      cajero: 'maria_cajera',
      fondoInicial: 200000,
      timestamp: new Date().toISOString(),
    },
  },
  {
    id: 'turno_cerrado',
    nombre: 'Turno Cerrado',
    descripcion: 'Se dispara al cerrar un turno de trabajo',
    icono: '⏹️',
    categoria: 'sistema',
    payloadEjemplo: {
      evento: 'turno_cerrado',
      tienda: 'Minimercado Ejemplo',
      cajero: 'maria_cajera',
      totalVentas: 980000,
      timestamp: new Date().toISOString(),
    },
  },
];

// ─────────────────────────────────────────────
// CONFIGURACIÓN DE WEBHOOKS
// ─────────────────────────────────────────────
export type PlataformaWebhook = 'zapier' | 'n8n' | 'custom';

export interface WebhookConfig {
  id: string;
  plataforma: PlataformaWebhook;
  nombre: string;
  url: string;
  eventosActivos: TipoEvento[];
  activo: boolean;
  secretHeader?: string; // Cabecera de autenticación opcional
  secretValue?: string;
  creadoEn: string;
  ultimoDisparo?: string;
  totalDisparos: number;
  totalErrores: number;
}

// ─────────────────────────────────────────────
// COLA OFFLINE
// ─────────────────────────────────────────────
export interface EventoEnCola {
  id: string;
  webhookId: string;
  webhookUrl: string;
  payload: Record<string, unknown>;
  intentos: number;
  maxIntentos: number;
  creadoEn: string;
  proximoIntento?: string;
  error?: string;
}

// ─────────────────────────────────────────────
// LOG DE DISPAROS
// ─────────────────────────────────────────────
export type EstadoDisparo = 'exitoso' | 'fallido' | 'en_cola';

export interface LogDisparo {
  id: string;
  webhookId: string;
  webhookNombre: string;
  evento: TipoEvento;
  estado: EstadoDisparo;
  statusCode?: number;
  mensaje: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

// ─────────────────────────────────────────────
// STORAGE KEYS
// ─────────────────────────────────────────────
const KEYS = {
  WEBHOOKS:   'codecpos_webhooks_config',
  COLA:       'codecpos_webhooks_cola',
  LOG:        'codecpos_webhooks_log',
};

// ─────────────────────────────────────────────
// FUNCIONES CRUD DE WEBHOOKS
// ─────────────────────────────────────────────
export function obtenerWebhooks(): WebhookConfig[] {
  try {
    const raw = localStorage.getItem(KEYS.WEBHOOKS);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function guardarWebhooks(webhooks: WebhookConfig[]): void {
  localStorage.setItem(KEYS.WEBHOOKS, JSON.stringify(webhooks));
}

export function crearWebhook(data: Omit<WebhookConfig, 'id' | 'creadoEn' | 'totalDisparos' | 'totalErrores'>): WebhookConfig {
  const webhook: WebhookConfig = {
    ...data,
    id: `wh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    creadoEn: new Date().toISOString(),
    totalDisparos: 0,
    totalErrores: 0,
  };
  const webhooks = obtenerWebhooks();
  webhooks.push(webhook);
  guardarWebhooks(webhooks);
  return webhook;
}

export function actualizarWebhook(id: string, cambios: Partial<WebhookConfig>): void {
  const webhooks = obtenerWebhooks().map(w => w.id === id ? { ...w, ...cambios } : w);
  guardarWebhooks(webhooks);
}

export function eliminarWebhook(id: string): void {
  guardarWebhooks(obtenerWebhooks().filter(w => w.id !== id));
}

// ─────────────────────────────────────────────
// FUNCIONES DE COLA OFFLINE
// ─────────────────────────────────────────────
function obtenerCola(): EventoEnCola[] {
  try {
    const raw = localStorage.getItem(KEYS.COLA);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function guardarCola(cola: EventoEnCola[]): void {
  localStorage.setItem(KEYS.COLA, JSON.stringify(cola));
}

export function obtenerColaPendiente(): EventoEnCola[] {
  return obtenerCola();
}

function encolarEvento(webhookId: string, url: string, payload: Record<string, unknown>): void {
  const cola = obtenerCola();
  cola.push({
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    webhookId,
    webhookUrl: url,
    payload,
    intentos: 0,
    maxIntentos: 5,
    creadoEn: new Date().toISOString(),
  });
  guardarCola(cola);
}

function eliminarDeCola(id: string): void {
  guardarCola(obtenerCola().filter(e => e.id !== id));
}

// ─────────────────────────────────────────────
// LOG
// ─────────────────────────────────────────────
function obtenerLog(): LogDisparo[] {
  try {
    const raw = localStorage.getItem(KEYS.LOG);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function agregarLog(entry: Omit<LogDisparo, 'id' | 'timestamp'>): void {
  const log = obtenerLog();
  const nueva: LogDisparo = {
    ...entry,
    id: `log_${Date.now()}`,
    timestamp: new Date().toISOString(),
  };
  log.unshift(nueva); // Más reciente primero
  // Máximo 200 entradas
  guardarLog(log.slice(0, 200));
}

function guardarLog(log: LogDisparo[]): void {
  localStorage.setItem(KEYS.LOG, JSON.stringify(log));
}

export function obtenerLogDisparos(): LogDisparo[] {
  return obtenerLog();
}

export function limpiarLog(): void {
  guardarLog([]);
}

// ─────────────────────────────────────────────
// MOTOR PRINCIPAL — DISPARAR EVENTO
// ─────────────────────────────────────────────
export async function dispararEvento(
  tipo: TipoEvento,
  payload: Record<string, unknown>,
): Promise<void> {
  const webhooks = obtenerWebhooks().filter(
    w => w.activo && w.eventosActivos.includes(tipo),
  );

  if (webhooks.length === 0) return;

  const payloadFinal = {
    ...payload,
    _codec_pos_version: '2.0',
    _evento: tipo,
    _timestamp: new Date().toISOString(),
    _online: navigator.onLine,
  };

  await Promise.allSettled(webhooks.map(webhook => _disparar(webhook, payloadFinal, tipo)));
}

async function _disparar(
  webhook: WebhookConfig,
  payload: Record<string, unknown>,
  tipo: TipoEvento,
): Promise<void> {
  if (!navigator.onLine) {
    encolarEvento(webhook.id, webhook.url, payload);
    agregarLog({
      webhookId: webhook.id,
      webhookNombre: webhook.nombre,
      evento: tipo,
      estado: 'en_cola',
      mensaje: 'Sin conexión — evento encolado para reintento',
      payload,
    });
    return;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (webhook.secretHeader && webhook.secretValue) {
    headers[webhook.secretHeader] = webhook.secretValue;
  }

  try {
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    actualizarWebhook(webhook.id, {
      ultimoDisparo: new Date().toISOString(),
      totalDisparos: (obtenerWebhooks().find(w => w.id === webhook.id)?.totalDisparos ?? 0) + 1,
    });

    agregarLog({
      webhookId: webhook.id,
      webhookNombre: webhook.nombre,
      evento: tipo,
      estado: res.ok ? 'exitoso' : 'fallido',
      statusCode: res.status,
      mensaje: res.ok
        ? `✅ Enviado correctamente (${res.status})`
        : `❌ Error HTTP ${res.status}`,
      payload,
    });

    if (!res.ok) {
      actualizarWebhook(webhook.id, {
        totalErrores: (obtenerWebhooks().find(w => w.id === webhook.id)?.totalErrores ?? 0) + 1,
      });
      encolarEvento(webhook.id, webhook.url, payload);
    }
  } catch (err: unknown) {
    const mensaje = err instanceof Error ? err.message : 'Error desconocido';
    agregarLog({
      webhookId: webhook.id,
      webhookNombre: webhook.nombre,
      evento: tipo,
      estado: 'fallido',
      mensaje: `❌ ${mensaje}`,
      payload,
    });
    actualizarWebhook(webhook.id, {
      totalErrores: (obtenerWebhooks().find(w => w.id === webhook.id)?.totalErrores ?? 0) + 1,
    });
    encolarEvento(webhook.id, webhook.url, payload);
  }
}

// ─────────────────────────────────────────────
// REINTENTO DE COLA OFFLINE
// ─────────────────────────────────────────────
export async function procesarColaOffline(): Promise<{ enviados: number; fallidos: number }> {
  if (!navigator.onLine) return { enviados: 0, fallidos: 0 };

  const cola = obtenerCola();
  if (cola.length === 0) return { enviados: 0, fallidos: 0 };

  let enviados = 0;
  let fallidos = 0;

  for (const item of cola) {
    const webhook = obtenerWebhooks().find(w => w.id === item.webhookId);
    if (!webhook) {
      eliminarDeCola(item.id);
      continue;
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (webhook.secretHeader && webhook.secretValue) {
      headers[webhook.secretHeader] = webhook.secretValue;
    }

    try {
      const res = await fetch(item.webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...item.payload, _reintento: item.intentos + 1 }),
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        eliminarDeCola(item.id);
        enviados++;
      } else {
        _actualizarIntentoCola(item, `HTTP ${res.status}`);
        fallidos++;
      }
    } catch (err) {
      _actualizarIntentoCola(item, err instanceof Error ? err.message : 'Error');
      fallidos++;
    }
  }

  return { enviados, fallidos };
}

function _actualizarIntentoCola(item: EventoEnCola, error: string): void {
  const cola = obtenerCola().map(e => {
    if (e.id !== item.id) return e;
    const intentos = e.intentos + 1;
    if (intentos >= e.maxIntentos) {
      // Descartar tras maxIntentos
      return null;
    }
    return {
      ...e,
      intentos,
      error,
      proximoIntento: new Date(Date.now() + Math.pow(2, intentos) * 60_000).toISOString(),
    };
  }).filter(Boolean) as EventoEnCola[];
  guardarCola(cola);
}

// ─────────────────────────────────────────────
// TEST DE WEBHOOK (envía payload de ejemplo)
// ─────────────────────────────────────────────
export async function testWebhook(
  webhook: WebhookConfig,
  evento: TipoEvento,
): Promise<{ ok: boolean; status?: number; mensaje: string }> {
  const infoEvento = EVENTOS_CATALOGO.find(e => e.id === evento);
  const payload = {
    ...infoEvento?.payloadEjemplo,
    _codec_pos_version: '2.0',
    _test: true,
    _timestamp: new Date().toISOString(),
  };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (webhook.secretHeader && webhook.secretValue) {
    headers[webhook.secretHeader] = webhook.secretValue;
  }

  try {
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    return {
      ok: res.ok,
      status: res.status,
      mensaje: res.ok ? `✅ Respuesta ${res.status} — webhook funcionando` : `❌ Error HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      mensaje: `❌ ${err instanceof Error ? err.message : 'Error de conexión'}`,
    };
  }
}

// ─────────────────────────────────────────────
// ESTADÍSTICAS GLOBALES
// ─────────────────────────────────────────────
export function obtenerEstadisticasWebhooks() {
  const webhooks = obtenerWebhooks();
  const cola = obtenerCola();
  const log = obtenerLog();
  return {
    totalWebhooks: webhooks.length,
    activos: webhooks.filter(w => w.activo).length,
    totalDisparos: webhooks.reduce((a, w) => a + w.totalDisparos, 0),
    totalErrores: webhooks.reduce((a, w) => a + w.totalErrores, 0),
    enCola: cola.length,
    exitososHoy: log.filter(
      l => l.estado === 'exitoso' && l.timestamp.startsWith(new Date().toISOString().slice(0, 10)),
    ).length,
  };
}
