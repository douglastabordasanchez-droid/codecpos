import { describe, expect, it } from 'vitest';
import { avisoTurnoMedianoche, formatoDuracion, tramoDiaSiguiente } from './turnoMedianoche';

describe('turnos que pasan de medianoche', () => {
  it('turno del mismo día: sin aviso', () => {
    expect(avisoTurnoMedianoche(new Date(2026, 9, 24, 15, 47), new Date(2026, 9, 24, 23, 50))).toBe('');
  });

  it('cierre a las 12:35 a. m.: 35 min del día siguiente', () => {
    const t = tramoDiaSiguiente(new Date(2026, 9, 23, 15, 47), new Date(2026, 9, 24, 0, 35));
    expect(t.cruza).toBe(true);
    expect(t.duracion).toBe('35 min');
    expect(avisoTurnoMedianoche(new Date(2026, 9, 23, 15, 47), new Date(2026, 9, 24, 0, 35)))
      .toBe('Turno del 23 oct: tomó 35 min del 24 oct (cerró a las 12:35 a. m.)');
  });

  it('duraciones de más de una hora', () => {
    expect(formatoDuracion(70)).toBe('1 h 10 min');
    expect(formatoDuracion(120)).toBe('2 h');
  });

  it('fechas vacías o al revés: sin aviso', () => {
    expect(avisoTurnoMedianoche(null, new Date())).toBe('');
    expect(avisoTurnoMedianoche(new Date(2026, 9, 24, 1), new Date(2026, 9, 23, 22))).toBe('');
  });
});
