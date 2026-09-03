import { useEffect } from 'react';
import { obtenerComandasActivas, suscribirComandas, type EstadoComanda } from '../../app/lib/supabase/panaderiaSyncService';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { avisarCambioComanda, type EstadoAvisableComanda } from '../lib/pedidoAlerts';

const ESTADOS_AVISABLES = new Set<EstadoComanda>(['preparando', 'listo']);

function mismoNombre(a?: string, b?: string): boolean {
  return !!a && !!b && a.trim().localeCompare(b.trim(), 'es', { sensitivity: 'base' }) === 0;
}

/**
 * Mantiene a cada mesero informado aunque navegue fuera del salón. El mapa se
 * inicializa con las comandas ya existentes para no anunciar pedidos viejos al
 * abrir la app; solo avisa transiciones reales recibidas por Realtime.
 */
export function useComandaAlerts(): void {
  const { empleado } = usePwaAuth();

  useEffect(() => {
    if (!empleado) return;
    let cancelado = false;
    const estados = new Map<string, EstadoComanda>();

    obtenerComandasActivas(empleado.cliente_id)
      .then((comandas) => {
        if (cancelado) return;
        comandas.forEach((comanda) => estados.set(comanda.id, comanda.estado));
      })
      .catch(() => { /* Realtime sigue siendo útil aunque falle la carga inicial. */ });

    const unsubscribe = suscribirComandas(empleado.cliente_id, (comanda) => {
      const anterior = estados.get(comanda.id);
      estados.set(comanda.id, comanda.estado);

      if (
        anterior &&
        anterior !== comanda.estado &&
        ESTADOS_AVISABLES.has(comanda.estado) &&
        mismoNombre(comanda.meseroNombre, empleado.nombre_completo)
      ) {
        avisarCambioComanda(comanda, comanda.estado as EstadoAvisableComanda);
      }
    });

    return () => { cancelado = true; unsubscribe(); };
  }, [empleado?.cliente_id, empleado?.nombre_completo]);
}
