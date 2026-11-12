import { describe, expect, it } from 'vitest';
import { claveEmpleado, filtrarPorEmpleado, resumirPorEmpleado, SIN_CAJERO } from './ventasPorEmpleado';

const ventas = [
  { cajero_nombre: 'Diana Pérez', total: 50000, propina: 5000 },
  { cajero_nombre: 'Michell ', total: 20000, propina: 0 },
  { cajero_nombre: 'michell', total: 10000 },
  { cajero_nombre: null, total: 3000 },
  { cajero_nombre: 'Diana  Pérez', total: 11000, propina: 1000 },
];

describe('ventas por empleado', () => {
  it('une el mismo nombre con espacios o mayúsculas distintas', () => {
    expect(claveEmpleado('Michell ')).toBe(claveEmpleado('michell'));
    expect(claveEmpleado('  ')).toBe(SIN_CAJERO);
  });

  it('suma cada empleado sin la propina y ordena de mayor a menor', () => {
    const r = resumirPorEmpleado(ventas);
    expect(r.map((x) => [x.nombre, x.cantidad, x.total, x.propinas])).toEqual([
      ['Diana Pérez', 2, 55000, 6000],
      ['Michell', 2, 30000, 0],
      ['Sin cajero', 1, 3000, 0],
    ]);
  });

  it('filtra las ventas de un solo empleado', () => {
    expect(filtrarPorEmpleado(ventas, claveEmpleado('MICHELL'))).toHaveLength(2);
    expect(filtrarPorEmpleado(ventas, null)).toHaveLength(5);
  });
});
