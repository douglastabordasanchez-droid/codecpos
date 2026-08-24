// Edge Function: webhook/IPN de Mercado Pago. Única fuente de verdad para
// activar una licencia -- NUNCA se activa nada porque el usuario "volvió"
// del checkout (esa lógica vive en el frontend y no toca esta tabla).
//
// Reglas duras:
//  - Nunca confiar en el status que venga en el body de la notificación:
//    siempre se vuelve a consultar el pago completo a la API de Mercado
//    Pago con nuestro propio Access Token.
//  - Idempotente: si este pago ya fue procesado con el mismo resultado
//    (mismo mp_payment_id, misma licencia ya activada), no se hace nada de
//    nuevo -- una notificación repetida no puede activar dos veces.
//  - El monto se valida contra lo que YA habíamos calculado en el servidor
//    al crear la preferencia (pagos_licencia.monto) -- si no coincide, se
//    registra pero no se activa la licencia automáticamente.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const MERCADOPAGO_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN') ?? '';

// Mapeo de estados de Mercado Pago -> estados internos (pagos_licencia.estado)
const ESTADO_MP: Record<string, string> = {
  approved: 'APROBADO',
  pending: 'EN_PROCESO',
  in_process: 'EN_PROCESO',
  in_mediation: 'EN_PROCESO',
  rejected: 'RECHAZADO',
  cancelled: 'CANCELADO',
  refunded: 'REEMBOLSADO',
  charged_back: 'REEMBOLSADO',
};

Deno.serve(async (req: Request) => {
  // Mercado Pago a veces manda un GET de verificación al configurar la URL.
  if (req.method === 'GET') return new Response('ok', { status: 200 });

  try {
    if (!MERCADOPAGO_ACCESS_TOKEN) {
      console.error('[webhook-mercadopago] MERCADOPAGO_ACCESS_TOKEN no configurado');
      return new Response('ok', { status: 200 }); // no reintentar por un error de config nuestro
    }

    const url = new URL(req.url);
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    // Mercado Pago manda el id del pago de dos formas según el tipo de
    // notificación: IPN clásico (?topic=payment&id=...) o webhook nuevo
    // ({ type: 'payment', data: { id: '...' } }).
    const topic = (body as any)?.type || url.searchParams.get('topic');
    const paymentId = (body as any)?.data?.id || url.searchParams.get('id') || url.searchParams.get('data.id');

    if (topic !== 'payment' || !paymentId) {
      // Otros tipos de evento (merchant_order, etc.) -- los ignoramos, no es error.
      return new Response('ok', { status: 200 });
    }

    // 1) SIEMPRE volver a consultar el pago real a Mercado Pago -------------
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}` },
    });

    if (!mpRes.ok) {
      console.error(`[webhook-mercadopago] No se pudo consultar el pago ${paymentId}: HTTP ${mpRes.status}`);
      // Puede ser transitorio (rate limit, red) -- pedimos reintento.
      return new Response('error consultando el pago', { status: 500 });
    }

    const pago = await mpRes.json();
    const externalReference = pago.external_reference as string | undefined;
    const mpStatus = pago.status as string | undefined;
    const montoMP = Number(pago.transaction_amount);

    if (!externalReference || !mpStatus) {
      console.error(`[webhook-mercadopago] Pago ${paymentId} sin external_reference o status`);
      return new Response('ok', { status: 200 });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: registro, error: registroError } = await admin
      .from('pagos_licencia')
      .select('*')
      .eq('external_reference', externalReference)
      .maybeSingle();

    if (registroError) {
      console.error('[webhook-mercadopago] Error leyendo pagos_licencia:', registroError.message);
      return new Response('error interno', { status: 500 });
    }
    if (!registro) {
      console.warn(`[webhook-mercadopago] external_reference ${externalReference} no corresponde a ningún intento registrado`);
      return new Response('ok', { status: 200 });
    }

    // 2) Idempotencia: ya procesamos exactamente este pago con este resultado.
    if (registro.mp_payment_id === String(paymentId) && registro.estado === (ESTADO_MP[mpStatus] || registro.estado)) {
      return new Response('ok (ya procesado)', { status: 200 });
    }
    // La licencia ya fue activada por una notificación anterior -- no se
    // vuelve a activar aunque llegue otra notificación "approved" (p. ej.
    // reintentos de Mercado Pago o un segundo evento del mismo pago).
    const yaActivada = registro.estado === 'APROBADO' && registro.licencia_id !== null;

    const nuevoEstado = ESTADO_MP[mpStatus] || registro.estado;
    const montoEsperado = Number(registro.monto);
    const montoValido = Number.isFinite(montoMP) && Math.abs(montoMP - montoEsperado) < 1;

    if (!montoValido) {
      console.error(
        `[webhook-mercadopago] Monto no coincide para pago ${paymentId} (ref ${externalReference}): ` +
        `esperado ${montoEsperado}, recibido ${montoMP}. No se activa la licencia.`
      );
    }

    let licenciaId: string | null = registro.licencia_id;

    if (mpStatus === 'approved' && montoValido && !yaActivada) {
      const { data: nuevaLicenciaId, error: licenciaError } = await admin.rpc('registrar_licencia', {
        p_cliente_id: registro.cliente_id,
        p_plan_codigo: registro.plan_codigo,
        p_modalidad: registro.modalidad,
        p_promocion_codigo: null,
        p_origen: 'MERCADOPAGO',
        p_motivo: `Pago aprobado vía Mercado Pago (payment_id ${paymentId})`,
        p_estado: 'ACTIVA',
      });

      if (licenciaError) {
        console.error(`[webhook-mercadopago] Pago ${paymentId} aprobado pero falló registrar_licencia:`, licenciaError.message);
        // No perdemos el pago: queda registrado como APROBADO sin licencia
        // asociada para que quede visible y se pueda activar manualmente.
      } else {
        licenciaId = nuevaLicenciaId as string;
        if (registro.codigo_descuento_id) {
          await admin.rpc('registrar_uso_codigo_descuento', { p_codigo_id: registro.codigo_descuento_id })
            .then(({ error }) => { if (error) console.error('[webhook-mercadopago] No se pudo incrementar el uso del código:', error.message); });
        }
      }
    }

    const { error: updateError } = await admin
      .from('pagos_licencia')
      .update({
        estado: nuevoEstado,
        mp_payment_id: String(paymentId),
        mp_status_detail: pago.status_detail ?? null,
        respuesta_mp: pago,
        licencia_id: licenciaId,
        procesado_en: new Date().toISOString(),
      })
      .eq('id', registro.id);

    if (updateError) {
      console.error('[webhook-mercadopago] Error actualizando pagos_licencia:', updateError.message);
      return new Response('error interno', { status: 500 });
    }

    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error('[webhook-mercadopago] Excepción no controlada:', e instanceof Error ? e.message : e);
    return new Response('error interno', { status: 500 });
  }
});
