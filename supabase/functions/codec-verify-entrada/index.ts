// Edge Function: entrada de pagos de Codec Verify desde el iPhone (y
// cualquier otro origen sencillo: correo reenviado, otra automatización).
//
// El iPhone no deja que una app lea las notificaciones de otras apps, pero
// la app Atajos sí puede ejecutar una automatización al llegar un SMS o un
// correo del banco y enviar su texto aquí:
//
//   POST https://<proyecto>.supabase.co/functions/v1/codec-verify-entrada?t=<webhook_token>
//   Cuerpo: JSON {"texto": "..."}, formulario texto=..., o texto plano.
//   Opcional: &e=nequi (banco; si no, se reconoce del texto) y &prueba=1
//   (valida el enlace sin registrar nada).
//
// El webhook_token del negocio es lo único que autoriza la llamada (igual
// que registrar_pago_automatico). Se despliega sin verificación de JWT.
// Registra con la misma lógica probada en Postgres; si no logra leer el
// monto, usa la IA de respaldo (interpretar-pago-ia).
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const BANCOS: Array<[string, RegExp]> = [
  ['nequi', /nequi/i],
  ['daviplata', /daviplata/i],
  ['davivienda', /davivienda/i],
  ['bancolombia', /bancolombia/i],
  ['bre_b', /llave/i],
];

/**
 * El método de pago lo dice el contenido: un aviso de Bre-B es Bre-B aunque
 * llegue por la app (o el SMS) de Bancolombia, Nu, Davivienda o cualquier banco.
 */
export function reconocerBanco(texto: string, sugerido?: string | null): string {
  if (/bre[\s-]?b\b/i.test(texto)) return 'bre_b';
  const s = (sugerido || '').toLowerCase().trim();
  if (s) return s;
  return BANCOS.find(([, re]) => re.test(texto))?.[0] || 'otro';
}

async function leerTexto(req: Request, url: URL): Promise<string> {
  const desdeUrl = url.searchParams.get('texto');
  if (desdeUrl) return desdeUrl;
  if (req.method !== 'POST') return '';
  const tipo = req.headers.get('content-type') || '';
  const crudo = await req.text();
  if (!crudo) return '';
  if (tipo.includes('application/json') || /^\s*[{[]/.test(crudo)) {
    try {
      const j = JSON.parse(crudo);
      const v = j?.texto ?? j?.text ?? j?.mensaje ?? j?.message ?? j?.body ?? j?.contenido;
      const titulo = typeof j?.titulo === 'string' ? j.titulo : typeof j?.title === 'string' ? j.title : '';
      if (typeof v === 'string') return [titulo, v].filter(Boolean).join(' — ');
      if (v && typeof v === 'object') return JSON.stringify(v);
    } catch { /* se usa como texto plano */ }
  }
  if (tipo.includes('application/x-www-form-urlencoded')) {
    const f = new URLSearchParams(crudo);
    // La notificación de iOS 27 se envía como título + mensaje.
    const cuerpo = f.get('texto') || f.get('text') || f.get('mensaje') || '';
    const titulo = f.get('titulo') || f.get('title') || '';
    return [titulo, cuerpo].filter(Boolean).join(' — ') || crudo;
  }
  return crudo;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  const token = (url.searchParams.get('t') || url.searchParams.get('token') || '').trim();
  if (!token) return json({ ok: false, mensaje: 'Falta el enlace del negocio (parámetro t).' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: negocio } = await admin.from('clientes_pos').select('id, nombre_negocio').eq('webhook_token', token).maybeSingle();
  if (!negocio) return json({ ok: false, mensaje: 'Enlace inválido. Cópialo de nuevo desde Configuración de Codec POS.' }, 401);

  if (url.searchParams.get('prueba') === '1') {
    return json({ ok: true, mensaje: `Conexión correcta con ${negocio.nombre_negocio || 'tu negocio'}. Codec Verify está listo para recibir pagos desde este iPhone.` });
  }

  const texto = (await leerTexto(req, url)).replace(/\s+/g, ' ').trim().slice(0, 1000);
  if (!texto) return json({ ok: false, mensaje: 'No llegó el texto del mensaje.' }, 400);
  const entidad = reconocerBanco(texto, url.searchParams.get('e'));
  const referencia = `[iPhone] ${texto}`.slice(0, 300);

  // El mismo mensaje repetido (por ejemplo, la automatización corrió dos veces) no se registra otra vez.
  const hace10 = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: repetido } = await admin.from('notificaciones_pago').select('id')
    .eq('cliente_id', negocio.id).eq('referencia', referencia).gte('created_at', hace10).limit(1).maybeSingle();
  if (repetido) return json({ ok: true, duplicado: true, mensaje: 'Ese pago ya estaba registrado.' });

  const { error } = await admin.rpc('registrar_pago_automatico', { p_token: token, p_monto: texto, p_entidad: entidad, p_referencia: referencia });
  if (!error) return json({ ok: true, mensaje: 'Pago registrado en Codec Verify.' });

  if (/saliente/i.test(error.message)) {
    return json({ ok: false, ignorado: true, mensaje: 'Es un movimiento saliente; no se registra como pago recibido.' });
  }
  if (!/No se pudo extraer el monto/i.test(error.message)) {
    return json({ ok: false, mensaje: error.message }, 422);
  }

  // Respaldo con IA para textos que la lectura normal no entiende.
  const ia = await fetch(`${SUPABASE_URL}/functions/v1/interpretar-pago-ia`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: token, p_texto: texto, p_entidad: entidad }),
  }).then((r) => r.json()).catch(() => null);
  if (ia?.ok) return json({ ok: true, mensaje: `Pago de $${Number(ia.monto).toLocaleString('es-CO')} registrado (leído con IA).` });
  return json({ ok: false, mensaje: 'No se encontró un monto de pago recibido en el mensaje.' }, 422);
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
