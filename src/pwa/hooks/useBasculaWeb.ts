import { useEffect, useState } from 'react';
import { estadoBascula, reconectarBascula, suscribirBascula, type EstadoBascula } from '../lib/basculaWeb';

/** Estado en vivo de la báscula. Al montarse intenta reabrir la báscula
 * recordada, así no hay que conectarla de nuevo en cada pantalla. */
export function useBasculaWeb(): EstadoBascula {
  const [estado, setEstado] = useState<EstadoBascula>(estadoBascula);
  useEffect(() => {
    const quitar = suscribirBascula(setEstado);
    reconectarBascula().catch(() => {});
    return quitar;
  }, []);
  return estado;
}
