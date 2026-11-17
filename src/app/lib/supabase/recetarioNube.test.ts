import { describe, it, expect, vi } from 'vitest';

vi.mock('./config', () => ({ getSupabaseClient: () => null }));
vi.mock('./tenantLink', () => ({ getLinkedClienteId: () => null }));
vi.mock('./terminalPrincipalService', () => ({ idEsteEquipo: () => 'eq' }));

import { mezclar, type DocRecetario } from './recetarioNube';

const vacio = (): DocRecetario => ({ ingredientes: [], recetas: [], lineas: [], combos: [], eliminados: [] });

describe('mezclar recetario', () => {
  it('une el ingrediente local con el de la nube del mismo nombre y toma el stock ajustado más nuevo', () => {
    const local = { ...vacio(), ingredientes: [{ id: 'L1', nombre: 'huevo', unidad: 'g', stockActual: 0, updatedAt: 1 }],
      lineas: [{ id: 'x', recipeId: 'R0', ingredientId: 'L1', cantidad: 1, unidad: 'und' }] };
    const nube = { ...vacio(), ingredientes: [{ id: 'N1', nombre: 'Huevo', unidad: 'und', stockActual: 300, updatedAt: 10, stockAjustadoEn: 10 }] };
    const { doc, soloLocal } = mezclar(nube, local, 'union');
    expect(doc.ingredientes).toHaveLength(1);
    expect(doc.ingredientes[0]).toMatchObject({ id: 'N1', unidad: 'und', stockActual: 300 });
    expect(doc.lineas[0].ingredientId).toBe('N1');
    expect(soloLocal).toBe(true);
  });

  it('el stock que bajaron las ventas no se pisa si la nube no tiene un ajuste más nuevo', () => {
    const local = { ...vacio(), ingredientes: [{ id: 'A', nombre: 'Arroz', unidad: 'g', stockActual: 7000, updatedAt: 5, stockAjustadoEn: 5 }] };
    const nube = { ...vacio(), ingredientes: [{ id: 'A', nombre: 'Arroz', unidad: 'g', stockActual: 10000, updatedAt: 5, stockAjustadoEn: 5 }] };
    expect(mezclar(nube, local, 'nube').doc.ingredientes[0].stockActual).toBe(7000);
  });

  it('los borrados quitan el ingrediente y gana el lado indicado en recetas', () => {
    const local = { ...vacio(), ingredientes: [{ id: 'A', nombre: 'Arroz' }, { id: 'B', nombre: 'Sal' }], recetas: [{ id: 'RL' }] };
    const nube = { ...vacio(), ingredientes: [{ id: 'A', nombre: 'Arroz' }], recetas: [{ id: 'RN' }], eliminados: ['B'] };
    const r = mezclar(nube, local, 'nube');
    expect(r.doc.ingredientes.map((i) => i.id)).toEqual(['A']);
    expect(r.doc.recetas.map((x) => x.id)).toEqual(['RN']);
    expect(mezclar(nube, local, 'union').doc.recetas.map((x) => x.id)).toEqual(['RN', 'RL']);
    expect(mezclar(nube, local, 'local').doc.recetas.map((x) => x.id)).toEqual(['RL']);
  });
});
