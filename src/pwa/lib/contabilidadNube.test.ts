import { describe, it, expect, vi } from 'vitest';

vi.mock('../../app/lib/supabase/config', () => ({ getSupabaseClient: () => null }));

import {
  calcularRango, rangoAnterior, calcularTotales, variacion, flujoPorDia, calcularRentabilidad, saludFinanciera,
  type MovimientosPeriodo,
} from './contabilidadNube';

const jueves = new Date(2026, 9, 1); // 1 de octubre de 2026

describe('rangos rápidos', () => {
  it('calcula los rangos como Electron (semana desde el lunes)', () => {
    expect(calcularRango('hoy', jueves)).toEqual({ desde: '2026-10-01', hasta: '2026-10-01' });
    expect(calcularRango('ayer', jueves)).toEqual({ desde: '2026-09-30', hasta: '2026-09-30' });
    expect(calcularRango('semana', jueves)).toEqual({ desde: '2026-09-28', hasta: '2026-10-01' });
    expect(calcularRango('mes_anterior', jueves)).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' });
    expect(calcularRango('trimestre', jueves).desde).toBe('2026-10-01');
    expect(calcularRango('semestre', jueves).desde).toBe('2026-07-01');
    expect(calcularRango('anio', jueves).desde).toBe('2026-01-01');
  });

  it('el domingo pertenece a la semana que empezó el lunes anterior', () => {
    expect(calcularRango('semana', new Date(2026, 9, 4)).desde).toBe('2026-09-28');
  });

  it('el período anterior tiene la misma duración y termina el día antes', () => {
    expect(rangoAnterior('2026-10-01', '2026-10-31')).toEqual({ desde: '2026-08-31', hasta: '2026-09-30' });
    expect(rangoAnterior('2026-10-01', '2026-10-01')).toEqual({ desde: '2026-09-30', hasta: '2026-09-30' });
  });
});

const movimientos: MovimientosPeriodo = {
  ventas: [
    { fecha: '2026-10-01T09:00:00', total: 100_000, metodo: 'efectivo' },
    { fecha: '2026-10-01T20:30:00', total: 50_000, metodo: 'nequi' },
    { fecha: '2026-10-02T10:00:00', total: 30_000, metodo: 'efectivo' },
  ],
  devoluciones: [{ fecha: '2026-10-02T11:00:00', total: 10_000 }],
  gastos: [{ fecha: '2026-10-01T12:00:00', monto: 40_000, categoria: 'arriendo', descripcion: '', medio: 'efectivo' }],
  ingresosExtra: [{ fecha: '2026-10-02T08:00:00', monto: 5_000, concepto: 'reciclaje', categoria: 'otros' }],
};

describe('totales y flujo', () => {
  it('ingresos = ventas + extra − devoluciones; utilidad = ingresos − gastos', () => {
    const t = calcularTotales(movimientos);
    expect(t.ingresos).toBe(175_000);
    expect(t.utilidad).toBe(135_000);
    expect(t.margen).toBeCloseTo(77.14, 1);
    expect(t.ticketPromedio).toBe(60_000);
  });

  it('agrupa por día local con saldo acumulado', () => {
    expect(flujoPorDia(movimientos)).toEqual([
      { dia: '2026-10-01', entradas: 150_000, salidas: 40_000, neto: 110_000, acumulado: 110_000 },
      { dia: '2026-10-02', entradas: 35_000, salidas: 10_000, neto: 25_000, acumulado: 135_000 },
    ]);
  });

  it('variación contra el período anterior', () => {
    expect(variacion(120, 100)).toBe(20);
    expect(variacion(-50, -100)).toBe(50);
    expect(variacion(0, 0)).toBeNull();
  });
});

describe('rentabilidad', () => {
  it('usa el costo del producto y cuenta las líneas sin costo', () => {
    const productos = new Map([
      ['a', { nombre: 'Café', categoria: 'Bebidas', costo: 1_000 }],
      ['b', { nombre: 'Pan', categoria: 'Panadería', costo: null }],
    ]);
    const r = calcularRentabilidad([
      { producto_id: 'a', nombre: 'Café', cantidad: 3, precio_unitario: 3_000, subtotal: 9_000 },
      { producto_id: 'b', nombre: 'Pan', cantidad: 2, precio_unitario: 500, subtotal: null },
    ], productos);
    expect(r.productos[0]).toMatchObject({ nombre: 'Café', ventas: 9_000, costo: 3_000, utilidad: 6_000, unidades: 3 });
    expect(r.productos[1]).toMatchObject({ nombre: 'Pan', ventas: 1_000, utilidad: 1_000 });
    expect(r.sinCosto).toBe(1);
    expect(r.categorias.map((c) => c.nombre)).toEqual(['Bebidas', 'Panadería']);
  });
});

describe('salud financiera', () => {
  it('castiga margen negativo y cartera alta', () => {
    const t = calcularTotales(movimientos);
    expect(saludFinanciera(t, 5, 0).etiqueta).toBe('Excelente');
    expect(saludFinanciera({ ...t, margen: -5, utilidad: -1 }, -20, t.ingresos).etiqueta).toBe('Crítica');
  });
});
