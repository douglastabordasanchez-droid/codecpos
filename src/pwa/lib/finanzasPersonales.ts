/**
 * Mis finanzas (migración 0171): finanzas personales y de la empresa del
 * dueño, en un libro privado que solo ven sus miembros.
 *
 * Los cálculos son funciones puras (sin red) para poder probarlos; la parte
 * de datos lee y escribe las tablas finanzas_* con la sesión del usuario.
 */
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { traerTodo } from './nubeConsultas';

export type Ambito = 'personal' | 'empresa';
export type TipoMovimiento = 'ingreso' | 'gasto' | 'transferencia';
export type RolFinanzas = 'dueno' | 'editor' | 'lector';

export interface LibroFinanzas { id: string; nombre: string; cliente_id: string | null; rol: RolFinanzas }
export interface CuentaFinanzas { id: string; nombre: string; tipo: string; saldo_inicial: number; activa: boolean }
export interface MovimientoFinanzas {
  id: string;
  fecha: string;
  tipo: TipoMovimiento;
  ambito: Ambito;
  categoria: string;
  monto: number;
  cuenta_id: string | null;
  cuenta_destino_id: string | null;
  descripcion: string | null;
  deuda_id: string | null;
  fijo_id: string | null;
}
export interface PresupuestoFinanzas { id: string; ambito: Ambito; categoria: string; monto_mensual: number }
export interface MetaFinanzas { id: string; nombre: string; objetivo: number; ahorrado: number; fecha_limite: string | null }
export interface DeudaFinanzas {
  id: string; tipo: 'debo' | 'me_deben'; ambito: Ambito; persona: string; concepto: string | null;
  monto: number; fecha: string; vence: string | null; saldada: boolean;
}
export interface FijoFinanzas {
  id: string; nombre: string; ambito: Ambito; categoria: string; monto: number; dia_mes: number; cuenta_id: string | null; activo: boolean;
}
export interface PersonaFinanzas { empleado_id: string; nombre: string; usuario: string | null; negocio: string | null; rol: RolFinanzas }

export interface DatosFinanzas {
  cuentas: CuentaFinanzas[];
  movimientos: MovimientoFinanzas[];
  presupuestos: PresupuestoFinanzas[];
  metas: MetaFinanzas[];
  deudas: DeudaFinanzas[];
  fijos: FijoFinanzas[];
}

// ── Categorías ────────────────────────────────────────────────────────────

export interface Categoria { id: string; nombre: string; emoji: string }

/** El ingreso personal que sale de la empresa: en la pestaña Empresa cuenta como retiro del dueño. */
export const CATEGORIA_RETIRO = 'retiro_empresa';

export const CATEGORIAS: Record<Ambito, Record<'ingreso' | 'gasto', Categoria[]>> = {
  personal: {
    gasto: [
      { id: 'mercado', nombre: 'Mercado y comida', emoji: '🛒' },
      { id: 'vivienda', nombre: 'Arriendo y vivienda', emoji: '🏠' },
      { id: 'servicios', nombre: 'Servicios públicos', emoji: '💡' },
      { id: 'transporte', nombre: 'Transporte', emoji: '🚌' },
      { id: 'salud', nombre: 'Salud', emoji: '🩺' },
      { id: 'educacion', nombre: 'Educación', emoji: '📚' },
      { id: 'restaurantes', nombre: 'Restaurantes', emoji: '🍔' },
      { id: 'entretenimiento', nombre: 'Entretenimiento', emoji: '🎬' },
      { id: 'ropa', nombre: 'Ropa y cuidado', emoji: '👕' },
      { id: 'celular', nombre: 'Celular e internet', emoji: '📱' },
      { id: 'familia', nombre: 'Familia', emoji: '👨‍👩‍👧' },
      { id: 'deudas', nombre: 'Pago de deudas', emoji: '💳' },
      { id: 'otros', nombre: 'Otros', emoji: '📦' },
    ],
    ingreso: [
      { id: CATEGORIA_RETIRO, nombre: 'Retiro de la empresa', emoji: '🏢' },
      { id: 'salario', nombre: 'Salario', emoji: '💼' },
      { id: 'extra', nombre: 'Trabajos extra', emoji: '🛠️' },
      { id: 'cobro_deuda', nombre: 'Me pagaron una deuda', emoji: '🤝' },
      { id: 'prestamo', nombre: 'Préstamo recibido', emoji: '🏦' },
      { id: 'otros', nombre: 'Otros', emoji: '📦' },
    ],
  },
  empresa: {
    gasto: [
      { id: 'nomina', nombre: 'Nómina y pagos a personas', emoji: '👥' },
      { id: 'arriendo', nombre: 'Arriendo y oficina', emoji: '🏢' },
      { id: 'servicios', nombre: 'Servicios e internet', emoji: '💡' },
      { id: 'software', nombre: 'Software y servidores', emoji: '🖥️' },
      { id: 'publicidad', nombre: 'Publicidad', emoji: '📣' },
      { id: 'equipos', nombre: 'Equipos y repuestos', emoji: '🔧' },
      { id: 'transporte', nombre: 'Transporte', emoji: '🚗' },
      { id: 'impuestos', nombre: 'Impuestos y contador', emoji: '🧾' },
      { id: 'proveedores', nombre: 'Proveedores', emoji: '🚚' },
      { id: 'deudas', nombre: 'Pago de deudas', emoji: '💳' },
      { id: 'otros', nombre: 'Otros', emoji: '📦' },
    ],
    ingreso: [
      { id: 'ventas_fuera', nombre: 'Ventas fuera de la caja', emoji: '💵' },
      { id: 'aporte_dueno', nombre: 'Aporte del dueño', emoji: '🙋' },
      { id: 'cobro_deuda', nombre: 'Me pagaron una deuda', emoji: '🤝' },
      { id: 'otros', nombre: 'Otros', emoji: '📦' },
    ],
  },
};

export function categoriaDe(ambito: Ambito, tipo: TipoMovimiento, id: string): Categoria {
  if (tipo === 'transferencia') return { id: 'transferencia', nombre: 'Transferencia', emoji: '🔁' };
  return CATEGORIAS[ambito][tipo].find((c) => c.id === id) ?? { id, nombre: id.replace(/_/g, ' '), emoji: '📦' };
}

// ── Fechas ────────────────────────────────────────────────────────────────

/** 'YYYY-MM' del mes. */
export const claveMes = (fecha: string) => fecha.slice(0, 7);

export function mesActual(hoy = new Date()): string {
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
}

export function moverMes(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function rangoMes(mes: string): { desde: string; hasta: string } {
  const [y, m] = mes.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, '0')}` };
}

export function nombreMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  const t = new Date(y, m - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ── Cálculos ──────────────────────────────────────────────────────────────

/** Saldo de cada cuenta: inicial + ingresos − gastos ± transferencias (todo el historial). */
export function saldosPorCuenta(cuentas: CuentaFinanzas[], movimientos: MovimientoFinanzas[]): Map<string, number> {
  const saldos = new Map(cuentas.map((c) => [c.id, Number(c.saldo_inicial) || 0]));
  const sumar = (id: string | null, v: number) => { if (id && saldos.has(id)) saldos.set(id, (saldos.get(id) || 0) + v); };
  for (const m of movimientos) {
    const v = Number(m.monto) || 0;
    if (m.tipo === 'ingreso') sumar(m.cuenta_id, v);
    else if (m.tipo === 'gasto') sumar(m.cuenta_id, -v);
    else { sumar(m.cuenta_id, -v); sumar(m.cuenta_destino_id, v); }
  }
  return saldos;
}

export interface ResumenAmbito {
  ingresos: number;
  gastos: number;
  balance: number;
  /** % del ingreso que quedó (balance / ingresos). */
  tasaAhorro: number;
  porCategoria: Array<{ categoria: Categoria; total: number }>;
}

export function resumenDelMes(movimientos: MovimientoFinanzas[], mes: string, ambito: Ambito): ResumenAmbito {
  const delMes = movimientos.filter((m) => m.ambito === ambito && claveMes(m.fecha) === mes);
  const ingresos = delMes.filter((m) => m.tipo === 'ingreso').reduce((a, m) => a + Number(m.monto), 0);
  const gastos = delMes.filter((m) => m.tipo === 'gasto').reduce((a, m) => a + Number(m.monto), 0);
  const porId = new Map<string, number>();
  for (const m of delMes) if (m.tipo === 'gasto') porId.set(m.categoria, (porId.get(m.categoria) || 0) + Number(m.monto));
  return {
    ingresos, gastos, balance: ingresos - gastos,
    tasaAhorro: ingresos > 0 ? ((ingresos - gastos) / ingresos) * 100 : 0,
    porCategoria: [...porId.entries()]
      .map(([id, total]) => ({ categoria: categoriaDe(ambito, 'gasto', id), total }))
      .sort((a, b) => b.total - a.total),
  };
}

/** Lo que el dueño sacó de la empresa en el mes (ingresos personales «Retiro de la empresa»). */
export function retirosDelMes(movimientos: MovimientoFinanzas[], mes: string): number {
  return movimientos
    .filter((m) => m.ambito === 'personal' && m.tipo === 'ingreso' && m.categoria === CATEGORIA_RETIRO && claveMes(m.fecha) === mes)
    .reduce((a, m) => a + Number(m.monto), 0);
}

export interface UsoPresupuesto { presupuesto: PresupuestoFinanzas; categoria: Categoria; gastado: number; porcentaje: number; estado: 'bien' | 'cerca' | 'pasado' }

export function usoPresupuestos(presupuestos: PresupuestoFinanzas[], movimientos: MovimientoFinanzas[], mes: string): UsoPresupuesto[] {
  return presupuestos.map((p) => {
    const gastado = movimientos
      .filter((m) => m.tipo === 'gasto' && m.ambito === p.ambito && m.categoria === p.categoria && claveMes(m.fecha) === mes)
      .reduce((a, m) => a + Number(m.monto), 0);
    const porcentaje = p.monto_mensual > 0 ? (gastado / Number(p.monto_mensual)) * 100 : 0;
    return {
      presupuesto: p, categoria: categoriaDe(p.ambito, 'gasto', p.categoria), gastado, porcentaje,
      estado: (porcentaje > 100 ? 'pasado' : porcentaje >= 80 ? 'cerca' : 'bien') as UsoPresupuesto['estado'],
    };
  }).sort((a, b) => b.porcentaje - a.porcentaje);
}

/** Abonado y saldo de una deuda: los movimientos ligados a ella. */
export function estadoDeuda(deuda: DeudaFinanzas, movimientos: MovimientoFinanzas[]): { abonado: number; saldo: number } {
  const abonado = movimientos.filter((m) => m.deuda_id === deuda.id).reduce((a, m) => a + Number(m.monto), 0);
  return { abonado, saldo: Math.max(0, Number(deuda.monto) - abonado) };
}

export interface EstadoFijo { fijo: FijoFinanzas; pagado: boolean; vencido: boolean; diasParaPagar: number }

/** Pagos fijos del mes: pagado si hay un movimiento ligado ese mes. */
export function estadoFijos(fijos: FijoFinanzas[], movimientos: MovimientoFinanzas[], mes: string, hoy = new Date()): EstadoFijo[] {
  const esMesActual = mes === mesActual(hoy);
  return fijos.filter((f) => f.activo).map((fijo) => {
    const pagado = movimientos.some((m) => m.fijo_id === fijo.id && claveMes(m.fecha) === mes);
    const { hasta } = rangoMes(mes);
    const dia = Math.min(fijo.dia_mes, Number(hasta.slice(8)));
    const diasParaPagar = esMesActual ? dia - hoy.getDate() : mes < mesActual(hoy) ? -1 : 99;
    return { fijo, pagado, vencido: !pagado && diasParaPagar < 0, diasParaPagar };
  }).sort((a, b) => Number(a.pagado) - Number(b.pagado) || a.fijo.dia_mes - b.fijo.dia_mes);
}

export interface UtilidadEmpresa {
  ventas: number;
  costoVentas: number;
  gastosCaja: number;
  ingresosExtra: number;
  gastosExtra: number;
  utilidad: number;
  margen: number;
  retiros: number;
  /** Lo que queda en la empresa después de lo que el dueño sacó. */
  queda: number;
}

/**
 * Utilidad real de la empresa en el mes: lo que vendió la caja (sin propina,
 * menos devoluciones, más ingresos extra) menos el costo de lo vendido y los
 * gastos de la caja, más y menos lo registrado aquí como empresa.
 */
export function utilidadEmpresa(
  caja: { ingresos: number; gastos: number; costo: number },
  movimientos: MovimientoFinanzas[],
  mes: string,
): UtilidadEmpresa {
  const r = resumenDelMes(movimientos, mes, 'empresa');
  const utilidad = caja.ingresos + r.ingresos - caja.costo - caja.gastos - r.gastos;
  const base = caja.ingresos + r.ingresos;
  const retiros = retirosDelMes(movimientos, mes);
  return {
    ventas: caja.ingresos, costoVentas: caja.costo, gastosCaja: caja.gastos,
    ingresosExtra: r.ingresos, gastosExtra: r.gastos,
    utilidad, margen: base > 0 ? (utilidad / base) * 100 : 0,
    retiros, queda: utilidad - retiros,
  };
}

/** Cuánto hay que ahorrar al mes para llegar a la meta en la fecha límite. */
export function cuotaMensualMeta(meta: MetaFinanzas, hoy = new Date()): number | null {
  if (!meta.fecha_limite) return null;
  const falta = Math.max(0, Number(meta.objetivo) - Number(meta.ahorrado));
  if (falta === 0) return 0;
  const [y, m] = meta.fecha_limite.split('-').map(Number);
  const meses = (y - hoy.getFullYear()) * 12 + (m - 1 - hoy.getMonth()) + 1;
  return meses <= 0 ? falta : falta / meses;
}

// ── Datos ─────────────────────────────────────────────────────────────────

function cliente() {
  const c = getSupabaseClient();
  if (!c) throw new Error('nuestra base de datos no está configurada');
  return c;
}

function lanzar(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function misLibros(): Promise<LibroFinanzas[]> {
  const { data, error } = await cliente().rpc('finanzas_mis_libros');
  lanzar(error);
  return (data as LibroFinanzas[]) || [];
}

export async function cargarDatos(libroId: string): Promise<DatosFinanzas> {
  const c = cliente();
  const tabla = <T,>(nombre: string, orden: string) =>
    traerTodo<T>((a, b) => c.from(nombre).select('*').eq('libro_id', libroId).order(orden, { ascending: false }).order('id').range(a, b));
  const [cuentas, movimientos, presupuestos, metas, deudas, fijos] = await Promise.all([
    tabla<CuentaFinanzas>('finanzas_cuentas', 'created_at'),
    tabla<MovimientoFinanzas>('finanzas_movimientos', 'fecha'),
    tabla<PresupuestoFinanzas>('finanzas_presupuestos', 'created_at'),
    tabla<MetaFinanzas>('finanzas_metas', 'created_at'),
    tabla<DeudaFinanzas>('finanzas_deudas', 'fecha'),
    tabla<FijoFinanzas>('finanzas_fijos', 'created_at'),
  ]);
  const num = <T extends Record<string, any>>(l: T[], campos: string[]) =>
    l.map((x) => { const y: any = { ...x }; for (const k of campos) if (y[k] != null) y[k] = Number(y[k]); return y as T; });
  return {
    cuentas: num(cuentas, ['saldo_inicial']).reverse(),
    movimientos: num(movimientos, ['monto']),
    presupuestos: num(presupuestos, ['monto_mensual']),
    metas: num(metas, ['objetivo', 'ahorrado']),
    deudas: num(deudas, ['monto']),
    fijos: num(fijos, ['monto']),
  };
}

export type Tabla = 'finanzas_cuentas' | 'finanzas_movimientos' | 'finanzas_presupuestos' | 'finanzas_metas' | 'finanzas_deudas' | 'finanzas_fijos';

export async function guardar(tabla: Tabla, libroId: string, fila: Record<string, unknown> & { id?: string }): Promise<void> {
  const c = cliente();
  const { id, ...resto } = fila;
  const { error } = id
    ? await c.from(tabla).update(resto).eq('id', id).eq('libro_id', libroId)
    : await c.from(tabla).insert({ ...resto, libro_id: libroId });
  lanzar(error);
}

export async function borrar(tabla: Tabla, libroId: string, id: string): Promise<void> {
  const { error } = await cliente().from(tabla).delete().eq('id', id).eq('libro_id', libroId);
  lanzar(error);
}

export async function personas(libroId: string): Promise<PersonaFinanzas[]> {
  const { data, error } = await cliente().rpc('finanzas_personas', { p_libro: libroId });
  lanzar(error);
  return (data as PersonaFinanzas[]) || [];
}

export async function invitar(libroId: string, usuario: string, rol: RolFinanzas): Promise<string> {
  const { data, error } = await cliente().rpc('finanzas_invitar', { p_libro: libroId, p_usuario: usuario, p_rol: rol });
  lanzar(error);
  return String(data || usuario);
}

export async function quitarAcceso(libroId: string, empleadoId: string): Promise<void> {
  const { error } = await cliente().rpc('finanzas_quitar', { p_libro: libroId, p_empleado: empleadoId });
  lanzar(error);
}
