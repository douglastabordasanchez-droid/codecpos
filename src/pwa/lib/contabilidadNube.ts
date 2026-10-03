/**
 * Datos y cálculos de Contabilidad para la web y el celular, leídos de
 * Supabase. Mismos criterios que la Contabilidad de Electron
 * (src/app/components/pos/ContabilidadPage.tsx) para que las dos pantallas
 * den las mismas cifras:
 *   · Ingresos = ventas completadas + ingresos extra − devoluciones.
 *   · Utilidad = ingresos − gastos. Margen = utilidad / ingresos.
 *   · Flujo de caja disponible = utilidad − lo que todavía deben los clientes.
 *   · Comparación contra el período inmediatamente anterior de igual duración.
 *
 * Las funciones de cálculo son puras (sin red) para poder probarlas.
 */
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { traerTodo, aFechaLocal, inicioDelDia, finDelDia, fechaLocal } from './nubeConsultas';

// ── Rangos ────────────────────────────────────────────────────────────────

export type RangoRapido = 'hoy' | 'ayer' | 'semana' | 'mes' | 'mes_anterior' | 'trimestre' | 'semestre' | 'anio' | 'todos' | 'personalizado';

export const RANGOS_RAPIDOS: Array<[RangoRapido, string]> = [
  ['hoy', 'Hoy'], ['ayer', 'Ayer'], ['semana', 'Esta semana'], ['mes', 'Mes actual'], ['mes_anterior', 'Mes anterior'],
  ['trimestre', 'Trimestre'], ['semestre', 'Semestre'], ['anio', 'Año en curso'], ['todos', 'Todo'], ['personalizado', 'Personalizado'],
];

/** Mismo cálculo que Electron: la semana empieza el lunes. */
export function calcularRango(rango: RangoRapido, hoy = new Date()): { desde: string; hasta: string } {
  const y = hoy.getFullYear();
  const m = hoy.getMonth();
  let desde = fechaLocal(hoy);
  let hasta = fechaLocal(hoy);
  switch (rango) {
    case 'ayer': { const d = new Date(y, m, hoy.getDate() - 1); desde = hasta = fechaLocal(d); break; }
    case 'semana': { const dia = hoy.getDay(); desde = fechaLocal(new Date(y, m, hoy.getDate() - dia + (dia === 0 ? -6 : 1))); break; }
    case 'mes': desde = fechaLocal(new Date(y, m, 1)); break;
    case 'mes_anterior': desde = fechaLocal(new Date(y, m - 1, 1)); hasta = fechaLocal(new Date(y, m, 0)); break;
    case 'trimestre': desde = fechaLocal(new Date(y, Math.floor(m / 3) * 3, 1)); break;
    case 'semestre': desde = fechaLocal(new Date(y, m < 6 ? 0 : 6, 1)); break;
    case 'anio': desde = fechaLocal(new Date(y, 0, 1)); break;
    case 'todos': desde = '2000-01-01'; break;
    default: break;
  }
  return { desde, hasta };
}

/** El período inmediatamente anterior de igual duración (para «▲12 % vs. antes»). */
export function rangoAnterior(desde: string, hasta: string): { desde: string; hasta: string } {
  const inicio = new Date(`${desde}T00:00:00`);
  const fin = new Date(`${hasta}T00:00:00`);
  const dias = Math.round((fin.getTime() - inicio.getTime()) / 86_400_000) + 1;
  const finAnt = new Date(inicio); finAnt.setDate(finAnt.getDate() - 1);
  const inicioAnt = new Date(finAnt); inicioAnt.setDate(inicioAnt.getDate() - (dias - 1));
  return { desde: fechaLocal(inicioAnt), hasta: fechaLocal(finAnt) };
}

// ── Movimientos del período ───────────────────────────────────────────────

export interface MovimientosPeriodo {
  ventas: Array<{ fecha: string; total: number; metodo: string }>;
  devoluciones: Array<{ fecha: string; total: number }>;
  gastos: Array<{ fecha: string; monto: number; categoria: string; descripcion: string; medio: string }>;
  ingresosExtra: Array<{ fecha: string; monto: number; concepto: string; categoria: string }>;
}

function cliente() {
  const c = getSupabaseClient();
  if (!c) throw new Error('nuestra base de datos no está configurada');
  return c;
}

export async function cargarMovimientos(clienteId: string, desde: string, hasta: string): Promise<MovimientosPeriodo> {
  const c = cliente();
  const a = inicioDelDia(desde);
  const b = finDelDia(hasta);
  const [ventas, devoluciones, gastos, ingresos] = await Promise.all([
    traerTodo<any>((i, j) => c.from('ventas').select('created_at, total, metodo_pago')
      .eq('cliente_id', clienteId).eq('estado', 'completada').gte('created_at', a).lte('created_at', b).order('created_at').range(i, j)),
    traerTodo<any>((i, j) => c.from('devoluciones').select('created_at, total_devolucion')
      .eq('cliente_id', clienteId).eq('estado', 'completada').gte('created_at', a).lte('created_at', b).order('created_at').range(i, j)),
    traerTodo<any>((i, j) => c.from('gastos').select('fecha, monto, categoria, descripcion, medio_pago')
      .eq('cliente_id', clienteId).gte('fecha', a).lte('fecha', b).order('fecha').range(i, j)),
    traerTodo<any>((i, j) => c.from('ingresos_extra').select('fecha, monto, concepto, categoria')
      .eq('cliente_id', clienteId).gte('fecha', a).lte('fecha', b).order('fecha').range(i, j)),
  ]);
  return {
    ventas: ventas.map((v) => ({ fecha: aFechaLocal(v.created_at), total: Number(v.total) || 0, metodo: v.metodo_pago || 'otro' })),
    devoluciones: devoluciones.map((d) => ({ fecha: aFechaLocal(d.created_at), total: Number(d.total_devolucion) || 0 })),
    gastos: gastos.map((g) => ({ fecha: aFechaLocal(g.fecha), monto: Number(g.monto) || 0, categoria: g.categoria || 'otros', descripcion: g.descripcion || '', medio: g.medio_pago || 'efectivo' })),
    ingresosExtra: ingresos.map((i) => ({ fecha: aFechaLocal(i.fecha), monto: Number(i.monto) || 0, concepto: i.concepto || '', categoria: i.categoria || 'otros' })),
  };
}

export interface Totales {
  ventas: number;
  ingresosExtra: number;
  devoluciones: number;
  ingresos: number;
  gastos: number;
  utilidad: number;
  /** % sobre ingresos. */
  margen: number;
  transacciones: number;
  ticketPromedio: number;
}

export function calcularTotales(m: MovimientosPeriodo): Totales {
  const suma = <T,>(lista: T[], f: (x: T) => number) => lista.reduce((a, x) => a + f(x), 0);
  const ventas = suma(m.ventas, (v) => v.total);
  const ingresosExtra = suma(m.ingresosExtra, (i) => i.monto);
  const devoluciones = suma(m.devoluciones, (d) => d.total);
  const ingresos = Math.max(0, ventas + ingresosExtra - devoluciones);
  const gastos = suma(m.gastos, (g) => g.monto);
  const utilidad = ingresos - gastos;
  return {
    ventas, ingresosExtra, devoluciones, ingresos, gastos, utilidad,
    margen: ingresos > 0 ? (utilidad / ingresos) * 100 : 0,
    transacciones: m.ventas.length,
    ticketPromedio: m.ventas.length > 0 ? ventas / m.ventas.length : 0,
  };
}

/** Variación % contra el período anterior; null si no hay con qué comparar. */
export function variacion(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual > 0 ? 100 : actual < 0 ? -100 : null;
  return ((actual - anterior) / Math.abs(anterior)) * 100;
}

export interface DiaFlujo {
  dia: string;
  entradas: number;
  salidas: number;
  neto: number;
  acumulado: number;
}

/** Entradas (ventas + ingresos extra) y salidas (gastos + devoluciones) por día, con saldo acumulado. */
export function flujoPorDia(m: MovimientosPeriodo): DiaFlujo[] {
  const dias = new Map<string, { entradas: number; salidas: number }>();
  const sumar = (fecha: string, campo: 'entradas' | 'salidas', valor: number) => {
    const dia = fecha.slice(0, 10);
    const d = dias.get(dia) || { entradas: 0, salidas: 0 };
    d[campo] += valor;
    dias.set(dia, d);
  };
  m.ventas.forEach((v) => sumar(v.fecha, 'entradas', v.total));
  m.ingresosExtra.forEach((i) => sumar(i.fecha, 'entradas', i.monto));
  m.gastos.forEach((g) => sumar(g.fecha, 'salidas', g.monto));
  m.devoluciones.forEach((d) => sumar(d.fecha, 'salidas', d.total));
  let acumulado = 0;
  return [...dias.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dia, d]) => {
    acumulado += d.entradas - d.salidas;
    return { dia, entradas: d.entradas, salidas: d.salidas, neto: d.entradas - d.salidas, acumulado };
  });
}

export function agrupar<T>(lista: T[], clave: (x: T) => string, valor: (x: T) => number): Array<{ nombre: string; total: number }> {
  const mapa = new Map<string, number>();
  for (const x of lista) mapa.set(clave(x), (mapa.get(clave(x)) || 0) + valor(x));
  return [...mapa.entries()].map(([nombre, total]) => ({ nombre, total })).sort((a, b) => b.total - a.total);
}

// ── Cuentas por cobrar ────────────────────────────────────────────────────

export interface CuentaPorCobrar {
  id: string;
  cliente: string;
  telefono: string;
  referencia: string;
  saldo: number;
  total: number;
  vence: string;
  /** Días de atraso (0 si no ha vencido). */
  diasAtraso: number;
  estado: 'al_dia' | 'proximo' | 'vencido';
}

export async function cargarCuentasPorCobrar(clienteId: string, hoy = new Date()): Promise<CuentaPorCobrar[]> {
  const c = cliente();
  const filas = await traerTodo<any>((i, j) => c.from('cuentas_cartera')
    .select('id, numero_factura, cliente_cartera_nombre, cliente_cartera_telefono, total, saldo, fecha_vencimiento, estado')
    .eq('cliente_id', clienteId).gt('saldo', 0).neq('estado', 'pagada').order('fecha_vencimiento').range(i, j));
  return filas.map((f) => {
    const dias = Math.floor((hoy.getTime() - new Date(f.fecha_vencimiento).getTime()) / 86_400_000);
    return {
      id: f.id,
      cliente: f.cliente_cartera_nombre || 'Sin nombre',
      telefono: f.cliente_cartera_telefono || '',
      referencia: f.numero_factura ? `Factura ${f.numero_factura}` : 'Venta a crédito',
      saldo: Number(f.saldo) || 0,
      total: Number(f.total) || 0,
      vence: fechaLocal(new Date(f.fecha_vencimiento)),
      diasAtraso: Math.max(0, dias),
      // Mismo criterio que Electron: vencida desde el día de vencimiento; próxima los 3 días previos.
      estado: dias >= 0 ? 'vencido' : dias >= -3 ? 'proximo' : 'al_dia',
    } as CuentaPorCobrar;
  }).sort((a, b) => b.saldo - a.saldo);
}

// ── Rentabilidad ──────────────────────────────────────────────────────────

export interface Rentabilidad {
  nombre: string;
  ventas: number;
  costo: number;
  utilidad: number;
  margen: number;
  unidades: number;
}

/**
 * Utilidad por producto y por categoría. La nube no guarda el costo de cada
 * venta, así que se usa el costo ACTUAL del producto — si el costo cambió en
 * el período, la utilidad de las ventas viejas es aproximada. Electron sí usa
 * el costo guardado en cada venta.
 */
export async function cargarRentabilidad(clienteId: string, desde: string, hasta: string): Promise<{ productos: Rentabilidad[]; categorias: Rentabilidad[]; sinCosto: number }> {
  const c = cliente();
  const [ventas, productos] = await Promise.all([
    traerTodo<any>((i, j) => c.from('ventas').select('id')
      .eq('cliente_id', clienteId).eq('estado', 'completada').gte('created_at', inicioDelDia(desde)).lte('created_at', finDelDia(hasta)).order('created_at').range(i, j)),
    traerTodo<any>((i, j) => c.from('productos').select('id, nombre, categoria, costo').eq('cliente_id', clienteId).order('id').range(i, j)),
  ]);
  const productoPorId = new Map(productos.map((p) => [p.id, p]));
  const items: any[] = [];
  const ids = ventas.map((v) => v.id);
  for (let k = 0; k < ids.length; k += 150) {
    const grupo = ids.slice(k, k + 150);
    items.push(...await traerTodo<any>((i, j) => c.from('venta_items')
      .select('producto_id, nombre, cantidad, precio_unitario, subtotal').in('venta_id', grupo).order('venta_id').range(i, j)));
  }
  return calcularRentabilidad(items, productoPorId);
}

export function calcularRentabilidad(
  items: Array<{ producto_id: string | null; nombre: string | null; cantidad: number; precio_unitario: number; subtotal: number | null }>,
  productoPorId: Map<string, { nombre: string; categoria: string | null; costo: number | null }>,
): { productos: Rentabilidad[]; categorias: Rentabilidad[]; sinCosto: number } {
  const porProducto = new Map<string, Rentabilidad>();
  const porCategoria = new Map<string, Rentabilidad>();
  let sinCosto = 0;
  const acumular = (mapa: Map<string, Rentabilidad>, nombre: string, venta: number, costo: number, unidades: number) => {
    const r = mapa.get(nombre) || { nombre, ventas: 0, costo: 0, utilidad: 0, margen: 0, unidades: 0 };
    r.ventas += venta; r.costo += costo; r.unidades += unidades;
    mapa.set(nombre, r);
  };
  for (const it of items) {
    const cantidad = Number(it.cantidad) || 0;
    const venta = Number(it.subtotal ?? cantidad * Number(it.precio_unitario)) || 0;
    const producto = it.producto_id ? productoPorId.get(it.producto_id) : undefined;
    const costoUnitario = Number(producto?.costo) || 0;
    if (!costoUnitario) sinCosto++;
    const costo = costoUnitario * cantidad;
    acumular(porProducto, producto?.nombre || it.nombre || 'Producto', venta, costo, cantidad);
    acumular(porCategoria, producto?.categoria || 'Sin categoría', venta, costo, cantidad);
  }
  const cerrar = (mapa: Map<string, Rentabilidad>) => [...mapa.values()]
    .map((r) => ({ ...r, utilidad: r.ventas - r.costo, margen: r.ventas > 0 ? ((r.ventas - r.costo) / r.ventas) * 100 : 0 }))
    .sort((a, b) => b.utilidad - a.utilidad);
  return { productos: cerrar(porProducto), categorias: cerrar(porCategoria), sinCosto };
}

// ── Salud financiera y resumen en palabras ────────────────────────────────

export interface SaludFinanciera { puntaje: number; etiqueta: string; color: string }

/** Mismo puntaje que Electron (sin presupuestos, que solo existen allá). */
export function saludFinanciera(t: Totales, varIngresos: number | null, porCobrar: number): SaludFinanciera {
  let p = 100;
  if (t.margen < 0) p -= 50; else if (t.margen < 10) p -= 20; else if (t.margen < 20) p -= 5;
  if (varIngresos !== null && varIngresos < -10) p -= 15;
  if (t.ingresos > 0 && porCobrar > t.ingresos * 0.3) p -= 15;
  if (t.utilidad - porCobrar < 0) p -= 10;
  p = Math.max(0, Math.min(100, p));
  if (p >= 80) return { puntaje: p, etiqueta: 'Excelente', color: '#10b981' };
  if (p >= 60) return { puntaje: p, etiqueta: 'Buena', color: '#0ea5e9' };
  if (p >= 35) return { puntaje: p, etiqueta: 'Regular', color: '#f59e0b' };
  return { puntaje: p, etiqueta: 'Crítica', color: '#ef4444' };
}

export function resumenEnPalabras(
  t: Totales,
  anterior: Totales | null,
  masRentable: string | null,
  vencidas: CuentaPorCobrar[],
  moneda: (n: number) => string,
): string[] {
  const frases: string[] = [];
  if (anterior) {
    const vi = variacion(t.ingresos, anterior.ingresos);
    if (vi !== null) frases.push(vi >= 0 ? `Los ingresos subieron ${vi.toFixed(0)} % frente al período anterior.` : `Los ingresos bajaron ${Math.abs(vi).toFixed(0)} % frente al período anterior.`);
    const vu = variacion(t.utilidad, anterior.utilidad);
    if (vu !== null) frases.push(vu >= 0 ? `La utilidad mejoró ${vu.toFixed(0)} %.` : `La utilidad cayó ${Math.abs(vu).toFixed(0)} %.`);
    const vg = variacion(t.gastos, anterior.gastos);
    if (vg !== null && vg > 20) frases.push(`Los gastos crecieron ${vg.toFixed(0)} %: revisa las categorías que más pesan.`);
  }
  if (masRentable) frases.push(`El producto que más utilidad dejó fue «${masRentable}».`);
  if (vencidas.length > 0) {
    frases.push(`Hay ${vencidas.length} ${vencidas.length === 1 ? 'cuenta vencida' : 'cuentas vencidas'} por cobrar, por ${moneda(vencidas.reduce((a, c) => a + c.saldo, 0))}.`);
  }
  if (t.margen < 0) frases.push('Este período los gastos superaron a los ingresos.');
  if (frases.length === 0) frases.push('Todavía no hay suficientes datos para comparar la tendencia.');
  return frases;
}
