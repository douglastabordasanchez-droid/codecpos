/**
 * Arma los eventos que Codec POS le manda a Codec Document (pos-ingesta),
 * según el formato acordado con ese proyecto. Sin dependencias de Deno: lo
 * prueba vitest (eventos.test.ts).
 */

export interface VentaFila {
  id: string; numero: number | null; local_id: string | null; created_at: string;
  total: number | string; descuento: number | string | null; propina: number | string | null;
  metodo_pago: string | null; metodos_multiples: unknown; cajero_nombre: string | null; tienda_id: string | null;
}
export interface ItemFila {
  venta_id: string; nombre: string | null; cantidad: number | string; precio_unitario: number | string;
  subtotal: number | string | null; producto_id: string | null;
}
export interface FacturaFila {
  id: string; cufe: string | null; xml: string | null; fecha_emision: string | null; created_at: string; venta_referencia: string | null;
}

const num = (v: unknown) => (v == null || v === '' ? 0 : Number(v) || 0);
const redondear = (v: number) => Math.round(v * 100) / 100;

/** NIT solo con dígitos y sin dígito de verificación ("1049796031-3" → "1049796031"). */
export function nitSoloDigitos(nit: string | null | undefined): string {
  const base = String(nit ?? '').split('-')[0];
  return base.replace(/\D/g, '');
}

const COLOMBIA_MS = -5 * 3600_000;

/** "2026-10-21T15:04:00-05:00" (Colombia no tiene horario de verano). */
export function fechaHoraColombia(ts: string): string {
  const local = new Date(Date.parse(ts) + COLOMBIA_MS).toISOString().slice(0, 19);
  return `${local}-05:00`;
}

/** "2026-10-21", el día en Colombia. */
export function diaColombia(ts: string): string {
  return new Date(Date.parse(ts) + COLOMBIA_MS).toISOString().slice(0, 10);
}

/**
 * Medio de pago con los nombres que entiende Codec Document: la venta fiada
 * del POS («cartera») va como «credito» (cuenta 130505).
 */
export function medioPagoContador(medio: string | null | undefined): string {
  const m = String(medio ?? '').trim().toLowerCase();
  if (!m) return 'efectivo';
  if (['cartera', 'fiado', 'credito', 'crédito', 'a_credito'].includes(m)) return 'credito';
  if (['tarjeta_banco', 'datafono', 'tarjeta_credito', 'tarjeta_debito'].includes(m)) return 'tarjeta';
  if (['bancolombia', 'bre_b', 'transferencia_bancaria', 'banco'].includes(m)) return 'transferencia';
  return m;
}

/** Cliente de la factura electrónica de la venta (B4 del contrato con Codec Document). */
export interface ClienteVenta { nit: string | null; nombre: string | null; tipoDocumento: string | null }

export const NIT_CONSUMIDOR_FINAL = '222222222222';

/**
 * Los precios del POS ya traen el IVA incluido (ivaIncluido.ts): de cada
 * ítem se separa la base y el IVA según el porcentaje de su producto.
 */
export function construirEventoVenta(
  venta: VentaFila,
  items: ItemFila[],
  ivaPorProducto: Map<string, number>,
  tienda: string | null,
  facturaCufe: string | null,
  cliente: ClienteVenta | null = null,
) {
  let iva = 0;
  const lineas = items.map((i) => {
    const cantidad = num(i.cantidad);
    const precio = num(i.precio_unitario);
    const subtotal = num(i.subtotal) || redondear(precio * cantidad);
    const ivaPct = (i.producto_id && ivaPorProducto.get(i.producto_id)) || 0;
    iva += ivaPct > 0 ? subtotal - subtotal / (1 + ivaPct / 100) : 0;
    return { nombre: i.nombre || 'Producto', cantidad, precio_unitario: precio, subtotal, iva_pct: ivaPct };
  });
  const brutoItems = lineas.reduce((s, l) => s + l.subtotal, 0);
  iva = redondear(iva);
  const multiples = (Array.isArray(venta.metodos_multiples) ? venta.metodos_multiples : []).map((m: any) =>
    m && typeof m === 'object' && 'metodo' in m ? { ...m, metodo: medioPagoContador(m.metodo) } : m);
  // Solo con factura: sin ella el cliente va en null (lo pide el contrato).
  const conCliente = !!facturaCufe && !!cliente;
  const nitCliente = conCliente ? nitSoloDigitos(cliente!.nit) || null : null;
  const esConsumidorFinal = nitCliente === NIT_CONSUMIDOR_FINAL;
  return {
    tipo: 'venta' as const,
    id_origen: venta.id,
    numero: venta.numero,
    fecha: fechaHoraColombia(venta.created_at),
    total: num(venta.total),
    subtotal: redondear(brutoItems - iva),
    iva,
    descuento: num(venta.descuento),
    propina: num(venta.propina),
    medio_pago: medioPagoContador(venta.metodo_pago),
    metodos_multiples: multiples,
    cajero: (venta.cajero_nombre || '').trim() || null,
    tienda,
    factura_cufe: facturaCufe,
    cliente_nit: nitCliente,
    cliente_nombre: nitCliente
      ? (esConsumidorFinal ? 'Consumidor final' : String(cliente!.nombre ?? '').trim() || null)
      : null,
    cliente_tipo_documento: nitCliente
      ? (esConsumidorFinal ? '13' : cliente!.tipoDocumento || null)
      : null,
    items: lineas,
  };
}

export function construirEventoFactura(factura: FacturaFila, ventaId: string | null) {
  return {
    tipo: 'factura_electronica' as const,
    id_origen: factura.id,
    venta_id: ventaId,
    cufe: factura.cufe,
    fecha: diaColombia(factura.fecha_emision || factura.created_at),
    xml: factura.xml,
  };
}

/** Factura con la nota interna del administrador para el contador (migración 0135). */
export interface NotaFacturaFila {
  id: string; cufe: string | null; prefijo: string | null; numero_factura: string | number | null;
  nota_contador: string | null; nota_contador_actualizada_en: string | null; fecha_emision: string | null; created_at: string;
}

/**
 * Nota del negocio sobre una factura ya enviada. Va aparte de la factura
 * (que viaja como XML y no se toca): Codec Document la guarda por CUFE y la
 * reemplaza con cada versión; nota vacía = el negocio la borró.
 */
export function construirEventoNotaFactura(f: NotaFacturaFila) {
  return {
    tipo: 'nota_factura' as const,
    id_origen: f.id,
    cufe: f.cufe,
    numero: `${f.prefijo ?? ''}${f.numero_factura ?? ''}` || null,
    nota: (f.nota_contador ?? '').slice(0, 1000),
    actualizada_en: f.nota_contador_actualizada_en || f.fecha_emision || f.created_at,
  };
}

// ── Fase 2 ──────────────────────────────────────────────────────────────

export interface GastoFila {
  id: string; fecha: string | null; created_at: string; descripcion: string | null; categoria: string | null;
  monto: number | string; medio_pago: string | null; comprobante: string | null; registrado_por_nombre: string | null; notas: string | null;
}
/** Documento de compra causado como este gasto (proveedor, número e IVA). */
export interface SoporteGasto {
  emisor_nombre: string | null; emisor_nit: string | null; numero_completo: string | null; total_iva: number | string | null;
  cufe?: string | null; tipo?: string | null; direccion?: string | null;
}

/** "servicios_publicos" → "Servicios publicos"; las categorías escritas a mano quedan igual. */
function categoriaLegible(categoria: string | null): string | null {
  const c = (categoria || '').trim();
  if (!c) return null;
  if (!/^[a-z0-9_]+$/.test(c)) return c;
  const t = c.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function construirEventoGasto(g: GastoFila, soporte: SoporteGasto | null) {
  return {
    tipo: 'gasto' as const,
    id_origen: g.id,
    fecha: fechaHoraColombia(g.fecha || g.created_at),
    concepto: (g.descripcion || '').trim() || categoriaLegible(g.categoria) || 'Gasto',
    categoria: categoriaLegible(g.categoria),
    valor: num(g.monto),
    iva: num(soporte?.total_iva),
    medio_pago: medioPagoContador(g.medio_pago),
    proveedor_nombre: soporte?.emisor_nombre || null,
    proveedor_nit: soporte?.emisor_nit ? nitSoloDigitos(soporte.emisor_nit) : null,
    numero_soporte: soporte?.numero_completo || (g.comprobante || '').trim() || null,
    cajero: (g.registrado_por_nombre || '').trim() || null,
    tienda: null,
    notas: (g.notas || '').trim() || null,
    // Gasto que salió de causar una factura de compra: Codec Document no lo
    // mete al CE del día para no contar la compra dos veces (B10).
    factura_compra_cufe: soporte?.direccion === 'recibido' && soporte?.tipo === 'factura' && soporte?.cufe ? soporte.cufe : null,
  };
}

export interface DevolucionFila {
  id: string; venta_id: string | null; created_at: string; total_devolucion: number | string;
  metodo_pago: string | null; observaciones: string | null; numero_factura: string | null;
}
export interface DevolucionItemFila {
  devolucion_id: string; nombre: string | null; cantidad: number | string; precio_unitario: number | string;
  producto_id: string | null; motivo: string | null;
}

/** Igual que en la venta: el precio trae el IVA incluido y se separa según el producto. */
export function construirEventoDevolucion(
  d: DevolucionFila, items: DevolucionItemFila[], ivaPorProducto: Map<string, number>, notaCreditoCufe: string | null,
) {
  let iva = 0;
  const lineas = items.map((i) => {
    const cantidad = num(i.cantidad);
    const precio = num(i.precio_unitario);
    const subtotal = redondear(precio * cantidad);
    const ivaPct = (i.producto_id && ivaPorProducto.get(i.producto_id)) || 0;
    iva += ivaPct > 0 ? subtotal - subtotal / (1 + ivaPct / 100) : 0;
    return { nombre: i.nombre || 'Producto', cantidad, precio_unitario: precio, subtotal, iva_pct: ivaPct };
  });
  iva = redondear(iva);
  const total = num(d.total_devolucion);
  const motivo = (d.observaciones || '').trim() || items.map((i) => (i.motivo || '').trim()).find(Boolean) || null;
  return {
    tipo: 'devolucion' as const,
    id_origen: d.id,
    venta_id_origen: d.venta_id,
    fecha: fechaHoraColombia(d.created_at),
    total,
    subtotal: redondear(total - iva),
    iva,
    medio_pago: medioPagoContador(d.metodo_pago),
    motivo,
    nota_credito_cufe: notaCreditoCufe,
    items: lineas,
  };
}

export interface CierreFila {
  id: string; fecha_apertura: string | null; fecha_cierre: string | null; created_at: string;
  monto_apertura: number | string | null; monto_cierre: number | string | null; ventas_total: number | string | null;
  diferencia: number | string | null; detalle: Record<string, any> | null;
}

/**
 * El detalle es el cierre que guardó la caja (CierreCajaPage): totalFinal es
 * el efectivo esperado, totalFisico el contado y desglose las ventas por medio.
 */
export function construirEventoCierre(c: CierreFila, tienda: string | null) {
  const d = c.detalle || {};
  const porMedio: Record<string, number> = {};
  for (const [medio, valor] of Object.entries((d.desglose || {}) as Record<string, unknown>)) {
    if (num(valor) !== 0) porMedio[medio] = num(valor);
  }
  const esperado = d.totalFinal != null ? num(d.totalFinal) : num(c.monto_cierre);
  const contado = d.totalFisico != null ? num(d.totalFisico) : null;
  return {
    tipo: 'cierre_caja' as const,
    id_origen: c.id,
    apertura: c.fecha_apertura || d.fechaApertura ? fechaHoraColombia(c.fecha_apertura || d.fechaApertura) : null,
    cierre: fechaHoraColombia(c.fecha_cierre || d.fecha || c.created_at),
    cajero: String(d.cajero_nombre || d.cajero || '').trim() || null,
    tienda,
    caja: d.caja ? String(d.caja) : null,
    base_inicial: d.baseInicial != null ? num(d.baseInicial) : num(c.monto_apertura),
    ventas_total: num(c.ventas_total ?? d.totalSistema),
    ventas_por_medio: porMedio,
    gastos_efectivo: num(d.gastosEfectivo),
    retiros: num(d.retiros),
    ingresos_extra: num(d.abonosCarteraEfectivo),
    efectivo_esperado: esperado,
    efectivo_contado: contado,
    diferencia: contado != null ? redondear(contado - esperado) : num(d.diferenciaEfectivo ?? c.diferencia),
    num_ventas: d.cantidadTransacciones != null ? num(d.cantidadTransacciones) : null,
    observaciones: String(d.observaciones || '').trim() || null,
  };
}

/** Nota crédito, nota débito o documento soporte: igual que la factura, con su XML. */
export function construirEventoDocumento(
  tipo: 'nota_credito' | 'nota_debito' | 'documento_soporte' | 'factura_compra',
  id: string, cufe: string | null, fecha: string, xml: string,
) {
  return { tipo, id_origen: id, cufe, fecha: diaColombia(fecha), xml };
}

/** El XML viaja con tope de 5 MB (lo dice el contrato con Codec Document). */
export const XML_MAXIMO_BYTES = 5 * 1024 * 1024;

export function construirEventoAnulacion(idOrigen: string, de: string | null) {
  return { tipo: 'anulacion' as const, id_origen: idOrigen, de: de || 'venta' };
}

/**
 * Una anulación que llega antes que su registro («venta_no_encontrada»,
 * «gasto_no_encontrada»…) se vuelve a intentar más tarde.
 */
export function esAnulacionPrematura(motivo: string | null | undefined): boolean {
  return /_no_encontrad[ao]/i.test(String(motivo ?? ''));
}

/** Espera antes del siguiente intento: 1, 2, 4… minutos, máximo 6 horas. */
export function minutosHastaReintento(intentos: number): number {
  return Math.min(2 ** Math.max(0, intentos - 1), 360);
}

/**
 * Las facturas del POS cuentan en el cupo mensual de XML del plan del
 * contador. Un rechazo por cupo no es definitivo: la factura se guarda en
 * espera hasta que el contador tenga cupo (mes nuevo o plan mayor).
 */
export function esRechazoPorCupo(motivo: string | null | undefined): boolean {
  return /cupo|l[ií]mite|limite_|quota|plan_/i.test(String(motivo ?? ''));
}

/** 429 y 5xx (o sin respuesta) se reintentan; el resto de 4xx no. */
export function esReintentable(status: number | null): boolean {
  return status === null || status === 429 || status >= 500;
}

// ── Fase 3 (B10): abonos de cartera e ingresos extra ────────────────────

export interface CuentaCarteraFila {
  id: string; venta_local_id: string | null; numero_factura: string | null;
  cliente_cartera_nombre: string | null; cliente_cartera_documento: string | null; abonos: unknown;
}
export interface AbonoFila { id?: string; monto?: number | string; metodoPago?: string; fecha?: string; usuario?: string }

/** Mismo id que le da la migración 0138: el del abono o cuenta:posición (desde 1). */
export function idAbono(cuentaId: string, abono: AbonoFila, posicion: number): string {
  const id = String(abono?.id ?? '').trim();
  return id || `${cuentaId}:${posicion}`;
}

/** Busca el abono por su id_origen dentro de la cuenta. */
export function buscarAbono(cuenta: CuentaCarteraFila, idOrigen: string): AbonoFila | null {
  const abonos = Array.isArray(cuenta.abonos) ? (cuenta.abonos as AbonoFila[]) : [];
  for (let i = 0; i < abonos.length; i++) {
    if (idAbono(cuenta.id, abonos[i], i + 1) === idOrigen) return abonos[i];
  }
  return null;
}

export function construirEventoAbono(
  idOrigen: string, cuenta: CuentaCarteraFila, abono: AbonoFila, ventaIdOrigen: string | null, creadoEn: string,
) {
  const fecha = abono.fecha && !Number.isNaN(Date.parse(abono.fecha)) ? abono.fecha : creadoEn;
  return {
    tipo: 'abono_cartera' as const,
    id_origen: idOrigen,
    venta_id_origen: ventaIdOrigen,
    numero_factura: (cuenta.numero_factura || '').trim() || null,
    fecha: fechaHoraColombia(fecha),
    valor: num(abono.monto),
    medio_pago: medioPagoContador(abono.metodoPago),
    cliente_nombre: (cuenta.cliente_cartera_nombre || '').trim() || null,
    cliente_documento: nitSoloDigitos(cuenta.cliente_cartera_documento) || null,
    cajero: String(abono.usuario ?? '').trim() || null,
    tienda: null,
  };
}

export interface IngresoExtraFila {
  id: string; fecha: string; concepto: string | null; categoria: string | null; monto: number | string;
  metodo_pago: string | null; registrado_por: string | null;
}

export function construirEventoIngresoExtra(i: IngresoExtraFila) {
  return {
    tipo: 'ingreso_extra' as const,
    id_origen: i.id,
    fecha: fechaHoraColombia(i.fecha),
    concepto: (i.concepto || '').trim() || categoriaLegible(i.categoria) || 'Ingreso',
    categoria: categoriaLegible(i.categoria),
    valor: num(i.monto),
    medio_pago: medioPagoContador(i.metodo_pago),
    cajero: (i.registrado_por || '').trim() || null,
    tienda: null,
  };
}
