import { describe, it, expect } from 'vitest';
import { construirCadenaCudeDocumentoEquivalente, calcularCudeDocumentoEquivalente } from './calcularCudeDocumentoEquivalente';

describe('calcularCudeDocumentoEquivalente', () => {
  // El Anexo Técnico de Documento Equivalente Electrónico v1.0 §14.1.3
  // declara la fórmula EXACTA como idéntica a la de notas de ajuste
  // (Software-PIN, no Clave Técnica) pero no publica un ejemplo numérico
  // propio con hash para el documento equivalente en sí — solo para la nota
  // de ajuste asociada (§14.1.5), que reutiliza los mismos valores que el
  // ejemplo de nota crédito del anexo de factura v1.9 §11.4.3. Se usa ese
  // mismo vector, ya verificado exacto en calcularCudeNota.test.ts, para
  // confirmar que esta función construye la cadena idéntica dado que la
  // fórmula publicada es la misma.
  it('reproduce la misma cadena y hash que el vector oficial verificado de nota crédito (misma fórmula, confirmado por el propio anexo)', async () => {
    const datos = {
      numeroDocumento: '8110007871',
      fecha: new Date(2019, 0, 12, 7, 0, 0),
      valorBruto: 5000,
      impuestos: [{ codigo: '01' as const, valor: 950 }],
      valorTotal: 5950,
      nitEmisor: '900373076',
      numeroAdquirente: '8355990',
      softwarePin: '12301',
      ambiente: 'produccion' as const,
    };
    const cadena = construirCadenaCudeDocumentoEquivalente(datos);
    expect(cadena).toBe('81100078712019-01-1207:00:00-05:005000.0001950.00040.00030.005950.009003730768355990123011');
    const cude = await calcularCudeDocumentoEquivalente(datos);
    expect(cude).toBe('907e4444decc9e59c160a2fb3b6659b33dc5b632a5008922b9a62f83f757b1c448e47f5867f2b50dbdb96f48c7681168');
    expect(cude).toHaveLength(96);
  });

  it('usa el número de documento (no el de la factura) como primer campo de la cadena', () => {
    const cadena = construirCadenaCudeDocumentoEquivalente({
      numeroDocumento: 'POS001',
      fecha: '2026-01-01T00:00:00-05:00',
      valorBruto: 1000,
      impuestos: [],
      valorTotal: 1000,
      nitEmisor: '900000000',
      numeroAdquirente: '222222222222',
      softwarePin: '1111',
      ambiente: 'habilitacion',
    });
    expect(cadena.startsWith('POS001')).toBe(true);
  });
});
