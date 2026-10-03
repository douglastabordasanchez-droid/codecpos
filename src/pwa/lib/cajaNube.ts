/**
 * Caja de la web y el celular (terminal 'PWA'): apertura, arqueo en vivo por
 * billetes y monedas, entradas/salidas de efectivo y cierre.
 *
 * El cierre se guarda en `cierres_caja.detalle` con LA MISMA FORMA que usa
 * Electron (billetes m50…b100000, desglose, baseInicial, totalFinal,
 * totalFisico, gastosEfectivo, devoluciones…) para que el historial y el
 * detalle de un cierre se lean igual en las dos plataformas.
 *
 * Efectivo esperado (misma fórmula que Electron, ModalDetalleCierre):
 *   base + ventas en efectivo − gastos en efectivo − devoluciones en efectivo
 *   + entradas manuales − salidas manuales.
 *
 * Solo cuenta lo hecho desde la web: las ventas de Electron tienen su propio
 * cierre en su terminal y antes se colaban aquí, descuadrando todo cierre
 * hecho desde el celular.
 */
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { traerTodo } from './nubeConsultas';

export const TERMINAL_PWA = 'PWA';

export const DENOMINACIONES: Array<{ clave: string; valor: number; tipo: 'billete' | 'moneda' }> = [
  { clave: 'b100000', valor: 100_000, tipo: 'billete' },
  { clave: 'b50000', valor: 50_000, tipo: 'billete' },
  { clave: 'b20000', valor: 20_000, tipo: 'billete' },
  { clave: 'b10000', valor: 10_000, tipo: 'billete' },
  { clave: 'b5000', valor: 5_000, tipo: 'billete' },
  { clave: 'b2000', valor: 2_000, tipo: 'billete' },
  { clave: 'b1000', valor: 1_000, tipo: 'billete' },
  { clave: 'm1000', valor: 1_000, tipo: 'moneda' },
  { clave: 'm500', valor: 500, tipo: 'moneda' },
  { clave: 'm200', valor: 200, tipo: 'moneda' },
  { clave: 'm100', valor: 100, tipo: 'moneda' },
  { clave: 'm50', valor: 50, tipo: 'moneda' },
];

export type Billetes = Record<string, number>;

export const totalBilletes = (b: Billetes) => DENOMINACIONES.reduce((a, d) => a + (Number(b[d.clave]) || 0) * d.valor, 0);

export interface MovimientoCaja {
  id: string;
  tipo: 'entrada' | 'salida';
  monto: number;
  concepto: string;
  fecha: string;
  usuario: string;
}

export const METODOS = ['efectivo', 'tarjeta', 'nequi', 'daviplata', 'bancolombia', 'transferencia', 'bre_b', 'rappi', 'cartera', 'mixto', 'otro'] as const;
export const METODOS_LABEL: Record<string, string> = {
  efectivo: 'Efectivo', tarjeta: 'Tarjeta', nequi: 'Nequi', daviplata: 'Daviplata', bancolombia: 'Bancolombia',
  transferencia: 'Transferencia', bre_b: 'Bre-B', rappi: 'Rappi', cartera: 'Crédito (cartera)', mixto: 'Mixto', otro: 'Otro',
};

export interface TurnoCaja {
  ventas: Array<{ total: number; propina: number; metodo: string }>;
  gastos: Array<{ monto: number; medio: string; descripcion: string; categoria: string }>;
  devoluciones: Array<{ total: number; metodo: string }>;
}

export interface ResumenTurno {
  desglose: Record<string, number>;
  propinas: Record<string, number>;
  ventasTotal: number;
  transacciones: number;
  gastosEfectivo: number;
  devolucionesEfectivo: number;
  entradas: number;
  salidas: number;
  efectivoEsperado: number;
}

export function resumirTurno(turno: TurnoCaja, base: number, movimientos: MovimientoCaja[]): ResumenTurno {
  const desglose: Record<string, number> = {};
  const propinas: Record<string, number> = {};
  for (const v of turno.ventas) {
    const m = (METODOS as readonly string[]).includes(v.metodo) ? v.metodo : 'otro';
    desglose[m] = (desglose[m] || 0) + v.total;
    if (v.propina) propinas[m] = (propinas[m] || 0) + v.propina;
  }
  const gastosEfectivo = turno.gastos.filter((g) => g.medio === 'efectivo').reduce((a, g) => a + g.monto, 0);
  const devolucionesEfectivo = turno.devoluciones.filter((d) => d.metodo === 'efectivo').reduce((a, d) => a + d.total, 0);
  const entradas = movimientos.filter((m) => m.tipo === 'entrada').reduce((a, m) => a + m.monto, 0);
  const salidas = movimientos.filter((m) => m.tipo === 'salida').reduce((a, m) => a + m.monto, 0);
  return {
    desglose,
    propinas,
    ventasTotal: turno.ventas.reduce((a, v) => a + v.total, 0),
    transacciones: turno.ventas.length,
    gastosEfectivo,
    devolucionesEfectivo,
    entradas,
    salidas,
    efectivoEsperado: base + (desglose.efectivo || 0) - gastosEfectivo - devolucionesEfectivo + entradas - salidas,
  };
}

/** Lo vendido, gastado y devuelto desde la web desde que se abrió la caja. */
export async function cargarTurno(clienteId: string, desdeIso: string): Promise<TurnoCaja> {
  const c = getSupabaseClient();
  if (!c) throw new Error('nuestra base de datos no está configurada');
  const [ventas, gastos, devoluciones] = await Promise.all([
    traerTodo<any>((i, j) => c.from('ventas').select('total, propina, metodo_pago')
      .eq('cliente_id', clienteId).eq('terminal_id', TERMINAL_PWA).eq('estado', 'completada').gte('created_at', desdeIso).order('created_at').range(i, j)),
    // Los gastos registrados en la web llevan quién los registró; los de Electron no.
    traerTodo<any>((i, j) => c.from('gastos').select('monto, medio_pago, descripcion, categoria')
      .eq('cliente_id', clienteId).not('registrado_por', 'is', null).gte('fecha', desdeIso).order('fecha').range(i, j)),
    traerTodo<any>((i, j) => c.from('devoluciones').select('total_devolucion, metodo_pago')
      .eq('cliente_id', clienteId).eq('estado', 'completada').not('procesado_por', 'is', null).gte('created_at', desdeIso).order('created_at').range(i, j)),
  ]);
  return {
    ventas: ventas.map((v) => ({ total: Number(v.total) || 0, propina: Number(v.propina) || 0, metodo: String(v.metodo_pago || 'otro').toLowerCase() })),
    gastos: gastos.map((g) => ({ monto: Number(g.monto) || 0, medio: String(g.medio_pago || 'efectivo').toLowerCase(), descripcion: g.descripcion || '', categoria: g.categoria || '' })),
    devoluciones: devoluciones.map((d) => ({ total: Number(d.total_devolucion) || 0, metodo: String(d.metodo_pago || '').toLowerCase() })),
  };
}

/** Detalle del cierre con la forma de Electron (ver ModalDetalleCierre / TirillaCierreCaja). */
export function armarDetalleCierre(p: {
  resumen: ResumenTurno;
  turno: TurnoCaja;
  base: number;
  billetes: Billetes;
  movimientos: MovimientoCaja[];
  cajero: string;
  fechaApertura: string;
  observaciones: string;
}) {
  const totalFisico = totalBilletes(p.billetes);
  const diferencia = totalFisico - p.resumen.efectivoEsperado;
  const transferencias = ['nequi', 'daviplata', 'bancolombia', 'transferencia', 'bre_b']
    .reduce((a, m) => a + (p.resumen.desglose[m] || 0), 0);
  return {
    fecha: new Date().toISOString(),
    cajero: p.cajero,
    cajero_nombre: p.cajero,
    fechaApertura: p.fechaApertura,
    estado: Math.abs(diferencia) < 1 ? 'cuadrado' : diferencia > 0 ? 'sobrante' : 'faltante',
    billetes: p.billetes,
    desglose: p.resumen.desglose,
    propinas: p.resumen.propinas,
    baseInicial: p.base,
    totalFinal: p.resumen.efectivoEsperado,
    totalFisico,
    diferencia,
    totalSistema: p.resumen.ventasTotal,
    cantidadTransacciones: p.resumen.transacciones,
    ticketPromedio: p.resumen.transacciones ? p.resumen.ventasTotal / p.resumen.transacciones : 0,
    gastosEfectivo: p.resumen.gastosEfectivo,
    gastosTransferencia: p.turno.gastos.filter((g) => g.medio !== 'efectivo').reduce((a, g) => a + g.monto, 0),
    gastosTarjetaBanco: 0,
    gastosDetalle: p.turno.gastos.map((g) => ({ descripcion: g.descripcion || g.categoria, concepto: g.categoria, monto: g.monto, medioPago: g.medio.toUpperCase() })),
    devoluciones: p.resumen.devolucionesEfectivo,
    tarjetaBancoEsperado: p.resumen.desglose.tarjeta || 0,
    transferenciaEsperada: transferencias,
    abonosCarteraEfectivo: 0,
    abonosCarteraDetalle: [],
    movimientos: p.movimientos,
    entradasEfectivo: p.resumen.entradas,
    salidasEfectivo: p.resumen.salidas,
    observaciones: p.observaciones,
    origen: 'web',
  };
}
