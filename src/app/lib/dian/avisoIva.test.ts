import { it, expect } from 'vitest';
import { avisoProductosSinIva } from './configIva';
it('aviso IVA', () => {
  const c = { habilitado: true, todosLosProductos: true, porcentaje: 19 };
  expect(avisoProductosSinIva(c, [])).toBeNull();
  expect(avisoProductosSinIva({ ...c, todosLosProductos: false }, ['A'])).toBeNull();
  expect(avisoProductosSinIva(c, ['Flativet'])).toMatch(/^Este producto tiene IVA 0 % en su ficha: Flativet\. .* se le cobra el 19 %/);
  expect(avisoProductosSinIva(c, ['A', 'B', 'C', 'D', 'D'])).toMatch(/Estos productos tienen .*: A, B, C y 1 más/);
});
