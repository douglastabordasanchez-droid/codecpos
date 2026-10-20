import { describe, it, expect } from 'vitest';
import { costoPorUnidadDeVenta } from './costoGranel';

describe('costoPorUnidadDeVenta', () => {
  it('a granel divide el costo del bulto por sus kilos (web y Electron)', () => {
    expect(costoPorUnidadDeVenta({ costo: 95000, tipo_producto: 'granel', peso_bulto_kg: 25 })).toBe(3800);
    expect(costoPorUnidadDeVenta({ costo: '95000', tipoProducto: 'granel', pesoBultoKg: 25 })).toBe(3800);
  });
  it('a granel sin peso del bulto toma el costo como costo por kilo', () => {
    expect(costoPorUnidadDeVenta({ costo: 4000, tipo_producto: 'granel' })).toBe(4000);
  });
  it('los demás productos no cambian', () => {
    expect(costoPorUnidadDeVenta({ costo: 12000, tipo_producto: 'fisico', peso_bulto_kg: 25 })).toBe(12000);
    expect(costoPorUnidadDeVenta(null)).toBe(0);
  });
});
