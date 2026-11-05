import { describe, expect, it } from 'vitest';
import { propinaDe, ventaSinPropina } from './propinas';
import { clasificarPorNombre } from './papelImpresora';

describe('propinas fuera de la contabilidad', () => {
  it('venta de 1.000.000 con 180.000 de propina: el negocio vendió 1.000.000', () => {
    const venta = { total: 1180000, propina: 180000 };
    expect(ventaSinPropina(venta)).toBe(1000000);
    expect(propinaDe(venta)).toBe(180000);
  });

  it('venta sin propina o con datos vacíos', () => {
    expect(ventaSinPropina({ total: 50100 })).toBe(50100);
    expect(ventaSinPropina({ total: '48600', propina: null })).toBe(48600);
    expect(ventaSinPropina(null)).toBe(0);
    expect(propinaDe({ propina: -5 })).toBe(0);
  });
});

describe('ancho del rollo por el nombre de la impresora', () => {
  it('reconoce térmicas de 58 y 80 mm', () => {
    expect(clasificarPorNombre('POS-58')).toBe('angosto');
    expect(clasificarPorNombre('XP-58IIH')).toBe('angosto');
    expect(clasificarPorNombre('GP-5890 Series')).toBe('angosto');
    expect(clasificarPorNombre('POS-80C')).toBe('normal');
    expect(clasificarPorNombre('POS-80')).toBe('normal');
    expect(clasificarPorNombre('EPSON TM-T20')).toBe('incierto');
  });
});
