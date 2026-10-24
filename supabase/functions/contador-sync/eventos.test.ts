import { describe, expect, it } from 'vitest';
import {
  construirEventoAnulacion, construirEventoCierre, construirEventoDevolucion, construirEventoGasto, esAnulacionPrematura,
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

describe('fase 2', () => {
  it('gasto: valor con IVA, proveedor del documento causado y categoría legible', () => {
    const e = construirEventoGasto({
      id: 'g1', fecha: '2026-10-20T15:02:07.789Z', created_at: '2026-10-20T20:35:08Z', descripcion: 'Hojaldre 81879',
      categoria: 'servicios_publicos', monto: '149500.00', medio_pago: 'EFECTIVO', comprobante: null, registrado_por_nombre: 'Michell ', notas: null,
    }, { emisor_nombre: 'Distribuidora X', emisor_nit: '800123456-1', numero_completo: 'FV-123', total_iva: '1900' });
    expect(e).toMatchObject({
      tipo: 'gasto', id_origen: 'g1', fecha: '2026-10-20T10:02:07-05:00', concepto: 'Hojaldre 81879', categoria: 'Servicios publicos',
      valor: 149500, iva: 1900, medio_pago: 'efectivo', proveedor_nit: '800123456', numero_soporte: 'FV-123', cajero: 'Michell',
    });
  });

  it('devolución: separa el IVA incluido y lleva la nota crédito', () => {
    const e = construirEventoDevolucion(
      { id: 'd1', venta_id: 'v1', created_at: '2026-10-22T22:47:24Z', total_devolucion: '11900', metodo_pago: 'efectivo', observaciones: null, numero_factura: 'FE000017' },
      [{ devolucion_id: 'd1', nombre: 'Goma', cantidad: 1, precio_unitario: 11900, producto_id: 'p1', motivo: 'Dañado' }],
      new Map([['p1', 19]]), 'cude-1',
    );
    expect(e).toMatchObject({ venta_id_origen: 'v1', total: 11900, subtotal: 10000, iva: 1900, motivo: 'Dañado', nota_credito_cufe: 'cude-1' });
    expect(e.items[0]).toEqual({ nombre: 'Goma', cantidad: 1, precio_unitario: 11900, subtotal: 11900, iva_pct: 19 });
  });

  it('cierre de caja desde el detalle que guarda la caja', () => {
    const e = construirEventoCierre({
      id: 'c1', fecha_apertura: '2026-10-20T10:47:41.294Z', fecha_cierre: '2026-10-20T15:05:39.66Z', created_at: '2026-10-20T15:06:00Z',
      monto_apertura: '50', monto_cierre: '16750', ventas_total: '484400', diferencia: '9350',
      detalle: { cajero_nombre: 'Michell ', baseInicial: 50, desglose: { efectivo: 171000, tarjeta: 141400, nequi: 0 }, gastosEfectivo: 154300,
        totalFinal: 16750, totalFisico: 34100, cantidadTransacciones: 42, observaciones: '' },
    }, null);
    expect(e).toMatchObject({
      apertura: '2026-10-20T05:47:41-05:00', cierre: '2026-10-20T10:05:39-05:00', cajero: 'Michell', base_inicial: 50, ventas_total: 484400,
      ventas_por_medio: { efectivo: 171000, tarjeta: 141400 }, gastos_efectivo: 154300, efectivo_esperado: 16750, efectivo_contado: 34100,
      diferencia: 17350, num_ventas: 42, observaciones: null,
    });
  });

  it('anulación con «de» y reintento cuando llega antes que su registro', () => {
    expect(construirEventoAnulacion('g1', 'gasto')).toEqual({ tipo: 'anulacion', id_origen: 'g1', de: 'gasto' });
    expect(construirEventoAnulacion('v1', null).de).toBe('venta');
    expect(['venta_no_encontrada', 'gasto_no_encontrada', 'xml_invalido'].map(esAnulacionPrematura)).toEqual([true, true, false]);
  });
});
