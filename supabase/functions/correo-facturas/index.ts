// Edge Function: envía la factura electrónica al correo del cliente desde la
// cuenta de correo del propio negocio (Gmail con contraseña de aplicación u
// otro servidor SMTP). Sin proveedor de correo pagado: cada negocio usa el
// cupo diario de su cuenta (Gmail: unos 500 correos al día).
//
// Acciones:
//   · estado    cualquier sesión del negocio: si hay correo conectado y cuál.
//   · guardar   administrador: prueba la conexión y guarda la clave cifrada.
//   · eliminar  administrador: desconecta el correo.
//   · enviar    cualquier sesión del negocio: manda la factura con sus
//               adjuntos (ZIP para la DIAN y PDF) y la marca como enviada.
//
// El negocio se resuelve con current_cliente_id() usando el JWT de quien
// llama, igual que dian-emision. Supabase bloquea los puertos 25 y 587 de
// salida, por eso se usa SMTP con SSL directo (465).

import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'nodemailer';
import { cifrar, descifrar } from './cifrado.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const LLAVE = Deno.env.get('DIAN_CERT_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

class ErrorHttp extends Error {
  constructor(mensaje: string, readonly status: number) { super(mensaje); }
}

/** Servidores conocidos: el dueño solo escribe su correo y la clave. */
const SERVIDORES: Record<string, { servidor: string; puerto: number }> = {
  gmail: { servidor: 'smtp.gmail.com', puerto: 465 },
  hostinger: { servidor: 'smtp.hostinger.com', puerto: 465 },
  zoho: { servidor: 'smtp.zoho.com', puerto: 465 },
};

// Cupo prudente por día: Gmail corta la cuenta por un rato si se pasa de ~500.
const MAXIMO_DIARIO = 450;
const MAXIMO_ADJUNTOS_BYTES = 8 * 1024 * 1024;

const correoValido = (c: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);
const hoyColombia = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

function transporte(servidor: string, puerto: number, usuario: string, clave: string) {
  return nodemailer.createTransport({
    host: servidor,
    port: puerto,
    secure: puerto === 465,
    auth: { user: usuario, pass: clave },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

/** Mensajes del servidor de correo en palabras del dueño. */
function explicarError(e: unknown): string {
  const m = String((e as Error)?.message || e);
  if (/Invalid login|Username and Password not accepted|535|EAUTH/i.test(m)) {
    return 'El correo o la contraseña de aplicación no son correctos. En Gmail hay que usar una contraseña de aplicación (16 letras), no la clave normal.';
  }
  if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND|timeout/i.test(m)) return 'No se pudo conectar con el servidor de correo. Revisa el servidor y el puerto.';
  if (/Daily user sending limit|limit exceeded|550 5\.4\.5/i.test(m)) return 'La cuenta de correo llegó a su límite de envíos de hoy. Mañana vuelve a enviar.';
  return `El servidor de correo respondió: ${m.slice(0, 200)}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!LLAVE) throw new ErrorHttp('El servidor no tiene configurada la llave de cifrado (DIAN_CERT_KEY).', 500);
    const token = req.headers.get('Authorization')?.replace(/^Bearer /, '');
    if (!token) throw new ErrorHttp('No autenticado', 401);

    const comoUsuario = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: errorUsuario } = await comoUsuario.auth.getUser(token);
    if (errorUsuario || !user) throw new ErrorHttp('Sesión inválida o vencida', 401);
    const { data: clienteId } = await comoUsuario.rpc('current_cliente_id');
    if (!clienteId) throw new ErrorHttp('Esta sesión no pertenece a ningún negocio', 403);

    const cuerpo = await req.json().catch(() => ({})) as Record<string, unknown>;
    const accion = String(cuerpo.accion || '');
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const contexto = `correo:${clienteId}`;

    const exigirAdministrador = async () => {
      const [{ data: empleado }, { data: instalacion }] = await Promise.all([
        admin.from('empleados').select('rol').eq('id', user.id).maybeSingle(),
        admin.from('sync_identidades').select('id').eq('id', user.id).maybeSingle(),
      ]);
      const esAdmin = !!instalacion || ['admin', 'super_usuario'].includes(empleado?.rol ?? '');
      if (!esAdmin) throw new ErrorHttp('Solo un administrador puede cambiar el correo del negocio', 403);
    };

    switch (accion) {
      case 'estado': {
        const { data } = await admin.from('correo_envio_negocio')
          .select('proveedor, servidor, puerto, usuario, remitente_nombre, verificado_el, enviados_hoy, dia_conteo')
          .eq('cliente_id', clienteId).maybeSingle();
        if (!data) return json({ configurado: false });
        return json({
          configurado: true,
          proveedor: data.proveedor,
          servidor: data.servidor,
          puerto: data.puerto,
          usuario: data.usuario,
          remitenteNombre: data.remitente_nombre,
          verificadoEl: data.verificado_el,
          enviadosHoy: data.dia_conteo === hoyColombia() ? data.enviados_hoy : 0,
          maximoDiario: MAXIMO_DIARIO,
        });
      }

      case 'guardar': {
        await exigirAdministrador();
        const proveedor = String(cuerpo.proveedor || 'gmail');
        const usuario = String(cuerpo.usuario || '').trim().toLowerCase();
        // Google muestra la contraseña de aplicación en grupos con espacios.
        const clave = String(cuerpo.clave || '').replace(/\s+/g, '');
        const remitenteNombre = String(cuerpo.remitenteNombre || '').trim().slice(0, 100);
        const conocido = SERVIDORES[proveedor];
        const servidor = conocido?.servidor || String(cuerpo.servidor || '').trim();
        const puerto = conocido?.puerto || Number(cuerpo.puerto) || 465;
        if (!correoValido(usuario)) throw new ErrorHttp('Escribe un correo válido', 400);
        if (!clave) throw new ErrorHttp('Falta la contraseña de aplicación', 400);
        if (!servidor) throw new ErrorHttp('Falta el servidor de correo', 400);
        if (puerto === 25 || puerto === 587) throw new ErrorHttp('Usa el puerto 465 (SSL): el 25 y el 587 están bloqueados en el servidor.', 400);

        // Se prueba ANTES de guardar: una clave equivocada se descubre ahora.
        try { await transporte(servidor, puerto, usuario, clave).verify(); } catch (e) { throw new ErrorHttp(explicarError(e), 400); }

        const { error } = await admin.from('correo_envio_negocio').upsert({
          cliente_id: clienteId,
          proveedor,
          servidor,
          puerto,
          usuario,
          remitente_nombre: remitenteNombre || null,
          clave_cifrada: await cifrar(new TextEncoder().encode(clave), LLAVE, contexto),
          verificado_el: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        if (error) throw new ErrorHttp(error.message, 500);
        return json({ ok: true });
      }

      case 'eliminar': {
        await exigirAdministrador();
        await admin.from('correo_envio_negocio').delete().eq('cliente_id', clienteId);
        return json({ ok: true });
      }

      case 'enviar': {
        const destino = String(cuerpo.destino || '').trim();
        const asunto = String(cuerpo.asunto || '').trim().slice(0, 200);
        const texto = String(cuerpo.texto || '').slice(0, 5000);
        const facturaId = cuerpo.facturaId ? String(cuerpo.facturaId) : null;
        const adjuntos = (Array.isArray(cuerpo.adjuntos) ? cuerpo.adjuntos : []) as Array<{ nombre?: string; base64?: string; tipo?: string }>;
        const destinos = destino.split(/[,;]/).map((d) => d.trim()).filter(Boolean);
        if (destinos.length === 0 || destinos.length > 5 || !destinos.every(correoValido)) throw new ErrorHttp('Revisa el correo del cliente', 400);
        if (!asunto) throw new ErrorHttp('Falta el asunto', 400);
        const pesoAdjuntos = adjuntos.reduce((s, a) => s + (a.base64?.length || 0) * 0.75, 0);
        if (pesoAdjuntos > MAXIMO_ADJUNTOS_BYTES) throw new ErrorHttp('Los adjuntos pesan demasiado', 400);

        // La factura debe ser de este negocio (y se marca como enviada).
        if (facturaId) {
          const { data: factura } = await admin.from('facturas_electronicas').select('id').eq('id', facturaId).eq('cliente_id', clienteId).maybeSingle();
          if (!factura) throw new ErrorHttp('La factura no existe o no es de tu negocio', 404);
        }

        const { data: config } = await admin.from('correo_envio_negocio').select('*').eq('cliente_id', clienteId).maybeSingle();
        if (!config) throw new ErrorHttp('El negocio no tiene un correo conectado. Conéctalo en Facturación › Correo para enviar facturas.', 409);
        const hoy = hoyColombia();
        const enviadosHoy = config.dia_conteo === hoy ? Number(config.enviados_hoy) || 0 : 0;
        if (enviadosHoy >= MAXIMO_DIARIO) throw new ErrorHttp(`Ya se enviaron ${enviadosHoy} correos hoy, el máximo diario. Mañana se puede seguir.`, 429);

        const clave = new TextDecoder().decode(await descifrar(config.clave_cifrada, LLAVE, contexto));
        try {
          await transporte(config.servidor, config.puerto, config.usuario, clave).sendMail({
            from: config.remitente_nombre ? { name: config.remitente_nombre, address: config.usuario } : config.usuario,
            to: destinos,
            subject: asunto,
            text: texto,
            attachments: adjuntos
              .filter((a) => a.base64 && a.nombre)
              .map((a) => ({ filename: String(a.nombre).slice(0, 150), content: a.base64, encoding: 'base64', contentType: a.tipo || undefined })),
          });
        } catch (e) {
          throw new ErrorHttp(explicarError(e), 502);
        }

        await admin.from('correo_envio_negocio').update({ enviados_hoy: enviadosHoy + 1, dia_conteo: hoy }).eq('cliente_id', clienteId);
        if (facturaId) {
          await admin.from('facturas_electronicas')
            .update({ correo_enviado_at: new Date().toISOString(), correo_destino: destinos.join(', ') })
            .eq('id', facturaId);
        }
        return json({ ok: true, enviadosHoy: enviadosHoy + 1 });
      }

      default:
        throw new ErrorHttp(`Acción desconocida: ${accion}`, 400);
    }
  } catch (e) {
    const status = e instanceof ErrorHttp ? e.status : 500;
    return json({ error: (e as Error).message || 'Error inesperado' }, status);
  }
});
