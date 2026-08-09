import { describe, it, expect } from 'vitest';
import { construirCadenaCudeNota, calcularCudeNota } from './calcularCudeNota';

describe('calcularCudeNota', () => {
  it('reproduce EXACTO el ejemplo oficial de nota crédito del Anexo Técnico v1.9 §11.4.3', async () => {
    // Vector de prueba oficial (dian.gov.co, Anexo-Tecnico-Factura-Electronica-de-Venta-vr-1-9.pdf, página 665):
    // NumFac=8110007871 FecFac=2019-01-12 HorFac=07:00:00-05:00 ValFac=5000.00
    // 01=950.00 04=0.00 03=0.00 ValTot=5950.00 NitOFE=900373076 NumAdq=8355990
    // Software-PIN=12301 TipoAmbiente=1 (producción)
    const datos = {
      numeroNota: '8110007871',
      fecha: new Date(2019, 0, 12, 7, 0, 0),
      valorBruto: 5000,
      impuestos: [{ codigo: '01' as const, valor: 950 }],
      valorTotal: 5950,
      nitEmisor: '900373076',
      numeroAdquirente: '8355990',
      softwarePin: '12301',
      ambiente: 'produccion' as const,
    };
    const cadena = construirCadenaCudeNota(datos);
    expect(cadena).toBe('81100078712019-01-1207:00:00-05:005000.0001950.00040.00030.005950.009003730768355990123011');
    const cude = await calcularCudeNota(datos);
    expect(cude).toBe('907e4444decc9e59c160a2fb3b6659b33dc5b632a5008922b9a62f83f757b1c448e47f5867f2b50dbdb96f48c7681168');
    expect(cude).toHaveLength(96);
  });

  // NOTA: el ejemplo de nota débito del mismo anexo (§11.4.5, página 668) tiene
  // un hash de referencia que NO coincide con su propia cadena de entrada
  // publicada — verificado de forma independiente con openssl y Node crypto
  // sobre la cadena exacta que publica el PDF (sin diferencias de codificación
  // ni caracteres invisibles). Es un error de transcripción del documento
  // oficial, no de esta implementación — la fórmula ya está confirmada por el
  // ejemplo de nota crédito de arriba, que sí coincide exacto.
  it('nota débito: la fórmula reproduce la cadena de entrada oficial (el hash publicado en el anexo no coincide con esa cadena — error del propio documento DIAN, no de esta función)', () => {
    const datos = {
      numeroNota: 'ND1001',
      fecha: new Date(2019, 0, 18, 10, 58, 0),
      valorBruto: 30000,
      impuestos: [{ codigo: '04' as const, valor: 2400 }],
      valorTotal: 32400,
      nitEmisor: '900197264',
      numeroAdquirente: '10254102',
      softwarePin: '10201',
      ambiente: 'habilitacion' as const,
    };
    const cadena = construirCadenaCudeNota(datos);
    expect(cadena).toBe('ND10012019-01-1810:58:00-05:0030000.00010.00042400.00030.0032400.0090019726410254102102012');
  });

  it('impuestos ausentes se representan como 0.00, no se omiten', async () => {
    const cadena = construirCadenaCudeNota({
      numeroNota: 'NC000001',
      fecha: '2026-01-01T00:00:00-05:00',
      valorBruto: 1000,
      impuestos: [],
      valorTotal: 1000,
      nitEmisor: '900000000',
      numeroAdquirente: '222222222222',
      softwarePin: '1111',
      ambiente: 'habilitacion',
    });
    expect(cadena).toContain('010.00040.00030.00');
  });
});
