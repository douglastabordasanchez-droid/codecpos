/**
 * Cobro de licencia desde Electron (Wompi o Mercado Pago) -- reutiliza EXACTAMENTE la misma
 * infraestructura ya probada en la PWA (src/pwa/pages/PlanesPage.tsx): la
 * Edge Function `crear-pago-licencia` (calcula el precio en el servidor y
 * registra el intento en `pagos_licencia` ANTES de contactar a la pasarela)
 * y el webhook `webhook-mercadopago` o la función `verificar-pago-wompi`
 * (única fuente de verdad -- activan la licencia automáticamente cuando el
 * pago queda aprobado, sin depender de que nadie del staff lo registre a mano).
 *
 * Electron no puede incrustar Checkout Pro dentro de la ventana de la app
 * (BrowserWindow no es un navegador de confianza para Mercado Pago), así que
 * el checkout se abre en el navegador por defecto del sistema
 * (`abrirEnlaceExterno`) y este módulo hace polling de `pagos_licencia` para
 * saber cuándo el webhook confirmó el pago -- mismo patrón que
 * `src/pwa/pages/PagoResultadoPage.tsx`.
 */
import { getSupabaseClient } from './supabase/config';
import { abrirEnlaceExterno } from './externalLink';

export type ProveedorPagoLicencia = 'WOMPI' | 'MERCADOPAGO';

export type EstadoPagoLicencia =
  | 'PENDIENTE'
  | 'EN_PROCESO'
  | 'APROBADO'
  | 'RECHAZADO'
  | 'CANCELADO'
  | 'REEMBOLSADO';

interface IniciarPagoResultado {
  ok: boolean;
  externalReference?: string;
  error?: string;
}

/** Crea el pago para el plan/modalidad indicados y abre el checkout de la
 *  pasarela elegida en el navegador del sistema. */
export async function iniciarPagoLicencia(
  planCodigo: string,
  modalidad: string,
  proveedor: ProveedorPagoLicencia = 'MERCADOPAGO'
): Promise<IniciarPagoResultado> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'La conexión con nuestro servidor no está configurada' };

  const { data, error } = await client.functions.invoke('crear-pago-licencia', {
    body: { planCodigo, modalidad, proveedor },
  });

  if (error || !data?.ok) {
    return { ok: false, error: data?.error || error?.message || 'No se pudo iniciar el pago. Intenta de nuevo.' };
  }

  abrirEnlaceExterno(data.initPoint);
  return { ok: true, externalReference: data.externalReference };
}

/** Consulta el estado real de un intento de pago. Solo el servidor escribe
 *  esta columna: el webhook de Mercado Pago, o verificar-pago-wompi, que aquí
 *  se invoca mientras un pago de Wompi siga pendiente (Wompi no nos avisa). */
export async function consultarEstadoPagoLicencia(
  externalReference: string,
  wompiTransactionId?: string | null
): Promise<EstadoPagoLicencia | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client
    .from('pagos_licencia')
    .select('estado, proveedor')
    .eq('external_reference', externalReference)
    .maybeSingle();
  const estado = (data?.estado as EstadoPagoLicencia | undefined) ?? null;
  if (data?.proveedor !== 'WOMPI' || (estado !== 'PENDIENTE' && estado !== 'EN_PROCESO')) return estado;

  const { data: verificado } = await client.functions.invoke('verificar-pago-wompi', {
    body: { externalReference, transactionId: wompiTransactionId || undefined },
  });
  return (verificado?.ok ? (verificado.estado as EstadoPagoLicencia) : estado) ?? estado;
}
