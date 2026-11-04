// Edge Function: el certificado digital del negocio al servicio de su
// contador en Codec Document (migración 0139; B6, B7 y B10 del contrato).
//
// Vía 1, firma por encargo (cron cada minuto, acción «despachar»):
//   · acuses DIAN de compras (pos-acuses): capacidad, pendientes → arma el
//     ApplicationResponse, lo firma y lo envía (SendEventUpdateStatus) →
//     resultado.
//   · nómina electrónica (pos-nomina): capacidad, pendientes → pone
//     SoftwareID, SoftwareSC, Ambiente y el CUNE con el PIN de nómina, firma
//     y envía (SendNominaSync, o el set de pruebas en habilitación) →
//     resultado.
// Vía 2, copia compartida (acciones del administrador desde Mi contador):
//   · «compartir-certificado» → pos-certificado POST; «dejar-de-compartir» →
//     pos-certificado DELETE. Si el negocio sube un certificado nuevo, el
//     cron lo vuelve a mandar solo.
//
// La llave privada nunca sale de aquí salvo en la vía 2, y solo cuando el
// dueño la pide. Se despliega con --no-verify-jwt: el cron no trae JWT y las
// acciones del administrador se validan aquí mismo.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { descifrar } from '../dian-emision/cifrado.ts';
import { abrirP12, firmarXades, type Credenciales } from '../dian-emision/xades.ts';
import { consultarEstadoZip, enviarEvento, enviarNomina, enviarSetDePruebas, type RespuestaDian } from '../dian-emision/soap.ts';
import { construirApplicationResponse, prepararNomina, type CuneDatos, type EventoAcuse } from './documentos.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const TOKEN_KEY = Deno.env.get('CONTADOR_TOKEN_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CONTADOR_CRON_SECRET') ?? '';
const DIAN_CERT_KEY = Deno.env.get('DIAN_CERT_KEY') ?? '';
const CODEC_DOCUMENT = (Deno.env.get('CODEC_DOCUMENT_FUNCTIONS_URL') ?? 'https://yxzchnldmfsgdtbjurey.supabase.co/functions/v1').replace(/\/$/, '');

const PRESUPUESTO_MS = 45_000;
const CAPACIDAD_CADA_MS = 24 * 3600_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

class ErrorHttp extends Error {
  constructor(mensaje: string, readonly status: number) { super(mensaje); }
}

const textoDe = (b: Uint8Array) => new TextDecoder().decode(b);
const aBase64 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

async function llamarCodecDocument(ruta: string, cuerpo: unknown, token: string, metodo: 'POST' | 'DELETE' = 'POST'): Promise<{ status: number | null; datos: any }> {
  try {
    const r = await fetch(`${CODEC_DOCUMENT}/${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: cuerpo == null ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(25_000),
    });
    const texto = await r.text();
    let datos: any = null;
    try { datos = texto ? JSON.parse(texto) : null; } catch { datos = { error: texto.slice(0, 300) }; }
    return { status: r.status, datos };
  } catch (e) {
    return { status: null, datos: { error: (e as Error).message } };
  }
}
const codigoError = (d: any) => String(d?.error ?? d?.codigo ?? d?.code ?? '').trim();

// ── Contexto de un negocio conectado ────────────────────────────────────
interface Contexto {
  clienteId: string;
  token: string;
  vinculo: any;
  perfil: any | null;
  certificado: any | null;            // fila de dian_certificados_nube (sin descifrar)
  credenciales: () => Promise<Credenciales>;
  p12: () => Promise<{ bytes: Uint8Array; pin: string }>;
}

async function cargarContexto(admin: SupabaseClient, vinculo: any): Promise<Contexto> {
  const clienteId = vinculo.cliente_id as string;
  const token = textoDe(await descifrar(vinculo.token_cifrado, TOKEN_KEY, `contador:${clienteId}`));
  const { data: perfil } = await admin.from('perfiles_fiscales')
    .select('id, nit, digito_verificacion, nombre_o_razon_social, identificador_software, software_pin, ambiente, nomina_software_id, nomina_software_pin, nomina_ambiente, nomina_test_set_id')
    .eq('cliente_id', clienteId).eq('activo', true).maybeSingle();
  const { data: certificado } = perfil
    ? await admin.from('dian_certificados_nube').select('perfil_fiscal_id, p12_cifrado, pin_cifrado, sujeto, vence_el, subido_el').eq('perfil_fiscal_id', perfil.id).maybeSingle()
    : { data: null };

  let p12Cache: { bytes: Uint8Array; pin: string } | null = null;
  let credCache: Credenciales | null = null;
  const p12 = async () => {
    if (!certificado) throw new Error('El negocio no tiene certificado digital en la nube');
    if (!p12Cache) {
      p12Cache = {
        bytes: await descifrar(certificado.p12_cifrado, DIAN_CERT_KEY, `p12:${certificado.perfil_fiscal_id}`),
        pin: textoDe(await descifrar(certificado.pin_cifrado, DIAN_CERT_KEY, `pin:${certificado.perfil_fiscal_id}`)),
      };
    }
    return p12Cache;
  };
  const credenciales = async () => {
    if (!credCache) { const { bytes, pin } = await p12(); credCache = abrirP12(bytes, pin); }
    return credCache;
  };
  return { clienteId, token, vinculo, perfil, certificado, credenciales, p12 };
}

const certificadoVigente = (c: Contexto) => !!c.certificado && new Date(c.certificado.vence_el).getTime() > Date.now();
const titularDe = (cred: Credenciales) =>
  String(cred.certificado.subject.getField('CN')?.value ?? cred.certificado.subject.getField('O')?.value ?? '').trim();
const ambienteDian = (a: string | null | undefined): '1' | '2' => (a === 'produccion' ? '1' : '2');
const soloDigitos = (v: unknown) => String(v ?? '').split('-')[0].replace(/\D/g, '');

// ── Vía 2: copia compartida ─────────────────────────────────────────────
async function compartirCertificado(admin: SupabaseClient, c: Contexto) {
  if (!c.perfil) throw new ErrorHttp('El negocio no tiene un perfil fiscal activo', 409);
  if (!c.certificado) throw new ErrorHttp('El negocio no tiene certificado digital en la nube. Súbelo en Facturación, Certificado digital.', 409);
  if (!certificadoVigente(c)) throw new ErrorHttp('El certificado digital está vencido. Sube el renovado y vuelve a compartirlo.', 409);
  const { bytes, pin } = await c.p12();
  const cred = await c.credenciales();
  const vence = new Date(c.certificado.vence_el).toISOString().slice(0, 10);
  const { status, datos } = await llamarCodecDocument('pos-certificado', {
    p12_base64: aBase64(bytes), pin, titular: titularDe(cred) || c.perfil.nombre_o_razon_social, vence, perfil_nit: soloDigitos(c.perfil.nit),
  }, c.token);
  const ahora = new Date().toISOString();
  if (status !== 200 || !datos?.ok) {
    const motivo = codigoError(datos) || `respuesta ${status ?? 'sin conexión'}`;
    const mensajes: Record<string, string> = {
      nit_no_coincide: 'El NIT del certificado no es el de la empresa que tu contador tiene en Codec Document',
      p12_invalido: 'Codec Document no pudo abrir el certificado',
      certificado_vencido: 'El certificado está vencido',
      falta_configurar: 'Codec Document todavía no está listo para recibir certificados. Intenta más tarde.',
    };
    await admin.from('contador_vinculos').update({ certificado_error: mensajes[motivo] ?? `No se pudo compartir: ${motivo}`, updated_at: ahora }).eq('cliente_id', c.clienteId);
    throw new ErrorHttp(mensajes[motivo] ?? `Codec Document no recibió el certificado (${motivo})`, 502);
  }
  await admin.from('contador_vinculos').update({
    certificado_compartido: true, certificado_compartido_en: ahora, certificado_compartido_vence: datos.vence ?? vence,
    certificado_error: null, updated_at: ahora,
  }).eq('cliente_id', c.clienteId);
  return { ok: true, compartido: true, vence: datos.vence ?? vence };
}

async function dejarDeCompartir(admin: SupabaseClient, c: Contexto) {
  const { status, datos } = await llamarCodecDocument('pos-certificado', null, c.token, 'DELETE');
  if (status !== 200 && status !== 404) {
    throw new ErrorHttp(`Codec Document no confirmó que borró el certificado (${codigoError(datos) || status || 'sin conexión'}). Intenta de nuevo.`, 502);
  }
  await admin.from('contador_vinculos').update({
    certificado_compartido: false, certificado_compartido_en: null, certificado_compartido_vence: null, certificado_error: null,
    updated_at: new Date().toISOString(),
  }).eq('cliente_id', c.clienteId);
  return { ok: true, compartido: false };
}

// ── Vía 1: capacidades ──────────────────────────────────────────────────
function capacidades(c: Contexto) {
  const p = c.perfil;
  const vigente = certificadoVigente(c);
  const motivoCert = !c.certificado ? 'El negocio no tiene certificado digital en Codec POS' : !vigente ? 'El certificado digital está vencido' : null;
  const acuses = {
    accion: 'capacidad',
    puede_firmar: !motivoCert && !!p?.identificador_software && !!p?.software_pin,
    certificado_titular: c.certificado?.sujeto ? (String(c.certificado.sujeto).match(/CN=([^,]+)/)?.[1] ?? null) : null,
    certificado_vence: c.certificado?.vence_el ? new Date(c.certificado.vence_el).toISOString().slice(0, 10) : null,
    motivo: motivoCert ?? (!p?.identificador_software || !p?.software_pin ? 'Faltan el Software ID o el PIN de facturación en Codec POS' : null),
  };
  const nominaLista = !!p?.nomina_software_id && !!p?.nomina_software_pin && (p?.nomina_ambiente === 'produccion' || !!p?.nomina_test_set_id);
  const nomina = {
    accion: 'capacidad',
    puede_firmar_nomina: !motivoCert && nominaLista,
    software_id: p?.nomina_software_id ?? null,
    ambiente: ambienteDian(p?.nomina_ambiente),
    motivo: motivoCert ?? (nominaLista ? null : 'La empresa aún no está habilitada para nómina electrónica en Codec POS (Software ID, PIN y set de pruebas de nómina)'),
  };
  return { acuses, nomina };
}

/** Manda las capacidades si cambiaron o una vez al día. */
async function anunciarCapacidades(admin: SupabaseClient, c: Contexto) {
  const caps = capacidades(c);
  const huella = JSON.stringify(caps);
  const anterior = c.vinculo.firma_capacidad ? JSON.stringify(c.vinculo.firma_capacidad) : null;
  const viejo = !c.vinculo.firma_capacidad_en || Date.now() - new Date(c.vinculo.firma_capacidad_en).getTime() > CAPACIDAD_CADA_MS;
  if (huella !== anterior || viejo) {
    const [a, n] = await Promise.all([
      llamarCodecDocument('pos-acuses', caps.acuses, c.token),
      llamarCodecDocument('pos-nomina', caps.nomina, c.token),
    ]);
    const error = [a, n].find((r) => r.status !== 200);
    await admin.from('contador_vinculos').update({
      firma_capacidad: error ? null : caps, firma_capacidad_en: error ? null : new Date().toISOString(),
      firma_error: error ? `Codec Document no recibió la capacidad de firma (${codigoError(error.datos) || error.status || 'sin conexión'})` : null,
    }).eq('cliente_id', c.clienteId);
  }
  return caps;
}

// ── Registro de lo firmado ──────────────────────────────────────────────
type Resultado = { id: string; estado: 'validado_dian' | 'rechazado_dian' | 'error_envio'; [k: string]: unknown };

const mensajeDian = (r: RespuestaDian) =>
  [r.StatusDescription, r.StatusMessage, ...(r.ErrorMessage?.string ?? [])].filter(Boolean).join(' · ').slice(0, 1000) || null;

function resultadoDe(f: any, clase: 'acuse' | 'nomina'): Resultado {
  const base: Resultado = { id: f.id, estado: f.estado, codigo_dian: f.codigo_dian ?? null, mensaje: f.mensaje ?? null };
  if (f.estado === 'validado_dian') {
    if (clase === 'acuse') base.cude = f.cude;
    else { base.cune = f.cude; base.xml_firmado = f.xml_firmado; }
  }
  return base;
}

async function guardar(admin: SupabaseClient, fila: Record<string, unknown>) {
  await admin.from('dian_firmas_encargo').upsert({ ...fila, updated_at: new Date().toISOString() });
}

// ── Vía 1: acuses ───────────────────────────────────────────────────────
async function procesarAcuses(admin: SupabaseClient, c: Contexto, limite: number) {
  const { status, datos } = await llamarCodecDocument('pos-acuses', { accion: 'pendientes' }, c.token);
  if (status !== 200) return;
  const eventos = (datos?.eventos ?? []) as EventoAcuse[];
  if (!eventos.length) return;

  const resultados: Resultado[] = [];
  const facturasConFalla = new Set<string>();
  const ambiente = ambienteDian(c.perfil.ambiente);

  for (const e of eventos) {
    if (Date.now() > limite) break;
    const { data: previo } = await admin.from('dian_firmas_encargo').select('*').eq('id', e.id).maybeSingle();
    if (previo && (previo.estado === 'validado_dian' || previo.estado === 'rechazado_dian')) {
      resultados.push(resultadoDe(previo, 'acuse'));
      if (previo.estado !== 'validado_dian') facturasConFalla.add(e.factura?.cufe);
      continue;
    }
    // Si un evento anterior de la misma factura falló, los siguientes esperan.
    if (facturasConFalla.has(e.factura?.cufe)) continue;

    const fila: Record<string, any> = {
      id: e.id, cliente_id: c.clienteId, perfil_fiscal_id: c.perfil.id, clase: 'acuse', codigo: e.codigo,
      referencia: e.factura?.cufe ?? null, intentos: (previo?.intentos ?? 0) + 1,
    };
    try {
      if (soloDigitos(e.factura?.comprador?.nit) !== soloDigitos(c.perfil.nit)) {
        throw new Error('La factura no es una compra de esta empresa: el comprador no tiene el NIT del perfil fiscal');
      }
      const numero = previo?.numero || (await admin.rpc('dian_siguiente_evento')).data as string;
      const { xml, cude } = construirApplicationResponse(
        { ...e, factura: { ...e.factura, comprador: { ...e.factura.comprador, dv: e.factura.comprador.dv ?? c.perfil.digito_verificacion } } },
        { numero, softwareId: c.perfil.identificador_software, softwarePin: c.perfil.software_pin, ambiente },
      );
      const firmado = firmarXades(xml, await c.credenciales(), new Date(), 'third party');
      Object.assign(fila, { numero, cude, xml_firmado: firmado });
      const r = await enviarEvento(numero, firmado, ambiente === '1' ? 'produccion' : 'habilitacion', await c.credenciales());
      if (r.IsValid) {
        Object.assign(fila, { estado: 'validado_dian', codigo_dian: r.StatusCode ?? '00', mensaje: mensajeDian(r) });
      } else {
        Object.assign(fila, { estado: 'rechazado_dian', codigo_dian: r.StatusCode ?? null, mensaje: mensajeDian(r) ?? 'La DIAN rechazó el evento' });
        facturasConFalla.add(e.factura.cufe);
      }
    } catch (err) {
      Object.assign(fila, { estado: 'error_envio', mensaje: (err as Error).message.slice(0, 1000) });
      facturasConFalla.add(e.factura?.cufe);
    }
    await guardar(admin, fila);
    resultados.push(resultadoDe(fila, 'acuse'));
  }

  if (resultados.length) {
    const r = await llamarCodecDocument('pos-acuses', { accion: 'resultado', resultados }, c.token);
    if (r.status === 200) await admin.from('dian_firmas_encargo').update({ reportado: true }).in('id', resultados.map((x) => x.id));
  }
}

// ── Vía 1: nómina ───────────────────────────────────────────────────────
interface DocumentoNomina { id: string; tipo_xml: string; numero: string; xml: string; cune_datos: CuneDatos; trabajador?: { documento?: string } }

async function procesarNomina(admin: SupabaseClient, c: Contexto, limite: number) {
  const { status, datos } = await llamarCodecDocument('pos-nomina', { accion: 'pendientes' }, c.token);
  if (status !== 200) return;
  const documentos = (datos?.documentos ?? []) as DocumentoNomina[];
  const enHabilitacion = c.perfil.nomina_ambiente !== 'produccion';
  const ambiente = ambienteDian(c.perfil.nomina_ambiente);
  const resultados: Resultado[] = [];

  // En habilitación la DIAN responde después: se consulta lo que quedó en espera.
  const { data: enEspera } = await admin.from('dian_firmas_encargo').select('*')
    .eq('cliente_id', c.clienteId).eq('clase', 'nomina').eq('estado', 'firmando').not('zip_key', 'is', null).limit(20);

  const consultar = async (f: any) => {
    try {
      const r = await consultarEstadoZip(f.zip_key, 'habilitacion', await c.credenciales());
      // Aún en proceso: la DIAN responde sin código o con «en proceso».
      if (!r.IsValid && (!r.StatusCode || /proceso/i.test(`${r.StatusDescription ?? ''} ${r.StatusMessage ?? ''}`)) && !r.ErrorMessage) return null;
      const fila = { ...f, estado: r.IsValid ? 'validado_dian' : 'rechazado_dian', codigo_dian: r.StatusCode ?? null, mensaje: mensajeDian(r) };
      await guardar(admin, fila);
      return fila;
    } catch { return null; }
  };

  for (const f of enEspera ?? []) {
    if (Date.now() > limite) break;
    const listo = await consultar(f);
    if (listo) resultados.push(resultadoDe(listo, 'nomina'));
  }

  for (const d of documentos) {
    if (Date.now() > limite) break;
    if (resultados.some((r) => r.id === d.id)) continue;
    const { data: previo } = await admin.from('dian_firmas_encargo').select('*').eq('id', d.id).maybeSingle();
    if (previo && (previo.estado === 'validado_dian' || previo.estado === 'rechazado_dian')) { resultados.push(resultadoDe(previo, 'nomina')); continue; }
    if (previo?.estado === 'firmando' && previo.zip_key) continue; // ya se consultó arriba

    const fila: Record<string, any> = {
      id: d.id, cliente_id: c.clienteId, perfil_fiscal_id: c.perfil.id, clase: 'nomina', codigo: d.tipo_xml,
      numero: d.numero, referencia: d.trabajador?.documento ?? null, intentos: (previo?.intentos ?? 0) + 1,
    };
    try {
      if (soloDigitos(d.cune_datos?.nit_ne) !== soloDigitos(c.perfil.nit)) {
        throw new Error('La nómina no es de esta empresa: el NIT del empleador no es el del perfil fiscal');
      }
      const { xml, cune } = prepararNomina(d.xml, d.cune_datos, {
        softwareId: c.perfil.nomina_software_id, softwarePin: c.perfil.nomina_software_pin, ambiente,
      });
      const firmado = firmarXades(xml, await c.credenciales(), new Date(), 'supplier');
      Object.assign(fila, { cude: cune, xml_firmado: firmado });
      if (enHabilitacion) {
        const r = await enviarSetDePruebas(d.numero, firmado, c.perfil.nomina_test_set_id, await c.credenciales());
        if (r.ZipKey) {
          Object.assign(fila, { estado: 'firmando', zip_key: r.ZipKey });
          await guardar(admin, fila);
          const listo = await consultar(fila);
          if (listo) resultados.push(resultadoDe(listo, 'nomina'));
          continue;
        }
        Object.assign(fila, { estado: 'rechazado_dian', codigo_dian: r.StatusCode ?? null, mensaje: mensajeDian(r) ?? 'La DIAN no recibió el set de pruebas' });
      } else {
        const r = await enviarNomina(d.numero, firmado, await c.credenciales());
        Object.assign(fila, r.IsValid
          ? { estado: 'validado_dian', codigo_dian: r.StatusCode ?? '00', mensaje: mensajeDian(r) }
          : { estado: 'rechazado_dian', codigo_dian: r.StatusCode ?? null, mensaje: mensajeDian(r) ?? 'La DIAN rechazó la nómina' });
      }
    } catch (err) {
      Object.assign(fila, { estado: 'error_envio', mensaje: (err as Error).message.slice(0, 1000) });
    }
    await guardar(admin, fila);
    resultados.push(resultadoDe(fila, 'nomina'));
  }

  if (resultados.length) {
    const r = await llamarCodecDocument('pos-nomina', { accion: 'resultado', resultados }, c.token);
    if (r.status === 200) await admin.from('dian_firmas_encargo').update({ reportado: true }).in('id', resultados.map((x) => x.id));
  }
}

// ── Cron ────────────────────────────────────────────────────────────────
async function despachar(admin: SupabaseClient) {
  const limite = Date.now() + PRESUPUESTO_MS;
  const { data: vinculos } = await admin.from('contador_vinculos')
    .select('cliente_id, token_cifrado, firma_capacidad, firma_capacidad_en, certificado_compartido, certificado_compartido_en')
    .eq('estado', 'activo');
  let negocios = 0;
  for (const v of vinculos ?? []) {
    if (Date.now() > limite) break;
    if (!v.token_cifrado) continue;
    try {
      const c = await cargarContexto(admin, v);
      if (!c.perfil) continue;
      // Vía 2: certificado renovado en Codec POS → se le vuelve a mandar.
      if (v.certificado_compartido && c.certificado && certificadoVigente(c)
          && (!v.certificado_compartido_en || new Date(c.certificado.subido_el) > new Date(v.certificado_compartido_en))) {
        await compartirCertificado(admin, c).catch(() => { /* queda el error en certificado_error */ });
      }
      const caps = await anunciarCapacidades(admin, c);
      if (caps.acuses.puede_firmar) await procesarAcuses(admin, c, limite);
      if (caps.nomina.puede_firmar_nomina) await procesarNomina(admin, c, limite);
      negocios++;
    } catch (e) {
      await admin.from('contador_vinculos').update({ firma_error: `Firma por encargo: ${(e as Error).message}`.slice(0, 500) }).eq('cliente_id', v.cliente_id);
    }
  }
  return { negocios };
}

// ── Sesión del administrador ────────────────────────────────────────────
async function negocioDelAdministrador(req: Request, admin: SupabaseClient) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!token) throw new ErrorHttp('No autenticado', 401);
  const comoUsuario = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error } = await comoUsuario.auth.getUser(token);
  if (error || !user) throw new ErrorHttp('Sesión inválida o vencida', 401);
  const { data: clienteId } = await comoUsuario.rpc('current_cliente_id');
  if (!clienteId) throw new ErrorHttp('Esta sesión no pertenece a ningún negocio', 403);
  const [{ data: empleado }, { data: instalacion }] = await Promise.all([
    admin.from('empleados').select('rol').eq('id', user.id).maybeSingle(),
    admin.from('sync_identidades').select('id').eq('id', user.id).maybeSingle(),
  ]);
  if (!instalacion && !['admin', 'super_usuario'].includes(empleado?.rol ?? '')) {
    throw new ErrorHttp('Solo un administrador del negocio puede compartir el certificado digital', 403);
  }
  return clienteId as string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (!TOKEN_KEY || !DIAN_CERT_KEY) throw new ErrorHttp('Faltan llaves del servidor (CONTADOR_TOKEN_KEY o DIAN_CERT_KEY)', 500);
    const cuerpo = await req.json().catch(() => ({}));
    const accion = String((cuerpo as any)?.accion ?? '');
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (accion === 'despachar') {
      if (!CRON_SECRET || req.headers.get('x-contador-secret') !== CRON_SECRET) throw new ErrorHttp('No autorizado', 401);
      return json(await despachar(admin));
    }

    const clienteId = await negocioDelAdministrador(req, admin);
    const { data: vinculo } = await admin.from('contador_vinculos')
      .select('cliente_id, estado, token_cifrado, firma_capacidad, firma_capacidad_en').eq('cliente_id', clienteId).maybeSingle();
    if (!vinculo || vinculo.estado !== 'activo' || !vinculo.token_cifrado) {
      throw new ErrorHttp('Primero conecta el negocio con tu contador', 409);
    }
    const c = await cargarContexto(admin, vinculo);
    if (accion === 'compartir-certificado') return json(await compartirCertificado(admin, c));
    if (accion === 'dejar-de-compartir') return json(await dejarDeCompartir(admin, c));
    throw new ErrorHttp(`Acción desconocida: ${accion}`, 400);
  } catch (e) {
    const status = e instanceof ErrorHttp ? e.status : 500;
    if (status === 500) console.error('[contador-firma]', e);
    return json({ ok: false, error: (e as Error).message }, status);
  }
});
