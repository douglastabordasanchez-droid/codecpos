/**
 * Escucha los pagos de Codec Verify mientras esté activo en este dispositivo
 * y los alerta (sonido fuerte, voz, vibración, notificación y aviso en
 * pantalla). Lo usan la barra superior del celular y el menú del computador.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { suscribirNotificacionesPagoPwa, type NotificacionPagoRow } from '../lib/codecVerifyPwa';
import { abrirPopupPago } from '../components/PopupPagoRecibido';
import {
  alertarPago, alternarSonidoPagos, obtenerAlertasPago, guardarAlertasPago, EVENTO_ALERTAS_PAGO,
} from '../lib/alertaPagos';

/** Alerta completa de un pago: lo mismo para un pago real y para el ejemplo de Configuración. */
export async function avisarPago(row: NotificacionPagoRow, ejemplo = false) {
  abrirPopupPago(row, ejemplo);
  const { sono } = await alertarPago(row);
  const prefs = obtenerAlertasPago();
  if ((prefs.sonido || prefs.voz) && !sono) {
    toast('Toca la pantalla una vez para que el navegador permita el sonido de los pagos.');
  }
}

/** Simula un pago de $12.345 por Nequi para ver y oír cómo llega. */
export function mostrarEjemploPago() {
  return avisarPago({
    id: `prueba-${Date.now()}`, monto: 12345, entidad: 'nequi', referencia: null, origen: 'automatizacion', estado: 'confirmado',
  }, true);
}

export function useAlertasPago(verifyActivo: boolean, clienteId: string | undefined) {
  const audible = () => { const p = obtenerAlertasPago(); return p.sonido || p.voz; };
  const [sonido, setSonido] = useState(audible);

  useEffect(() => {
    const actualizar = () => setSonido(audible());
    window.addEventListener(EVENTO_ALERTAS_PAGO, actualizar);
    // Que la app de Android conozca las preferencias guardadas en este celular.
    guardarAlertasPago({});
    return () => window.removeEventListener(EVENTO_ALERTAS_PAGO, actualizar);
  }, []);

  useEffect(() => {
    if (!verifyActivo || !clienteId) return;
    const dejar = suscribirNotificacionesPagoPwa(clienteId, (row) => { avisarPago(row); });
    return () => dejar?.();
  }, [verifyActivo, clienteId]);

  const alternarSonido = () => {
    const nuevas = alternarSonidoPagos();
    toast(nuevas.sonido ? 'Sonido y voz de pagos activados en este dispositivo' : 'Pagos en silencio en este dispositivo');
  };

  return { sonido, alternarSonido };
}
