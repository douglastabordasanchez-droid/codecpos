import { describe, expect, it } from 'vitest';
import { numeracionesPorVencer, textoAvisoNumeracion } from './avisoNumeracion';
import type { ResolucionDian } from './types';

const res = (prefijo: string, vigenciaHasta: string | undefined, estado: ResolucionDian['estado'] = 'activa'): ResolucionDian => ({
  id: prefijo, perfilFiscalId: 'p', clienteId: 'c', tipoDocumento: 'factura', prefijo, resolucionNumero: '1',
  rangoDesde: 1, rangoHasta: 10, consecutivoActual: 0, vigenciaHasta, estado,
});

describe('numeracionesPorVencer', () => {
  // 31 oct 2026, 10 a. m. en Colombia
  const ahora = new Date('2026-10-31T15:00:00Z');

  it('avisa desde 15 días antes, no antes', () => {
    expect(numeracionesPorVencer([res('DBM', '2026-11-15')], ahora).map((n) => n.diasRestantes)).toEqual([15]);
    expect(numeracionesPorVencer([res('DBM', '2026-11-16')], ahora)).toEqual([]);
  });

  it('incluye las ya vencidas y deja fuera las inactivas o sin fecha', () => {
    const lista = numeracionesPorVencer([res('A', '2026-10-30'), res('B', '2026-11-01', 'vencida'), res('C', undefined)], ahora);
    expect(lista.map((n) => [n.prefijo, n.diasRestantes])).toEqual([['A', -1]]);
  });

  it('cuenta por fecha de Colombia aunque en UTC ya sea el día siguiente', () => {
    // 31 oct 9 p. m. en Colombia = 1 nov 02:00 UTC
    expect(numeracionesPorVencer([res('DBM', '2026-11-15')], new Date('2026-11-01T02:00:00Z'))[0].diasRestantes).toBe(15);
  });

  it('arma el texto', () => {
    expect(textoAvisoNumeracion({ prefijo: 'DBM', vigenciaHasta: '2026-11-15', diasRestantes: 15 })).toContain('vence el 15 de noviembre de 2026 (en 15 días)');
    expect(textoAvisoNumeracion({ prefijo: 'DBM', vigenciaHasta: '2026-11-15', diasRestantes: 1 })).toContain('(mañana)');
    expect(textoAvisoNumeracion({ prefijo: 'DBM', vigenciaHasta: '2026-11-15', diasRestantes: -2 })).toContain('venció');
  });
});
