import { describe, expect, it } from 'vitest';
import { emojiParaProducto } from './imagenProducto';

describe('emojiParaProducto en papelería y piñatería', () => {
  it.each([
    ['Cuaderno cuadriculado 100 hojas Norma', '📓'],
    ['Lápiz negro Mirado N.º 2', '✏️'],
    ['Esfero Kilométrico azul', '🖊️'],
    ['Lapicero gel negro', '🖊️'],
    ['Colores Prismacolor x 12', '🖍️'],
    ['Globo metalizado número 5', '🎈'],
    ['Piñata Spiderman', '🪅'],
    ['Vela de cumpleaños número 3', '🕯️'],
    ['Papel seda azul', '📄'],
    ['Fotocopia blanco y negro', '🖨️'],
    ['Tijeras punta roma', '✂️'],
    ['Colbón 115 g', '🧴'],
    ['Marcador borrable negro', '🖋️'],
  ])('%s → %s', (nombre, emoji) => {
    expect(emojiParaProducto(nombre)).toBe(emoji);
  });
  it('la comida sigue igual', () => {
    expect(emojiParaProducto('Café con leche')).toBe('☕');
    expect(emojiParaProducto('Empanada de pollo')).toBe('🥟');
    expect(emojiParaProducto('Sobrebarriga')).toBe('🥩');
  });
  it('sin coincidencia usa el que se indique', () => {
    expect(emojiParaProducto('Producto raro XYZ', undefined, '🛍️')).toBe('🛍️');
  });
});
