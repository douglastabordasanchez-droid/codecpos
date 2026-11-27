import { describe, expect, it } from 'vitest';
import {
  saldosPorCuenta, resumenDelMes, usoPresupuestos, estadoDeuda, estadoFijos, utilidadEmpresa, cuotaMensualMeta,
  moverMes, rangoMes, retirosDelMes, CATEGORIA_RETIRO, type MovimientoFinanzas,
} from './finanzasPersonales';

const mov = (p: Partial<MovimientoFinanzas>): MovimientoFinanzas => ({
  id: Math.random().toString(36), fecha: '2026-11-10', tipo: 'gasto', ambito: 'personal', categoria: 'otros', monto: 0,
  cuenta_id: null, cuenta_destino_id: null, descripcion: null, deuda_id: null, fijo_id: null, ...p,
});

describe('finanzas personales', () => {
  it('saldo por cuenta con transferencias', () => {
    const cuentas = [{ id: 'a', nombre: 'Efectivo', tipo: 'efectivo', saldo_inicial: 100, activa: true }, { id: 'b', nombre: 'Nequi', tipo: 'nequi', saldo_inicial: 0, activa: true }];
    const s = saldosPorCuenta(cuentas, [
      mov({ tipo: 'ingreso', monto: 500, cuenta_id: 'a' }),
      mov({ tipo: 'gasto', monto: 50, cuenta_id: 'a' }),
      mov({ tipo: 'transferencia', monto: 200, cuenta_id: 'a', cuenta_destino_id: 'b' }),
    ]);
    expect(s.get('a')).toBe(350);
    expect(s.get('b')).toBe(200);
  });

  it('resumen del mes separa personal y empresa y otros meses', () => {
    const m = [
      mov({ tipo: 'ingreso', monto: 1000 }),
      mov({ tipo: 'gasto', monto: 300, categoria: 'mercado' }),
      mov({ tipo: 'gasto', monto: 100, categoria: 'transporte' }),
      mov({ tipo: 'gasto', monto: 999, ambito: 'empresa' }),
      mov({ tipo: 'gasto', monto: 999, fecha: '2026-10-30' }),
    ];
    const r = resumenDelMes(m, '2026-11', 'personal');
    expect(r).toMatchObject({ ingresos: 1000, gastos: 400, balance: 600, tasaAhorro: 60 });
    expect(r.porCategoria[0].categoria.id).toBe('mercado');
  });

  it('presupuesto cerca y pasado', () => {
    const m = [mov({ monto: 85, categoria: 'mercado' }), mov({ monto: 120, categoria: 'ropa' })];
    const u = usoPresupuestos([
      { id: '1', ambito: 'personal', categoria: 'mercado', monto_mensual: 100 },
      { id: '2', ambito: 'personal', categoria: 'ropa', monto_mensual: 100 },
    ], m, '2026-11');
    expect(u.map((x) => x.estado)).toEqual(['pasado', 'cerca']);
  });

  it('deuda con abonos', () => {
    const d = { id: 'd', tipo: 'debo' as const, ambito: 'personal' as const, persona: 'Banco', concepto: null, monto: 1000, fecha: '2026-11-01', vence: null, saldada: false };
    expect(estadoDeuda(d, [mov({ monto: 300, deuda_id: 'd' }), mov({ monto: 50 })])).toEqual({ abonado: 300, saldo: 700 });
  });

  it('pagos fijos pagados y vencidos', () => {
    const fijos = [
      { id: 'f1', nombre: 'Arriendo', ambito: 'personal' as const, categoria: 'vivienda', monto: 800, dia_mes: 5, cuenta_id: null, activo: true },
      { id: 'f2', nombre: 'Internet', ambito: 'personal' as const, categoria: 'celular', monto: 90, dia_mes: 20, cuenta_id: null, activo: true },
    ];
    const e = estadoFijos(fijos, [mov({ fijo_id: 'f2', monto: 90 })], '2026-11', new Date(2026, 10, 10));
    const arriendo = e.find((x) => x.fijo.id === 'f1')!;
    expect(arriendo).toMatchObject({ pagado: false, vencido: true });
    expect(e.find((x) => x.fijo.id === 'f2')!.pagado).toBe(true);
  });

  it('utilidad de la empresa resta costo, gastos y retiros', () => {
    const m = [
      mov({ ambito: 'empresa', tipo: 'gasto', monto: 100 }),
      mov({ ambito: 'empresa', tipo: 'ingreso', monto: 50 }),
      mov({ ambito: 'personal', tipo: 'ingreso', categoria: CATEGORIA_RETIRO, monto: 300 }),
    ];
    const u = utilidadEmpresa({ ingresos: 1000, gastos: 200, costo: 150 }, m, '2026-11');
    expect(u.utilidad).toBe(600);
    expect(u.retiros).toBe(300);
    expect(u.queda).toBe(300);
    expect(retirosDelMes(m, '2026-10')).toBe(0);
  });

  it('meses y cuota de una meta', () => {
    expect(moverMes('2026-01', -1)).toBe('2025-12');
    expect(rangoMes('2026-02')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(cuotaMensualMeta({ id: 'm', nombre: 'Moto', objetivo: 1200, ahorrado: 200, fecha_limite: '2027-03-31' }, new Date(2026, 10, 26))).toBe(200);
  });
});
