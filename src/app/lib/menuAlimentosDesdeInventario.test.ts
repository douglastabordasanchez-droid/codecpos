import { describe, expect, it } from 'vitest';
import { iconoParaCategoria, rearmarMenuAlimentos } from './menuAlimentosDesdeInventario';

describe('rearmarMenuAlimentos', () => {
  const inventario = [
    { id: 'pprod-1790293580352', nombre: 'Champiñon', categoria: 'Hojaldres', color: '#633603', precio: 6000, costo: 2500, stock: 989, codigo: 'PAN-1' },
    { id: 'pprod-1', nombre: 'Croissant', categoria: 'Hojaldres', precio: 4500, costo: 2500, stock: 15, codigo: 'PAN-001' },
    { id: 'pprod-1790426216927', nombre: 'Tinto casero', categoria: 'Bebidas calientes', color: '#f97316', precio: 1500, costo: 500, stock: 921 },
    { id: 'MAN-1792084616892-714', nombre: 'prueba', categoria: 'Manuales', precio: 50 },
    { id: 'pprod-9', nombre: 'Inactivo', categoria: 'Postres', activo: false },
  ];

  it('solo toma productos creados en Alimentos y Bebidas', () => {
    const { productos } = rearmarMenuAlimentos(inventario);
    expect(productos.map((p) => p.nombre)).toEqual(['Tinto casero', 'Croissant', 'Champiñon']);
  });

  it('arma una categoría por nombre con ícono y color', () => {
    const { categorias, productos } = rearmarMenuAlimentos(inventario);
    expect(categorias).toEqual([
      { id: 'cat-bebidas-calientes', nombre: 'Bebidas calientes', icono: 'cafe', color: '#f97316' },
      { id: 'cat-hojaldres', nombre: 'Hojaldres', icono: 'pan', color: '#633603' },
    ]);
    expect(productos.find((p) => p.nombre === 'Croissant')).toMatchObject({ categoriaId: 'cat-hojaldres', color: '#633603', icono: 'pan', stock: 15 });
  });

  it('deduce íconos de los nombres de Boniexpress', () => {
    expect(['Desayunos', 'Gaseosas', 'Lacteos', 'Postres', 'Propios', 'Otra cosa'].map(iconoParaCategoria))
      .toEqual(['desayuno', 'gaseosa', 'vaso', 'postre', 'pan', 'general']);
  });
});
