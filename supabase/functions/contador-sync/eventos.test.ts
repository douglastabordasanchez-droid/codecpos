import { describe, expect, it } from 'vitest';
import {
  construirEventoFactura, construirEventoVenta, diaColombia, esRechazoPorCupo, esReintentable, fechaHoraColombia, minutosHastaReintento, nitSoloDigitos,
} from './eventos';

describe('nitSoloDigitos', () => {
  it('quita el dígito de verificación y lo que no es número', () => {
    expect(nitSoloDigitos('1049796031-3')).toBe('1049796031');
    expect(nitSoloDigitos('1.049.796.031')).toBe('1049796031');
    expect(nitSoloDigitos(null)).toBe('');
  });
});

describe('fechas en hora de Colombia', () => {
  it('pasa de UTC a -05:00', () => {
    expect(fechaHoraColombia('2026-10-21T20:04:00.000Z')).toBe('2026-10-21T15:04:00-05:00');
    expect(diaColombia('2026-10-22T03:00:00Z')).toBe('2026-10-21');
  });
});

describe('construirEventoVenta', () => {
  const venta = {
    id: 'v-1', numero: 287, local_id: 'FE000287', created_at: '2026-10-20T23:41:38.809Z', total: '17000.00',
    descuento: '0.00', propina: '0.00', metodo_pago: 'efectivo', metodos_multiples: null, cajero_nombre: 'Yulieth Berrio ', tienda_id: null,
  };
  const items = [
    { venta_id: 'v-1', nombre: 'Gaseosa', cantidad: '1.00', precio_unitario: '11900.00', subtotal: '11900.00', producto_id: 'p-iva' },
    { venta_id: 'v-1', nombre: 'Pan', cantidad: '2', precio_unitario: '2550', subtotal: null, producto_id: 'p-exento' },
  ];

  it('separa base e IVA incluido y arma el formato acordado', () => {
    const e = construirEventoVenta(venta, items, new Map([['p-iva', 19]]), 'Sede Centro', null);
    expect(e).toMatchObject({
      tipo: 'venta', id_origen: 'v-1', numero: 287, fecha: '2026-10-20T18:41:38-05:00',
      total: 17000, iva: 1900, subtotal: 15100, descuento: 0, propina: 0, medio_pago: 'efectivo',
      metodos_multiples: [], cajero: 'Yulieth Berrio', tienda: 'Sede Centro', factura_cufe: null,
    });
    expect(e.items).toEqual([
      { nombre: 'Gaseosa', cantidad: 1, precio_unitario: 11900, subtotal: 11900, iva_pct: 19 },
      { nombre: 'Pan', cantidad: 2, precio_unitario: 2550, subtotal: 5100, iva_pct: 0 },
    ]);
  });

  it('lleva el CUFE si la venta tuvo factura electrónica', () => {
    expect(construirEventoVenta(venta, items, new Map(), null, 'abc').factura_cufe).toBe('abc');
  });
});

describe('construirEventoFactura', () => {
  it('manda el XML, el CUFE, la venta y el día', () => {
    expect(construirEventoFactura(
      { id: 'f-1', cufe: 'c', xml: '<Invoice/>', fecha_emision: '2026-10-21T16:29:40Z', created_at: '2026-10-21T16:29:40Z', venta_referencia: 'FE1' },
      'v-1',
    )).toEqual({ tipo: 'factura_electronica', id_origen: 'f-1', venta_id: 'v-1', cufe: 'c', fecha: '2026-10-21', xml: '<Invoice/>' });
  });
});

describe('esRechazoPorCupo', () => {
  it('reconoce el cupo agotado del plan del contador y no otros rechazos', () => {
    expect(['cupo_agotado', 'Límite de XML del plan alcanzado', 'quota_exceeded'].map(esRechazoPorCupo)).toEqual([true, true, true]);
    expect(['xml_invalido', 'venta_no_encontrada', 'aun_no_soportado', null].map(esRechazoPorCupo)).toEqual([false, false, false, false]);
  });
});

describe('reintentos', () => {
  it('espera creciente con tope de 6 horas', () => {
    expect([1, 2, 3, 4, 20].map(minutosHastaReintento)).toEqual([1, 2, 4, 8, 360]);
  });
  it('reintenta 429, 5xx y caídas de red, no los demás 4xx', () => {
    expect([null, 429, 500, 503, 400, 401, 404, 409].map(esReintentable)).toEqual([true, true, true, true, false, false, false, false]);
  });
});
