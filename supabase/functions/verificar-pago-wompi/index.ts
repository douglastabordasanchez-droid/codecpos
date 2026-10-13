// Edge Function: confirma con Wompi un pago de licencia y, si quedó aprobado,
// activa la licencia. Hace el papel que para Mercado Pago cumple
// webhook-mercadopago: la cuenta de Wompi es la misma de Codec Flow y su URL de
// eventos apunta allá, así que aquí se consulta la transacción directamente.
//
// La llama la app (pantalla de regreso de Wompi, Planes y Electron) con el
// external_reference del intento. La fuente de verdad es siempre la respuesta
// de Wompi consultada desde el servidor, nunca lo que diga el navegador.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const WOMPI_PUBLIC_KEY = Deno.env.get('WOMPI_PUBLIC_KEY') ?? '';
const WOMPI_PRIVATE_KEY = Deno.env.get('WOMPI_PRIVATE_KEY') ?? '';
const WOMPI_API = WOMPI_PUBLIC_KEY.startsWith('pub_test_')
  ? 'https://sandbox.wompi.co/v1'
  : 'https://production.wompi.co/v1';

const ESTADO_WOMPI: Record<string, string> = {
  APPROVED: 'APROBADO',
  PENDING: 'EN_PROCESO',
  DECLINED: 'RECHAZADO',
  ERROR: 'RECHAZADO',
  VOIDED: 'CANCELADO',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WompiTx {
  id: string;
  status: string;
  status_message?: string | null;
  reference: string;
  amount_in_cents: number;
  currency: string;
  payment_method_type?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!WOMPI_PRIVATE_KEY) return json({ ok: false, error: 'Wompi no está configurado en el servidor' }, 500);

    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return json({ ok: false, error: 'No autenticado' }, 401);

    const anonClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: userData, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !userData.user) return json({ ok: false, error: 'Sesión inválida' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({})) as { externalReference?: string; transactionId?: string };
    const externalReference = (body.externalReference || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(externalReference)) return json({ ok: false, error: 'Referencia inválida' }, 400);

    const { data: empleado } = await admin
      .from('empleados')
      .select('cliente_id, activo')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (!empleado?.activo) return json({ ok: false, error: 'No autorizado' }, 403);

    const { data: registro, error: registroError } = await admin
      .from('pagos_licencia')
      .select('*')
      .eq('external_reference', externalReference)
      .maybeSingle();
    if (registroError) return json({ ok: false, error: registroError.message }, 500);
    // Un negocio solo puede consultar sus propios pagos.
    if (!registro || registro.cliente_id !== empleado.cliente_id || registro.proveedor !== 'WOMPI') {
      return json({ ok: false, error: 'Pago no encontrado' }, 404);
    }
    if (registro.estado === 'APROBADO') return json({ ok: true, estado: registro.estado });

    // 1) Buscar la transacción en Wompi ------------------------------------
    const referencia = `cpos_${externalReference}`;
    const tx = await buscarTransaccion(referencia, (body.transactionId || '').trim());
    if (!tx) return json({ ok: true, estado: registro.estado });

    const nuevoEstado = ESTADO_WOMPI[tx.status] || registro.estado;
    const montoCentavos = Math.round(Number(registro.monto) * 100);
    const montoValido = tx.currency === 'COP' && Number(tx.amount_in_cents) === montoCentavos;

    if (tx.status === 'APPROVED' && !montoValido) {
      console.error(
        `[verificar-pago-wompi] Monto no coincide en ${referencia}: esperado ${montoCentavos}, ` +
        `recibido ${tx.amount_in_cents} ${tx.currency}. No se activa la licencia.`
      );
      return json({ ok: true, estado: registro.estado });
    }

    const detalle = {
      wompi_transaction_id: tx.id,
      mp_status_detail: tx.status_message ?? tx.status,
      respuesta_mp: tx,
    };

    // 2) Aprobado: solo una llamada gana y activa la licencia ---------------
    if (tx.status === 'APPROVED') {
      const { data: gano } = await admin.rpc('tomar_pago_licencia_aprobado', { p_pago_id: registro.id });
      if (!gano) return json({ ok: true, estado: 'APROBADO' });

      let licenciaId: string | null = null;
      const { data: nuevaLicenciaId, error: licenciaError } = await admin.rpc('registrar_licencia', {
        p_cliente_id: registro.cliente_id,
        p_plan_codigo: registro.plan_codigo,
        p_modalidad: registro.modalidad,
        p_promocion_codigo: null,
        p_origen: 'WOMPI',
        p_motivo: `Pago aprobado vía Wompi (transacción ${tx.id}, ${tx.payment_method_type ?? 'sin método'})`,
        p_estado: 'ACTIVA',
      });
      if (licenciaError) {
        // El pago queda APROBADO sin licencia para que se vea y se active a mano.
        console.error(`[verificar-pago-wompi] ${tx.id} aprobado pero falló registrar_licencia:`, licenciaError.message);
      } else {
        licenciaId = nuevaLicenciaId as string;
        if (registro.codigo_descuento_id) {
          const { error } = await admin.rpc('registrar_uso_codigo_descuento', { p_codigo_id: registro.codigo_descuento_id });
          if (error) console.error('[verificar-pago-wompi] No se pudo incrementar el uso del código:', error.message);
        }
      }

      await admin.from('pagos_licencia').update({ ...detalle, licencia_id: licenciaId }).eq('id', registro.id);
      return json({ ok: true, estado: 'APROBADO' });
    }

    // 3) Pendiente, rechazado o anulado: solo se actualiza el intento --------
    await admin
      .from('pagos_licencia')
      .update({ ...detalle, estado: nuevoEstado, procesado_en: new Date().toISOString() })
      .eq('id', registro.id)
      .in('estado', ['PENDIENTE', 'EN_PROCESO']);

    return json({ ok: true, estado: nuevoEstado });
  } catch (e) {
    console.error('[verificar-pago-wompi] Excepción:', e instanceof Error ? e.message : e);
    return json({ ok: false, error: 'Error inesperado' }, 500);
  }
});

/** La transacción que Wompi devolvió al regresar (?id=) o, si no llegó, la
 *  búsqueda por referencia. Si alguna quedó aprobada, esa manda. */
async function buscarTransaccion(referencia: string, transactionId: string): Promise<WompiTx | null> {
  const auth = { headers: { Authorization: `Bearer ${WOMPI_PRIVATE_KEY}` } };

  if (transactionId && /^[\w-]+$/.test(transactionId)) {
    const res = await fetch(`${WOMPI_API}/transactions/${transactionId}`, auth);
    if (res.ok) {
      const tx = (await res.json())?.data as WompiTx | undefined;
      // Se ignora una transacción de otro pago aunque alguien mande su id.
      if (tx?.reference === referencia) return tx;
    }
  }

  const res = await fetch(`${WOMPI_API}/transactions?reference=${encodeURIComponent(referencia)}`, auth);
  if (!res.ok) {
    console.error(`[verificar-pago-wompi] Wompi respondió ${res.status} buscando ${referencia}`);
    return null;
  }
  const lista = ((await res.json())?.data ?? []) as WompiTx[];
  const propias = lista.filter(t => t.reference === referencia);
  return propias.find(t => t.status === 'APPROVED') ?? propias[0] ?? null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
