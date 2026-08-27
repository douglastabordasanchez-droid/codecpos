import { useEffect } from 'react';
import { getSupabaseClient } from '../lib/supabase/config';
import { getRealMachineUUID } from '../utils/machineId';
import { useAuth } from '../contexts/AuthContext';
import { dbManager } from '../lib/indexedDB';

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

      // 🛡️ FIX: `puntoVentaId` (el `terminal_id` que sube con cada venta a
      // Supabase) nunca se configuraba en ningún lado del código -- siempre
      // caía en el default hardcodeado 'POS-001', así que TODAS las cajas de
      // TODOS los negocios (no solo multi-sucursal) reportaban ventas bajo el
      // mismo terminal_id, sin forma de distinguir de qué caja/sucursal vino
      // cada una. Se siembra aquí, una sola vez, con el UUID real del
      // hardware -- nunca pisa un valor que ya exista (por si en el futuro
      // se agrega una pantalla para que el dueño lo escriba a mano).
      try {
        const puntoVentaIdActual = await dbManager.getConfig('puntoVentaId');
        if (!puntoVentaIdActual) {
          await dbManager.setConfig('puntoVentaId', machineId);
        }
      } catch {
        // no crítico -- en el peor caso, esta caja sigue reportando 'POS-001'.
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
