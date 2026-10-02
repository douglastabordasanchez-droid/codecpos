import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { SupabaseFalso } from '../../app/lib/supabase/supabaseFalso';

let falso: SupabaseFalso;
vi.mock('../../app/lib/supabase/config', () => ({ getSupabaseClient: () => falso }));
// El servicio de reportes importa el almacenamiento local de Electron; en la
// web no se usa (la fuente lo reemplaza), así que aquí basta con que exista.
vi.mock('../../app/lib/electronStore', () => ({ electronStore: {} }));

const CLIENTE = 'cliente-1';
// Fechas construidas en hora LOCAL para que la prueba valga en cualquier zona.
const local = (dia: number, hora: number, min = 0) => new Date(2026, 8, dia, hora, min).toISOString();

let FuenteReportesSupabase: typeof import('./reportesFuenteSupabase').FuenteReportesSupabase;
let reportesService: typeof import('../../app/services/reportesService').reportesService;

beforeAll(async () => {
  const memoria = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => memoria.get(k) ?? null,
    setItem: (k: string, v: string) => { memoria.set(k, v); },
    removeItem: (k: string) => { memoria.delete(k); },
  });
  ({ FuenteReportesSupabase } = await import('./reportesFuenteSupabase'));
  ({ reportesService } = await import('../../app/services/reportesService'));
});

beforeEach(() => {
  // 1.500 ventas de $1.000 repartidas en tres días (más de una página de PostgREST).
  const ventas = Array.from({ length: 1500 }, (_, i) => ({
    id: `v${i}`, cliente_id: CLIENTE, numero: i + 1, estado: 'completada',
    created_at: local(10 + (i % 3), 9, i % 60), total: 1000, propina: 0,
    metodo_pago: i % 2 ? 'efectivo' : 'nequi', cajero_nombre: i % 2 ? 'Ana' : 'Luis', empleado_id: i % 2 ? 'emp-ana' : 'emp-luis',
  }));
  // Una venta a las 9:30 p.m. del día 15, con propina, y una anulada que no cuenta.
  ventas.push({ id: 'noche', cliente_id: CLIENTE, numero: 9001, estado: 'completada', created_at: local(15, 21, 30), total: 55000, propina: 5000, metodo_pago: 'tarjeta', cajero_nombre: 'Ana', empleado_id: 'emp-ana' });
  ventas.push({ id: 'anulada', cliente_id: CLIENTE, numero: 9002, estado: 'anulada', created_at: local(15, 10), total: 999999, propina: 0, metodo_pago: 'efectivo', cajero_nombre: 'Ana', empleado_id: 'emp-ana' });
  ventas.push({ id: 'ajena', cliente_id: 'otro-negocio', numero: 1, estado: 'completada', created_at: local(15, 10), total: 777777, propina: 0, metodo_pago: 'efectivo', cajero_nombre: 'X', empleado_id: 'x' });

  falso = new SupabaseFalso({
    ventas,
    venta_items: [
      ...ventas.filter((v) => v.id.startsWith('v')).map((v) => ({ venta_id: v.id, producto_id: 'p-pan', nombre: 'Pan', cantidad: 2, precio_unitario: 500, subtotal: 1000 })),
      { venta_id: 'noche', producto_id: 'p-cafe', nombre: 'Café', cantidad: 5, precio_unitario: 10000, subtotal: 50000 },
    ],
    productos: [
      { id: 'p-pan', cliente_id: CLIENTE, activo: true, nombre: 'Pan', categoria: 'Panadería', codigo_barras: '770001', precio_venta: 500, costo: 200, stock: 3, stock_minimo: 10, fecha_vencimiento: null },
      { id: 'p-cafe', cliente_id: CLIENTE, activo: true, nombre: 'Café', categoria: 'Bebidas', codigo_barras: null, precio_venta: 10000, costo: 4000, stock: 50, stock_minimo: null, fecha_vencimiento: null },
      { id: 'p-viejo', cliente_id: CLIENTE, activo: false, nombre: 'Descontinuado', categoria: 'Otros', codigo_barras: null, precio_venta: 1, costo: 1, stock: 0, stock_minimo: 5, fecha_vencimiento: null },
    ],
    gastos: [
      { id: 'g1', cliente_id: CLIENTE, fecha: local(11, 8), descripcion: 'Arriendo', categoria: 'arriendo', monto: 300000, medio_pago: 'transferencia', registrado_por: 'emp-ana', registrado_por_nombre: 'Ana', notas: null },
      { id: 'g2', cliente_id: CLIENTE, fecha: local(15, 22), descripcion: 'Compra FE100', categoria: 'inventario', monto: 119000, medio_pago: 'credito', registrado_por: null, registrado_por_nombre: 'Ana', notas: null },
    ],
    cierres_caja: [
      { id: 'c1', cliente_id: CLIENTE, fecha_cierre: local(12, 20), monto_apertura: 0, monto_cierre: 500000, ventas_total: 500000, diferencia: -2000, empleado_id: 'emp-ana', cajero_nombre: 'Ana', detalle: { desglose: { efectivo: 300000, nequi: 200000 } } },
      { id: 'abierto', cliente_id: CLIENTE, fecha_cierre: null, monto_apertura: 0, monto_cierre: 0, ventas_total: 0, diferencia: 0, empleado_id: 'emp-luis', cajero_nombre: 'Luis', detalle: {} },
    ],
    devoluciones: [
      { id: 'd1', cliente_id: CLIENTE, estado: 'completada', created_at: local(11, 15), total_devolucion: 4000, metodo_pago: 'efectivo', procesado_por_nombre: 'Ana', numero_factura: '12' },
    ],
    empleados: [
      { id: 'emp-ana', cliente_id: CLIENTE, nombre_completo: 'Ana', activo: true },
      { id: 'emp-luis', cliente_id: CLIENTE, nombre_completo: 'Luis', activo: true },
    ],
  });
});

async function preparado() {
  const fuente = new FuenteReportesSupabase(CLIENTE);
  reportesService.usarFuente(fuente);
  await fuente.preparar('2026-09-10', '2026-09-15');
  return fuente;
}

describe('Reportes en la web (Supabase → mismos cálculos de Electron)', () => {
  it('reporte de ventas: trae TODAS las ventas (pagina más allá de 1000) y solo las del negocio', async () => {
    await preparado();
    const r = await reportesService.generarReporteVentas('2026-09-10', '2026-09-15', undefined, 'Ana');

    expect(r.metadata.totalRegistros).toBe(1501);
    expect(r.datos.resumen.totalRecaudado).toBe(1500 * 1000 + 55000);
    expect(r.datos.resumen.totalPropinas).toBe(5000);
    expect(r.datos.resumen.totalDevoluciones).toBe(4000);
    expect(r.datos.resumen.ventasPorMetodo).toEqual({ efectivo: 750000, nequi: 750000, tarjeta: 55000 });
  });

  it('agrupa por día LOCAL: la venta de las 9:30 p.m. queda en su día, no en el siguiente', async () => {
    await preparado();
    const r = await reportesService.generarReporteVentas('2026-09-10', '2026-09-15');
    expect(r.datos.resumen.ventasPorDia['2026-09-15']).toBe(55000);
    expect(r.datos.resumen.ventasPorDia['2026-09-16']).toBeUndefined();
  });

  it('usa la categoría real del producto para ventas por categoría y el top de productos', async () => {
    await preparado();
    const r = await reportesService.generarReporteVentas('2026-09-10', '2026-09-15');
    expect(r.datos.resumen.ventasPorCategoria).toEqual([
      { categoria: 'Panadería', total: 1500000, cantidad: 3000 },
      { categoria: 'Bebidas', total: 50000, cantidad: 5 },
    ]);
    expect(r.datos.resumen.topProductos[0]).toEqual({ nombre: 'Pan', cantidad: 3000, total: 1500000 });

    const soloBebidas = await reportesService.generarReporteVentas('2026-09-10', '2026-09-15', 'Bebidas');
    expect(soloBebidas.metadata.totalRegistros).toBe(1);
  });

  it('reporte por cajero: filtra por el empleado y trae sus cierres', async () => {
    await preparado();
    const r = await reportesService.generarReporteCajero('2026-09-10', '2026-09-15', 'emp-ana');
    expect(r.datos.cajero.nombre).toBe('Ana');
    expect(r.datos.resumen.cantidadTransacciones).toBe(751);
    expect(r.datos.resumen.totalVentas).toBe(750000 + 55000);
    expect(r.datos.resumen.totalCierres).toBe(1);
    expect(r.datos.resumen.cierresConFaltante).toBe(1);
  });

  it('reportes de gastos, cierres y financiero cuadran con los datos', async () => {
    await preparado();

    const gastos = reportesService.generarReporteGastos('2026-09-10', '2026-09-15');
    expect(gastos.datos.resumen.totalGastos).toBe(419000);
    expect(gastos.datos.resumen.gastosPorCategoria).toEqual({ arriendo: 300000, inventario: 119000 });
    // El gasto de las 10 p.m. del día 15 entra en el rango (día local, no UTC).
    expect(gastos.datos.resumen.gastosPorDia['2026-09-15']).toBe(119000);

    const cierres = reportesService.generarReporteCierres('2026-09-10', '2026-09-15');
    expect(cierres.datos.resumen.totalCierres).toBe(1); // el turno aún abierto no cuenta
    expect(cierres.datos.cierres[0]).toMatchObject({ totalEfectivo: 300000, totalNequi: 200000, totalVentas: 500000, diferencia: -2000, cajero: 'Ana' });

    const fin = await reportesService.generarReporteFinanciero('2026-09-10', '2026-09-15');
    expect(fin.datos.ingresos.total).toBe(1555000 - 4000);
    expect(fin.datos.gastos.total).toBe(419000);
    expect(fin.datos.resumen.utilidadNeta).toBe(1551000 - 419000);
  });

  it('reporte de inventario: solo productos activos, con sus alertas de stock', async () => {
    await preparado();
    const r = reportesService.generarReporteInventario();
    expect(r.datos.resumen.totalProductos).toBe(2);
    expect(r.datos.resumen.productosBajoStock).toBe(1); // Pan: 3 ≤ 10. Café sin mínimo usa 5: 50 > 5.
    expect(r.datos.resumen.valorInventario).toBe(3 * 500 + 50 * 10000);
    expect(r.datos.resumen.valorCosto).toBe(3 * 200 + 50 * 4000);
  });

  it('listas para el modal: cajeros y categorías reales', async () => {
    const fuente = await preparado();
    expect(await fuente.cajeros()).toEqual([{ id: 'emp-ana', nombre: 'Ana' }, { id: 'emp-luis', nombre: 'Luis' }]);
    expect((await fuente.categorias()).map((c) => c.nombre)).toEqual(['Bebidas', 'Panadería']);
  });

  it('sin fuente (Electron) el servicio sigue leyendo su almacenamiento local', async () => {
    reportesService.usarFuente(null);
    localStorage.setItem('pos-gastos', JSON.stringify([{ id: 'l1', fecha: '2026-09-12T10:00:00', monto: 7000, categoria: 'otros', descripcion: 'x' }]));
    const r = reportesService.generarReporteGastos('2026-09-10', '2026-09-15');
    expect(r.datos.resumen.totalGastos).toBe(7000);
  });
});
