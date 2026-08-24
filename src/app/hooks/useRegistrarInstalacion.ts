import { useEffect } from 'react';
import { getSupabaseClient } from '../lib/supabase/config';
import { getRealMachineUUID } from '../utils/machineId';
import { useAuth } from '../contexts/AuthContext';

/**
 * Registra esta instalación de Electron contra la licencia del cliente
 * (tabla `instalaciones`, motor comercial Fase 3) -- Fase 5 ampliada,
 * punto 34: "cada instalación Electron debe poder identificarse de forma
 * segura". Antes esta tabla existía pero ningún código la usaba.
 *
 * También reescribe `codecpos_machine_id` en localStorage -- lo sembraba
 * el LicenseContext falso que se eliminó esta fase, y AutoBackupSystem.tsx
 * todavía lo lee para etiquetar los backups (efecto secundario que había
 * que restaurar sin volver a depender de aquel sistema).
 */
export function useRegistrarInstalacion() {
  const { usuarioActual } = useAuth();

  useEffect(() => {
    if (!usuarioActual) return;
    let cancelado = false;

    (async () => {
      const machineId = await getRealMachineUUID();
      if (cancelado) return;
      try {
        localStorage.setItem('codecpos_machine_id', machineId);
      } catch {
        // localStorage no disponible -- no crítico, solo afecta la etiqueta de los backups.
      }

      const client = getSupabaseClient();
      if (!client) return;
      const version = (await (window as any).electron?.getRuntimeVersions?.())?.appVersion ?? null;
      client.rpc('registrar_instalacion', { p_machine_id: machineId, p_tipo: 'ELECTRON', p_version: version })
        .then(({ data, error }) => {
          if (error) {
            console.warn('No se pudo registrar la instalación (no crítico):', error.message);
            return;
          }
          // 🛡️ Prefijo de factura por caja: el servidor asigna, la primera
          // vez que esta máquina se registra, un prefijo único dentro del
          // negocio (código del negocio + número de caja) — evita que dos
          // cajas del mismo dueño repitan números de factura sin que nadie
          // tenga que configurar nada a mano. Se guarda aparte de
          // 'codec_pos_config' (nunca pisa un prefijo que el dueño ya haya
          // elegido explícitamente en Configuración — ver POSPageNew.tsx y
          // ConfiguracionPage.tsx, que solo lo usan como respaldo).
          const fila = Array.isArray(data) ? data[0] : data;
          if (fila?.prefijo) {
            try { localStorage.setItem('codec_pos_prefijo_auto', fila.prefijo); } catch { /* no crítico */ }
          }
        });
    })();

    return () => { cancelado = true; };
  }, [usuarioActual?.id]);
}
