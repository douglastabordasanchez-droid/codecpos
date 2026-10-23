import { describe, it, expect } from 'vitest';
import { configIvaDesdeDatos, itemsConIvaConfigurado, precioDeVentaConIva, tarifaIvaProducto, type ConfigIva } from './configIva';
import { calcularDocumentoFiscal } from './documentoFiscal';

const ivaATodos: ConfigIva = { habilitado: true, porcentaje: 19, incluidoEnPrecio: true, todosLosProductos: true };

describe('IVA del negocio', () => {
  it('sin configurar queda apagado, igual que en Electron', () => {
    expect(configIvaDesdeDatos({})).toEqual({ habilitado: false, porcentaje: 19, incluidoEnPrecio: false, todosLosProductos: false });
    expect(tarifaIvaProducto(configIvaDesdeDatos(null), 19)).toBe(0);
  });

  it('a todos los productos: lleva la tarifa aunque el producto diga 0', () => {
    expect(tarifaIvaProducto(ivaATodos, 0)).toBe(19);
    expect(tarifaIvaProducto({ ...ivaATodos, todosLosProductos: false }, 0)).toBe(0);
    expect(tarifaIvaProducto({ ...ivaATodos, todosLosProductos: false }, 5)).toBe(5);
  });

  it('el IVA se suma encima solo si el precio no lo incluye', () => {
    expect(precioDeVentaConIva(ivaATodos, 10000, 19)).toBe(10000);
    expect(precioDeVentaConIva({ ...ivaATodos, incluidoEnPrecio: false }, 10000, 19)).toBe(11900);
  });

  it('Facturar de nuevo la DBM1509 ($90.000 sin IVA) separa base 75.630 e IVA 14.370', () => {
    const anulada = [
      { descripcion: 'NUCITA CREMA X 18 UNIDADES', cantidad: 1, precioUnitario: 15000, subtotal: 15000 },
      { descripcion: 'CHOCOBREAK ZOMBIE', cantidad: 4, precioUnitario: 10000, subtotal: 40000 },
      { descripcion: 'CHOCOBREAK TRADICIONAL X 50 UNIDADES', cantidad: 2, precioUnitario: 17500, subtotal: 35000 },
    ];
    const fiscal = calcularDocumentoFiscal(itemsConIvaConfigurado(anulada, ivaATodos));
    expect(Math.round(fiscal.brutoLineas)).toBe(75630);
    expect(Math.round(fiscal.totalImpuestos)).toBe(14370);
    expect(fiscal.total).toBe(90000);
  });

  it('con el IVA apagado o según cada producto, las líneas no cambian', () => {
    const items = [{ descripcion: 'X', cantidad: 1, precioUnitario: 100, subtotal: 100 }];
    expect(itemsConIvaConfigurado(items, { ...ivaATodos, habilitado: false })).toBe(items);
    expect(itemsConIvaConfigurado(items, { ...ivaATodos, todosLosProductos: false })).toBe(items);
  });
});
