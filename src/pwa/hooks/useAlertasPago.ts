/**
 * Escucha los pagos de Codec Verify mientras esté activo en este dispositivo
 * y los alerta (sonido fuerte, vibración, notificación y aviso en pantalla).
 * Lo usan la barra superior del celular y el menú del computador.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { suscribirNotificacionesPagoPwa } from '../lib/codecVerifyPwa';
import {
  alertarPago, alternarSonidoPagos, obtenerAlertasPago, textoPago, guardarAlertasPago, EVENTO_ALERTAS_PAGO,
} from '../lib/alertaPagos';

export function useAlertasPago(verifyActivo: boolean, clienteId: string | undefined) {
  const [sonido, setSonido] = useState(() => obtenerAlertasPago().sonido);

  useEffect(() => {
    const actualizar = () => setSonido(obtenerAlertasPago().sonido);
    window.addEventListener(EVENTO_ALERTAS_PAGO, actualizar);
    // Que la app de Android conozca las preferencias guardadas en este celular.
    guardarAlertasPago({});
    return () => window.removeEventListener(EVENTO_ALERTAS_PAGO, actualizar);
  }, []);

  useEffect(() => {
    if (!verifyActivo || !clienteId) return;
    const dejar = suscribirNotificacionesPagoPwa(clienteId, async (row) => {
      const { sono } = await alertarPago(row);
      const { titulo, cuerpo } = textoPago(row);
      const accion = obtenerAlertasPago().sonido
        ? { label: 'Silenciar', onClick: () => { guardarAlertasPago({ sonido: false }); toast('Sonido de pagos desactivado en este dispositivo'); } }
        : { label: 'Activar sonido', onClick: () => { guardarAlertasPago({ sonido: true }); toast('Sonido de pagos activado'); } };
      const descripcion = obtenerAlertasPago().sonido && !sono
        ? `${cuerpo} Toca la pantalla una vez para que el navegador permita el sonido.`
        : cuerpo;
      const mostrar = row.origen === 'automatizacion' ? toast.success : toast.info;
      mostrar(titulo, { description: descripcion, duration: 10000, action: accion });
    });
    return () => dejar?.();
  }, [verifyActivo, clienteId]);

  const alternarSonido = () => {
    const nuevas = alternarSonidoPagos();
    toast(nuevas.sonido ? 'Sonido de pagos activado en este dispositivo' : 'Sonido de pagos silenciado en este dispositivo');
  };

  return { sonido, alternarSonido };
}
