/**
 * Canal efímero (Supabase Realtime Broadcast, sin tabla) para enviar un
 * código escaneado desde la cámara del celular (PWA) hacia la pantalla de
 * venta activa en Electron. Todas las cajas abiertas de ese negocio lo
 * reciben — para v1 es intencional (negocio de una sola caja o "la que esté
 * abierta la recibe"), targeting por terminal específico queda para después.
 */
import { getSupabaseClient } from './config';

interface ScanPayload {
  codigo: string;
  origen: 'pwa';
  timestamp: number;
}

export function enviarCodigoEscaneado(clienteId: string, codigo: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return Promise.resolve(false);

  // 🛡️ `ack: true` es obligatorio aquí: sin él, `channel.send()` resuelve en
  // cuanto el mensaje sale por el WebSocket local, no cuando el servidor lo
  // confirma — `removeChannel` inmediatamente después cerraba la conexión
  // antes de que el broadcast llegara a viajar de verdad (se perdía en
  // silencio, sin error, cada vez).
  const channel = client.channel(`escaneos-${clienteId}`, {
    config: { broadcast: { ack: true } },
  });

  return new Promise((resolve) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel
          .send({
            type: 'broadcast',
            event: 'codigo_escaneado',
            payload: { codigo, origen: 'pwa', timestamp: Date.now() } satisfies ScanPayload,
          })
          .then(() => {
            client.removeChannel(channel);
            resolve(true);
          });
      }
    });
  });
}

export function suscribirCodigosEscaneados(
  clienteId: string,
  onCodigo: (codigo: string) => void
): () => void {
  const client = getSupabaseClient();
  if (!client) return () => {};

  const channel = client
    .channel(`escaneos-${clienteId}`)
    .on('broadcast', { event: 'codigo_escaneado' }, ({ payload }) => {
      onCodigo((payload as ScanPayload).codigo);
    })
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}
