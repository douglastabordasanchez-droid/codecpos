/**
 * "Mi contador": puente de Codec POS hacia Codec Document (módulo
 * Contabilidad del contador). Ver migración 0122 y eventos.ts.
 *
 * Acciones:
 *   · vincular { codigo }   — sesión de un administrador del negocio. Llama
 *     pos-vincular, guarda el token cifrado y encola todo el historial.
 *   · desvincular           — sesión de un administrador. Llama pos-desvincular.
 *   · verificar             — sesión del negocio. Pregunta a pos-estado si la
 *     conexión sigue viva; si el contador la cortó, la cierra aquí.
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
  construirEventoAnulacion, construirEventoCierre, construirEventoDevolucion, construirEventoDocumento, construirEventoFactura,
  construirEventoGasto, construirEventoVenta, esAnulacionPrematura, esRechazoPorCupo, esReintentable, minutosHastaReintento,
  nitSoloDigitos, XML_MAXIMO_BYTES,
  type CierreFila, type DevolucionFila, type DevolucionItemFila, type FacturaFila, type GastoFila, type ItemFila,
  type SoporteGasto, type VentaFila,
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
  // Si el contador ya desconectó la empresa desde Codec Document, se sigue con el código nuevo sin pasos extra.
  if (actual?.estado === 'activo' && (await verificar(admin, clienteId)).estado === 'activo') {
    throw new ErrorHttp(`Este negocio ya está conectado con ${actual.contador || 'un contador'}. Desconéctalo primero.`, 409, 'ya_vinculado');
  }

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

  // Al reconectar se reenvía todo: la conexión nueva puede ser de otra cuenta
  // de contador que no tiene nada, y Codec Document deduplica por id_origen.
  await admin.from('contador_eventos').update({ estado: 'pendiente', intentos: 0, proximo_intento_en: new Date().toISOString(), motivo: null, enviado_en: null })
    .eq('cliente_id', clienteId).neq('estado', 'pendiente');
  const { data: encolados } = await admin.rpc('contador_encolar_historial', { p_cliente_id: clienteId });

  return { empresa: datos.empresa ?? null, contador: datos.contador ?? null, encolados: encolados ?? 0 };
}

/** El contador desconectó la empresa en Codec Document: se cierra aquí también. */
async function marcarRevocado(admin: SupabaseClient, clienteId: string) {
  const ahora = new Date().toISOString();
  await admin.from('contador_vinculos').update({
    estado: 'revocado', token_cifrado: null, ultimo_error: 'Tu contador desconectó esta empresa', updated_at: ahora,
  }).eq('cliente_id', clienteId);
  await admin.from('contador_eventos').update({ estado: 'cancelado', motivo: 'Tu contador desconectó esta empresa' })
    .eq('cliente_id', clienteId).eq('estado', 'pendiente');
}

/**
 * Pregunta a pos-estado si la conexión sigue viva (al abrir «Mi contador» y
 * antes de aceptar un código nuevo). Sin respuesta de Codec Document se deja
 * como estaba: solo un 401 claro la cierra.
 */
async function verificar(admin: SupabaseClient, clienteId: string): Promise<{ estado: string | null }> {
  const { data: vinculo } = await admin.from('contador_vinculos').select('estado, token_cifrado').eq('cliente_id', clienteId).maybeSingle();
  if (!vinculo) return { estado: null };
  if (vinculo.estado !== 'activo') return { estado: vinculo.estado };
  let token: string;
  try {
    if (!vinculo.token_cifrado) throw new Error('sin token');
    token = new TextDecoder().decode(await descifrar(vinculo.token_cifrado, TOKEN_KEY, contextoToken(clienteId)));
  } catch {
    await marcarRevocado(admin, clienteId);
    return { estado: 'revocado' };
  }
  const { status, datos } = await llamarCodecDocument('pos-estado', {}, token);
  const motivo = codigoError(datos) || String(datos?.estado ?? '');
  // Solo con el código de Codec Document: un 401 de la pasarela (función mal publicada) no es una desconexión.
  if (status === 401 && /conexion_revocada|token_invalido|revocado/.test(motivo)) {
    await marcarRevocado(admin, clienteId);
    return { estado: 'revocado' };
  }
  return { estado: 'activo' };
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
interface EventoCola { id: number; tipo: string; id_origen: string; intentos: number; de: string | null }

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function itemsDeVentas(admin: SupabaseClient, idsVentas: string[]): Promise<{ data: ItemFila[] }> {
  const todos: ItemFila[] = [];
  for (let i = 0; i < idsVentas.length; i += 40) {
    const { data, error } = await admin.from('venta_items').select('venta_id, nombre, cantidad, precio_unitario, subtotal, producto_id')
      .in('venta_id', idsVentas.slice(i, i + 40));
    if (error) throw new Error(`No se pudieron leer los ítems de las ventas: ${error.message}`);
    todos.push(...((data ?? []) as ItemFila[]));
  }
  return { data: todos };
}

/** Factura aceptada de cada venta, de a 40 referencias para no pasarse del largo de la consulta. */
async function facturasDeReferencias(admin: SupabaseClient, clienteId: string, refs: string[]): Promise<{ data: any[] }> {
  const todas: any[] = [];
  for (let i = 0; i < refs.length; i += 40) {
    const { data } = await admin.from('facturas_electronicas').select('venta_referencia, cufe').eq('cliente_id', clienteId)
      .eq('estado', 'accepted').eq('issuer_ambiente', 'produccion').in('venta_referencia', refs.slice(i, i + 40));
    todas.push(...(data ?? []));
  }
  return { data: todas };
}

/** Arma los eventos del lote. Los que no se pueden armar vuelven como rechazos locales. */
async function armarLote(admin: SupabaseClient, clienteId: string, cola: EventoCola[]) {
  const idsVentas = cola.filter((e) => e.tipo === 'venta').map((e) => e.id_origen);
  const idsFacturas = cola.filter((e) => e.tipo === 'factura_electronica').map((e) => e.id_origen);

  const [{ data: ventas }, { data: items }, { data: facturasEv }] = await Promise.all([
    idsVentas.length
      ? admin.from('ventas').select('id, numero, local_id, created_at, total, descuento, propina, metodo_pago, metodos_multiples, cajero_nombre, tienda_id').in('id', idsVentas)
      : Promise.resolve({ data: [] as VentaFila[] }),
    // De a 40 ventas: cada consulta trae máximo 1000 filas y 200 ventas pueden pasar de 1000 ítems.
    itemsDeVentas(admin, idsVentas),
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
  // La factura apunta a la venta por su número de caja (FE000017) o, si se vendió en la web, por su id.
  const referenciasVentas = [...((ventas ?? []) as VentaFila[]).map((v) => v.local_id).filter(Boolean) as string[], ...idsVentas];
  const referenciasFacturas = ((facturasEv ?? []) as FacturaFila[]).map((f) => f.venta_referencia).filter(Boolean) as string[];

  const [{ data: productos }, { data: tiendas }, { data: facturasDeVentas }, { data: ventasDeFacturas }] = await Promise.all([
    idsProductos.length ? admin.from('productos').select('id, iva').in('id', idsProductos) : Promise.resolve({ data: [] }),
    idsTiendas.length ? admin.from('tiendas').select('id, local_id, nombre').eq('cliente_id', clienteId) : Promise.resolve({ data: [] }),
    facturasDeReferencias(admin, clienteId, referenciasVentas),
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

  const extra = await datosFase2(admin, clienteId, cola);

  const eventos: unknown[] = [];
  const rechazosLocales: { id: number; motivo: string }[] = [];
  for (const e of cola) {
    if (e.tipo !== 'venta' && e.tipo !== 'factura_electronica') {
      const r = extra(e);
      if ('motivo' in r) rechazosLocales.push({ id: e.id, motivo: r.motivo });
      else eventos.push(r.evento);
      continue;
    }
    if (e.tipo === 'venta') {
      const v = ventasPorId.get(e.id_origen);
      if (!v) { rechazosLocales.push({ id: e.id, motivo: 'La venta ya no existe en Codec POS' }); continue; }
      eventos.push(construirEventoVenta(
        v, itemsPorVenta.get(v.id) ?? [], ivaPorProducto,
        v.tienda_id ? tiendaPorId.get(String(v.tienda_id)) ?? null : null,
        (v.local_id ? cufePorReferencia.get(v.local_id) : null) ?? cufePorReferencia.get(v.id) ?? null,
      ));
    } else if (e.tipo === 'factura_electronica') {
      const f = facturaPorId.get(e.id_origen);
      if (!f?.xml) { rechazosLocales.push({ id: e.id, motivo: 'La factura no tiene XML guardado' }); continue; }
      const ref = f.venta_referencia;
      eventos.push(construirEventoFactura(f, ref ? ventaPorReferencia.get(ref) ?? (ES_UUID.test(ref) ? ref : null) : null));
    }
  }
  return { eventos, rechazosLocales };
}

type Armado = { evento: unknown } | { motivo: string };

/**
 * Trae de una vez lo que necesitan los eventos de fase 2 del lote y
 * devuelve el armador de cada uno.
 */
async function datosFase2(admin: SupabaseClient, clienteId: string, cola: EventoCola[]): Promise<(e: EventoCola) => Armado> {
  const ids = (tipo: string) => cola.filter((e) => e.tipo === tipo).map((e) => e.id_origen);
  const [idsGastos, idsDevoluciones, idsCierres, idsNC, idsND, idsSoporte] =
    ['gasto', 'devolucion', 'cierre_caja', 'nota_credito', 'nota_debito', 'documento_soporte'].map(ids);
  const vacio = Promise.resolve({ data: [] as any[] });

  const [{ data: gastos }, { data: soportesGasto }, { data: devoluciones }, { data: itemsDev }, { data: cierres }, { data: nc }, { data: nd }, { data: soportes }] = await Promise.all([
    idsGastos.length ? admin.from('gastos').select('id, fecha, created_at, descripcion, categoria, monto, medio_pago, comprobante, registrado_por_nombre, notas').in('id', idsGastos) : vacio,
    idsGastos.length ? admin.from('documentos_electronicos').select('gasto_id, emisor_nombre, emisor_nit, numero_completo, total_iva').in('gasto_id', idsGastos) : vacio,
    idsDevoluciones.length ? admin.from('devoluciones').select('id, venta_id, created_at, total_devolucion, metodo_pago, observaciones, numero_factura').in('id', idsDevoluciones) : vacio,
    idsDevoluciones.length ? admin.from('devolucion_items').select('devolucion_id, nombre, cantidad, precio_unitario, producto_id, motivo').in('devolucion_id', idsDevoluciones) : vacio,
    idsCierres.length ? admin.from('cierres_caja').select('id, fecha_apertura, fecha_cierre, created_at, monto_apertura, monto_cierre, ventas_total, diferencia, detalle').in('id', idsCierres) : vacio,
    idsNC.length ? admin.from('notas_credito_electronicas').select('id, cude, xml, respuesta_dian, fecha_emision, created_at').in('id', idsNC) : vacio,
    idsND.length ? admin.from('notas_debito_electronicas').select('id, cude, xml, respuesta_dian, fecha_emision, created_at').in('id', idsND) : vacio,
    idsSoporte.length ? admin.from('documentos_electronicos').select('id, cufe, xml, fecha_emision, created_at').in('id', idsSoporte) : vacio,
  ]);

  // IVA de los productos devueltos y nota crédito de cada devolución (por la factura de su venta).
  const idsProductos = [...new Set((itemsDev ?? []).map((i: any) => i.producto_id).filter(Boolean))] as string[];
  const refs = [...new Set((devoluciones ?? []).map((d: any) => d.numero_factura).filter(Boolean))] as string[];
  const [{ data: productos }, { data: facturasDev }] = await Promise.all([
    idsProductos.length ? admin.from('productos').select('id, iva').in('id', idsProductos) : vacio,
    refs.length ? admin.from('facturas_electronicas').select('id, venta_referencia').eq('cliente_id', clienteId).in('venta_referencia', refs) : vacio,
  ]);
  const idsFacturasDev = (facturasDev ?? []).map((f: any) => f.id);
  const { data: notasDev } = idsFacturasDev.length
    ? await admin.from('notas_credito_electronicas').select('factura_id, cude, created_at').in('factura_id', idsFacturasDev).eq('estado', 'accepted').order('created_at', { ascending: false })
    : { data: [] as any[] };
  const ivaPorProducto = new Map((productos ?? []).map((p: any) => [p.id, Number(p.iva) || 0]));
  const cudePorReferencia = new Map<string, string>();
  for (const f of (facturasDev ?? []) as any[]) {
    const nota = (notasDev ?? []).find((n: any) => n.factura_id === f.id);
    if (nota?.cude && !cudePorReferencia.has(f.venta_referencia)) cudePorReferencia.set(f.venta_referencia, nota.cude);
  }
  const itemsPorDev = new Map<string, DevolucionItemFila[]>();
  for (const i of (itemsDev ?? []) as DevolucionItemFila[]) {
    if (!itemsPorDev.has(i.devolucion_id)) itemsPorDev.set(i.devolucion_id, []);
    itemsPorDev.get(i.devolucion_id)!.push(i);
  }

  const porId = <T extends { id: string }>(filas: T[] | null) => new Map((filas ?? []).map((f) => [f.id, f]));
  const gastoPorId = porId(gastos as GastoFila[]);
  const soportePorGasto = new Map((soportesGasto ?? []).map((s: any) => [s.gasto_id, s as SoporteGasto]));
  const devPorId = porId(devoluciones as DevolucionFila[]);
  const cierrePorId = porId(cierres as CierreFila[]);
  const ncPorId = porId(nc as any[]);
  const ndPorId = porId(nd as any[]);
  const soportePorId = porId(soportes as any[]);

  // Va el XML firmado (el AttachedDocument no se guarda en la nube).
  const documento = (tipo: 'nota_credito' | 'nota_debito' | 'documento_soporte', doc: any, cufe: string | null): Armado => {
    const xml: string | null = doc?.xml || null;
    if (!doc) return { motivo: 'El documento ya no existe en Codec POS' };
    if (!xml) return { motivo: 'El documento no tiene XML guardado' };
    if (new TextEncoder().encode(xml).length > XML_MAXIMO_BYTES) return { motivo: 'El XML supera 5 MB' };
    return { evento: construirEventoDocumento(tipo, doc.id, cufe, doc.fecha_emision || doc.created_at, xml) };
  };

  return (e) => {
    switch (e.tipo) {
      case 'gasto': {
        const g = gastoPorId.get(e.id_origen);
        if (!g) return { motivo: 'El gasto ya no existe en Codec POS' };
        if (!(Number(g.monto) > 0)) return { motivo: 'El gasto tiene valor 0' };
        return { evento: construirEventoGasto(g, soportePorGasto.get(g.id) ?? null) };
      }
      case 'devolucion': {
        const d = devPorId.get(e.id_origen);
        if (!d) return { motivo: 'La devolución ya no existe en Codec POS' };
        return { evento: construirEventoDevolucion(d, itemsPorDev.get(d.id) ?? [], ivaPorProducto, d.numero_factura ? cudePorReferencia.get(d.numero_factura) ?? null : null) };
      }
      case 'cierre_caja': {
        const c = cierrePorId.get(e.id_origen);
        if (!c) return { motivo: 'El cierre ya no existe en Codec POS' };
        return { evento: construirEventoCierre(c, null) };
      }
      case 'nota_credito': { const n = ncPorId.get(e.id_origen); return documento('nota_credito', n, n?.cude ?? null); }
      case 'nota_debito': { const n = ndPorId.get(e.id_origen); return documento('nota_debito', n, n?.cude ?? null); }
      case 'documento_soporte': { const s = soportePorId.get(e.id_origen); return documento('documento_soporte', s, s?.cufe ?? null); }
      case 'anulacion': return { evento: construirEventoAnulacion(e.id_origen, e.de) };
      default: return { motivo: `Tipo de evento sin soporte: ${e.tipo}` };
    }
  };
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
  const { data: cola } = await admin.from('contador_eventos').select('id, tipo, id_origen, intentos, de')
    .eq('cliente_id', clienteId).eq('estado', 'pendiente').lte('proximo_intento_en', new Date().toISOString())
    .order('fecha_origen', { ascending: true }).order('id', { ascending: true }).limit(LOTE);
  if (!cola?.length) return false;

  const { eventos, rechazosLocales } = await armarLote(admin, clienteId, cola);
  for (const r of rechazosLocales) await marcar(admin, [r.id], { estado: 'rechazado', motivo: r.motivo });
  const enviables = cola.filter((e) => !rechazosLocales.some((r) => r.id === e.id));
  if (!eventos.length) return true;

  const { status, datos } = await llamarCodecDocument('pos-ingesta', { eventos }, token);
  const ahora = new Date().toISOString();

  if (status === 401 && /conexion_revocada|token_invalido/.test(codigoError(datos) || JSON.stringify(datos ?? ''))) {
    await marcarRevocado(admin, clienteId);
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
    if (e.tipo === 'anulacion' && esAnulacionPrematura(r.motivo) && e.intentos < 10) {
      // Llegó antes que el registro que anula: se espera a que ese pase primero.
      await reprogramar(admin, [e], r.motivo ?? 'no_encontrada');
    } else if (esRechazoPorCupo(r.motivo)) {
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
    if (accion === 'verificar') return json(await verificar(admin, clienteId));
    throw new ErrorHttp(`Acción desconocida: ${accion}`, 400);
  } catch (e) {
    const status = e instanceof ErrorHttp ? e.status : 500;
    if (status === 500) console.error('[contador-sync]', e);
    return json({ ok: false, error: (e as Error).message, codigo: e instanceof ErrorHttp ? e.codigo : undefined }, status);
  }
});
