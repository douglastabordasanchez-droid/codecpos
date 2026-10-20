import { describe, it, expect, beforeEach } from 'vitest';
import { letraDeCaja, armarNumeroFactura, numeroVentaWeb, numeroVisibleVenta, prefijoDelNegocio, guardarCodigoCaja } from './numeracionCaja';

const almacen = new Map<string, string>();
beforeEach(() => {
  almacen.clear();
  (globalThis as any).localStorage = {
    getItem: (k: string) => almacen.get(k) ?? null,
    setItem: (k: string, v: string) => { almacen.set(k, v); },
    removeItem: (k: string) => { almacen.delete(k); },
  };
});

describe('numeración por caja', () => {
  it('da una letra distinta a cada caja y nunca la W de la web', () => {
    const letras = Array.from({ length: 60 }, (_, i) => letraDeCaja(i + 1));
    expect(letras.slice(0, 3)).toEqual(['A', 'B', 'C']);
    expect(new Set(letras).size).toBe(60);
    expect(letras.every((l) => !l.includes('W'))).toBe(true);
    expect(letraDeCaja(26)).toBe('AA');
  });

  it('arma números cortos que no se cruzan entre cajas', () => {
    guardarCodigoCaja(1);
    expect(armarNumeroFactura(5, 'FE')).toBe('FEA000005');
    guardarCodigoCaja(2);
    expect(armarNumeroFactura(5, 'FE')).toBe('FEB000005');
    expect(numeroVentaWeb(42)).toBe('W000042');
  });

  it('el prefijo automático viejo ya no se usa como prefijo', () => {
    almacen.set('codec_pos_prefijo_auto', '2S01');
    expect(prefijoDelNegocio('2S01')).toBe('FE');
    expect(prefijoDelNegocio('tda')).toBe('TDA');
    expect(prefijoDelNegocio('')).toBe('FE');
  });

  it('muestra el número que imprimió la caja o el de la web, nunca el identificador largo', () => {
    expect(numeroVisibleVenta({ local_id: 'FEA000123', numero: 9 })).toBe('FEA000123');
    expect(numeroVisibleVenta({ local_id: null, numero: 42, id: '7f1c2d3e-aaaa-bbbb-cccc-1234567890ab' })).toBe('W000042');
  });
});
