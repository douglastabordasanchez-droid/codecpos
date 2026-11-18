import { describe, it, expect } from 'vitest';
import { cantidadesADevolver, avisoDevolucionPorNota, type LineaVenta } from './devolucionPorNota';
import type { ItemFacturaDian } from './types';

const camisa: LineaVenta = { clave: 'p1', productoId: 'p1', codigo: 'A1', nombre: 'Camisa', cantidad: 4, precio: 11900 };
const gorra: LineaVenta = { clave: 'p2', productoId: 'p2', codigo: 'B2', nombre: 'Gorra', cantidad: 1, precio: 5000 };
const nada = () => 0;
const linea = (descripcion: string, cantidad: number, codigo?: string) =>
  ({ descripcion, cantidad, codigo, precioUnitario: 0, subtotal: 0 }) as ItemFacturaDian;

describe('devolución de la venta por nota crédito', () => {
  it('la anulación devuelve todo lo vendido', () => {
    const r = cantidadesADevolver([camisa, gorra], nada, null);
    expect(r.map((x) => [x.linea.nombre, x.cantidad])).toEqual([['Camisa', 4], ['Gorra', 1]]);
  });

  it('la anulación no devuelve otra vez lo que ya se devolvió', () => {
    const yaDevuelto = (l: LineaVenta) => (l.clave === 'p1' ? 3 : 1);
    const r = cantidadesADevolver([camisa, gorra], yaDevuelto, null);
    expect(r.map((x) => [x.linea.nombre, x.cantidad])).toEqual([['Camisa', 1]]);
  });

  it('una venta ya devuelta del todo no mueve el inventario', () => {
    const r = cantidadesADevolver([camisa, gorra], (l) => l.cantidad, null);
    expect(r).toHaveLength(0);
  });

  it('la devolución parcial toma solo las líneas de la nota, por código o por nombre', () => {
    const r = cantidadesADevolver([camisa, gorra], nada, [linea('Camisa', 2, 'A1'), linea('gorra', 1)]);
    expect(r.map((x) => [x.linea.nombre, x.cantidad])).toEqual([['Camisa', 2], ['Gorra', 1]]);
  });

  it('nunca devuelve más de lo que queda pendiente', () => {
    const r = cantidadesADevolver([camisa], (l) => (l.clave === 'p1' ? 3 : 0), [linea('Camisa', 4, 'A1')]);
    expect(r[0].cantidad).toBe(1);
  });

  it('ignora líneas de la nota que no están en la venta', () => {
    expect(cantidadesADevolver([camisa], nada, [linea('Zapatos', 1)])).toHaveLength(0);
  });

  it('avisa si la venta no se encontró', () => {
    expect(avisoDevolucionPorNota({ estado: 'sin_venta' })?.tipo).toBe('warning');
    expect(avisoDevolucionPorNota({ estado: 'no_aplica' })).toBeNull();
  });
});
