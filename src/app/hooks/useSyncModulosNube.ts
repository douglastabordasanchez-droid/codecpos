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
import {
  pullOrdenesTallerDesdePwa,
  suscribirCambiosTallerPwa,
} from '../lib/supabase/tallerSyncService';
import {
  suscribirCuentasMesa,
  type CuentaMesa,
} from '../lib/supabase/panaderiaSyncService';
import type { OrdenServicio } from '../types/taller';

const STORAGE_CUENTAS_MESAS = 'codecpos_mesas_cuentas';

export function useSyncModulosNube() {
  useEffect(() => {
    const clienteId = getLinkedClienteId();
    if (!isSupabaseConfigured() || !clienteId) return;

    let cancelado = false;

    // ── Taller: aplicar una orden que llegó del celular ──────────────────────
    const aplicarOrden = async (orden: OrdenServicio) => {
      if (cancelado) return;
      try {
        await tallerService.init();
        await tallerService.upsertOrdenRemota(orden);
        window.dispatchEvent(new CustomEvent('lan:taller-estado-cambio', { detail: orden }));
        toast(`Taller · Orden ${orden.numeroOrden}`, {
          description: `Actualizada desde la app móvil · ${orden.estado}`,
          duration: 5000,
        });
      } catch (e) {
        console.warn('[SyncNube] No se pudo aplicar la orden recibida del celular:', e);
      }
    };

    // Al arrancar: recuperar lo que pasó mientras la caja estaba cerrada.
    pullOrdenesTallerDesdePwa()
      .then((ordenes) => { ordenes.forEach(aplicarOrden); })
      .catch((e) => console.warn('[SyncNube] Pull inicial de taller falló:', e));

    const desuscribirTaller = suscribirCambiosTallerPwa(aplicarOrden);

    // ── Panadería: cuenta de mesa enviada por un mesero ──────────────────────
    const desuscribirCuentas = suscribirCuentasMesa(clienteId, (cuenta: CuentaMesa) => {
      if (cancelado) return;
      // Lo que escribió esta misma caja ya está aplicado localmente.
      if (cuenta.actualizadoEn !== 'pwa') return;

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
      desuscribirTaller();
      desuscribirCuentas();
    };
  }, []);
}
