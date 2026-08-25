// Edge Function: webhook de WhatsApp Business Platform (Cloud API) para el
// número +573112726359, que atiende 4 líneas de servicio de Codec (Codec
// Studio / Codec Document / Codec POS / Automatizaciones). Un solo agente de
// IA (Claude vía OpenRouter, mismo secreto OPENROUTER_API_KEY que ya usa
// interpretar-pago-ia) responde en lenguaje natural en vez de un árbol de
// menús -- el guion de los 4 servicios vive en SYSTEM_PROMPT.
//
// Igual que webhook-mercadopago: siempre responder 200 a Meta (salvo la
// verificación GET), para que no reintente indefinidamente un mensaje que
// ya procesamos o que no nos interesa (statuses, tipos no soportados).

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') ?? '';
const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_TOKEN') ?? '';
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';
const WHATSAPP_VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';

const MODELO = 'anthropic/claude-haiku-4.5';
const WHATSAPP_API_VERSION = 'v21.0';
const HISTORIAL_MAX_MENSAJES = 20;

const SYSTEM_PROMPT = `Eres el asistente de WhatsApp de Codec. Este número atiende las diferentes soluciones de la empresa. Responde siempre en español, de forma natural, comercial y humana -- NUNCA parezcas un menú automático ni envíes explicaciones demasiado largas.

Cuando un cliente escribe por primera vez (o pregunta qué hace Codec), preséntate brevemente y menciona que Codec ofrece estas 4 soluciones, invitando a elegir una:

1️⃣ Página web — Codec Studio
Codec Studio desarrolla páginas y sitios web profesionales para empresas, emprendimientos y negocios. Se puede crear desde páginas informativas y landing pages hasta sitios web más completos y personalizados. Sitio: codecstudio.online

2️⃣ Codec Document
Plataforma para crear, gestionar y firmar documentos digitales. Permite crear documentos desde cero o con plantillas: contratos, documentos legales, cotizaciones, documentos de recursos humanos y otros documentos empresariales. Incluye firma electrónica/digital con evidencias del proceso (fotografía, selfie y otros datos de respaldo según el proceso). Sitio: codecdocument.com

3️⃣ Codec POS
Sistema POS administrativo para negocios y empresas: ventas, inventario, caja, productos, usuarios y procesos administrativos. Cuenta con funcionalidades avanzadas como Codec Verify, aplicación web y otras herramientas. Es una solución modular que busca ofrecer más funcionalidades que un POS tradicional. NUNCA afirmes que es objetivamente "el mejor POS de Colombia" -- puedes decir que está desarrollado para competir con las principales alternativas del mercado y que tiene funcionalidades avanzadas y diferenciales.

4️⃣ Automatizaciones
Codec también desarrolla automatizaciones y soluciones de software personalizadas: automatización de procesos, integraciones, formularios, WhatsApp y otras herramientas según las necesidades del cliente.

Si el cliente responde con 1, 2, 3 o 4 (o nombra directamente el servicio, ej. "quiero una página web"), explica brevemente SOLO esa opción y continúa la conversación con una pregunta sencilla para entender qué necesita. Ejemplo de tono (para la opción 3):

Cliente: "3"
Respuesta: "🧾 Codec POS es nuestro sistema administrativo para negocios. Te permite gestionar ventas, inventario, caja, usuarios y mucho más, además de contar con herramientas como Codec Verify y acceso web.

¿Tienes actualmente un sistema POS o estás buscando uno para comenzar?"

Reglas importantes:
- No mezcles los servicios: si el cliente eligió uno, quédate en ese hasta que él mismo pregunte por otro.
- NUNCA des precios, cifras ni rangos de ningún servicio. Si preguntan por precio, explica que depende de las necesidades del negocio y pide los datos básicos (qué negocio es, qué necesita) para que un asesor le cotice por este mismo WhatsApp.
- Si ya identificaste claramente qué servicio y qué necesidad tiene el cliente, cierra pidiendo su nombre y una breve descripción del negocio para pasarlo a un asesor.
- Sé breve -- respuestas de WhatsApp, no correos.`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);

  // Verificación del webhook (Meta la llama una sola vez al configurar la URL).
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('Verificación fallida', { status: 403 });
  }

  try {
    if (!OPENROUTER_API_KEY || !WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      console.error('[webhook-whatsapp] Faltan secretos requeridos (OPENROUTER_API_KEY / WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)');
      return new Response('ok', { status: 200 }); // no reintentar por un error de config nuestro
    }

    const body = await req.json().catch(() => ({} as any));
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const mensaje = value?.messages?.[0];

    // Eventos que no son mensajes entrantes (statuses de entrega/lectura, etc.)
    if (!mensaje) return new Response('ok', { status: 200 });

    // Por ahora solo texto -- audios/imágenes/documentos se ignoran sin error.
    if (mensaje.type !== 'text' || !mensaje.text?.body) {
      return new Response('ok', { status: 200 });
    }

    const telefono: string = mensaje.from;
    const textoUsuario: string = mensaje.text.body;
    const nombreContacto: string | null = value?.contacts?.[0]?.profile?.name ?? null;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1) Conversación: obtener o crear ------------------------------------
    const { data: conversacion, error: convError } = await admin
      .from('whatsapp_conversaciones')
      .upsert(
        { telefono, nombre_contacto: nombreContacto, ultimo_mensaje_en: new Date().toISOString() },
        { onConflict: 'telefono' }
      )
      .select('id')
      .single();

    if (convError || !conversacion) {
      console.error('[webhook-whatsapp] Error creando/actualizando conversación:', convError?.message);
      return new Response('ok', { status: 200 });
    }

    // 2) Guardar el mensaje del usuario ------------------------------------
    await admin.from('whatsapp_mensajes').insert({
      conversacion_id: conversacion.id,
      rol: 'usuario',
      contenido: textoUsuario,
      wa_message_id: mensaje.id ?? null,
    });

    // 3) Historial reciente para darle contexto al modelo -------------------
    const { data: historial, error: histError } = await admin
      .from('whatsapp_mensajes')
      .select('rol, contenido')
      .eq('conversacion_id', conversacion.id)
      .order('creado_en', { ascending: false })
      .limit(HISTORIAL_MAX_MENSAJES);

    if (histError) {
      console.error('[webhook-whatsapp] Error leyendo historial:', histError.message);
    }

    const mensajesOrdenados = (historial ?? []).slice().reverse();

    // 4) Generar respuesta con IA -------------------------------------------
    const respuestaIA = await generarRespuesta(mensajesOrdenados);
    if (!respuestaIA) {
      console.error('[webhook-whatsapp] La IA no devolvió respuesta para', telefono);
      return new Response('ok', { status: 200 });
    }

    // 5) Guardar la respuesta -------------------------------------------------
    await admin.from('whatsapp_mensajes').insert({
      conversacion_id: conversacion.id,
      rol: 'asistente',
      contenido: respuestaIA,
    });

    // 6) Enviar la respuesta por WhatsApp ------------------------------------
    await enviarWhatsApp(telefono, respuestaIA);

    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error('[webhook-whatsapp] Excepción no controlada:', e instanceof Error ? e.message : e);
    return new Response('ok', { status: 200 });
  }
});

async function generarRespuesta(historial: { rol: string; contenido: string }[]): Promise<string | null> {
  const mensajes = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...historial.map((m) => ({
      role: m.rol === 'asistente' ? 'assistant' : 'user',
      content: m.contenido,
    })),
  ];

  const respuesta = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODELO,
      temperature: 0.6,
      messages: mensajes,
    }),
  });

  if (!respuesta.ok) {
    console.error('[webhook-whatsapp] OpenRouter respondió', respuesta.status, await respuesta.text().catch(() => ''));
    return null;
  }

  const data = await respuesta.json();
  const contenido = data?.choices?.[0]?.message?.content;
  return typeof contenido === 'string' && contenido.trim() ? contenido.trim() : null;
}

async function enviarWhatsApp(to: string, texto: string): Promise<void> {
  const resp = await fetch(
    `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: texto },
      }),
    }
  );

  if (!resp.ok) {
    console.error('[webhook-whatsapp] Error enviando WhatsApp:', resp.status, await resp.text().catch(() => ''));
  }
}
