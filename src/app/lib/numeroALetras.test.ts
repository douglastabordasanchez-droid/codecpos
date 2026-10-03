import { describe, it, expect } from 'vitest';
import { valorEnLetras } from './numeroALetras';

describe('valor en letras', () => {
  it.each([
    [468000, 'Cuatrocientos sesenta y ocho mil pesos m/cte'],
    [0, 'Cero pesos m/cte'],
    [1, 'Un pesos m/cte'],
    [21, 'Veintiún pesos m/cte'],
    [100, 'Cien pesos m/cte'],
    [101, 'Ciento un pesos m/cte'],
    [1000, 'Mil pesos m/cte'],
    [1500, 'Mil quinientos pesos m/cte'],
    [21000, 'Veintiún mil pesos m/cte'],
    [31000, 'Treinta y un mil pesos m/cte'],
    [100000, 'Cien mil pesos m/cte'],
    [549890, 'Quinientos cuarenta y nueve mil ochocientos noventa pesos m/cte'],
    [1000000, 'Un millón de pesos m/cte'],
    [2000000, 'Dos millones de pesos m/cte'],
    [1250300, 'Un millón doscientos cincuenta mil trescientos pesos m/cte'],
    [21000000, 'Veintiún millones de pesos m/cte'],
    [15990.5, 'Quince mil novecientos noventa pesos con 50/100 m/cte'],
  ])('%s', (n, esperado) => {
    expect(valorEnLetras(n)).toBe(esperado);
  });
});
