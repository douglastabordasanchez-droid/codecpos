import { describe, it, expect } from 'vitest';
import { calcularCufe, construirCadenaCufe, NUMERO_DOCUMENTO_CONSUMIDOR_FINAL } from './index';
import type { DatosCufe } from './cufeCalculator';

function datosBase(overrides: Partial<DatosCufe> = {}): DatosCufe {
  return {
    numeroFactura: 'SETP990000001',
    fecha: new Date(2026, 0, 15, 14, 30, 0), // 15-ene-2026 14:30:00 hora local
    valorBruto: 100000,
    impuestos: [{ codigo: '01', valor: 19000 }],
    valorTotal: 119000,
    nitEmisor: '900123456',
    numeroAdquirente: '1234567890',
    claveTecnica: 'abc123clavetecnica',
    ambiente: 'habilitacion',
    ...overrides,
  };
}

describe('construirCadenaCufe', () => {
  it('concatena los campos en el orden exacto del Anexo Técnico v1.9', () => {
    const cadena = construirCadenaCufe(datosBase());
    // NumFac + FecFac + HorFac + ValFac + CodImp1 + ValImp1 + CodImp2 + ValImp2 + CodImp3 + ValImp3 + ValTot + NitOFE + NumAdq + ClTec + TipoAmb
    expect(cadena).toBe(
      'SETP990000001' +
      '2026-01-15' +
      '14:30:00-05:00' +
      '100000.00' +
      '01' + '19000.00' +
      '04' + '0.00' +
      '03' + '0.00' +
      '119000.00' +
      '900123456' +
      '1234567890' +
      'abc123clavetecnica' +
      '2' // habilitación
    );
  });

  it('usa TipoAmb=1 en producción y =2 en habilitación', () => {
    const prod = construirCadenaCufe(datosBase({ ambiente: 'produccion' }));
    const hab = construirCadenaCufe(datosBase({ ambiente: 'habilitacion' }));
    expect(prod.endsWith('1')).toBe(true);
    expect(hab.endsWith('2')).toBe(true);
  });

  it('usa 222222222222 como NumAdq para consumidor final', () => {
    const cadena = construirCadenaCufe(datosBase({ numeroAdquirente: NUMERO_DOCUMENTO_CONSUMIDOR_FINAL }));
    expect(cadena).toContain('222222222222');
  });

  it('suma impuestos repetidos del mismo código antes de formatear', () => {
    const cadena = construirCadenaCufe(
      datosBase({ impuestos: [{ codigo: '01', valor: 10000 }, { codigo: '01', valor: 5000 }] })
    );
    // CodImp1 '01' + ValImp1 '15000.00' (10000 + 5000 sumados), concatenado sin separador
    expect(cadena).toContain('0115000.00');
  });

  it('rellena a 0.00 los impuestos que no aplican', () => {
    const cadena = construirCadenaCufe(datosBase({ impuestos: [] }));
    expect(cadena).toContain('010.00' + '040.00' + '030.00');
  });
});

describe('calcularCufe', () => {
  it('produce una cadena hexadecimal en minúsculas de 96 caracteres (SHA-384)', async () => {
    const cufe = await calcularCufe(datosBase());
    expect(cufe).toMatch(/^[0-9a-f]{96}$/);
  });

  it('es determinístico: mismos datos → mismo CUFE', async () => {
    const a = await calcularCufe(datosBase());
    const b = await calcularCufe(datosBase());
    expect(a).toBe(b);
  });

  it('cualquier cambio en los datos cambia el CUFE (efecto avalancha)', async () => {
    const base = await calcularCufe(datosBase());
    const conOtroTotal = await calcularCufe(datosBase({ valorTotal: 119001 }));
    expect(conOtroTotal).not.toBe(base);
  });

  it('produce CUFE distinto para producción vs habilitación con los mismos datos', async () => {
    const prod = await calcularCufe(datosBase({ ambiente: 'produccion' }));
    const hab = await calcularCufe(datosBase({ ambiente: 'habilitacion' }));
    expect(prod).not.toBe(hab);
  });

  // Venta con IVA + INC + ICA simultáneos (los tres códigos de impuesto)
  it('calcula correctamente con los tres tipos de impuesto a la vez', async () => {
    const cufe = await calcularCufe(
      datosBase({
        impuestos: [
          { codigo: '01', valor: 19000 },
          { codigo: '04', valor: 8000 },
          { codigo: '03', valor: 1000 },
        ],
      })
    );
    expect(cufe).toMatch(/^[0-9a-f]{96}$/);
  });

  // Venta sin ningún impuesto (todos en 0.00)
  it('calcula correctamente una venta exenta de impuestos', async () => {
    const cufe = await calcularCufe(datosBase({ impuestos: [], valorTotal: 100000 }));
    expect(cufe).toMatch(/^[0-9a-f]{96}$/);
  });
});
