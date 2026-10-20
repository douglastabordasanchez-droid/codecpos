import { describe, it, expect } from 'vitest';
import { lineaConIvaIncluido, sinIvaParaNoResponsable } from './ivaIncluido';
import { calcularDocumentoFiscal } from './documentoFiscal';

describe('IVA incluido en el precio cobrado', () => {
  it('despeja la base y el IVA de un precio con IVA del 19%', () => {
    const l = lineaConIvaIncluido({ descripcion: 'Chocolatina', cantidad: 2 }, 5950, 19);
    expect(l.subtotal).toBe(10000);
    expect(l.impuestos).toEqual([{ codigo: '01', porcentaje: 19, valor: 1900 }]);
  });

  it('el total de la factura da lo cobrado (con diferencia de centavos a lo sumo)', () => {
    const items = [
      lineaConIvaIncluido({ descripcion: 'Gomitas', cantidad: 3 }, 1500, 19),
      lineaConIvaIncluido({ descripcion: 'Bombón', cantidad: 7 }, 300, 19),
      lineaConIvaIncluido({ descripcion: 'Agua', cantidad: 1 }, 2000, 0),
    ];
    const cobrado = 3 * 1500 + 7 * 300 + 2000;
    expect(Math.abs(calcularDocumentoFiscal(items).total - cobrado)).toBeLessThan(0.05);
  });

  it('sin IVA la línea queda con lo cobrado como base', () => {
    const l = lineaConIvaIncluido({ descripcion: 'Agua', cantidad: 2 }, 2000, 0);
    expect(l.subtotal).toBe(4000);
    expect(l.impuestos).toBeUndefined();
  });

  it('a un no responsable de IVA se le suma el IVA a la base', () => {
    const [l] = sinIvaParaNoResponsable([lineaConIvaIncluido({ descripcion: 'Concentrado', cantidad: 1 }, 11900, 19)]);
    expect(l.subtotal).toBe(11900);
    expect(l.impuestos).toBeUndefined();
  });
});
