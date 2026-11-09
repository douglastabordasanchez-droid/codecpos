/**
 * Se conservan el mes actual y los 5 anteriores completos de ventas, gastos,
 * cierres y devoluciones (en diciembre se borra lo anterior al 1 de julio).
 * Lo más viejo:
 *
 *   1. Se avisa 5 días antes, todos los días, en la mañana, la tarde y la
 *      noche (AvisoRetencionDatos.tsx). Cada aviso queda en la bitácora de la
 *      nube (bitacora_retencion_datos, migración 0110) con la hora del
 *      servidor, para poder demostrar que se avisó.
 *   2. Si el cliente autorizó una carpeta del computador, el día de la
 *      limpieza se guarda ahí (CSV para Excel y un respaldo completo JSON) y
 *      solo si se guardó bien se borra de la caja.
 *   3. Se borra de la caja únicamente lo que YA está en la nube: una venta
 *      sin subir, una factura electrónica pendiente o un gasto sin
 *      sincronizar nunca se borran. La nube aplica el mismo corte por su
 *      cuenta (migraciones 0142 y 0143).
 *
 * Productos, precios, clientes, cartera abierta y configuración NO se tocan.
 */
import { dbManager, type Venta } from './indexedDB';
import { historicoService } from './historicoService';
import { getSupabaseClient } from './supabase/config';
import { getLinkedClienteId } from './supabase/tenantLink';

export const MESES_EN_CAJA = 5;
export const DIAS_AVISO = 5;
/** La primera limpieza da al menos esta ventana completa de avisos. */
const DIAS_PRIMERA_LIMPIEZA = 7;

const CLAVE_CONFIG = 'codecpos_retencion';
const CLAVE_BITACORA = 'codecpos_retencion_bitacora';
const CLAVE_BITACORA_PENDIENTE = 'codecpos_retencion_bitacora_pendiente';
const DIA = 24 * 60 * 60 * 1000;
const LOTE_BORRADO = 200;

/** La limpieza es el día 1 de cada mes, siempre con la ventana completa de avisos. */
function siguienteLimpieza(desde = new Date()): Date {
  const primero = new Date(desde.getFullYear(), desde.getMonth() + 1, 1, 3);
  if (primero.getTime() - desde.getTime() >= DIAS_PRIMERA_LIMPIEZA * DIA) return primero;
  return new Date(desde.getFullYear(), desde.getMonth() + 2, 1, 3);
}

export type Franja = 'mañana' | 'tarde' | 'noche';
export type TipoBitacora = 'aviso' | 'descarga' | 'limpieza' | 'carpeta_autorizada' | 'carpeta_retirada' | 'error';

export interface ConfigRetencion {
  /** Carpeta autorizada por el cliente para guardar el historial antes de borrarlo. */
  carpeta: string | null;
  autorizadaEn?: string;
  autorizadaPor?: string;
  proximaLimpieza: string;
  ultimaLimpieza?: string;
  ultimaDescarga?: string;
  /** Franjas en que ya se mostró el aviso: '2026-10-05|mañana'. */
  avisosMostrados: string[];
  /** Desde cuándo se cuentan los 6 meses del primer aviso de facturas electrónicas. */
  facturasDesde?: string;
  ultimaDescargaFacturas?: string;
  /** Día del último aviso de facturas: se avisa máximo una vez al día. */
  avisoFacturasDia?: string;
}

export interface EntradaBitacora {
  tipo: TipoBitacora;
  horaEquipo: string;
  fechaLimpieza?: string;
  usuario?: string;
  detalle?: Record<string, unknown>;
}

export interface DatosAntiguos {
  corte: string;
  ventas: Venta[];
  gastos: any[];
  cierres: any[];
  devoluciones: any[];
  /** Lo que es viejo pero aún no subió a la nube: se queda en la caja. */
  sinSubir: number;
}

// ── Configuración ──────────────────────────────────────────────────────────

export function leerConfigRetencion(): ConfigRetencion {
  let c: Partial<ConfigRetencion> = {};
  try { c = JSON.parse(localStorage.getItem(CLAVE_CONFIG) || '{}') || {}; } catch { /* config dañada: se rehace */ }
  if (!c.proximaLimpieza || Number.isNaN(Date.parse(c.proximaLimpieza))) {
    c.proximaLimpieza = siguienteLimpieza().toISOString();
    c.avisosMostrados = [];
    guardarConfig(c as ConfigRetencion);
  }
  return { carpeta: c.carpeta ?? null, avisosMostrados: c.avisosMostrados ?? [], ...c } as ConfigRetencion;
}

function guardarConfig(c: ConfigRetencion): void {
  try { localStorage.setItem(CLAVE_CONFIG, JSON.stringify(c)); } catch { /* storage lleno */ }
  window.dispatchEvent(new CustomEvent('codecpos:retencion-cambio'));
}

export function hayCarpetaDisponible(): boolean {
  return !!window.electron?.archivo;
}

export function franjaActual(fecha = new Date()): Franja {
  const h = fecha.getHours();
  return h < 12 ? 'mañana' : h < 17 ? 'tarde' : 'noche';
}

function claveFranja(fecha = new Date()): string {
  const d = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
  return `${d}|${franjaActual(fecha)}`;
}

/** Fecha hasta la que se borra (lo anterior a esto) si la limpieza fuera hoy. */
export function fechaCorte(limpieza = new Date()): Date {
  return new Date(limpieza.getFullYear(), limpieza.getMonth() - MESES_EN_CAJA, 1);
}

export function diasParaLimpieza(c = leerConfigRetencion()): number {
  return Math.max(0, Math.ceil((Date.parse(c.proximaLimpieza) - Date.now()) / DIA));
}

/** ¿Toca mostrar el aviso en esta franja del día (mañana, tarde o noche)? */
export function debeAvisar(c = leerConfigRetencion()): boolean {
  const faltan = Date.parse(c.proximaLimpieza) - Date.now();
  return faltan <= DIAS_AVISO * DIA && !c.avisosMostrados.includes(claveFranja());
}

// ── Bitácora (local + nube) ────────────────────────────────────────────────

function usuarioActual(): string {
  try {
    const s = JSON.parse(localStorage.getItem('codec_pos_sesion_activa') || 'null');
    if (s?.nombreUsuario) return String(s.nombreUsuario);
  } catch { /* sin sesión */ }
  return localStorage.getItem('usuario_actual') || 'Sin sesión';
}

export function leerBitacoraLocal(): EntradaBitacora[] {
  try { return JSON.parse(localStorage.getItem(CLAVE_BITACORA) || '[]'); } catch { return []; }
}

async function subirBitacoraPendiente(): Promise<void> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId || !navigator.onLine) return;
  let pendientes: EntradaBitacora[] = [];
  try { pendientes = JSON.parse(localStorage.getItem(CLAVE_BITACORA_PENDIENTE) || '[]'); } catch { pendientes = []; }
  if (pendientes.length === 0) return;
  const terminal = (await dbManager.getConfig('puntoVentaId').catch(() => null)) || 'POS-001';
  const { error } = await client.from('bitacora_retencion_datos').insert(pendientes.map((e) => ({
    cliente_id: clienteId,
    hora_equipo: e.horaEquipo,
    tipo: e.tipo,
    fecha_limpieza: e.fechaLimpieza ?? null,
    terminal: String(terminal),
    usuario: e.usuario ?? null,
    detalle: e.detalle ?? {},
  })));
  if (!error) localStorage.removeItem(CLAVE_BITACORA_PENDIENTE);
}

/**
 * Deja constancia de un aviso, descarga o limpieza. Se guarda primero en el
 * equipo y luego en la nube; sin internet queda en cola y sube después.
 */
export async function registrarEnBitacora(tipo: TipoBitacora, detalle: Record<string, unknown> = {}, fechaLimpieza?: string): Promise<void> {
  const entrada: EntradaBitacora = { tipo, horaEquipo: new Date().toISOString(), fechaLimpieza, usuario: usuarioActual(), detalle };
  try {
    const local = [entrada, ...leerBitacoraLocal()].slice(0, 300);
    localStorage.setItem(CLAVE_BITACORA, JSON.stringify(local));
    const pendientes = JSON.parse(localStorage.getItem(CLAVE_BITACORA_PENDIENTE) || '[]');
    localStorage.setItem(CLAVE_BITACORA_PENDIENTE, JSON.stringify([...pendientes, entrada].slice(-500)));
  } catch { /* storage lleno: igual se intenta subir */ }
  await subirBitacoraPendiente().catch(() => {});
}

/** El aviso de esta franja ya se mostró: se anota para no repetirlo y queda en la bitácora. */
export async function marcarAvisoMostrado(): Promise<void> {
  const c = leerConfigRetencion();
  const clave = claveFranja();
  if (c.avisosMostrados.includes(clave)) return;
  guardarConfig({ ...c, avisosMostrados: [...c.avisosMostrados, clave].slice(-30) });
  await registrarEnBitacora('aviso', {
    franja: franjaActual(),
    diasRestantes: diasParaLimpieza(c),
    borraAnterioresA: fechaCorte(new Date(c.proximaLimpieza)).toISOString(),
    carpetaAutorizada: !!c.carpeta,
  }, c.proximaLimpieza);
}

// ── Carpeta ────────────────────────────────────────────────────────────────

/** El cliente escoge la carpeta y autoriza que la caja guarde ahí el historial cada mes. */
export async function autorizarCarpeta(): Promise<string | null> {
  const api = window.electron?.archivo;
  if (!api) throw new Error('Solo disponible en la caja (programa de escritorio)');
  const r = await api.elegirCarpeta();
  if (!r.ok || !r.carpeta) {
    if (r.error) throw new Error(r.error);
    return null;
  }
  const c = leerConfigRetencion();
  guardarConfig({ ...c, carpeta: r.carpeta, autorizadaEn: new Date().toISOString(), autorizadaPor: usuarioActual() });
  await registrarEnBitacora('carpeta_autorizada', { carpeta: r.carpeta });
  return r.carpeta;
}

export async function retirarCarpeta(): Promise<void> {
  const c = leerConfigRetencion();
  if (!c.carpeta) return;
  guardarConfig({ ...c, carpeta: null, autorizadaEn: undefined, autorizadaPor: undefined });
  await registrarEnBitacora('carpeta_retirada', { carpeta: c.carpeta });
}

export async function abrirCarpeta(): Promise<void> {
  const c = leerConfigRetencion();
  if (c.carpeta) await window.electron?.archivo?.abrir(c.carpeta);
}

// ── Recolectar, guardar y borrar ───────────────────────────────────────────

function leerLista(clave: string): any[] {
  try {
    const v = JSON.parse(localStorage.getItem(clave) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

const tiempo = (v: unknown) => {
  const t = typeof v === 'number' ? v : Date.parse(String(v ?? ''));
  return Number.isFinite(t) ? t : NaN;
};

const ventaEnNube = (v: Venta) =>
  (!!v.supabaseId || v.syncStatus === 'synced') &&
  v.facturaEstado !== 'PENDIENTE_ENVIO' && v.facturaEstado !== 'PENDIENTE_SINCRONIZAR';

/** Todo lo anterior a `corte` que ya está en la nube (y cuánto viejo falta por subir). */
export async function recolectarDatosAntiguos(corte: Date): Promise<DatosAntiguos> {
  const limite = corte.getTime();
  const viejas = (await dbManager.getVentasByDateRange('', corte.toISOString())) as Venta[];
  const esViejo = (fecha: unknown) => tiempo(fecha) < limite;
  const viejosDe = (clave: string) => leerLista(clave).filter((x) => esViejo(x?.fecha));

  const gastos = viejosDe('pos-gastos');
  const cierres = viejosDe('pos-cierres-caja');
  const devoluciones = viejosDe('codecpos_devoluciones');
  const ventas = viejas.filter(ventaEnNube);
  const sinSubir = (viejas.length - ventas.length)
    + [...gastos, ...cierres, ...devoluciones].filter((x) => !x?._supabaseSynced).length;

  return {
    corte: corte.toISOString(),
    ventas,
    gastos: gastos.filter((x) => x?._supabaseSynced),
    cierres: cierres.filter((x) => x?._supabaseSynced),
    devoluciones: devoluciones.filter((x) => x?._supabaseSynced),
    sinSubir,
  };
}

function csv(filas: Array<Array<unknown>>): string {
  const celda = (v: unknown) => {
    const t = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  // BOM para que Excel abra bien las tildes; punto y coma como separador (Excel en español).
  return '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n');
}

const fechaCorta = (v: unknown) => {
  const t = tiempo(v);
  return Number.isFinite(t) ? new Date(t).toLocaleString('es-CO') : '';
};

function armarArchivos(d: DatosAntiguos): Array<{ nombre: string; contenido: string }> {
  const ventas = csv([
    ['Fecha', 'Factura', 'Cajero', 'Cliente', 'Método de pago', 'Subtotal', 'Descuento', 'Propina', 'Total', 'Productos', 'CUFE'],
    ...d.ventas.map((v) => [
      fechaCorta(v.fecha), (v as any).numeroFactura || v.numero || v.id, v.cajero, v.cliente || '', v.metodoPago,
      v.subtotal, v.descuento || 0, v.propina || 0, v.total, (v.items || []).length, v.cufe || '',
    ]),
  ]);
  const detalle = csv([
    ['Fecha', 'Factura', 'Código', 'Producto', 'Cantidad', 'Precio', 'Subtotal'],
    ...d.ventas.flatMap((v) => (v.items || []).map((i) => [
      fechaCorta(v.fecha), (v as any).numeroFactura || v.numero || v.id, i.codigo || '', i.nombre, i.cantidad, i.precio, i.subtotal,
    ])),
  ]);
  const gastos = csv([
    ['Fecha', 'Descripción', 'Categoría', 'Monto', 'Medio de pago', 'Registrado por'],
    ...d.gastos.map((g) => [fechaCorta(g.fecha), g.descripcion, g.categoria, g.monto, g.medioPago || g.metodoPago || '', g.registradoPor || g.usuario || '']),
  ]);
  const cierres = csv([
    ['Fecha de cierre', 'Apertura', 'Cajero', 'Base', 'Total sistema', 'Total contado', 'Diferencia'],
    ...d.cierres.map((c) => [fechaCorta(c.fecha), fechaCorta(c.fechaApertura), c.cajero || c.usuario || '', c.montoApertura ?? c.baseInicial ?? '', c.totalSistema ?? c.ventasTotal ?? '', c.totalFisico ?? c.montoCierre ?? '', c.diferencia ?? '']),
  ]);
  const devoluciones = csv([
    ['Fecha', 'Venta', 'Total devuelto', 'Método', 'Procesado por'],
    ...d.devoluciones.map((x) => [fechaCorta(x.fecha), x.numeroFactura || x.ventaId || '', x.totalDevolucion, x.metodoPago || '', x.procesadoPor || '']),
  ]);
  const hasta = d.corte.slice(0, 10);
  return [
    { nombre: `Ventas hasta ${hasta}.csv`, contenido: ventas },
    { nombre: `Ventas detalle por producto hasta ${hasta}.csv`, contenido: detalle },
    { nombre: `Gastos hasta ${hasta}.csv`, contenido: gastos },
    { nombre: `Cierres de caja hasta ${hasta}.csv`, contenido: cierres },
    { nombre: `Devoluciones hasta ${hasta}.csv`, contenido: devoluciones },
    {
      nombre: `Respaldo completo hasta ${hasta}.json`,
      contenido: JSON.stringify({ app: 'CODEC POS', generado: new Date().toISOString(), hasta: d.corte, ventas: d.ventas, gastos: d.gastos, cierres: d.cierres, devoluciones: d.devoluciones }),
    },
  ];
}

/** Escribe los archivos en la carpeta. Si alguno falla, lanza error (y no se borra nada). */
async function guardarEnCarpeta(carpeta: string, d: DatosAntiguos): Promise<{ archivos: number; bytes: number; subcarpeta: string }> {
  const api = window.electron?.archivo;
  if (!api) throw new Error('Solo disponible en la caja (programa de escritorio)');
  const subcarpeta = `Historial hasta ${d.corte.slice(0, 10)}`;
  let bytes = 0;
  const archivos = armarArchivos(d);
  for (const a of archivos) {
    const r = await api.guardar({ carpeta, subcarpeta, nombre: a.nombre, contenido: a.contenido });
    if (!r.ok) throw new Error(r.error || `No se pudo guardar ${a.nombre}`);
    bytes += r.bytes || 0;
  }
  return { archivos: archivos.length, bytes, subcarpeta };
}

/**
 * "Guardar ahora": guarda en la carpeta (la autorizada o una que se elige en
 * el momento) todo lo anterior al corte. No borra nada.
 */
export async function guardarHistorialAhora(): Promise<{ carpeta: string; registros: number } | null> {
  const api = window.electron?.archivo;
  if (!api) throw new Error('Solo disponible en la caja (programa de escritorio)');
  let carpeta = leerConfigRetencion().carpeta;
  if (!carpeta) {
    const r = await api.elegirCarpeta();
    if (!r.ok || !r.carpeta) {
      if (r.error) throw new Error(r.error);
      return null;
    }
    carpeta = r.carpeta;
  }
  const c = leerConfigRetencion();
  const d = await recolectarDatosAntiguos(fechaCorte(new Date(Math.max(Date.now(), Date.parse(c.proximaLimpieza)))));
  const registros = d.ventas.length + d.gastos.length + d.cierres.length + d.devoluciones.length;
  const r = await guardarEnCarpeta(carpeta, d);
  guardarConfig({ ...leerConfigRetencion(), ultimaDescarga: new Date().toISOString() });
  await registrarEnBitacora('descarga', { carpeta, registros, ...r }, c.proximaLimpieza);
  return { carpeta, registros };
}

// ── Facturas electrónicas: 1 año en la nube, copia cada 6 meses ────────────

export const MESES_FACTURAS_NUBE = 12;
const DIAS_ENTRE_COPIAS_FACTURAS = 182;

const diaLocal = (f: Date) => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;

/** ¿Pasaron 6 meses sin guardar copia y hoy aún no se ha avisado? */
export function debeAvisarFacturas(c: ConfigRetencion, ahora = new Date()): boolean {
  const base = Date.parse(c.ultimaDescargaFacturas || c.facturasDesde || '');
  if (Number.isNaN(base) || ahora.getTime() - base < DIAS_ENTRE_COPIAS_FACTURAS * DIA) return false;
  return c.avisoFacturasDia !== diaLocal(ahora);
}

async function leerDocumentos(tabla: string, columnas: string): Promise<any[]> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) throw new Error('Esta caja no está conectada a la nube');
  const filas: any[] = [];
  for (let desde = 0; ; desde += 200) {
    const { data, error } = await client.from(tabla).select(columnas).eq('cliente_id', clienteId)
      .order('id', { ascending: true }).range(desde, desde + 199);
    if (error) throw new Error(error.message);
    filas.push(...(data || []));
    if (!data || data.length < 200) return filas;
  }
}

/**
 * Guarda el XML de todas las facturas, notas y documentos de compra que siguen
 * en la nube, con un índice para Excel. Si un archivo falla, lanza error y la
 * copia no cuenta como hecha.
 */
export async function guardarFacturasElectronicas(): Promise<{ carpeta: string; documentos: number } | null> {
  const api = window.electron?.archivo;
  if (!api) throw new Error('Solo disponible en la caja (programa de escritorio)');
  let carpeta = leerConfigRetencion().carpeta;
  if (!carpeta) {
    const r = await api.elegirCarpeta();
    if (!r.ok || !r.carpeta) {
      if (r.error) throw new Error(r.error);
      return null;
    }
    carpeta = r.carpeta;
  }
  const notas = 'id, prefijo, numero_nota, cude, estado, fecha_emision, total, xml';
  const [facturas, credito, debito, compras] = await Promise.all([
    leerDocumentos('facturas_electronicas', 'id, numero_factura, cufe, estado, fecha_emision, cliente_nombre, total, xml'),
    leerDocumentos('notas_credito_electronicas', notas),
    leerDocumentos('notas_debito_electronicas', notas),
    leerDocumentos('documentos_electronicos', 'id, numero_completo, cufe, estado, fecha_emision, emisor_nombre, total, xml'),
  ]);
  const todos = [
    ...facturas.map((d) => ({ tipo: 'Factura', numero: d.numero_factura, codigo: d.cufe, tercero: d.cliente_nombre, ...d })),
    ...credito.map((d) => ({ tipo: 'Nota credito', numero: `${d.prefijo || ''}${d.numero_nota}`, codigo: d.cude, tercero: '', ...d })),
    ...debito.map((d) => ({ tipo: 'Nota debito', numero: `${d.prefijo || ''}${d.numero_nota}`, codigo: d.cude, tercero: '', ...d })),
    ...compras.map((d) => ({ tipo: 'Compra', numero: d.numero_completo, codigo: d.cufe, tercero: d.emisor_nombre, ...d })),
  ];
  const subcarpeta = `Facturas electronicas ${diaLocal(new Date())}`;
  const escribir = async (nombre: string, contenido: string) => {
    const r = await api.guardar({ carpeta: carpeta as string, subcarpeta, nombre, contenido });
    if (!r.ok) throw new Error(r.error || `No se pudo guardar ${nombre}`);
  };
  for (const d of todos) {
    if (d.xml) await escribir(`${d.tipo} ${d.numero} ${String(d.id).slice(0, 8)}.xml`, d.xml);
  }
  await escribir('Indice.csv', csv([
    ['Tipo', 'Número', 'Fecha', 'Tercero', 'Total', 'Estado', 'CUFE/CUDE'],
    ...todos.map((d) => [d.tipo, d.numero, fechaCorta(d.fecha_emision), d.tercero, d.total, d.estado, d.codigo]),
  ]));
  guardarConfig({ ...leerConfigRetencion(), ultimaDescargaFacturas: new Date().toISOString() });
  await registrarEnBitacora('descarga', { tipo: 'facturas_electronicas', carpeta, documentos: todos.length, subcarpeta });
  return { carpeta, documentos: todos.length };
}

/**
 * Cada 6 meses: con carpeta autorizada guarda la copia sola; sin carpeta (o si
 * falla) avisa, una vez al día, hasta que se guarde.
 */
export async function revisarFacturasElectronicas(onAviso: (cantidad: number) => void): Promise<void> {
  const c = leerConfigRetencion();
  if (!c.facturasDesde) {
    guardarConfig({ ...c, facturasDesde: new Date().toISOString() });
    return;
  }
  if (!debeAvisarFacturas(c)) return;
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId || !navigator.onLine) return;
  const { count, error } = await client.from('facturas_electronicas').select('id', { count: 'exact', head: true }).eq('cliente_id', clienteId);
  if (error || !count) return;
  if (c.carpeta) {
    try {
      await guardarFacturasElectronicas();
      return;
    } catch (e) {
      await registrarEnBitacora('error', { motivo: 'No se pudo guardar la copia de facturas electrónicas', error: String((e as Error)?.message || e), carpeta: c.carpeta });
    }
  }
  guardarConfig({ ...leerConfigRetencion(), avisoFacturasDia: diaLocal(new Date()) });
  await registrarEnBitacora('aviso', { tipo: 'facturas_electronicas', documentos: count });
  onAviso(count);
}

let limpiando = false;

/** Guarda (si hay carpeta) y borra de la caja lo anterior al corte. */
export async function ejecutarLimpieza(): Promise<{ borrados: number; sinSubir: number } | null> {
  if (limpiando) return null;
  limpiando = true;
  const c = leerConfigRetencion();
  try {
    const d = await recolectarDatosAntiguos(fechaCorte());
    const total = d.ventas.length + d.gastos.length + d.cierres.length + d.devoluciones.length;

    let guardado: Record<string, unknown> = {};
    if (total > 0 && c.carpeta) {
      try {
        guardado = { carpeta: c.carpeta, ...(await guardarEnCarpeta(c.carpeta, d)) };
      } catch (e) {
        // Sin copia en la carpeta no se borra: se reintenta en la próxima revisión.
        await registrarEnBitacora('error', { motivo: 'No se pudo guardar en la carpeta; no se borró nada', error: String((e as Error)?.message || e), carpeta: c.carpeta }, c.proximaLimpieza);
        return null;
      }
    }

    if (total > 0) {
      // El consecutivo de facturas nunca baja aunque se borren las ventas viejas.
      const maxNumero = Math.max(0, ...d.ventas.map((v) => Number(v.numero) || 0), await dbManager.getUltimoNumeroVenta().catch(() => 0));
      const actual = parseInt(localStorage.getItem('pos-ultima-factura') || '0') || 0;
      if (maxNumero > actual) localStorage.setItem('pos-ultima-factura', String(maxNumero));

      // Por tandas con pausas: la caja sigue atendiendo mientras se limpia.
      const ids = d.ventas.map((v) => v.id);
      for (let i = 0; i < ids.length; i += LOTE_BORRADO) {
        await dbManager.deleteVentas(ids.slice(i, i + LOTE_BORRADO));
        await new Promise((listo) => setTimeout(listo, 50));
      }
      const fuera = (clave: string, borrar: any[]) => {
        if (borrar.length === 0) return;
        const ids = new Set(borrar.map((x) => x.id));
        localStorage.setItem(clave, JSON.stringify(leerLista(clave).filter((x) => !ids.has(x?.id))));
      };
      fuera('pos-gastos', d.gastos);
      fuera('pos-cierres-caja', d.cierres);
      fuera('codecpos_devoluciones', d.devoluciones);
    }
    await historicoService.limpiarDatosAntiguos(Math.ceil((Date.now() - Date.parse(d.corte)) / DIA)).catch(() => {});

    const ahora = new Date();
    guardarConfig({
      ...leerConfigRetencion(),
      ultimaLimpieza: ahora.toISOString(),
      proximaLimpieza: siguienteLimpieza(ahora).toISOString(),
      avisosMostrados: [],
    });
    await registrarEnBitacora('limpieza', {
      borradosAnterioresA: d.corte,
      ventas: d.ventas.length, gastos: d.gastos.length, cierres: d.cierres.length, devoluciones: d.devoluciones.length,
      quedanSinSubir: d.sinSubir,
      ...guardado,
    }, ahora.toISOString());
    if (total > 0) window.dispatchEvent(new CustomEvent('codecpos:ventas-sincronizadas'));
    return { borrados: total, sinSubir: d.sinSubir };
  } finally {
    limpiando = false;
  }
}

/**
 * Revisión periódica (al abrir y cada 30 minutos): limpia si ya llegó la
 * fecha, o pide mostrar el aviso si estamos en los 5 días previos y no se ha
 * mostrado en esta franja del día. Devuelve cómo dejar de revisar.
 */
export function iniciarRetencionDatos(onAviso: () => void): () => void {
  if (!hayCarpetaDisponible()) return () => {};
  const revisar = async () => {
    try {
      await subirBitacoraPendiente().catch(() => {});
      const c = leerConfigRetencion();
      if (Date.now() >= Date.parse(c.proximaLimpieza)) {
        await ejecutarLimpieza();
        return;
      }
      if (debeAvisar(c)) {
        // Sin nada que borrar no se interrumpe al cajero.
        const d = await recolectarDatosAntiguos(fechaCorte(new Date(c.proximaLimpieza)));
        if (d.ventas.length + d.gastos.length + d.cierres.length + d.devoluciones.length > 0) onAviso();
      }
    } catch (e) {
      console.warn('[retención] revisión falló:', e);
    }
  };
  // Se espera un minuto tras abrir para no competir con el arranque de la caja.
  const primera = window.setTimeout(revisar, 60_000);
  const intervalo = window.setInterval(revisar, 30 * 60_000);
  return () => {
    clearTimeout(primera);
    clearInterval(intervalo);
  };
}
