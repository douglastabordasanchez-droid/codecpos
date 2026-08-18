/**
 * CODEC POS v2.0 — Relay de terminales por la nube (Supabase Realtime)
 *
 * Tercera vía de comunicación entre terminales, además de las dos que ya
 * existían (Wi-Fi y LAN cableada, ambas por TCP:4000 / UDP:4001 vía
 * `lanService`). El transporte LAN sigue siendo el camino principal —rápido,
 * sin internet y sin costo—; este relay se suma ENCIMA, no lo reemplaza:
 *
 *   • LAN  → terminales en la MISMA red física (router/switch compartido).
 *   • Nube → terminales en REDES DISTINTAS: otra sede, el celular del dueño
 *            en datos móviles, la cocina con su propio Wi-Fi, un técnico de
 *            taller trabajando desde su casa.
 *
 * Transporta exactamente el mismo `LanEvent` que la LAN, así que TODO evento
 * que ya funciona en red local (TALLER_ORDEN_NUEVA, COMANDA_NUEVA, CAJA_CIERRE,
 * SINCRONIZAR_USUARIO, TRANSFERENCIA_RECIBIDA…) viaja por la nube sin escribir
 * un solo handler nuevo: LanContext despacha ambos orígenes por el mismo
 * camino y deduplica por `eventId`.
 *
 * Usa Realtime Broadcast + Presence — canal efímero, SIN tabla y SIN migración
 * (mismo patrón que `scanBroadcast.ts`). El canal está namespaceado por el
 * `clienteId` del negocio vinculado, así que solo las terminales de ESE negocio
 * comparten bus de eventos.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from './config';
import { getLinkedClienteId } from './tenantLink';
import type { LanEvent, LanTerminalIdentity } from '../lanService';

export type CloudRelayState = 'disabled' | 'unavailable' | 'connecting' | 'connected' | 'error';

/** Identidad publicada por Presence: quién está en línea vía nube ahora mismo. */
export interface CloudTerminalPresence extends LanTerminalIdentity {
  /** ISO timestamp del momento en que esta terminal entró al canal. */
  onlineAt: string;
}

const LS_ENABLED = 'codecpos_cloud_relay_enabled';
const BROADCAST_EVENT = 'pos_event';

interface CloudRelayCallbacks {
  onEvent: (event: LanEvent) => void;
  onPresence: (terminales: CloudTerminalPresence[]) => void;
  onState: (state: CloudRelayState, detalle?: string) => void;
}

// ── Preferencia del usuario (persistida por terminal) ────────────────────────

/**
 * Por defecto ENCENDIDO: si el negocio ya está vinculado a la nube, tener las
 * terminales visibles entre sí es lo que el usuario espera. Si no hay
 * vinculación, `isCloudRelayAvailable()` lo apaga solo — nunca intenta
 * conectarse a ciegas.
 */
export function isCloudRelayEnabled(): boolean {
  try {
    return localStorage.getItem(LS_ENABLED) !== 'false';
  } catch {
    return true;
  }
}

export function setCloudRelayEnabled(valor: boolean): void {
  try {
    localStorage.setItem(LS_ENABLED, valor ? 'true' : 'false');
  } catch {
    /* storage lleno — la preferencia simplemente no persiste */
  }
}

/** Hay nube utilizable: Supabase configurado Y esta instalación vinculada a un negocio. */
export function isCloudRelayAvailable(): boolean {
  return isSupabaseConfigured() && !!getLinkedClienteId();
}

export function getCloudRelayClienteId(): string | null {
  return getLinkedClienteId();
}

// ── Relay ────────────────────────────────────────────────────────────────────

class CloudRelay {
  private channel: RealtimeChannel | null = null;
  private identity: LanTerminalIdentity | null = null;
  private callbacks: CloudRelayCallbacks | null = null;
  private connected = false;

  get isConnected(): boolean {
    return this.connected;
  }

  connect(identity: LanTerminalIdentity, callbacks: CloudRelayCallbacks): void {
    this.disconnect();

    this.identity = identity;
    this.callbacks = callbacks;

    if (!isCloudRelayEnabled()) {
      callbacks.onState('disabled');
      return;
    }

    const client = getSupabaseClient();
    const clienteId = getLinkedClienteId();

    if (!client) {
      callbacks.onState('unavailable', 'Nuestra base de datos no está configurada en esta instalación.');
      return;
    }
    if (!clienteId) {
      callbacks.onState('unavailable', 'Esta terminal aún no está vinculada a un negocio en la nube.');
      return;
    }

    callbacks.onState('connecting');

    const channel = client.channel(`pos-terminales-${clienteId}`, {
      config: {
        // `self: false` evita que la terminal reciba de vuelta su propio
        // broadcast — el eco ya lo maneja LanContext, pero ahorrarlo es gratis.
        broadcast: { self: false, ack: false },
        // La clave de presencia es el terminalId: si la misma terminal
        // reconecta, reemplaza su entrada en vez de duplicarse en la lista.
        presence: { key: identity.terminalId },
      },
    });

    channel.on('broadcast', { event: BROADCAST_EVENT }, ({ payload }) => {
      const evento = payload as LanEvent;
      if (!evento?.type) return;
      // Descartar el eco propio por si el servidor lo reenvía igualmente.
      if (evento.terminalId && evento.terminalId === this.identity?.terminalId) return;
      this.callbacks?.onEvent(evento);
    });

    const emitirPresencia = () => {
      const estado = channel.presenceState<CloudTerminalPresence>();
      const terminales: CloudTerminalPresence[] = Object.values(estado)
        .flat()
        .filter((p) => !!p && typeof p.terminalId === 'string')
        // La propia terminal no se muestra como "terminal remota" en el panel.
        .filter((p) => p.terminalId !== this.identity?.terminalId);
      this.callbacks?.onPresence(terminales);
    };

    channel.on('presence', { event: 'sync' }, emitirPresencia);
    channel.on('presence', { event: 'join' }, emitirPresencia);
    channel.on('presence', { event: 'leave' }, emitirPresencia);

    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        this.connected = true;
        callbacks.onState('connected');
        channel
          .track({ ...identity, onlineAt: new Date().toISOString() } satisfies CloudTerminalPresence)
          .catch(() => {});
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        this.connected = false;
        callbacks.onState('error', err?.message || 'No se pudo abrir el canal de la nube.');
        return;
      }
      if (status === 'CLOSED') {
        this.connected = false;
        callbacks.onState('disabled');
      }
    });

    this.channel = channel;
  }

  /** Publica un evento a todas las terminales del negocio conectadas por nube. */
  emit(event: LanEvent): void {
    if (!this.channel || !this.connected) return;
    this.channel
      .send({ type: 'broadcast', event: BROADCAST_EVENT, payload: event })
      .catch((e) => console.warn('[CloudRelay] No se pudo publicar el evento:', e));
  }

  disconnect(): void {
    const client = getSupabaseClient();
    if (this.channel && client) {
      try {
        this.channel.untrack().catch(() => {});
        client.removeChannel(this.channel);
      } catch {
        /* canal ya cerrado */
      }
    }
    this.channel = null;
    this.connected = false;
  }
}

export const cloudRelay = new CloudRelay();
