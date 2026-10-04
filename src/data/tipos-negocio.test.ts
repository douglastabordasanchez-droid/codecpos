import { describe, it, expect } from 'vitest';
import { normalizarTipoNegocio } from './tipos-negocio';

describe('tipo de negocio', () => {
  it('convierte nombres y alias al código', () => {
    expect(normalizarTipoNegocio('Tienda de Ropa')).toBe('ropa');
    expect(normalizarTipoNegocio('Juguetería')).toBe('jugueteria');
    expect(normalizarTipoNegocio('Restaurante / Comidas Rápidas')).toBe('restaurante');
    expect(normalizarTipoNegocio('restaurante')).toBe('restaurante');
    expect(normalizarTipoNegocio('Licorería')).toBe('licores');
    expect(normalizarTipoNegocio('retail')).toBe('minimercado');
    expect(normalizarTipoNegocio(null)).toBe('minimercado');
  });
});
