import { describe, it, expect } from 'vitest';
import { interpretarTrama, partirTramas, formatoPeso, tramaVisible } from './basculaWeb';

describe('interpretarTrama', () => {
  it('lee kilos con marca de estable y signo', () => {
    expect(interpretarTrama('ST,GS,+0001.250kg')).toBe(1.25);
    expect(interpretarTrama('US,GS,-0000.120kg')).toBe(-0.12);
  });
  it('lee formatos con prefijo y espacios', () => {
    expect(interpretarTrama('W   2.500 kg')).toBe(2.5);
    expect(interpretarTrama('\x02  0.875 KG\x03')).toBe(0.875);
  });
  it('convierte gramos y libras', () => {
    expect(interpretarTrama('  1250 g')).toBe(1.25);
    expect(interpretarTrama('2.2 lb')).toBeCloseTo(0.997903, 6);
  });
  it('usa la unidad configurada cuando la trama trae solo el número', () => {
    expect(interpretarTrama('  1.500')).toBe(1.5);
    expect(interpretarTrama('1500', 'g')).toBe(1.5);
    expect(interpretarTrama('1,75')).toBe(1.75);
  });
  it('ignora tramas sin peso', () => {
    expect(interpretarTrama('')).toBeNull();
    expect(interpretarTrama('OL')).toBeNull();
  });
});

describe('miligramos, gramos y kilos', () => {
  it('lee miligramos sin confundirlos con kilos', () => {
    expect(interpretarTrama('250 mg')).toBe(0.00025);
    expect(interpretarTrama('ST,GS,+0012mg')).toBe(0.000012);
  });
  it('lee "gr" y "grs" como gramos', () => {
    expect(interpretarTrama('  125 gr')).toBe(0.125);
    expect(interpretarTrama('NET 1500 grs')).toBe(1.5);
  });
  it('número solo en la unidad configurada, también miligramos', () => {
    expect(interpretarTrama('  750', 'mg')).toBe(0.00075);
  });
  it('un número con decimales siempre es kilos, aunque esté marcada en mg o g (caso Mega Can)', () => {
    expect(interpretarTrama('  0.485', 'mg')).toBe(0.485);
    expect(interpretarTrama('0,485', 'g')).toBe(0.485);
    expect(interpretarTrama('=584.0', 'mg')).toBe(0.485);
  });
  it('si hay número de báscula antes, toma el que trae unidad', () => {
    expect(interpretarTrama('N 001 W 1.250kg')).toBe(1.25);
  });
});

describe('formatos de indicadores comunes', () => {
  it('invertido (XK3190): "=05.2100" es 0012.50', () => {
    expect(interpretarTrama('=05.2100')).toBe(12.5);
    expect(interpretarTrama('=000.000')).toBe(0);
    expect(interpretarTrama('=0521', 'g')).toBe(1.25);
  });
  it('continuo de Toledo: estados + 6 dígitos sin punto (3 decimales, kg)', () => {
    // SWA 0x25 (bit 5 + punto 5 = XXX.XXX), SWB 0x30 (bit 5 + kg), SWC '0'
    expect(interpretarTrama('\x02%00001250000000')).toBe(1.25);
    // negativo: SWB 0x32 (bit 1 = signo)
    expect(interpretarTrama('\x02%20000500000000')).toBe(-0.5);
  });
});

describe('partirTramas', () => {
  it('separa por salto de línea, ETX, STX y por "="', () => {
    expect(partirTramas('ST,GS,+0001.250kg\r\nST,GS,+0001').tramas).toEqual(['ST,GS,+0001.250kg']);
    expect(partirTramas('=05.2100=05.2100=05.21').tramas).toEqual(['=05.2100', '=05.2100']);
    const { tramas, resto } = partirTramas('\x02%00001250000000\r\x02%000012');
    expect(tramas).toEqual(['\x02%00001250000000']);
    expect(resto).toBe('\x02%000012');
  });
  it('lo que llega se puede mostrar aunque traiga caracteres de control', () => {
    expect(tramaVisible('\x02%0000125\x03')).toBe('·%0000125·');
  });
});

describe('formatoPeso', () => {
  it('kilos desde 1 kg, gramos desde 1 g y miligramos por debajo', () => {
    expect(formatoPeso(1.25)).toBe('1,250 kg');
    expect(formatoPeso(0.125)).toBe('125 g');
    expect(formatoPeso(0.0125)).toBe('12,5 g');
    expect(formatoPeso(0.00025)).toBe('250 mg');
    expect(formatoPeso(0)).toBe('0 g');
  });
});
