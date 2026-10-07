/**
 * Bloqueo de Electron cuando Codec Studio suspende al negocio o su licencia
 * vence. Antes, un cliente suspendido seguía entrando con el usuario guardado
 * en el equipo (el login local nunca miraba la nube) y la suspensión no
 * servía de nada.
 *
 * Revisa `clientes_pos` del negocio vinculado al abrir, cada 2 minutos y al
 * volver a la ventana. El último resultado se guarda en el equipo: si el
 * negocio quedó bloqueado y luego se apaga el internet, sigue bloqueado; si
 * nunca se pudo consultar, no se bloquea (no se castiga a quien no tiene red).
 */
import { useCallback, useEffect, useState } from 'react';
import { getSupabaseClient } from '../lib/supabase/config';
import { getLinkedClienteId } from '../lib/supabase/tenantLink';
import { MotivoBloqueoLicencia, motivoBloqueoLicencia } from '../lib/bloqueoLicencia';

const REVISAR_CADA_MS = 2 * 60_000;
const CLAVE_CACHE = 'codecpos_bloqueo_licencia_v1_';

interface CacheBloqueo { motivo: MotivoBloqueoLicencia | null; nombreNegocio?: string; fechaExpiracion?: string | null; duracion?: string | null; estado?: string | null }

function leerCache(clienteId: string): CacheBloqueo | null {
  try {
    const raw = localStorage.getItem(CLAVE_CACHE + clienteId);
    return raw ? (JSON.parse(raw) as CacheBloqueo) : null;
  } catch {
    return null;
  }
}

export function useBloqueoLicencia(activo: boolean) {
  const [clienteId] = useState(() => getLinkedClienteId());
  const [estado, setEstado] = useState<CacheBloqueo | null>(() => (clienteId ? leerCache(clienteId) : null));

  const revisar = useCallback(async () => {
    const client = getSupabaseClient();
    if (!clienteId || !client || !navigator.onLine) return;
    try {
      const { data, error } = await client
        .from('clientes_pos')
        .select('nombre_negocio, estado, duracion, fecha_expiracion')
        .eq('id', clienteId)
        .maybeSingle();
      if (error || !data) return;
      const nuevo: CacheBloqueo = {
        motivo: motivoBloqueoLicencia(data),
        nombreNegocio: data.nombre_negocio ?? undefined,
        fechaExpiracion: data.fecha_expiracion,
        duracion: data.duracion,
        estado: data.estado,
      };
      setEstado(nuevo);
      try { localStorage.setItem(CLAVE_CACHE + clienteId, JSON.stringify(nuevo)); } catch { /* ignorar */ }
    } catch { /* sin red: se mantiene el último resultado */ }
  }, [clienteId]);

  useEffect(() => {
    if (!activo || !clienteId) return;
    revisar();
    const intervalo = window.setInterval(revisar, REVISAR_CADA_MS);
    window.addEventListener('focus', revisar);
    window.addEventListener('online', revisar);
    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener('focus', revisar);
      window.removeEventListener('online', revisar);
    };
  }, [activo, clienteId, revisar]);

  // La fecha de vencimiento también se evalúa sin internet: si la licencia
  // vence mientras el equipo está desconectado, igual se bloquea.
  const motivo = estado
    ? estado.motivo ?? motivoBloqueoLicencia({ estado: estado.estado, duracion: estado.duracion, fecha_expiracion: estado.fechaExpiracion })
    : null;

  return { motivo, nombreNegocio: estado?.nombreNegocio, revisar };
}
