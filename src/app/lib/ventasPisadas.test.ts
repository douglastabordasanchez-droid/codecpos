import { describe, expect, it } from 'vitest';
import { numeroVisibleVenta } from './numeracionCaja';
import { esOtraVenta } from './ventasPisadas';

describe('ventas con el mismo número en dos cajas', () => {
  it('la hora decide si es la misma venta o otra', () => {
    const local = Date.parse('2026-10-24T05:15:09.548Z');
    // Misma venta subida de nuevo: misma hora.
    expect(esOtraVenta('2026-10-24T05:15:09.548Z', local)).toBe(false);
    expect(esOtraVenta('2026-10-24T05:16:00.000Z', local)).toBe(false);
    // FE000541 de la otra caja, del 2 de octubre: es otra venta.
    expect(esOtraVenta('2026-10-02T01:38:36.197Z', local)).toBe(true);
    // Sin fecha no se adivina.
    expect(esOtraVenta('', local)).toBe(false);
  });

  it('el número que se muestra no lleva el sufijo de la caja', () => {
    expect(numeroVisibleVenta({ local_id: 'FE000541-0DB6' })).toBe('FE000541');
    expect(numeroVisibleVenta({ local_id: 'FEC001374' })).toBe('FEC001374');
    expect(numeroVisibleVenta({ local_id: null, numero: 12 })).toBe('W000012');
  });
});
