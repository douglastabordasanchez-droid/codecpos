import { describe, it, expect } from 'vitest';
import { interpretarTrama } from './basculaWeb';

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
    expect(interpretarTrama('2.2 lb')).toBe(0.998);
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
