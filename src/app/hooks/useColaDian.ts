/**
 * Mantiene viva la cola de envíos DIAN mientras haya sesión en Electron y
 * expone su estado para el indicador de la barra lateral.
 *
 * Devuelve null cuando no aplica (web, instalación sin vincular o negocio
 * que no factura con DIAN directo): así quien lo usa no dibuja nada y no se
 * hace ni una consulta a la nube.
 */
import { useEffect, useState } from 'react';
import { getLinkedClienteId } from '../lib/supabase/tenantLink';
import { esModuloActivoGlobal, ModuloPOS } from '../lib/permissions';
import { colaDianDisponible, procesarColaDian, INTERVALO_COLA_DIAN_MS, type EstadoColaDian } from '../lib/dian/colaDian';

/** ¿Este negocio emite con DIAN directo? Mismo dato que usa el POS al cobrar. */
function facturaConDianDirecto(): boolean {
  try {
    return JSON.parse(localStorage.getItem('codec_pos_config') || '{}').modoFacturacionElectronica === 'dian_directo';
  } catch {
    return false;
  }
}

export function useColaDian(): EstadoColaDian | null {
  const [estado, setEstado] = useState<EstadoColaDian | null>(null);

  useEffect(() => {
    const clienteId = getLinkedClienteId();
    const aplica = !!clienteId && colaDianDisponible()
      && (facturaConDianDirecto() || esModuloActivoGlobal(ModuloPOS.FACTURACION_DIAN));
    if (!aplica) { setEstado(null); return; }

    let vivo = true;
    const pasada = () => { procesarColaDian(clienteId!).then((e) => { if (vivo) setEstado(e); }); };

    pasada();
    const intervalo = window.setInterval(pasada, INTERVALO_COLA_DIAN_MS);
    // Al volver internet no se espera al siguiente ciclo.
    window.addEventListener('online', pasada);
    const alCaer = () => setEstado((e) => (e ? { ...e, enLinea: false } : e));
    window.addEventListener('offline', alCaer);

    return () => {
      vivo = false;
      window.clearInterval(intervalo);
      window.removeEventListener('online', pasada);
      window.removeEventListener('offline', alCaer);
    };
  }, []);

  return estado;
}
