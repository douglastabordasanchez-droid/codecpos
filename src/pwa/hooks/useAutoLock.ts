import { useCallback, useEffect, useState } from 'react';
import { debeBloquear, huellaHabilitada, registrarActividad } from '../lib/huellaLock';

/**
 * Bloquea la app tras 10 min con la pestaña/app en segundo plano, si el
 * empleado activó el desbloqueo por huella. Sin huella activada, nunca
 * bloquea (comportamiento actual, sin cambios) — es una función opcional.
 */
const CLAVE_SESION = 'codecpos_huella_sesion_desbloqueada';

export function useAutoLock(empleadoId: string | undefined) {
  const [bloqueado, setBloqueado] = useState(false);

  useEffect(() => {
    if (!empleadoId || !huellaHabilitada(empleadoId)) {
      setBloqueado(false);
      return;
    }

    // Al abrir la app desde cero siempre se pide la huella; dentro de la misma sesión
    // (recargas, volver de otra app) solo tras 10 min en segundo plano.
    let abiertaDesdeCero = true;
    try { abiertaDesdeCero = sessionStorage.getItem(CLAVE_SESION) !== empleadoId; } catch { /* sin sessionStorage */ }
    setBloqueado(abiertaDesdeCero || debeBloquear(empleadoId));

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'hidden') {
        // Se guarda el momento en que se fue a segundo plano — no cuando
        // vuelve, para que el conteo de 10 min sea desde que se dejó de usar.
        registrarActividad(empleadoId);
      } else if (document.visibilityState === 'visible') {
        if (debeBloquear(empleadoId)) setBloqueado(true);
      }
    };

    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    window.addEventListener('pageshow', alCambiarVisibilidad);
    return () => {
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      window.removeEventListener('pageshow', alCambiarVisibilidad);
    };
  }, [empleadoId]);

  const desbloquear = useCallback(() => {
    if (empleadoId) registrarActividad(empleadoId);
    try { if (empleadoId) sessionStorage.setItem(CLAVE_SESION, empleadoId); } catch { /* sin sessionStorage */ }
    setBloqueado(false);
  }, [empleadoId]);

  return { bloqueado, desbloquear };
}
