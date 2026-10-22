import { describe, expect, it } from 'vitest';
import { calcularRetenciones } from './retenciones';

const config = {
  retefuenteActiva: true,
  retefuentePorcentaje: 2.5,
  retefuenteBaseMinima: 100000,
  reteicaActiva: true,
  reteicaTarifaPorMil: 11.04,
  reteicaBaseMinima: 0,
};
const agente = { agenteRetencionFuente: true, agenteRetencionIca: true };

describe('calcularRetenciones', () => {
  it('retiene fuente e ICA sobre la base antes de impuestos', () => {
    const r = calcularRetenciones(config, agente, 253529.41);
    expect(r).toEqual([
      { codigo: '06', porcentaje: 2.5, base: 253529.41, valor: 6338.24 },
      { codigo: '07', porcentaje: 1.104, base: 253529.41, valor: 2798.96 },
    ]);
  });

  it('no retiene a quien no es agente de retención', () => {
    expect(calcularRetenciones(config, { agenteRetencionFuente: false, agenteRetencionIca: false }, 500000)).toEqual([]);
    expect(calcularRetenciones(config, null, 500000)).toEqual([]);
  });

  it('respeta la base mínima de cada retención', () => {
    const r = calcularRetenciones(config, agente, 50000);
    expect(r.map((x) => x.codigo)).toEqual(['07']);
  });

  it('no retiene si el negocio no activó la retención', () => {
    expect(calcularRetenciones({ ...config, retefuenteActiva: false, reteicaActiva: false }, agente, 500000)).toEqual([]);
  });
});
