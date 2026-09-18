/**
 * Cobro de licencia desde Electron -- reutiliza EXACTAMENTE la misma
 * infraestructura ya probada en la PWA (src/pwa/pages/PlanesPage.tsx): la
 * Edge Function `crear-pago-licencia` (calcula el precio en el servidor y
 * registra el intento en `pagos_licencia` ANTES de contactar a Mercado Pago)
 * y el webhook `webhook-mercadopago` (única fuente de verdad -- activa la
 * licencia automáticamente cuando el pago queda aprobado, sin depender de
 * que nadie del staff lo registre a mano).
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

/** Crea la preferencia de pago para el plan/modalidad indicados y abre el
 *  checkout de Mercado Pago en el navegador del sistema. */
export async function iniciarPagoLicencia(
  planCodigo: string,
  modalidad: string
): Promise<IniciarPagoResultado> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'La conexión con nuestro servidor no está configurada' };

  const { data, error } = await client.functions.invoke('crear-pago-licencia', {
    body: { planCodigo, modalidad },
  });

  if (error || !data?.ok) {
    return { ok: false, error: data?.error || error?.message || 'No se pudo iniciar el pago. Intenta de nuevo.' };
  }

  abrirEnlaceExterno(data.initPoint);
  return { ok: true, externalReference: data.externalReference };
}

/** Consulta el estado real de un intento de pago. La única fuente de verdad
 *  es el webhook de Mercado Pago, que es lo único que escribe esta columna. */
export async function consultarEstadoPagoLicencia(externalReference: string): Promise<EstadoPagoLicencia | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client
    .from('pagos_licencia')
    .select('estado')
    .eq('external_reference', externalReference)
    .maybeSingle();
  return (data?.estado as EstadoPagoLicencia | undefined) ?? null;
}
