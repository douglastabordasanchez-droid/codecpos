// CODEC POS v2.0 — Contexto de Red LAN
// Inicializa automáticamente servidor (admin) o cliente (cajero) al login
// Proporciona emitLanEvent() a todos los componentes via contexto

import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo, ReactNode } from 'react';
import { toast } from 'sonner';
import { Wrench, X } from 'lucide-react';
import { useAuth } from './AuthContext';
import {
  lanService,
  buildLanEvent,
  formatLanEventLabel,
  LanConnectionState,
  LanEvent,
  LanMode,
  LanTerminalIdentity,
  NuevaReparacionPayload,
  ComandaPayload,
} from '../lib/lanService';
import { playTallerAlertSound } from '../lib/tallerAlertSound';
import { getRoleCapabilities } from '../lib/terminalRoles';
import { tallerService } from '../services/tallerService';
import { guardarPermisosUsuario, ModuloPOS } from '../lib/permissions';
import {
  cloudRelay,
  isCloudRelayAvailable,
  isCloudRelayEnabled,
  setCloudRelayEnabled as persistCloudRelayEnabled,
  CloudRelayState,
  CloudTerminalPresence,
} from '../lib/supabase/cloudRelayService';

// ── Tipos de contexto ─────────────────────────────────────────────────────────

export interface TerminalCard {
  terminalId: string;
  /** userId del usuario logueado — clave para routing dirigido */
  userId?: string;
  cajeroNombre: string;
  cajeroIp: string;
  cajeroRol: string;
  machineHostname: string;
  connected: boolean;
  lastSeen: number;
  recentEvents: Array<{ raw: LanEvent; label: string }>;
  auditData?: Record<string, unknown> | null;
  /** SSID de la red WiFi del terminal remoto. '' = LAN cable. null = desconocido. */
  wifiSsid?: string | null;
  /**
   * Por dónde llega esta terminal: 'lan' = misma red física (TCP:4000),
   * 'cloud' = otra red, vía relay de Supabase. Ver cloudRelayService.ts.
   * Ausente = 'lan' (terminales creadas antes de existir el relay).
   */
  transport?: 'lan' | 'cloud';
}

interface LanContextValue {
  mode: LanMode;
  connectionState: LanConnectionState;
  localIp: string;
  serverIp: string;
  /** Terminales conocidas por CUALQUIER vía (LAN + nube), sin duplicados. */
  terminals: TerminalCard[];
  allEvents: Array<{ raw: LanEvent; label: string }>;
  isAvailable: boolean;
  /** Cajero emite evento a la red. targetUserId enruta el mensaje a un usuario específico */
  emitLanEvent: (type: string, payload?: Record<string, unknown>, targetUserId?: string) => void;
  /** Admin solicita auditoría de una terminal */
  requestAudit: (terminalId: string) => void;
  /** Admin: IP del servidor para cajeros manuales */
  setServerIp: (ip: string) => void;
  /** Limpia audit data de una terminal */
  clearAudit: (terminalId: string) => void;
  // ── Tercera vía: relay por la nube (Supabase Realtime) ──────────────────────
  /** Hay nube utilizable (Supabase configurado + negocio vinculado). */
  cloudAvailable: boolean;
  /** El usuario tiene activado el relay en ESTA terminal. */
  cloudEnabled: boolean;
  cloudState: CloudRelayState;
  /** Mensaje legible cuando cloudState es 'error' o 'unavailable'. */
  cloudDetail: string;
  /** Cuántas terminales remotas están en línea vía nube ahora mismo. */
  cloudOnlineCount: number;
  setCloudEnabled: (valor: boolean) => void;
}

const LanContext = createContext<LanContextValue>({
  mode: 'none',
  connectionState: 'idle',
  localIp: '',
  serverIp: '',
  terminals: [],
  allEvents: [],
  isAvailable: false,
  emitLanEvent: () => {},
  requestAudit: () => {},
  setServerIp: () => {},
  clearAudit: () => {},
  cloudAvailable: false,
  cloudEnabled: false,
  cloudState: 'disabled',
  cloudDetail: '',
  cloudOnlineCount: 0,
  setCloudEnabled: () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function LanProvider({ children }: { children: ReactNode }) {
  const { usuarioActual } = useAuth();
  const isAdmin    = usuarioActual?.rol === 'super_usuario';
  const isAvailable = lanService.isAvailable();

  const [mode, setMode]                   = useState<LanMode>('none');
  const [connectionState, setConnectionState] = useState<LanConnectionState>('idle');
  const [localIp, setLocalIp]             = useState('');
  const [serverIp, setServerIpState]      = useState(() => localStorage.getItem('lan_server_ip') || '');
  const [terminals, setTerminals]         = useState<TerminalCard[]>([]);
  const [allEvents, setAllEvents]         = useState<Array<{ raw: LanEvent; label: string }>>([]);

  // ── Estado del relay por nube (tercera vía de comunicación) ──────────────────
  const [cloudTerminals, setCloudTerminals] = useState<TerminalCard[]>([]);
  const [cloudEnabled, setCloudEnabledState] = useState<boolean>(() => isCloudRelayEnabled());
  const [cloudState, setCloudState]         = useState<CloudRelayState>('disabled');
  const [cloudDetail, setCloudDetail]       = useState('');
  const cloudAvailable = isCloudRelayAvailable();

  const identityRef     = useRef<LanTerminalIdentity | null>(null);
  const terminalIdRef   = useRef<string>('');
  const initializedRef  = useRef(false);

  // 🛡️ Deduplicación LAN ⟷ nube: cuando dos terminales están unidas por AMBAS
  // vías, el mismo evento llega dos veces (una por TCP, otra por Realtime) y
  // sin esto se guardaría la orden de taller dos veces, sonaría la alerta dos
  // veces, aparecerían dos toasts. Se procesa solo la primera copia, por
  // `eventId`. La ventana se acota para que el Set no crezca sin control en
  // terminales que llevan días abiertas.
  const processedEventIdsRef = useRef<Set<string>>(new Set());
  const processedOrderRef    = useRef<string[]>([]);
  const MAX_EVENTOS_RECORDADOS = 800;

  const yaProcesado = useCallback((event: LanEvent): boolean => {
    const id = event.eventId;
    // Eventos de versiones antiguas (sin eventId) no se pueden deduplicar:
    // se procesan siempre, exactamente igual que antes de existir el relay.
    if (!id) return false;
    if (processedEventIdsRef.current.has(id)) return true;

    processedEventIdsRef.current.add(id);
    processedOrderRef.current.push(id);
    if (processedOrderRef.current.length > MAX_EVENTOS_RECORDADOS) {
      const viejo = processedOrderRef.current.shift();
      if (viejo) processedEventIdsRef.current.delete(viejo);
    }
    return false;
  }, []);

  // ── Construye identidad del usuario actual ────────────────────────────────────
  function buildIdentity(terminalId: string): LanTerminalIdentity {
    return {
      terminalId,
      // userId es la clave para el routing dirigido (debe coincidir con u.id || u.username en codecpos_usuarios)
      userId: (usuarioActual as any)?.id || usuarioActual?.username || '',
      cajeroNombre: (usuarioActual as any)?.nombreCompleto
        || (usuarioActual as any)?.nombre
        || usuarioActual?.username
        || 'Cajero',
      cajeroIp: '',
      cajeroRol: usuarioActual?.rol || 'cajero',
      machineHostname: '',
    };
  }

  // ── Obtener IP local + machine ID ─────────────────────────────────────────────
  // 🛡️ Ya NO exige `isAvailable`: la identidad de terminal también la necesita
  // el relay por nube, que funciona sin el bridge de Electron (build web/PWA).
  // `getLocalIp()` devuelve '' sin bridge, así que es seguro llamarlo siempre.
  useEffect(() => {
    if (!usuarioActual) return;

    lanService.getLocalIp().then(ip => setLocalIp(ip));

    const el = (window as any).electron;
    if (el?.getMachineId) {
      el.getMachineId().then((id: string) => {
        const tid = id || `pos_${Date.now()}`;
        terminalIdRef.current = tid;
        identityRef.current   = buildIdentity(tid);
      });
    } else {
      const tid = localStorage.getItem('lan_terminal_id') || `pos_${Date.now()}`;
      localStorage.setItem('lan_terminal_id', tid);
      terminalIdRef.current = tid;
      identityRef.current   = buildIdentity(tid);
    }
  }, [usuarioActual?.username]);

  // ── Inicializar red según rol ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isAvailable || !usuarioActual || initializedRef.current) return;

    const tryInit = () => {
      if (!terminalIdRef.current) { setTimeout(tryInit, 200); return; }
      initializedRef.current = true;

      // 🛡️ FIX: el modo de red (servidor/cliente) se decidía SOLO por el rol
      // del usuario logueado EN ESE MOMENTO — si el Admin entraba a la
      // terminal del cajero (para revisar algo con su propia cuenta), esa
      // terminal se volvía OTRO servidor independiente (su propio puerto
      // 4000), quedando desconectada de la red real y sin recibir
      // usuarios/permisos/cierres nunca más mientras durara esa sesión.
      //
      // El rol de red es una propiedad de LA TERMINAL (el equipo físico),
      // no de quién tenga sesión abierta en un momento dado — "siempre va a
      // haber un terminal que va a ser el administrador". Por eso se guarda
      // una sola vez, la primera vez que esta terminal arranca exitosamente
      // en un modo (ver _initServer/_initClient), y de ahí en adelante esta
      // terminal SIEMPRE respeta ese rol grabado, sin importar qué usuario
      // inicie sesión después. Antes de que exista ese registro (instalación
      // nueva) se usa el rol del usuario actual como arranque inicial.
      const rolGrabado = localStorage.getItem('codec_pos_lan_role');
      if (rolGrabado === 'server') { _initServer(); }
      else if (rolGrabado === 'client') { _initClient(); }
      else if (isAdmin) { _initServer(); }
      else { _initClient(); }
    };
    tryInit();

    return () => {
      lanService.removeAllListeners();
      lanService.stop();
      initializedRef.current = false;
    };
  }, [isAvailable, isAdmin, usuarioActual?.username]);

  // ── Servidor: broadcast SINCRONIZAR_USUARIO cuando Admin cambia un usuario ───
  useEffect(() => {
    if (!isAvailable || !isAdmin) return;

    const handleUserChange = (e: Event) => {
      const { action, data } = (e as CustomEvent<{ action: string; data: Record<string, unknown> }>).detail;
      const event = buildLanEvent(
        'SINCRONIZAR_USUARIO',
        { terminalId: terminalIdRef.current || 'server', cajeroNombre: identityRef.current?.cajeroNombre || 'Admin', cajeroIp: '' },
        { action, data },
      );
      console.log(`[LAN][emit] SINCRONIZAR_USUARIO action=${action} userId=${(data as any)?.userId ?? (data as any)?.id ?? '?'} → broadcast a todas las terminales conectadas`, { payload: event.payload });
      lanService.emitEvent(event);
    };

    window.addEventListener('codecpos:usuario-cambio', handleUserChange);
    return () => window.removeEventListener('codecpos:usuario-cambio', handleUserChange);
  }, [isAvailable, isAdmin]);

  // ── Servidor: broadcast SINCRONIZAR_METODOS_PAGO cuando Admin modifica config ─
  useEffect(() => {
    if (!isAvailable || !isAdmin) return;

    const handleMetodosCambio = (e: Event) => {
      const { config } = (e as CustomEvent<{ config: unknown[] }>).detail;
      const event = buildLanEvent(
        'SINCRONIZAR_METODOS_PAGO',
        { terminalId: terminalIdRef.current || 'server', cajeroNombre: identityRef.current?.cajeroNombre || 'Admin', cajeroIp: '' },
        { config },
      );
      lanService.emitEvent(event);
    };

    window.addEventListener('codecpos:metodos-pago-cambio', handleMetodosCambio);
    return () => window.removeEventListener('codecpos:metodos-pago-cambio', handleMetodosCambio);
  }, [isAvailable, isAdmin]);

  // ── MODO SERVIDOR (Admin) ─────────────────────────────────────────────────────

  function _initServer() {
    lanService.startServer().then(result => {
      if (result.ok) {
        setMode('server');
        setConnectionState('connected');
        if (result.ip) setLocalIp(result.ip);
        // Graba el rol de ESTA terminal — ver comentario en tryInit().
        try { localStorage.setItem('codec_pos_lan_role', 'server'); } catch {}
      }
    });

    lanService.onClientConnected((data) => {
      setTerminals(prev => {
        const exists = prev.find(t => t.terminalId === data.terminalId);
        if (exists) {
          return prev.map(t => t.terminalId === data.terminalId
            ? { ...t, connected: true, lastSeen: Date.now(), userId: data.userId, cajeroNombre: data.cajeroNombre || t.cajeroNombre, wifiSsid: data.wifiSsid }
            : t
          );
        }
        return [...prev, {
          terminalId: data.terminalId,
          userId: data.userId,
          cajeroNombre: data.cajeroNombre || 'Terminal',
          cajeroIp: data.cajeroIp || '',
          cajeroRol: data.cajeroRol || 'cajero',
          machineHostname: data.machineHostname || '',
          connected: true,
          lastSeen: Date.now(),
          recentEvents: [],
          auditData: null,
          wifiSsid: data.wifiSsid ?? null,
        }];
      });
    });

    lanService.onClientDisconnected((data) => {
      setTerminals(prev =>
        prev.map(t => t.terminalId === data.terminalId ? { ...t, connected: false } : t)
      );
    });

    lanService.onEventReceived((event) => {
      // Dedup LAN ⟷ nube: si esta misma emisión ya llegó por el relay, no se
      // vuelve a procesar (ni al revés). Ver `yaProcesado`.
      if (yaProcesado(event)) return;
      if (event.type === 'AUDIT_RESPONSE') {
        setTerminals(prev =>
          prev.map(t => t.terminalId === event.terminalId
            ? { ...t, auditData: event.payload as Record<string, unknown> }
            : t
          )
        );
        return;
      }
      if (event.type === 'TRANSFERENCIA_RECIBIDA') {
        _handleTransferenciaRecibida(event);
        return;
      }
      if (event.type === 'TALLER_ORDEN_NUEVA') {
        _handleTallerOrdenNueva(event);
        // No 'return' — sigue también al feed genérico de actividad de abajo.
      }
      if (event.type === 'TALLER_ORDEN') {
        _handleTallerOrdenCambio(event);
        // No 'return' — sigue también al feed genérico de actividad de abajo.
      }
      if (event.type === 'CAJA_CIERRE') {
        _handleCajaCierreRecibido(event);
        // No 'return' — sigue también al feed genérico de actividad de abajo.
      }
      const entry = { raw: event, label: formatLanEventLabel(event) };
      setAllEvents(prev => [entry, ...prev].slice(0, 500));
      setTerminals(prev =>
        prev.map(t => t.terminalId === event.terminalId
          ? { ...t, lastSeen: Date.now(), recentEvents: [entry, ...t.recentEvents].slice(0, 5) }
          : t
        )
      );
    });
  }

  // ── MODO CLIENTE (Cajero/Técnico) ─────────────────────────────────────────────

  async function _initClient() {
    setMode('client');
    const identity  = identityRef.current!;
    const storedIp  = localStorage.getItem('lan_server_ip') || undefined;

    // Detect WiFi SSID so the server knows the connection type of this terminal
    let wifiSsid: string | null = null;
    const el = (window as any).electron;
    if (el?.wifi?.getSsid) {
      try { wifiSsid = await el.wifi.getSsid(); } catch { wifiSsid = null; }
    }
    const identityWithWifi: typeof identity = { ...identity, wifiSsid: wifiSsid ?? '' };

    lanService.startClient({ identity: identityWithWifi, serverIp: storedIp }).then(() => {
      setConnectionState('discovering');
    });

    lanService.onConnectionStatus((status) => {
      setConnectionState(status.state);
      if (status.state === 'connected') {
        // Graba el rol de ESTA terminal — ver comentario en tryInit(). También
        // se guarda la IP descubierta para que el panel de conexión la
        // muestre y para reconectar más rápido la próxima vez.
        try {
          localStorage.setItem('codec_pos_lan_role', 'client');
          if (status.serverIp) localStorage.setItem('lan_server_ip', status.serverIp);
        } catch {}
      }
    });

    // Escuchar eventos dirigidos desde el servidor a esta terminal
    lanService.onEventReceived((event) => {
      // Dedup LAN ⟷ nube — ver comentario en `yaProcesado`.
      if (yaProcesado(event)) return;
      if (event.type === 'NUEVA_REPARACION_REGISTRADA') {
        const myId = identityRef.current?.userId;
        if (event.targetUserId && myId && event.targetUserId !== myId) return;
        _handleNuevaReparacion(event);
      } else if (event.type === 'TALLER_ORDEN_NUEVA') {
        _handleTallerOrdenNueva(event);
      } else if (event.type === 'TALLER_ORDEN') {
        _handleTallerOrdenCambio(event);
      } else if (event.type === 'SINCRONIZAR_USUARIO') {
        _handleSyncUsuario(event);
      } else if (event.type === 'SINCRONIZAR_METODOS_PAGO') {
        _handleSyncMetodosPago(event);
      } else if (event.type === 'COMANDA_NUEVA') {
        _handleComandaNueva(event);
      } else if (event.type === 'TRANSFERENCIA_RECIBIDA') {
        _handleTransferenciaRecibida(event);
      } else if (event.type === 'CAJA_CIERRE') {
        _handleCajaCierreRecibido(event);
      }
    });

    // Responder peticiones de auditoría del admin
    lanService.onAuditRequest(() => {
      const responseEvent = buildLanEvent('AUDIT_RESPONSE', identity, _construirAuditoria());
      lanService.emitEvent(responseEvent);
    });
  }

  // ── RELAY POR NUBE (tercera vía) ──────────────────────────────────────────────
  //
  // Un evento que llega por la nube se procesa con EXACTAMENTE los mismos
  // handlers que si hubiera llegado por LAN — no hay lógica de negocio
  // duplicada, solo un transporte distinto. Por eso todo módulo que ya
  // funciona en red local (taller, comandas de cocina/mesas, cierres de caja,
  // sincronización de usuarios y permisos, transferencias) funciona entre
  // sedes sin escribir nada nuevo.
  const _dispatchCloudEvent = useCallback((event: LanEvent) => {
    // Eco propio (por si el servidor reenvía) — ya lo vimos localmente.
    if (event.terminalId && event.terminalId === terminalIdRef.current) return;
    // Ya llegó por LAN (o duplicado del propio canal): no repetir efectos.
    if (yaProcesado(event)) return;

    // El canal de nube es broadcast puro (no hay servidor que enrute), así que
    // el filtrado dirigido lo hace el receptor: si el evento va a un usuario
    // concreto y no soy yo, lo ignoro.
    const myUserId = identityRef.current?.userId;
    if (event.targetUserId && myUserId && event.targetUserId !== myUserId) return;

    switch (event.type) {
      case 'AUDIT_REQUEST':
        _responderAuditoria();
        return;
      case 'AUDIT_RESPONSE':
        setCloudTerminals(prev => prev.map(t => t.terminalId === event.terminalId
          ? { ...t, auditData: event.payload as Record<string, unknown> }
          : t
        ));
        return;
      case 'NUEVA_REPARACION_REGISTRADA':
        _handleNuevaReparacion(event);
        break;
      case 'TALLER_ORDEN_NUEVA':
        _handleTallerOrdenNueva(event);
        break;
      case 'TALLER_ORDEN':
        _handleTallerOrdenCambio(event);
        break;
      case 'SINCRONIZAR_USUARIO':
        _handleSyncUsuario(event);
        break;
      case 'SINCRONIZAR_METODOS_PAGO':
        _handleSyncMetodosPago(event);
        break;
      case 'COMANDA_NUEVA':
        _handleComandaNueva(event);
        break;
      case 'TRANSFERENCIA_RECIBIDA':
        _handleTransferenciaRecibida(event);
        break;
      case 'CAJA_CIERRE':
        _handleCajaCierreRecibido(event);
        break;
      default:
        break;
    }

    // Feed de actividad — el panel de Monitoreo muestra LAN y nube en la misma
    // línea de tiempo.
    const entry = { raw: event, label: formatLanEventLabel(event) };
    setAllEvents(prev => [entry, ...prev].slice(0, 500));
    setCloudTerminals(prev => prev.map(t => t.terminalId === event.terminalId
      ? { ...t, lastSeen: Date.now(), recentEvents: [entry, ...t.recentEvents].slice(0, 5) }
      : t
    ));
  }, [yaProcesado]);

  /** Snapshot de auditoría de ESTA terminal — compartido por LAN y por nube. */
  function _construirAuditoria(): Record<string, unknown> {
    return {
      ventasHoy: (() => {
        try { return JSON.parse(localStorage.getItem('pos-ventas-dia') || '[]').slice(-10); } catch { return []; }
      })(),
      caja: (() => {
        try { return JSON.parse(localStorage.getItem('pos-caja-sesiones-diarias') || '[]').slice(-1); } catch { return []; }
      })(),
      gastos: (() => {
        try { return JSON.parse(localStorage.getItem('pos-gastos') || '[]').slice(-5); } catch { return []; }
      })(),
      turnoActivo: (() => {
        try {
          const turnos: any[] = JSON.parse(localStorage.getItem('pos-turnos') || '[]');
          return turnos.find(t => t.activo) || null;
        } catch { return null; }
      })(),
      timestamp: new Date().toISOString(),
      cajero: identityRef.current?.cajeroNombre ?? '',
    };
  }

  function _responderAuditoria() {
    if (!identityRef.current) return;
    cloudRelay.emit(buildLanEvent('AUDIT_RESPONSE', identityRef.current, _construirAuditoria()));
  }

  // Conectar/desconectar el relay según preferencia del usuario y vinculación.
  useEffect(() => {
    if (!usuarioActual) return;

    if (!cloudEnabled) {
      cloudRelay.disconnect();
      setCloudState('disabled');
      setCloudDetail('');
      setCloudTerminals([]);
      return;
    }

    let cancelado = false;
    const intentarConectar = () => {
      if (cancelado) return;
      if (!identityRef.current) { setTimeout(intentarConectar, 250); return; }

      cloudRelay.connect(identityRef.current, {
        onEvent: (event) => { if (!cancelado) _dispatchCloudEvent(event); },
        onState: (estado, detalle) => {
          if (cancelado) return;
          setCloudState(estado);
          setCloudDetail(detalle || '');
        },
        onPresence: (presentes: CloudTerminalPresence[]) => {
          if (cancelado) return;
          setCloudTerminals(prev => {
            const enLinea = new Set(presentes.map(p => p.terminalId));
            const previas = new Map(prev.map(t => [t.terminalId, t]));

            const actualizadas: TerminalCard[] = presentes.map(p => {
              const anterior = previas.get(p.terminalId);
              return {
                terminalId: p.terminalId,
                userId: p.userId,
                cajeroNombre: p.cajeroNombre || 'Terminal',
                cajeroIp: p.cajeroIp || '',
                cajeroRol: p.cajeroRol || 'cajero',
                machineHostname: p.machineHostname || '',
                connected: true,
                lastSeen: Date.now(),
                recentEvents: anterior?.recentEvents ?? [],
                auditData: anterior?.auditData ?? null,
                wifiSsid: p.wifiSsid ?? null,
                transport: 'cloud',
              };
            });

            // Las que ya no están presentes se conservan como desconectadas,
            // igual que hace la LAN — así el admin ve "esta caja estuvo aquí".
            const desconectadas = prev
              .filter(t => !enLinea.has(t.terminalId))
              .map(t => ({ ...t, connected: false }));

            return [...actualizadas, ...desconectadas];
          });
        },
      });
    };
    intentarConectar();

    return () => {
      cancelado = true;
      cloudRelay.disconnect();
    };
  }, [usuarioActual?.username, cloudEnabled, _dispatchCloudEvent]);

  // ── Orden de taller completa recibida desde otra terminal (Admin ⟷ Cajero/Técnico) ──
  // A diferencia de TALLER_ORDEN (solo un resumen de cambio de estado) y de
  // NUEVA_REPARACION_REGISTRADA (solo notifica al técnico asignado), este
  // evento transporta la orden COMPLETA y llega por broadcast a TODAS las
  // terminales conectadas — así el Admin ve las órdenes que crea un
  // cajero/técnico, y viceversa, sin depender de que alguien asigne técnico.

  function _handleTallerOrdenNueva(event: LanEvent) {
    // Evitar procesar el eco de la propia orden que esta terminal creó: en
    // modo servidor, el Admin se ve reflejado a sí mismo vía
    // lanServer.emit('event', ...) al emitir su propia orden.
    if (event.terminalId && event.terminalId === terminalIdRef.current) return;

    const p = event.payload as { orden?: Record<string, unknown> & { id?: string; numeroOrden?: string; dispositivo?: { marca?: string; modelo?: string }; cliente?: { nombre?: string } } };
    const orden = p.orden;
    if (!orden?.id) return;

    (async () => {
      try {
        await tallerService.init();
        await tallerService.upsertOrdenRemota(orden as any);
        console.log(`[LAN][receive] TALLER_ORDEN_NUEVA — orden ${orden.numeroOrden} guardada localmente (id=${orden.id})`);

        toast.success(`Nueva orden de taller — ${orden.numeroOrden}`, {
          description: `${orden.dispositivo?.marca ?? ''} ${orden.dispositivo?.modelo ?? ''} · ${orden.cliente?.nombre ?? ''} · desde ${event.cajeroNombre}`,
          icon: <Wrench className="w-4 h-4 text-blue-400" />,
          duration: 6000,
        });

        // Notificar al Kanban/Lista del Taller para refresh automático
        window.dispatchEvent(new CustomEvent('lan:taller-estado-cambio', { detail: orden }));
      } catch (e) {
        console.warn('[LAN] Error guardando orden de taller recibida:', e);
      }
    })();
  }

  // ── Toast discreto en la cajera al cambiar estado de orden ──────────────────

  function _handleTallerOrdenCambio(event: LanEvent) {
    const p = event.payload;
    const estadoLabel = (p.nuevoEstadoLabel as string) || (p.nuevoEstado as string) || '—';

    toast(`Taller · Orden ${p.numeroOrden}`, {
      description: `${p.marca} ${p.modelo} → ${estadoLabel}`,
      icon: <Wrench className="w-4 h-4 text-blue-400" />,
      duration: 5000,
    });

    // Notificar al Kanban/Lista del Taller para refresh automático
    window.dispatchEvent(new CustomEvent('lan:taller-estado-cambio', { detail: p }));
  }

  // ── Notificación premium al técnico ──────────────────────────────────────────

  function _handleNuevaReparacion(event: LanEvent) {
    const p = event.payload as unknown as NuevaReparacionPayload;

    // Toast premium con icono Wrench y botón de cierre
    toast.custom((toastId) => (
      <div className="flex items-start gap-3 bg-slate-900 border border-cyan-500/40 rounded-2xl shadow-2xl shadow-cyan-500/10 p-4 pr-3 max-w-sm w-full pointer-events-auto">
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center">
          <Wrench className="w-5 h-5 text-cyan-400 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white leading-tight">
            ¡Nueva reparación asignada!
          </p>
          <p className="text-xs font-semibold text-cyan-300 mt-0.5">
            Orden {p.numeroOrden}
          </p>
          <p className="text-xs text-slate-400 mt-1 truncate">
            {p.marca} {p.modelo} — {p.cliente}
          </p>
          {p.prioridad === 'urgente' && (
            <span className="inline-block mt-1.5 px-2 py-0.5 bg-red-500/20 border border-red-500/30 rounded-full text-[10px] font-bold text-red-400 uppercase tracking-wide">
              Urgente
            </span>
          )}
        </div>
        <button
          onClick={() => toast.dismiss(toastId)}
          className="flex-shrink-0 mt-0.5 p-1 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    ), { duration: 8000, position: 'top-right' });

    // Sonido de alerta (tres notas ascendentes)
    playTallerAlertSound();

    // Notificar al Kanban via evento del navegador para actualización en caliente
    window.dispatchEvent(
      new CustomEvent('lan:nueva-reparacion', { detail: p })
    );
  }

  // ── Aplicar sync de usuario recibido desde el servidor LAN ──────────────────

  function _handleSyncUsuario(event: LanEvent) {
    const { action, data } = event.payload as { action: string; data: Record<string, unknown> };

    // 🛡️ FIX: el modal de Permisos NO cambia el objeto Usuario — guarda los
    // módulos habilitados en su propio almacén (permissions.ts) y dispara
    // 'codecpos:usuario-cambio' con action:'PERMISSIONS_UPDATE'. Antes esto
    // caía en el 'else' de abajo (pensado para DELETE) y no hacía nada útil:
    // los permisos otorgados en una terminal nunca llegaban a la otra hasta
    // cerrar sesión y volver a entrar. guardarPermisosUsuario() ya se encarga
    // de persistir (localStorage + IndexedDB) Y de disparar el evento que
    // AuthContext escucha para refrescar la sesión activa en caliente.
    if (action === 'PERMISSIONS_UPDATE') {
      const { userId, modulosHabilitados } = data as { userId?: string; modulosHabilitados?: ModuloPOS[] };
      console.log(`[LAN][receive] SINCRONIZAR_USUARIO action=PERMISSIONS_UPDATE en terminal=${terminalIdRef.current} userId=${userId ?? '?'}`, { payload: data });
      if (userId) {
        guardarPermisosUsuario({ userId, modulosHabilitados: modulosHabilitados || [] });
        console.log(`[LAN][receive] Permisos aplicados y persistidos para userId=${userId}: ${modulosHabilitados?.length ?? 0} módulos`, modulosHabilitados);
      } else {
        console.warn('[LAN][receive] PERMISSIONS_UPDATE recibido sin userId — descartado', data);
      }
      return;
    }

    try {
      const raw = localStorage.getItem('codecpos_usuarios');
      const lista: Record<string, unknown>[] = raw ? JSON.parse(raw) : [];
      let actualizada: Record<string, unknown>[];
      if (action === 'CREATE') {
        actualizada = lista.some(u => u.id === data.id) ? lista : [...lista, data];
      } else if (action === 'UPDATE') {
        actualizada = lista.map(u => u.id === data.id ? { ...u, ...data } : u);
      } else {
        actualizada = lista.filter(u => u.id !== data.id);
      }
      localStorage.setItem('codecpos_usuarios', JSON.stringify(actualizada));
      window.dispatchEvent(new CustomEvent('codecpos:usuarios-sincronizados'));
      console.log(`[LAN] Usuario sincronizado: ${action} id=${data.id}`);
    } catch (e) {
      console.warn('[LAN] Error aplicando sync de usuario:', e);
    }
  }

  // ── Aplicar sync de métodos de pago recibido desde el servidor LAN ────────────

  function _handleSyncMetodosPago(event: LanEvent) {
    const { config } = event.payload as { config: unknown[] };
    try {
      localStorage.setItem('codecpos_metodos_pago_config', JSON.stringify(config));
      window.dispatchEvent(new CustomEvent('codecpos:metodos-pago-sincronizados'));
    } catch (e) {
      console.warn('[LAN] Error aplicando sync de métodos de pago:', e);
    }
  }

  // ── Cierre de caja recibido desde otra terminal (Admin ⟷ Cajero) ─────────────

  function _handleCajaCierreRecibido(event: LanEvent) {
    // Evitar procesar el eco de nuestro propio cierre: en modo servidor, el
    // Admin se ve reflejado a sí mismo vía lanServer.emit('event', ...) al
    // emitir su propio CAJA_CIERRE — ya lo vio con el toast de cierre local.
    if (event.terminalId && event.terminalId === terminalIdRef.current) return;

    const p = event.payload as {
      cierre?: Record<string, unknown> & { id?: string };
      totalVentas?: number;
      cajero?: string;
      diferencia?: number;
    };
    const cierreCompleto = p.cierre;

    // Guardar el cierre completo en el historial local de ESTA terminal para
    // que Reportes / el historial de Cierre de Caja lo muestren igual que si
    // se hubiera hecho aquí — no solo un aviso que desaparece.
    if (cierreCompleto?.id) {
      try {
        const cierres: Array<Record<string, unknown> & { id?: string }> =
          JSON.parse(localStorage.getItem('pos-cierres-caja') || '[]');
        if (!cierres.some((c) => c.id === cierreCompleto.id)) {
          cierres.push(cierreCompleto);
          localStorage.setItem('pos-cierres-caja', JSON.stringify(cierres));
        }
      } catch (e) {
        console.warn('[LAN] Error guardando cierre de caja recibido:', e);
      }
    }

    toast.success(`Cierre de caja recibido — ${p.cajero || event.cajeroNombre}`, {
      description: `Total del turno: $${Number(p.totalVentas || 0).toLocaleString('es-CO')}`
        + (p.diferencia ? ` · Diferencia: $${Number(p.diferencia).toLocaleString('es-CO')}` : ''),
      duration: 6000,
    });

    window.dispatchEvent(new CustomEvent('lan:cierre-caja-recibido', { detail: cierreCompleto ?? p }));
  }

  // ── Transferencia de archivos/datos entre terminales POS ─────────────────────

  function _handleTransferenciaRecibida(event: LanEvent) {
    const p = event.payload as { modulo?: string; tipo?: string; datos?: unknown };
    const moduloLabel: Record<string, string> = {
      taller: 'Taller de Reparaciones',
      soporte: 'Soporte Técnico',
      restaurante: 'Restaurante / Alimentos y Bebidas',
    };
    const tipoLabel: Record<string, string> = {
      respaldo_caja: 'Respaldo de Caja',
      ordenes_pendientes: 'Órdenes Pendientes',
      comandas_mesa: 'Comandas de Mesa',
      bd_local: 'Base de Datos Local',
    };

    toast.success(`Transferencia recibida — ${moduloLabel[p.modulo ?? ''] ?? p.modulo}`, {
      description: `${tipoLabel[p.tipo ?? ''] ?? p.tipo} · desde ${event.cajeroNombre}`,
      duration: 7000,
    });

    // Aplicar datos automáticamente según módulo y tipo
    (async () => {
      try {
        const d = p.datos as Record<string, unknown> ?? {};

        if (p.modulo === 'taller' || p.tipo === 'ordenes_pendientes') {
          // Taller usa IndexedDB — importar cada orden vía tallerService
          const ordenes = (d.ordenes as any[]) ?? [];
          if (ordenes.length > 0) {
            await tallerService.init();
            for (const orden of ordenes) {
              try { await tallerService.upsertOrdenRemota(orden); } catch { /* skip inválidas */ }
            }
          }
        }

        if (p.modulo === 'restaurante' || p.tipo === 'comandas_mesa') {
          // Panadería: keys reales de localStorage
          if (d.mesas)       localStorage.setItem('codecpos_mesas_config', JSON.stringify(d.mesas));
          if (d.cuentas)     localStorage.setItem('codecpos_mesas_cuentas', JSON.stringify(d.cuentas));
          if (d.cuentaLibre) localStorage.setItem('codecpos_panaderia_cuenta_libre', JSON.stringify(d.cuentaLibre));
          if (d.categorias)  localStorage.setItem('codecpos_panaderia_cats', JSON.stringify(d.categorias));
        }

        if (p.tipo === 'respaldo_caja') {
          if (d.ventas) localStorage.setItem('pos-ventas-dia', JSON.stringify(d.ventas));
          if (d.caja)   localStorage.setItem('pos-caja-sesiones-diarias', JSON.stringify(d.caja));
          if (d.gastos) localStorage.setItem('pos-gastos', JSON.stringify(d.gastos));
          if (d.turno)  localStorage.setItem('pos-turnos', JSON.stringify(d.turno));
        }

        if (p.tipo === 'bd_local') {
          // Importar claves localStorage
          Object.entries(d).forEach(([k, v]) => {
            if (k === '__taller_ordenes_idb__') return; // manejar por separado
            if (k.startsWith('pos-') || k.startsWith('codecpos')) {
              try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch {}
            }
          });
          // Importar snapshot de Taller si viene incluido
          const tallerSnap = d['__taller_ordenes_idb__'] as any[];
          if (Array.isArray(tallerSnap) && tallerSnap.length > 0) {
            await tallerService.init();
            for (const orden of tallerSnap) {
              try { await tallerService.upsertOrdenRemota(orden); } catch { /* skip inválidas */ }
            }
          }
        }
      } catch (e) {
        console.warn('[LAN] Error aplicando transferencia recibida:', e);
      }
    })();

    // Notificar módulos activos para que refresquen sin recargar
    window.dispatchEvent(new CustomEvent('lan:transferencia-recibida', { detail: p }));
    if (p.modulo === 'taller') {
      window.dispatchEvent(new CustomEvent('lan:transferencia-taller', { detail: p }));
    } else if (p.modulo === 'restaurante') {
      window.dispatchEvent(new CustomEvent('lan:transferencia-restaurante', { detail: p }));
    }
  }

  // ── Comanda nueva (Restaurante: cocina / barra) ──────────────────────────────

  function _handleComandaNueva(event: LanEvent) {
    const myRol = identityRef.current?.cajeroRol ?? '';
    const caps  = getRoleCapabilities(myRol);
    // Solo mostrar si este rol puede recibir comandas
    if (!caps.includes('all') && !caps.includes('comandas_entrada')) return;

    const p = event.payload as unknown as ComandaPayload;
    const itemCount = Array.isArray(p.items) ? p.items.length : 0;

    toast(`Comanda → ${p.destino}`, {
      description: `${itemCount} ítem(s)${p.mesaLabel ? ` · Mesa ${p.mesaLabel}` : ''} · de ${p.meseroNombre || event.cajeroNombre}`,
      duration: 8000,
    });

    window.dispatchEvent(new CustomEvent('lan:comanda-nueva', { detail: p }));
  }

  // ── API pública ───────────────────────────────────────────────────────────────

  const emitLanEvent = useCallback((
    type: string,
    payload: Record<string, unknown> = {},
    targetUserId?: string,
  ) => {
    // 🛡️ Ya no exige `isAvailable`: sin Electron no hay LAN, pero el relay por
    // nube sí puede transportar el evento. Cada transporte se decide abajo.
    if (!identityRef.current) return;

    // Auto-notificación: el admin se asigna a sí mismo como técnico → manejar localmente sin red
    if (targetUserId && targetUserId === identityRef.current.userId) {
      if (type === 'NUEVA_REPARACION_REGISTRADA') {
        _handleNuevaReparacion({
          type: 'NUEVA_REPARACION_REGISTRADA',
          terminalId: terminalIdRef.current,
          cajeroNombre: identityRef.current?.cajeroNombre || '',
          cajeroIp: '',
          timestamp: new Date().toISOString(),
          payload,
        } as LanEvent);
      }
      return;
    }

    // Tanto el admin (server) como cajeros (client) pueden emitir eventos a la red.
    // El IPC lan:emit-event en main.js se encarga del enrutamiento correcto según el modo.
    const event = buildLanEvent(type, identityRef.current, payload, targetUserId);

    // Se publica por AMBAS vías cuando ambas están disponibles: la LAN llega
    // primero (misma red, sin internet) y la nube alcanza a las terminales de
    // otras redes. El `eventId` garantiza que quien reciba las dos copias
    // procese una sola. Ver `yaProcesado`.
    if (isAvailable) lanService.emitEvent(event);
    cloudRelay.emit(event);
  }, [isAvailable]);

  const requestAudit = useCallback((terminalId: string) => {
    // Terminal remota vía nube: la petición viaja por el relay (broadcast
    // dirigido por targetUserId; ver _dispatchCloudEvent → 'AUDIT_REQUEST').
    const remotaNube = cloudTerminals.find(t => t.terminalId === terminalId);
    if (remotaNube && !terminals.some(t => t.terminalId === terminalId)) {
      if (identityRef.current) {
        cloudRelay.emit(buildLanEvent('AUDIT_REQUEST', identityRef.current, {}, remotaNube.userId));
      }
      setCloudTerminals(prev =>
        prev.map(t => t.terminalId === terminalId ? { ...t, auditData: undefined } : t)
      );
      return;
    }

    if (mode !== 'server') return;
    lanService.sendAuditRequest(terminalId);
    setTerminals(prev =>
      prev.map(t => t.terminalId === terminalId ? { ...t, auditData: undefined } : t)
    );
  }, [mode, cloudTerminals, terminals]);

  const setServerIp = useCallback((ip: string) => {
    localStorage.setItem('lan_server_ip', ip);
    setServerIpState(ip);
    if (!isAdmin && isAvailable && identityRef.current) {
      lanService.stop().then(() => {
        lanService.removeAllListeners();
        lanService.startClient({ identity: identityRef.current!, serverIp: ip });
        lanService.onConnectionStatus(s => {
          setConnectionState(s.state);
          // Conectar manualmente a un servidor también fija el rol de esta
          // terminal como 'client' — ver comentario en tryInit().
          if (s.state === 'connected') {
            try { localStorage.setItem('codec_pos_lan_role', 'client'); } catch {}
          }
        });
      });
    }
  }, [isAdmin, isAvailable]);

  const clearAudit = useCallback((terminalId: string) => {
    setTerminals(prev =>
      prev.map(t => t.terminalId === terminalId ? { ...t, auditData: null } : t)
    );
    setCloudTerminals(prev =>
      prev.map(t => t.terminalId === terminalId ? { ...t, auditData: null } : t)
    );
  }, []);

  const setCloudEnabled = useCallback((valor: boolean) => {
    persistCloudRelayEnabled(valor);
    setCloudEnabledState(valor);
  }, []);

  // Vista unificada: una terminal alcanzable por LAN **y** por nube aparece una
  // sola vez, y gana la LAN (transporte más rápido y con más datos: IP real,
  // auditoría directa).
  const terminalesUnificadas = useMemo(() => {
    const idsLan = new Set(terminals.map(t => t.terminalId));
    return [
      ...terminals.map(t => ({ ...t, transport: t.transport ?? ('lan' as const) })),
      ...cloudTerminals.filter(t => !idsLan.has(t.terminalId)),
    ];
  }, [terminals, cloudTerminals]);

  const cloudOnlineCount = cloudTerminals.filter(t => t.connected).length;

  return (
    <LanContext.Provider value={{
      mode, connectionState, localIp, serverIp, terminals: terminalesUnificadas, allEvents,
      isAvailable, emitLanEvent, requestAudit, setServerIp, clearAudit,
      cloudAvailable, cloudEnabled, cloudState, cloudDetail, cloudOnlineCount, setCloudEnabled,
    }}>
      {children}
    </LanContext.Provider>
  );
}

export function useLanContext() {
  return useContext(LanContext);
}
