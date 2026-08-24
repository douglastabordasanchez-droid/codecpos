// Edge Function: crea una preferencia de pago de Mercado Pago (Checkout Pro)
// para activar/renovar la licencia de un cliente. El Access Token de
// Mercado Pago vive ÚNICAMENTE aquí, como secreto de servidor
// (`supabase secrets set MERCADOPAGO_ACCESS_TOKEN=...`). Nunca debe
// copiarse a código de la app Android/PWA/Electron.
//
// El precio SIEMPRE se calcula en el servidor (precio_modalidad(), motor
// comercial existente) -- nunca se confía en un monto enviado por el
// frontend. Cada intento de pago queda registrado en `pagos_licencia`
// ANTES de contactar a Mercado Pago, para que el webhook (fuente de verdad
// real del pago) siempre tenga dónde asociar la confirmación.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const MERCADOPAGO_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN') ?? '';
const PUBLIC_APP_URL = Deno.env.get('PUBLIC_APP_URL') ?? 'https://codecpos.vercel.app';

const MODALIDADES_VALIDAS = ['MENSUAL', 'TRIMESTRAL', 'ANUAL', 'VITALICIA'];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Body {
  planCodigo?: string;
  modalidad?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!MERCADOPAGO_ACCESS_TOKEN) {
      return json({ ok: false, error: 'MERCADOPAGO_ACCESS_TOKEN no está configurado en el servidor' }, 500);
    }

    // 1) Autenticar al que llama (JWT del usuario, no un secreto) -----------
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return json({ ok: false, error: 'No autenticado' }, 401);

    const anonClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: userData, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !userData.user) return json({ ok: false, error: 'Sesión inválida' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 2) Solo el dueño/admin del negocio puede activar/cambiar su propia
    //    licencia -- nunca un cajero, y nunca el cliente_id que mande el body.
    const { data: empleado, error: empleadoError } = await admin
      .from('empleados')
      .select('cliente_id, rol, activo')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (empleadoError || !empleado || !empleado.activo) {
      return json({ ok: false, error: 'No autorizado' }, 403);
    }
    if (!['admin', 'super_usuario'].includes(empleado.rol)) {
      return json({ ok: false, error: 'Solo un administrador del negocio puede gestionar el plan' }, 403);
    }

    const body: Body = await req.json().catch(() => ({}));
    const planCodigo = (body.planCodigo || '').trim().toUpperCase();
    const modalidad = (body.modalidad || '').trim().toUpperCase();

    if (!planCodigo || !MODALIDADES_VALIDAS.includes(modalidad)) {
      return json({ ok: false, error: 'planCodigo o modalidad inválidos' }, 400);
    }

    // 3) Precio real, calculado en el servidor -- ver migración 0047/0063.
    const { data: precio, error: precioError } = await admin.rpc('precio_modalidad', {
      p_plan_codigo: planCodigo,
      p_modalidad: modalidad,
      p_cliente_id: empleado.cliente_id,
    });

    if (precioError) return json({ ok: false, error: precioError.message }, 400);
    if (precio == null || Number(precio) <= 0) {
      return json({ ok: false, error: `No hay un precio configurado para ${planCodigo} / ${modalidad} todavía` }, 400);
    }
    const monto = Number(precio);

    // 4) Datos del negocio para el título del ítem / referencia -------------
    const { data: cliente } = await admin
      .from('clientes_pos')
      .select('nombre_negocio')
      .eq('id', empleado.cliente_id)
      .maybeSingle();

    // 5) Registrar el intento ANTES de llamar a Mercado Pago -----------------
    const { data: pago, error: insertError } = await admin
      .from('pagos_licencia')
      .insert({
        cliente_id: empleado.cliente_id,
        plan_codigo: planCodigo,
        modalidad,
        monto,
        estado: 'PENDIENTE',
        creado_por: userData.user.id,
      })
      .select('id, external_reference')
      .single();

    if (insertError || !pago) {
      return json({ ok: false, error: insertError?.message || 'No se pudo registrar el intento de pago' }, 500);
    }

    // 6) Crear la preferencia (Checkout Pro) ---------------------------------
    const modalidadEtiqueta: Record<string, string> = {
      MENSUAL: 'Mensual', TRIMESTRAL: 'Trimestral', ANUAL: 'Anual', VITALICIA: 'Vitalicio',
    };
    const prefRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [{
          title: `Codec POS - Plan ${planCodigo} (${modalidadEtiqueta[modalidad] || modalidad})`,
          description: cliente?.nombre_negocio ? `Licencia para ${cliente.nombre_negocio}` : 'Licencia Codec POS',
          quantity: 1,
          currency_id: 'COP',
          unit_price: monto,
        }],
        external_reference: pago.external_reference,
        back_urls: {
          success: `${PUBLIC_APP_URL}/app/pago/exitoso`,
          failure: `${PUBLIC_APP_URL}/app/pago/fallido`,
          pending: `${PUBLIC_APP_URL}/app/pago/pendiente`,
        },
        auto_return: 'approved',
        notification_url: `${SUPABASE_URL}/functions/v1/webhook-mercadopago`,
        statement_descriptor: 'CODEC POS',
      }),
    });

    const prefData = await prefRes.json();

    if (!prefRes.ok || !prefData.id) {
      // Nada se cobró -- no tiene sentido dejar un intento huérfano.
      await admin.from('pagos_licencia').delete().eq('id', pago.id);
      return json({ ok: false, error: prefData.message || 'No se pudo crear la preferencia de pago' }, 502);
    }

    await admin.from('pagos_licencia').update({ mp_preference_id: prefData.id }).eq('id', pago.id);

    return json({ ok: true, initPoint: prefData.init_point, externalReference: pago.external_reference });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'Error inesperado' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
