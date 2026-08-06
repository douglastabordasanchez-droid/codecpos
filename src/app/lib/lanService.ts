// CODEC POS v2.0 — Servicio LAN (renderer side)
// Wrapper tipado sobre window.electron.lan (IPC bridge)

export type LanConnectionState = 'idle' | 'discovering' | 'connecting' | 'connected' | 'disconnected';
export type LanMode = 'none' | 'server' | 'client';

export type LanEventType =
  | 'IDENTITY'
  | 'IDENTITY_ACK'
  | 'HEARTBEAT'
  | 'HEARTBEAT_ACK'
  | 'VENTA_NUEVA'
  | 'CAJA_APERTURA'
  | 'CAJA_CIERRE'
  | 'PANADERIA_ITEM'
  | 'PANADERIA_MESA'
  | 'TALLER_ORDEN'
  | 'NUEVA_REPARACION_REGISTRADA'
  | 'AUDIT_REQUEST'
  | 'AUDIT_RESPONSE'
  // ── Módulo Restaurante (comandas) ────────────────────────────────────────────
  | 'COMANDA_NUEVA'    // Mesero/Tablet → Cocina/Barra
  | 'COMANDA_ACK'     // Cocina/Barra  → Mesero (aceptada)
  | 'COMANDA_ESTADO'  // Cocina/Barra  → Mesero (listo/cancelada)
  | 'TERMINAL_PING'   // Diagnóstico de conectividad
  | string;

export interface LanTerminalIdentity {
  terminalId: string;
  /** ID del usuario logueado — usado por el servidor para routing dirigido */
  userId: string;
  cajeroNombre: string;
  cajeroIp: string;
  cajeroRol: string;
  machineHostname: string;
  connectedAt?: string;
  /** SSID de la red WiFi activa. '' = sin WiFi (cable LAN). null = no detectado. */
  wifiSsid?: string | null;
}

export interface LanEvent {
  type: LanEventType;
  terminalId: string;
  cajeroNombre: string;
  cajeroIp: string;
  timestamp: string;
  payload: Record<string, unknown>;
  /** Si está presente, el servidor enruta el evento al usuario con ese ID (no broadcast) */
  targetUserId?: string;
}

// ── Payload restaurante ───────────────────────────────────────────────────────

export interface ComandaItem {
  productoId: string;
  nombre: string;
  cantidad: number;
  precio?: number;
  nota?: string;
}

/** Payload del evento COMANDA_NUEVA — compatible con futura arquitectura de restaurante */
export interface ComandaPayload {
  comandaId: string;
  /** Mesa de origen (si aplica) */
  mesaId?: string;
  mesaLabel?: string;
  meseroNombre: string;
  /** Destino de la comanda: 'cocina' | 'barra' | cualquier rol personalizado */
  destino: 'cocina' | 'barra' | string;
  items: ComandaItem[];
  observaciones?: string;
}

/** Payload del evento NUEVA_REPARACION_REGISTRADA */
export interface NuevaReparacionPayload {
  ordenId: string;
  numeroOrden: string;
  tecnicoAsignadoId: string;
  tecnicoAsignadoNombre: string;
  cliente: string;
  marca: string;
  modelo: string;
  tipo: string;
  prioridad: string;
}

export interface LanStatusResult {
  mode: LanMode;
  localIp: string;
  clients: LanTerminalIdentity[];
  connected: boolean;
  httpRunning?: boolean;
  httpPort?: number;
}

// ── Acceso seguro al bridge IPC ──────────────────────────────────────────────

function bridge() {
  return (window as any).electron?.lan as {
    startServer: () => Promise<{ ok: boolean; ip?: string; port?: number; error?: string; alreadyRunning?: boolean }>;
    startClient: (opts: { identity: LanTerminalIdentity; serverIp?: string }) => Promise<{ ok: boolean; error?: string }>;
    stop: () => Promise<{ ok: boolean }>;
    emitEvent: (event: LanEvent) => Promise<{ ok: boolean }>;
    getStatus: () => Promise<LanStatusResult>;
    getClients: () => Promise<LanTerminalIdentity[]>;
    getLocalIp: () => Promise<string>;
    sendAuditRequest: (terminalId: string) => Promise<{ ok: boolean }>;
    sendAuditResponse: (data: { terminalId: string; payload: unknown }) => Promise<{ ok: boolean }>;
    onClientConnected: (cb: (data: LanTerminalIdentity) => void) => void;
    onClientDisconnected: (cb: (data: { terminalId: string }) => void) => void;
    onEventReceived: (cb: (event: LanEvent) => void) => void;
    onConnectionStatus: (cb: (status: { state: LanConnectionState; serverIp?: string }) => void) => void;
    onAuditRequest: (cb: (data: { terminalId: string }) => void) => void;
    removeAllListeners: () => void;
    // API HTTP para tablets/dispositivos externos
    startHttp?: () => Promise<{ ok: boolean; port?: number; ip?: string; error?: string }>;
    stopHttp?: () => Promise<{ ok: boolean }>;
    getHttpStatus?: () => Promise<{ running: boolean; port: number; ip: string; url: string }>;
  } | undefined;
}

// ── API pública ───────────────────────────────────────────────────────────────

export const lanService = {
  isAvailable: () => typeof window !== 'undefined' && !!(window as any).electron?.lan,

  startServer: () =>
    bridge()?.startServer() ?? Promise.resolve({ ok: false, error: 'LAN no disponible' }),

  startClient: (opts: { identity: LanTerminalIdentity; serverIp?: string }) =>
    bridge()?.startClient(opts) ?? Promise.resolve({ ok: false }),

  stop: () => bridge()?.stop() ?? Promise.resolve({ ok: false }),

  emitEvent: (event: LanEvent) =>
    bridge()?.emitEvent(event) ?? Promise.resolve({ ok: false }),

  getStatus: () =>
    bridge()?.getStatus() ?? Promise.resolve({ mode: 'none' as LanMode, localIp: '', clients: [], connected: false }),

  getClients: () => bridge()?.getClients() ?? Promise.resolve([]),

  getLocalIp: () => bridge()?.getLocalIp() ?? Promise.resolve(''),

  sendAuditRequest: (terminalId: string) =>
    bridge()?.sendAuditRequest(terminalId) ?? Promise.resolve({ ok: false }),

  sendAuditResponse: (data: { terminalId: string; payload: unknown }) =>
    bridge()?.sendAuditResponse(data) ?? Promise.resolve({ ok: false }),

  onClientConnected: (cb: (data: LanTerminalIdentity) => void) => bridge()?.onClientConnected(cb),
  onClientDisconnected: (cb: (data: { terminalId: string }) => void) => bridge()?.onClientDisconnected(cb),
  onEventReceived: (cb: (event: LanEvent) => void) => bridge()?.onEventReceived(cb),
  onConnectionStatus: (cb: (status: { state: LanConnectionState; serverIp?: string }) => void) => bridge()?.onConnectionStatus(cb),
  onAuditRequest: (cb: (data: { terminalId: string }) => void) => bridge()?.onAuditRequest(cb),
  removeAllListeners: () => bridge()?.removeAllListeners(),

  // ── API HTTP (servidor de comandas para tablets externas) ───────────────────
  startHttp:     () => bridge()?.startHttp?.() ?? Promise.resolve({ ok: false, error: 'No disponible' }),
  stopHttp:      () => bridge()?.stopHttp?.()  ?? Promise.resolve({ ok: false }),
  getHttpStatus: () => bridge()?.getHttpStatus?.() ?? Promise.resolve({ running: false, port: 4002, ip: '', url: '' }),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function buildLanEvent(
  type: LanEventType,
  identity: Pick<LanTerminalIdentity, 'terminalId' | 'cajeroNombre' | 'cajeroIp'>,
  payload: Record<string, unknown>,
  targetUserId?: string,
): LanEvent {
  return {
    type,
    terminalId: identity.terminalId,
    cajeroNombre: identity.cajeroNombre,
    cajeroIp: identity.cajeroIp,
    timestamp: new Date().toISOString(),
    payload,
    ...(targetUserId ? { targetUserId } : {}),
  };
}

export function formatLanEventLabel(event: LanEvent): string {
  const hora = new Date(event.timestamp).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  const p = event.payload;
  switch (event.type) {
    case 'VENTA_NUEVA':                  return `${hora} — Venta registrada ($${Number(p.total || 0).toLocaleString('es-CO')})`;
    case 'CAJA_APERTURA':                return `${hora} — Abrió caja con $${Number(p.baseInicial || 0).toLocaleString('es-CO')}`;
    case 'CAJA_CIERRE':                  return `${hora} — Cerró caja · Total $${Number(p.totalVentas || 0).toLocaleString('es-CO')}`;
    case 'PANADERIA_ITEM':               return `${hora} — Agregó "${p.nombreItem || 'ítem'}" a cuenta rápida`;
    case 'PANADERIA_MESA':               return `${hora} — Mesa ${p.numeroMesa}: ${p.estado || 'actualizada'}`;
    case 'TALLER_ORDEN':                 return `${hora} — Orden ${p.numeroOrden} → ${p.nuevoEstado || 'actualizado'}`;
    case 'NUEVA_REPARACION_REGISTRADA':  return `${hora} — Nueva reparación ${p.numeroOrden} asignada (${p.marca} ${p.modelo})`;
    case 'COMANDA_NUEVA':   return `${hora} — Comanda → ${p.destino}: ${(p.items as any[])?.length ?? 0} ítem(s)${p.mesaLabel ? ` · Mesa ${p.mesaLabel}` : ''}`;
    case 'COMANDA_ACK':     return `${hora} — Comanda ${p.comandaId} aceptada por ${p.destino}`;
    case 'COMANDA_ESTADO':  return `${hora} — Comanda ${p.comandaId}: ${p.estado}`;
    case 'TERMINAL_PING':   return `${hora} — Ping desde ${event.cajeroNombre}`;
    default:                             return `${hora} — ${event.type}`;
  }
}
