/**
 * "Mi contador": puente de Codec POS hacia Codec Document (módulo
 * Contabilidad del contador). Ver migración 0122 y eventos.ts.
 *
 * Acciones:
 *   · vincular { codigo }   — sesión de un administrador del negocio. Llama
 *     pos-vincular, guarda el token cifrado y encola el historial del año.
 *   · desvincular           — sesión de un administrador. Llama pos-desvincular.
 *   · despachar             — solo el cron (header x-contador-secret). Manda
 *     los eventos pendientes en lotes de 200 a pos-ingesta.
 *
 * Se despliega con --no-verify-jwt: el cron no trae JWT y las acciones del
 * negocio validan la sesión aquí mismo.
 *
 * Secretos: CONTADOR_TOKEN_KEY (32 bytes base64, cifra el token cdp_…),
 * CONTADOR_CRON_SECRET (= vault contador_cron_secret) y, opcional,
 * CODEC_DOCUMENT_FUNCTIONS_URL.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { cifrar, descifrar } from '../dian-emision/cifrado.ts';
import {
  construirEventoFactura, construirEventoVenta, esRechazoPorCupo, esReintentable, minutosHastaReintento, nitSoloDigitos,
  type FacturaFila, type ItemFila, type VentaFila,
} from './eventos.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const TOKEN_KEY = Deno.env.get('CONTADOR_TOKEN_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CONTADOR_CRON_SECRET') ?? '';
const CODEC_DOCUMENT = (Deno.env.get('CODEC_DOCUMENT_FUNCTIONS_URL') ?? 'https://yxzchnldmfsgdtbjurey.supabase.co/functions/v1').replace(/\/$/, '');

const LOTE = 200;
const PRESUPUESTO_MS = 45_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

class ErrorHttp extends Error {
  constructor(mensaje: string, readonly status: number, readonly codigo?: string) { super(mensaje); }
}

const contextoToken = (clienteId: string) => `contador:${clienteId}`;

/** Llama una función de Codec Document. status null = no hubo respuesta. */
async function llamarCodecDocument(ruta: string, cuerpo: unknown, token?: string): Promise<{ status: number | null; datos: any }> {
  try {
    const r = await fetch(`${CODEC_DOCUMENT}/${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(cuerpo),
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

const codigoError = (datos: any): string => String(datos?.error ?? datos?.codigo ?? datos?.code ?? '').trim();

// ── Sesión del negocio ──────────────────────────────────────────────────
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
    throw new ErrorHttp('Solo un administrador del negocio puede conectar o desconectar al contador', 403);
  }
  return { clienteId: clienteId as string, userId: user.id };
}

async function vincular(admin: SupabaseClient, clienteId: string, userId: string, codigo: string) {
  if (!TOKEN_KEY) throw new ErrorHttp('El servidor no tiene configurada la llave CONTADOR_TOKEN_KEY', 500);
  if (!codigo) throw new ErrorHttp('Escribe el código que te dio tu contador', 400);

  const { data: actual } = await admin.from('contador_vinculos').select('estado, empresa, contador').eq('cliente_id', clienteId).maybeSingle();
  if (actual?.estado === 'activo') throw new ErrorHttp(`Este negocio ya está conectado con ${actual.contador || 'un contador'}. Desconéctalo primero.`, 409, 'ya_vinculado');

  const [{ data: negocio }, { data: perfil }] = await Promise.all([
    admin.from('clientes_pos').select('nombre_negocio, nit').eq('id', clienteId).maybeSingle(),
    admin.from('perfiles_fiscales').select('nit, nombre_comercial, nombre_o_razon_social').eq('cliente_id', clienteId).eq('activo', true).maybeSingle(),
  ]);
  const nit = nitSoloDigitos(perfil?.nit || negocio?.nit);
  if (!nit) throw new ErrorHttp('El negocio no tiene NIT registrado. Agrégalo en la configuración del negocio o en Facturación.', 400, 'sin_nit');
  const nombreNegocio = negocio?.nombre_negocio || perfil?.nombre_comercial || perfil?.nombre_o_razon_social || '';

  const { status, datos } = await llamarCodecDocument('pos-vincular', {
    codigo: codigo.trim().toUpperCase(), nit, nombre_negocio: nombreNegocio, pos_cliente_id: clienteId,
  });
  // Se mira el código de error y no solo el HTTP: un 404 sin `codigo_invalido`
  // es que la función de Codec Document no está publicada.
  const motivo = codigoError(datos);
  if (status === 404 && motivo === 'codigo_invalido') throw new ErrorHttp('El código no existe. Revísalo con tu contador.', 404, 'codigo_invalido');
  if (status === 410 && motivo === 'codigo_vencido') throw new ErrorHttp('El código ya venció o ya se usó. Pídele uno nuevo a tu contador.', 410, 'codigo_vencido');
  if (status === 409 && motivo === 'nit_no_coincide') throw new ErrorHttp(`El NIT de este negocio (${nit}) no coincide con el de la empresa que creó tu contador.`, 409, 'nit_no_coincide');
  if (status !== 200 || !datos?.token) {
    throw new ErrorHttp(`Codec Document no respondió bien (${status ?? 'sin conexión'}${codigoError(datos) ? `: ${codigoError(datos)}` : ''}). Intenta de nuevo en unos minutos.`, 502);
  }

  const tokenCifrado = await cifrar(new TextEncoder().encode(String(datos.token)), TOKEN_KEY, contextoToken(clienteId));
  const { error: errorGuardar } = await admin.from('contador_vinculos').upsert({
    cliente_id: clienteId, estado: 'activo', empresa: datos.empresa ?? null, contador: datos.contador ?? null, nit,
    token_cifrado: tokenCifrado, vinculado_por: userId, vinculado_en: new Date().toISOString(),
    desvinculado_en: null, ultimo_error: null, updated_at: new Date().toISOString(),
  });
  if (errorGuardar) throw new ErrorHttp(`Se conectó, pero no se pudo guardar la conexión: ${errorGuardar.message}`, 500);

  // Lo que quedó cancelado de una conexión anterior vuelve a la cola.
  await admin.from('contador_eventos').update({ estado: 'pendiente', intentos: 0, proximo_intento_en: new Date().toISOString(), motivo: null })
    .eq('cliente_id', clienteId).eq('estado', 'cancelado');
  const { data: encolados } = await admin.rpc('contador_encolar_historial', { p_cliente_id: clienteId });

  return { empresa: datos.empresa ?? null, contador: datos.contador ?? null, encolados: encolados ?? 0 };
}

async function desvincular(admin: SupabaseClient, clienteId: string) {
  const { data: vinculo } = await admin.from('contador_vinculos').select('estado, token_cifrado').eq('cliente_id', clienteId).maybeSingle();
  if (!vinculo) throw new ErrorHttp('Este negocio no está conectado con ningún contador', 404);
  if (vinculo.token_cifrado && vinculo.estado === 'activo' && TOKEN_KEY) {
    const token = new TextDecoder().decode(await descifrar(vinculo.token_cifrado, TOKEN_KEY, contextoToken(clienteId)));
    const { status, datos } = await llamarCodecDocument('pos-desvincular', {}, token);
    // 401 = el contador ya la había desconectado: igual se cierra aquí.
    if (status !== 200 && status !== 401 && status !== 404) {
      throw new ErrorHttp(`Codec Document no confirmó la desconexión (${status ?? 'sin conexión'}${codigoError(datos) ? `: ${codigoError(datos)}` : ''}). Intenta de nuevo.`, 502);
    }
  }
  await admin.from('contador_vinculos').update({
    estado: 'desvinculado', token_cifrado: null, desvinculado_en: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('cliente_id', clienteId);
  await admin.from('contador_eventos').update({ estado: 'cancelado' }).eq('cliente_id', clienteId).eq('estado', 'pendiente');
  return { ok: true };
}

// ── Envío por lotes ─────────────────────────────────────────────────────
interface EventoCola { id: number; tipo: string; id_origen: string; intentos: number }

/** Arma los eventos del lote. Los que no se pueden armar vuelven como rechazos locales. */
async function armarLote(admin: SupabaseClient, clienteId: string, cola: EventoCola[]) {
  const idsVentas = cola.filter((e) => e.tipo === 'venta').map((e) => e.id_origen);
  const idsFacturas = cola.filter((e) => e.tipo === 'factura_electronica').map((e) => e.id_origen);

  const [{ data: ventas }, { data: items }, { data: facturasEv }] = await Promise.all([
    idsVentas.length
      ? admin.from('ventas').select('id, numero, local_id, created_at, total, descuento, propina, metodo_pago, metodos_multiples, cajero_nombre, tienda_id').in('id', idsVentas)
      : Promise.resolve({ data: [] as VentaFila[] }),
    idsVentas.length
      ? admin.from('venta_items').select('venta_id, nombre, cantidad, precio_unitario, subtotal, producto_id').in('venta_id', idsVentas)
      : Promise.resolve({ data: [] as ItemFila[] }),
    idsFacturas.length
      ? admin.from('facturas_electronicas').select('id, cufe, xml, fecha_emision, created_at, venta_referencia').in('id', idsFacturas)
      : Promise.resolve({ data: [] as FacturaFila[] }),
  ]);
  const ventasPorId = new Map((ventas ?? []).map((v: VentaFila) => [v.id, v]));
  const itemsPorVenta = new Map<string, ItemFila[]>();
  for (const i of (items ?? []) as ItemFila[]) {
    if (!itemsPorVenta.has(i.venta_id)) itemsPorVenta.set(i.venta_id, []);
    itemsPorVenta.get(i.venta_id)!.push(i);
  }

  const idsProductos = [...new Set(((items ?? []) as ItemFila[]).map((i) => i.producto_id).filter(Boolean))] as string[];
  const idsTiendas = [...new Set(((ventas ?? []) as VentaFila[]).map((v) => v.tienda_id).filter(Boolean))] as string[];
  const referenciasVentas = ((ventas ?? []) as VentaFila[]).map((v) => v.local_id).filter(Boolean) as string[];
  const referenciasFacturas = ((facturasEv ?? []) as FacturaFila[]).map((f) => f.venta_referencia).filter(Boolean) as string[];

  const [{ data: productos }, { data: tiendas }, { data: facturasDeVentas }, { data: ventasDeFacturas }] = await Promise.all([
    idsProductos.length ? admin.from('productos').select('id, iva').in('id', idsProductos) : Promise.resolve({ data: [] }),
    idsTiendas.length ? admin.from('tiendas').select('id, local_id, nombre').eq('cliente_id', clienteId) : Promise.resolve({ data: [] }),
    referenciasVentas.length
      ? admin.from('facturas_electronicas').select('venta_referencia, cufe').eq('cliente_id', clienteId).eq('estado', 'accepted')
          .eq('issuer_ambiente', 'produccion').in('venta_referencia', referenciasVentas)
      : Promise.resolve({ data: [] }),
    referenciasFacturas.length
      ? admin.from('ventas').select('id, local_id').eq('cliente_id', clienteId).in('local_id', referenciasFacturas)
      : Promise.resolve({ data: [] }),
  ]);
  const ivaPorProducto = new Map((productos ?? []).map((p: any) => [p.id, Number(p.iva) || 0]));
  const tiendaPorId = new Map<string, string>();
  for (const t of (tiendas ?? []) as any[]) { tiendaPorId.set(String(t.id), t.nombre); if (t.local_id) tiendaPorId.set(String(t.local_id), t.nombre); }
  const cufePorReferencia = new Map((facturasDeVentas ?? []).map((f: any) => [f.venta_referencia, f.cufe]));
  const ventaPorReferencia = new Map((ventasDeFacturas ?? []).map((v: any) => [v.local_id, v.id]));
  const facturaPorId = new Map(((facturasEv ?? []) as FacturaFila[]).map((f) => [f.id, f]));

  const eventos: unknown[] = [];
  const rechazosLocales: { id: number; motivo: string }[] = [];
  for (const e of cola) {
    if (e.tipo === 'venta') {
      const v = ventasPorId.get(e.id_origen);
      if (!v) { rechazosLocales.push({ id: e.id, motivo: 'La venta ya no existe en Codec POS' }); continue; }
      eventos.push(construirEventoVenta(
        v, itemsPorVenta.get(v.id) ?? [], ivaPorProducto,
        v.tienda_id ? tiendaPorId.get(String(v.tienda_id)) ?? null : null,
        v.local_id ? cufePorReferencia.get(v.local_id) ?? null : null,
      ));
    } else if (e.tipo === 'factura_electronica') {
      const f = facturaPorId.get(e.id_origen);
      if (!f?.xml) { rechazosLocales.push({ id: e.id, motivo: 'La factura no tiene XML guardado' }); continue; }
      eventos.push(construirEventoFactura(f, f.venta_referencia ? ventaPorReferencia.get(f.venta_referencia) ?? null : null));
    } else {
      rechazosLocales.push({ id: e.id, motivo: `Tipo de evento sin soporte: ${e.tipo}` });
    }
  }
  return { eventos, rechazosLocales };
}

async function marcar(admin: SupabaseClient, ids: number[], cambios: Record<string, unknown>) {
  if (ids.length) await admin.from('contador_eventos').update(cambios).in('id', ids);
}

/** Reprograma cada evento según sus propios intentos. */
async function reprogramar(admin: SupabaseClient, cola: EventoCola[], motivo: string) {
  for (const e of cola) {
    const intentos = e.intentos + 1;
    await admin.from('contador_eventos').update({
      intentos, motivo, proximo_intento_en: new Date(Date.now() + minutosHastaReintento(intentos) * 60_000).toISOString(),
    }).eq('id', e.id);
  }
}

/** Manda un lote de un negocio. Devuelve false si hay que dejar de enviar a ese negocio en esta corrida. */
async function enviarLote(admin: SupabaseClient, clienteId: string, token: string): Promise<boolean> {
  const { data: cola } = await admin.from('contador_eventos').select('id, tipo, id_origen, intentos')
    .eq('cliente_id', clienteId).eq('estado', 'pendiente').lte('proximo_intento_en', new Date().toISOString())
    .order('fecha_origen', { ascending: true }).order('id', { ascending: true }).limit(LOTE);
  if (!cola?.length) return false;

  const { eventos, rechazosLocales } = await armarLote(admin, clienteId, cola);
  for (const r of rechazosLocales) await marcar(admin, [r.id], { estado: 'rechazado', motivo: r.motivo });
  const enviables = cola.filter((e) => !rechazosLocales.some((r) => r.id === e.id));
  if (!eventos.length) return true;

  const { status, datos } = await llamarCodecDocument('pos-ingesta', { eventos }, token);
  const ahora = new Date().toISOString();

  if (status === 401 && /conexion_revocada/.test(codigoError(datos) || JSON.stringify(datos ?? ''))) {
    await admin.from('contador_vinculos').update({ estado: 'revocado', ultimo_error: 'Tu contador desconectó esta empresa', updated_at: ahora }).eq('cliente_id', clienteId);
    await marcar(admin, enviables.map((e) => e.id), { estado: 'cancelado', motivo: 'Tu contador desconectó esta empresa' });
    return false;
  }
  if (status !== 200) {
    const motivo = `HTTP ${status ?? 'sin respuesta'}${codigoError(datos) ? `: ${codigoError(datos)}` : ''}`;
    if (esReintentable(status)) await reprogramar(admin, enviables, motivo);
    else await marcar(admin, enviables.map((e) => e.id), { estado: 'rechazado', motivo });
    await admin.from('contador_vinculos').update({ ultimo_error: motivo, updated_at: ahora }).eq('cliente_id', clienteId);
    return false;
  }

  const porOrigen = new Map(enviables.map((e) => [e.id_origen, e]));
  const aceptados = (datos?.aceptados ?? []).map(String);
  const duplicados = (datos?.duplicados ?? []).map(String);
  const rechazados: { id_origen: string; motivo?: string }[] = datos?.rechazados ?? [];
  await marcar(admin, aceptados.map((o: string) => porOrigen.get(o)?.id).filter(Boolean) as number[], { estado: 'enviado', enviado_en: ahora, motivo: null });
  await marcar(admin, duplicados.map((o: string) => porOrigen.get(o)?.id).filter(Boolean) as number[], { estado: 'duplicado', enviado_en: ahora, motivo: null });
  let sinCupo = false;
  for (const r of rechazados) {
    const e = porOrigen.get(String(r.id_origen));
    if (!e) continue;
    if (esRechazoPorCupo(r.motivo)) {
      // Queda en espera: se reintenta cada 6 horas hasta que el contador tenga cupo.
      sinCupo = true;
      await admin.from('contador_eventos').update({
        intentos: e.intentos + 1, motivo: r.motivo ?? 'cupo', proximo_intento_en: new Date(Date.now() + 360 * 60_000).toISOString(),
      }).eq('id', e.id);
    } else {
      await marcar(admin, [e.id], { estado: 'rechazado', motivo: r.motivo ?? 'Rechazado por Codec Document' });
    }
  }
  // Lo que Codec Document no mencionó se vuelve a intentar más tarde.
  const mencionados = new Set([...aceptados, ...duplicados, ...rechazados.map((r) => String(r.id_origen))]);
  const sinRespuesta = enviables.filter((e) => !mencionados.has(e.id_origen));
  if (sinRespuesta.length) await reprogramar(admin, sinRespuesta, 'Codec Document no confirmó este evento');

  await admin.from('contador_vinculos').update({
    ultimo_envio_en: ahora,
    ultimo_error: sinCupo ? 'Tu contador llegó al límite de facturas de su plan este mes. Las facturas quedan en espera y le llegan cuando tenga cupo.' : null,
    updated_at: ahora,
  }).eq('cliente_id', clienteId);
  return true;
}

async function despachar(admin: SupabaseClient) {
  const inicio = Date.now();
  const { data: vinculos } = await admin.from('contador_vinculos').select('cliente_id, token_cifrado').eq('estado', 'activo');
  let lotes = 0;
  for (const v of vinculos ?? []) {
    if (!v.token_cifrado) continue;
    let token: string;
    try {
      token = new TextDecoder().decode(await descifrar(v.token_cifrado, TOKEN_KEY, contextoToken(v.cliente_id)));
    } catch {
      await admin.from('contador_vinculos').update({ ultimo_error: 'No se pudo leer la conexión guardada: hay que volver a conectar al contador' }).eq('cliente_id', v.cliente_id);
      continue;
    }
    while (Date.now() - inicio < PRESUPUESTO_MS && await enviarLote(admin, v.cliente_id, token)) lotes++;
    if (Date.now() - inicio >= PRESUPUESTO_MS) break;
  }
  return { lotes };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const cuerpo = await req.json().catch(() => ({}));
    const accion = String((cuerpo as any)?.accion ?? '');
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (accion === 'despachar') {
      if (!CRON_SECRET || req.headers.get('x-contador-secret') !== CRON_SECRET) throw new ErrorHttp('No autorizado', 401);
      return json(await despachar(admin));
    }

    const { clienteId, userId } = await negocioDelAdministrador(req, admin);
    if (accion === 'vincular') return json(await vincular(admin, clienteId, userId, String((cuerpo as any)?.codigo ?? '')));
    if (accion === 'desvincular') return json(await desvincular(admin, clienteId));
    throw new ErrorHttp(`Acción desconocida: ${accion}`, 400);
  } catch (e) {
    const status = e instanceof ErrorHttp ? e.status : 500;
    if (status === 500) console.error('[contador-sync]', e);
    return json({ ok: false, error: (e as Error).message, codigo: e instanceof ErrorHttp ? e.codigo : undefined }, status);
  }
});
