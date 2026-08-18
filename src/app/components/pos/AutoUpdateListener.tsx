import { useEffect } from 'react';
import { toast } from 'sonner';

/** Aviso global no bloqueante de auto-actualización (Fase 5 ampliada,
 *  puntos 12-14) -- el detalle y el botón de instalar viven en el Panel
 *  Desarrollador > Acerca del sistema; esto solo asegura que el dueño del
 *  negocio se entere aunque nunca abra ese panel. */
export function AutoUpdateListener() {
  useEffect(() => {
    const desuscribir = (window as any).electron?.onUpdateEvent?.((data: { evento: string; version?: string }) => {
      if (data.evento === 'lista') {
        toast.success(`Codec POS v${data.version} está lista -- se instalará automáticamente la próxima vez que cierres el programa.`, {
          duration: 10000,
        });
      }
    });
    return () => desuscribir?.();
  }, []);

  return null;
}
