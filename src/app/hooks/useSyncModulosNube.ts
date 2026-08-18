/**
 * Trae a Electron lo que el equipo hizo desde el celular.
 *
 * El camino de ida (Electron → nube) es explícito: el dueño publica los datos
 * desde Configuración → Módulos en la App Web. El de vuelta tiene que ser
 * automático, porque nadie va a estar pulsando «actualizar» en la caja
 * mientras el mesero toma pedidos o el técnico mueve órdenes.
 *
 * Se monta una sola vez, en ProtectedLayout, para que funcione aunque la
 * pantalla del módulo no esté abierta — igual que los handlers de la LAN.
 * Reutiliza los MISMOS eventos de ventana que ya dispara LanContext
 * (`lan:taller-estado-cambio`), así que el Kanban y el salón se refrescan
 * solos sin tocar esas pantallas.
 */
import { useEffect } from 'react';
import { toast } from 'sonner';
import { tallerService } from '../services/tallerService';
import { getLinkedClienteId } from '../lib/supabase/tenantLink';
import { isSupabaseConfigured } from '../lib/supabase/config';
import { useAuth } from '../contexts/AuthContext';
import { playTallerAlertSound } from '../lib/tallerAlertSound';
import {
  pullOrdenesTallerDesdePwa,
  suscribirCambiosTallerPwa,
} from '../lib/supabase/tallerSyncService';
import {
  suscribirCuentasMesa,
  esEcoPropioDeMesa,
  type CuentaMesa,
} from '../lib/supabase/panaderiaSyncService';
import type { OrdenServicio } from '../types/taller';

const STORAGE_CUENTAS_MESAS = 'codecpos_mesas_cuentas';
const TALLER_PULL_INTERVAL_MS = 30000;

export function useSyncModulosNube() {
  const { usuarioActual } = useAuth();

  useEffect(() => {
    const clienteId = getLinkedClienteId();
    if (!isSupabaseConfigured() || !clienteId) return;

    let cancelado = false;

    // ── Taller: aplicar una orden que llegó de otra caja o del celular ───────
    const aplicarOrden = async (orden: OrdenServicio) => {
      if (cancelado) return;
      try {
        await tallerService.init();
        const yaExistia = !!(await tallerService.obtenerOrden(orden.id));
        await tallerService.upsertOrdenRemota(orden);
        window.dispatchEvent(new CustomEvent('lan:taller-estado-cambio', { detail: orden }));

        // Compara por nombre completo — es lo único que viaja hoy en
        // `tecnicoAsignado` desde cualquier origen (Electron u otra caja).
        const asignadaAMi =
          !!usuarioActual?.nombreCompleto &&
          orden.tecnicoAsignado?.trim().toLowerCase() === usuarioActual.nombreCompleto.trim().toLowerCase();

        if (!yaExistia && asignadaAMi) {
          playTallerAlertSound();
          toast.success(`🔧 Nueva reparación asignada a ti — Orden ${orden.numeroOrden}`, {
            description: orden.dispositivo?.marca || orden.dispositivo?.tipo || undefined,
            duration: 8000,
          });
        } else if (!yaExistia) {
          toast(`Taller · Nueva orden ${orden.numeroOrden}`, {
            description: orden.tecnicoAsignado ? `Asignada a ${orden.tecnicoAsignado}` : 'Sin técnico asignado',
            duration: 5000,
          });
        } else {
          toast(`Taller · Orden ${orden.numeroOrden}`, {
            description: `Actualizada · ${orden.estado}`,
            duration: 5000,
          });
        }
      } catch (e) {
        console.warn('[SyncNube] No se pudo aplicar la orden recibida:', e);
      }
    };

    const pullTaller = () => {
      pullOrdenesTallerDesdePwa()
        .then((ordenes) => { ordenes.forEach(aplicarOrden); })
        .catch((e) => console.warn('[SyncNube] Pull de taller falló:', e));
    };

    // Al arrancar: recuperar lo que pasó mientras la caja estaba cerrada.
    pullTaller();
    // 🛡️ Red de seguridad: además del realtime, un pull periódico por si se
    // cae la conexión del canal sin que nadie lo note (mismo patrón que
    // ventas/productos en syncService.ts).
    const intervaloTaller = window.setInterval(pullTaller, TALLER_PULL_INTERVAL_MS);

    const desuscribirTaller = suscribirCambiosTallerPwa(aplicarOrden);

    // ── Panadería: cuenta de mesa enviada por un mesero U OTRA CAJA ──────────
    const desuscribirCuentas = suscribirCuentasMesa(clienteId, (cuenta: CuentaMesa) => {
      if (cancelado) return;
      // Ignorar el reflejo del propio guardado — antes se ignoraba TODO lo
      // que no viniera marcado 'pwa', lo que también bloqueaba enterarse de
      // cambios hechos desde otra caja Electron.
      if (esEcoPropioDeMesa(cuenta.mesaLocalId)) return;

      try {
        const raw = localStorage.getItem(STORAGE_CUENTAS_MESAS);
        const mapa: Record<string, unknown[]> = raw ? JSON.parse(raw) : {};
        mapa[cuenta.mesaLocalId] = cuenta.items;
        localStorage.setItem(STORAGE_CUENTAS_MESAS, JSON.stringify(mapa));

        // La pantalla de Panadería escucha esto para repintar el salón.
        window.dispatchEvent(new CustomEvent('codecpos:panaderia-cuentas-sincronizadas', {
          detail: { mesaId: cuenta.mesaLocalId, items: cuenta.items },
        }));

        if (cuenta.items.length > 0) {
          toast.success(`Comanda recibida — Mesa ${cuenta.mesaLocalId}`, {
            description: `${cuenta.items.length} ítem(s) · $${Math.round(cuenta.total).toLocaleString('es-CO')}`
              + (cuenta.meseroNombre ? ` · ${cuenta.meseroNombre}` : ''),
            duration: 7000,
          });
        }
      } catch (e) {
        console.warn('[SyncNube] No se pudo aplicar la comanda recibida:', e);
      }
    });

    return () => {
      cancelado = true;
      window.clearInterval(intervaloTaller);
      desuscribirTaller();
      desuscribirCuentas();
    };
  }, [usuarioActual?.nombreCompleto]);
}
