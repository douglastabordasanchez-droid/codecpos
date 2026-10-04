// Edge Function: envía la notificación push de "Pago recibido" a todos los
// dispositivos del negocio suscritos (web, celular Android con Chrome y
// iPhone con la web agregada a la pantalla de inicio).
//
// La llama SOLO el disparador `notificar_push_pago` (migración 0105) al
// entrar un pago en notificaciones_pago, con el secreto compartido
// `x-push-secret` (Vault ↔ secreto PUSH_TRIGGER_SECRET de esta función). Se
// despliega sin verificación de JWT porque quien llama es la base de datos.
//
// Secretos: VAPID_PUBLIC_JWK, VAPID_PRIVATE_JWK (llaves en formato JWK),
// VAPID_SUBJECT (mailto:), PUSH_TRIGGER_SECRET.
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush@0.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SECRETO = Deno.env.get('PUSH_TRIGGER_SECRET') ?? '';
const VAPID_PUBLIC_JWK = Deno.env.get('VAPID_PUBLIC_JWK') ?? '';
const VAPID_PRIVATE_JWK = Deno.env.get('VAPID_PRIVATE_JWK') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contacto@codecstudio.com';

interface Pago {
  id: string;
  cliente_id: string;
  monto: number;
  entidad: string | null;
  referencia: string | null;
  origen: string;
  estado: string;
}

let servidor: webpush.ApplicationServer | null = null;
async function obtenerServidor() {
  if (servidor) return servidor;
  const vapidKeys = await webpush.importVapidKeys(
    { publicKey: JSON.parse(VAPID_PUBLIC_JWK), privateKey: JSON.parse(VAPID_PRIVATE_JWK) },
    { extractable: false },
  );
  servidor = await webpush.ApplicationServer.new({ contactInformation: VAPID_SUBJECT, vapidKeys });
  return servidor;
}

const BANCOS: Record<string, string> = {
  nequi: 'Nequi', daviplata: 'Daviplata', bancolombia: 'Bancolombia', davivienda: 'Davivienda', bre_b: 'Bre-B',
};

export function armarMensaje(p: Pago) {
  const monto = `$${Math.round(Number(p.monto) || 0).toLocaleString('es-CO')}`;
  const clave = (p.entidad || '').toLowerCase();
  const banco = BANCOS[clave] || (clave ? clave.charAt(0).toUpperCase() + clave.slice(1) : '');
  const automatico = p.origen === 'automatizacion';
  return {
    tipo: 'pago',
    id: p.id,
    monto: Number(p.monto) || 0,
    entidad: p.entidad,
    referencia: p.referencia,
    origen: p.origen,
    titulo: automatico ? `Pago recibido ${monto}` : `Pago reportado ${monto}`,
    cuerpo: automatico
      ? `Has recibido un pago de ${monto}${banco ? ` por ${banco}` : ''}.`
      : `Se reportó un pago manual de ${monto}${banco ? ` por ${banco}` : ''}. Revísalo en Pagos.`,
    url: '/app/pagos',
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido' }, 405);
  if (!SECRETO || req.headers.get('x-push-secret') !== SECRETO) return json({ ok: false, error: 'No autorizado' }, 401);
  if (!VAPID_PUBLIC_JWK || !VAPID_PRIVATE_JWK) return json({ ok: false, error: 'Faltan las llaves VAPID' }, 500);

  const pago = (await req.json().catch(() => null)) as Pago | null;
  if (!pago?.cliente_id) return json({ ok: false, error: 'Pago inválido' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: subs, error } = await admin
    .from('push_suscripciones')
    .select('id, endpoint, p256dh, auth, fallos')
    .eq('cliente_id', pago.cliente_id)
    .eq('activa', true);
  if (error) return json({ ok: false, error: error.message }, 500);
  if (!subs?.length) return json({ ok: true, enviados: 0 });

  const app = await obtenerServidor();
  const mensaje = JSON.stringify(armarMensaje(pago));
  let enviados = 0;
  const vencidas: string[] = [];
  const fallidas: Array<{ id: string; fallos: number }> = [];

  await Promise.all(subs.map(async (s) => {
    try {
      const destino = app.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } });
      await destino.pushTextMessage(mensaje, { ttl: 60 * 60, urgency: webpush.Urgency.High, topic: `pago${String(pago.id).replace(/-/g, '').slice(0, 24)}` });
      enviados++;
    } catch (e) {
      // 404/410: el dispositivo ya no existe o revocó el permiso → se borra.
      if (e instanceof webpush.PushMessageError && e.isGone()) vencidas.push(s.id);
      else fallidas.push({ id: s.id, fallos: (s.fallos || 0) + 1 });
      console.warn('[push-pago] fallo de envío', s.endpoint.slice(0, 60), String(e).slice(0, 160));
    }
  }));

  if (vencidas.length) await admin.from('push_suscripciones').delete().in('id', vencidas);
  for (const f of fallidas) {
    await admin.from('push_suscripciones').update({ fallos: f.fallos, activa: f.fallos < 10 }).eq('id', f.id);
  }
  if (enviados) {
    await admin.from('push_suscripciones').update({ ultimo_envio: new Date().toISOString(), fallos: 0 })
      .eq('cliente_id', pago.cliente_id).eq('activa', true).not('id', 'in', `(${[...vencidas, ...fallidas.map((f) => f.id)].join(',') || '00000000-0000-0000-0000-000000000000'})`);
  }
  return json({ ok: true, enviados, vencidas: vencidas.length, fallidas: fallidas.length });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
