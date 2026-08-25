// Edge Function: IA que identifica un producto a partir de una foto para
// autocompletar el formulario de inventario (nombre, categoría, unidad) —
// "le tomo la foto a un arroz y la IA me autocompleta". Reusa OPENROUTER_API_KEY
// (mismo secreto que interpretar-pago-ia) y el mismo modelo económico con
// visión que ya está probado en este proyecto.
//
// Seguridad: no usa webhook_token (eso es para automatizaciones de
// servidor-a-servidor sin sesión) — esto lo llama la PWA con la sesión real
// del empleado, así que se verifica el JWT de Supabase Auth y que la cuenta
// sea un empleado activo, antes de gastar una llamada a la IA.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') ?? '';

// Mismo modelo que ya usa interpretar-pago-ia — económico, rápido, y con
// soporte de visión probado en OpenRouter.
const MODELO = 'openai/gpt-4o-mini';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Body {
  imageBase64?: string; // data URL completa (data:image/jpeg;base64,...)
  categoriasDisponibles?: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!OPENROUTER_API_KEY) {
      return json({ ok: false, error: 'OPENROUTER_API_KEY no está configurada en el servidor' }, 500);
    }

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json({ ok: false, error: 'No autenticado' }, 401);

    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await client.auth.getUser(token);
    if (userError || !userData?.user) {
      return json({ ok: false, error: 'Sesión inválida' }, 401);
    }

    const { data: empleado } = await client
      .from('empleados')
      .select('id, activo')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (!empleado || empleado.activo === false) {
      return json({ ok: false, error: 'Cuenta no autorizada' }, 403);
    }

    const body: Body = await req.json().catch(() => ({}));
    const imageBase64 = (body.imageBase64 || '').trim();
    const categorias = Array.isArray(body.categoriasDisponibles) ? body.categoriasDisponibles.slice(0, 60) : [];

    if (!imageBase64.startsWith('data:image/')) {
      return json({ ok: false, error: 'Falta la imagen o el formato no es válido' }, 400);
    }

    const resultado = await analizarConIA(imageBase64, categorias);
    if (!resultado) {
      return json({ ok: false, error: 'La IA no logró identificar el producto con confianza suficiente' }, 200);
    }

    return json({ ok: true, ...resultado });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'Error inesperado' }, 500);
  }
});

async function analizarConIA(
  imageDataUrl: string,
  categorias: string[]
): Promise<{ nombre: string; categoria: string; unidad: string } | null> {
  const listaCategorias = categorias.length ? categorias.join(', ') : 'sin categorías predefinidas';

  const respuesta = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODELO,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'Eres un asistente que identifica productos de tienda/minimercado colombiano a partir de una foto, ' +
            'para autocompletar un formulario de inventario. Responde SOLO un JSON válido, sin texto adicional, ' +
            'con esta forma: {"nombre": string, "categoria": string, ' +
            '"unidad": "unidad"|"kg"|"g"|"lb"|"l"|"ml"|"paquete", "confianza": "alta"|"media"|"baja"}. ' +
            `Si es posible, usa EXACTAMENTE una de estas categorías existentes del negocio: ${listaCategorias}. ` +
            'Si ninguna calza bien, sugiere una categoría corta nueva en español. El nombre debe ser claro y ' +
            'comercial (ej. "Arroz Diana 500g" en vez de solo "arroz"), en español, incluye la marca SOLO si se ' +
            've claramente en el empaque — no la inventes. Si no logras identificar el producto con razonable ' +
            'certeza (foto borrosa, no es un producto, etc.), responde "confianza":"baja".',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Identifica este producto para el inventario.' },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
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
    if (parsed?.confianza === 'baja') return null;
    const nombre = String(parsed?.nombre || '').trim().slice(0, 120);
    if (!nombre) return null;
    const categoria = String(parsed?.categoria || '').trim().slice(0, 60);
    const unidadesValidas = ['unidad', 'kg', 'g', 'lb', 'l', 'ml', 'paquete'];
    const unidad = unidadesValidas.includes(parsed?.unidad) ? parsed.unidad : 'unidad';
    return { nombre, categoria, unidad };
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
