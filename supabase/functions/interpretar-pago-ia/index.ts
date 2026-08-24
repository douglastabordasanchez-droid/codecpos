// Edge Function: respaldo por IA para leer el monto de una notificación
// bancaria cuando el regex de registrar_pago_automatico (ver migración 0045)
// no logró extraerlo. NO reemplaza ese regex — solo se llama cuando ya
// falló, para no agregar costo/latencia a las notificaciones que el regex
// ya procesa bien.
//
// La clave de OpenRouter vive ÚNICAMENTE aquí, como secreto de servidor
// (`supabase secrets set OPENROUTER_API_KEY=...`). Nunca debe copiarse al
// código de la app Android/PWA/Electron — cualquier clave embebida en una
// app cliente es extraíble por cualquiera que la instale.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') ?? '';

// Modelo económico y rápido — esto es solo extracción de un número de un
// texto corto, no requiere un modelo grande. Cambiar aquí si se prefiere otro.
const MODELO = 'openai/gpt-4o-mini';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Body {
  p_token?: string;
  p_texto?: string;
  p_entidad?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!OPENROUTER_API_KEY) {
      return json({ ok: false, error: 'OPENROUTER_API_KEY no está configurada en el servidor' }, 500);
    }

    const body: Body = await req.json().catch(() => ({}));
    const token = (body.p_token || '').trim();
    const texto = (body.p_texto || '').trim();
    const entidad = (body.p_entidad || 'otro').trim();

    if (!token || !texto) {
      return json({ ok: false, error: 'Faltan p_token o p_texto' }, 400);
    }

    // Mismo control de acceso que registrar_pago_automatico — el
    // webhook_token es lo único que autoriza esta llamada.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: cliente, error: clienteError } = await admin
      .from('clientes_pos')
      .select('id')
      .eq('webhook_token', token)
      .maybeSingle();

    if (clienteError || !cliente) {
      return json({ ok: false, error: 'Token de automatización inválido' }, 401);
    }

    const montoExtraido = await interpretarConIA(texto);
    if (!montoExtraido) {
      return json({ ok: false, error: 'La IA no logró interpretar un monto con confianza suficiente' }, 200);
    }

    const { error: rpcError } = await admin.rpc('registrar_pago_automatico_monto_confirmado', {
      p_token: token,
      p_monto: montoExtraido,
      p_entidad: entidad,
      p_referencia: `[IA] ${texto.slice(0, 250)}`,
    });

    if (rpcError) {
      return json({ ok: false, error: rpcError.message }, 500);
    }

    return json({ ok: true, monto: montoExtraido });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'Error inesperado' }, 500);
  }
});

async function interpretarConIA(texto: string): Promise<number | null> {
  const respuesta = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODELO,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'Extraes el monto de dinero RECIBIDO (no enviado) de notificaciones bancarias colombianas ' +
            '(Nequi, Bancolombia, Daviplata). Responde SOLO un JSON válido, sin texto adicional, con esta forma: ' +
            '{"monto": <número entero en pesos colombianos sin separadores, o null si no hay un pago recibido claro>, ' +
            '"confianza": "alta"|"media"|"baja"}. ' +
            'Si el texto describe dinero SALIENTE (transferiste, enviaste, pagaste, retiraste) responde monto: null. ' +
            'Si hay más de una cifra (ej. un saldo y un monto de pago), usa la del pago recibido, no el saldo.',
        },
        { role: 'user', content: texto },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!respuesta.ok) return null;

  const data = await respuesta.json();
  const contenido = data?.choices?.[0]?.message?.content;
  if (!contenido) return null;

  try {
    const parsed = JSON.parse(contenido);
    const monto = Number(parsed?.monto);
    const confianza = parsed?.confianza;
    if (!Number.isFinite(monto) || monto <= 0) return null;
    if (confianza === 'baja') return null; // mejor no registrar nada que registrar mal
    return monto;
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
