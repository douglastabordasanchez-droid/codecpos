import { describe, it, expect } from 'vitest';
import { lineasDevueltas } from './notaPorDevolucion';
import type { FacturaElectronicaDian } from './types';

const factura = {
  items: [
    { codigo: 'A1', descripcion: 'Camisa', cantidad: 4, precioUnitario: 10000, subtotal: 40000, impuestos: [{ codigo: '01', porcentaje: 19, valor: 7600 }] },
    { codigo: 'B2', descripcion: 'Gorra', cantidad: 1, precioUnitario: 5000, subtotal: 5000 },
  ],
} as unknown as FacturaElectronicaDian;

describe('nota crédito por devolución', () => {
  it('toma solo lo devuelto y en proporción, con su IVA', () => {
    const lineas = lineasDevueltas(factura, [{ codigo: 'A1', nombre: 'Camisa', cantidad: 1 }]);
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatchObject({ cantidad: 1, subtotal: 10000, precioUnitario: 10000 });
    expect(lineas[0].impuestos?.[0].valor).toBe(1900);
  });

  it('encuentra el producto por nombre si no trae código', () => {
    expect(lineasDevueltas(factura, [{ nombre: 'gorra', cantidad: 1 }])[0].codigo).toBe('B2');
  });

  it('no inventa líneas que la factura no tiene', () => {
    expect(() => lineasDevueltas(factura, [{ nombre: 'Zapatos', cantidad: 1 }])).toThrow(/no aparece/);
  });
});
