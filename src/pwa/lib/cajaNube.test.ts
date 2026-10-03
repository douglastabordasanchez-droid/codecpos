import { describe, it, expect, vi } from 'vitest';

vi.mock('../../app/lib/supabase/config', () => ({ getSupabaseClient: () => null }));

import { resumirTurno, totalBilletes, armarDetalleCierre, type TurnoCaja, type MovimientoCaja } from './cajaNube';

const turno: TurnoCaja = {
  ventas: [
    { total: 50_000, propina: 5_000, metodo: 'efectivo' },
    { total: 30_000, propina: 0, metodo: 'nequi' },
    { total: 20_000, propina: 0, metodo: 'tarjeta' },
    { total: 10_000, propina: 0, metodo: 'efectivo' },
  ],
  gastos: [
    { monto: 8_000, medio: 'efectivo', descripcion: 'Hielo', categoria: 'insumos' },
    { monto: 15_000, medio: 'transferencia', descripcion: 'Proveedor', categoria: 'proveedores' },
  ],
  devoluciones: [{ total: 4_000, metodo: 'efectivo' }, { total: 9_000, metodo: 'tarjeta' }],
};

const movimientos: MovimientoCaja[] = [
  { id: '1', tipo: 'entrada', monto: 20_000, concepto: 'Sencillo', fecha: '', usuario: '' },
  { id: '2', tipo: 'salida', monto: 5_000, concepto: 'Domicilio', fecha: '', usuario: '' },
];

describe('caja de la web', () => {
  it('el efectivo esperado solo suma ventas en efectivo (no tarjeta ni Nequi)', () => {
    const r = resumirTurno(turno, 100_000, movimientos);
    // 100.000 + 60.000 − 8.000 − 4.000 + 20.000 − 5.000
    expect(r.efectivoEsperado).toBe(163_000);
    expect(r.ventasTotal).toBe(110_000);
    expect(r.desglose).toEqual({ efectivo: 60_000, nequi: 30_000, tarjeta: 20_000 });
    expect(r.propinas).toEqual({ efectivo: 5_000 });
  });

  it('cuenta billetes y monedas', () => {
    expect(totalBilletes({ b50000: 2, b10000: 3, m500: 4, m50: 1 })).toBe(132_050);
  });

  it('arma el detalle con la forma que lee Electron', () => {
    const resumen = resumirTurno(turno, 100_000, movimientos);
    const d = armarDetalleCierre({
      resumen, turno, base: 100_000, billetes: { b100000: 1, b50000: 1, b10000: 1, b2000: 1, m500: 2 }, movimientos,
      cajero: 'Ana', fechaApertura: '2026-10-02T13:00:00.000Z', observaciones: '',
    });
    expect(d.totalFisico).toBe(163_000);
    expect(d.diferencia).toBe(0);
    expect(d.estado).toBe('cuadrado');
    expect(d.baseInicial).toBe(100_000);
    expect(d.totalFinal).toBe(163_000);
    expect(d.transferenciaEsperada).toBe(30_000);
    expect(d.gastosEfectivo).toBe(8_000);
  });
});
