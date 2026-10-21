/**
 * Rearma el menú de Alimentos y Bebidas (categorías con ícono y color +
 * productos del POS táctil) a partir del inventario general.
 *
 * El menú vive en localStorage (`codecpos_panaderia_cats` y
 * `codecpos_panaderia_prods`) y ningún respaldo lo guardaba: cuando un equipo
 * se vaciaba y se restauraba, el inventario volvía pero Alimentos y Bebidas
 * quedaba en blanco (Boniexpress, 21 oct 2026). Los productos creados desde
 * ese módulo llevan id `pprod-…` y conservan su categoría y color en el
 * inventario; el ícono no se guardaba, así que se deduce del nombre de la
 * categoría.
 */

export interface CategoriaMenuAlimentos { id: string; nombre: string; icono: string; color: string }
export interface ProductoMenuAlimentos {
  id: string; categoriaId: string; nombre: string; precio: number; costo: number; stock: number;
  icono: string; color: string; codigo: string; tipoInventario?: 'directo' | 'receta'; recipeId?: string;
}

const COLOR_POR_DEFECTO = '#2563eb';

const ICONOS_POR_PALABRA: Array<[RegExp, string]> = [
  [/caf[eé]|tinto|caliente|arom[aá]tica/i, 'cafe'],
  [/gaseosa|refresco|soda/i, 'gaseosa'],
  [/jugo|bebida/i, 'jugo'],
  [/l[aá]cteo|leche|yogur|kumis/i, 'vaso'],
  [/postre|dulce|torta|pastel/i, 'postre'],
  [/desayuno/i, 'desayuno'],
  [/hojaldre|pan|propio|panader[ií]a|horneado|arepa/i, 'pan'],
  [/pizza/i, 'pizza'],
  [/hamburguesa/i, 'hamburguesa'],
  [/helado/i, 'helado'],
  [/cerveza|licor/i, 'cerveza'],
  [/sopa|caldo/i, 'sopa'],
  [/pollo/i, 'pollo'],
  [/carne/i, 'carne'],
];

export function iconoParaCategoria(nombre: string): string {
  return ICONOS_POR_PALABRA.find(([patron]) => patron.test(nombre))?.[1] ?? 'general';
}

function idCategoria(nombre: string): string {
  const base = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `cat-${base || 'general'}`;
}

/** Color más repetido entre los productos de la categoría (los vacíos no cuentan). */
function colorDominante(colores: string[]): string {
  const cuenta = new Map<string, number>();
  for (const c of colores) if (c) cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
  let mejor = COLOR_POR_DEFECTO;
  let maximo = 0;
  for (const [c, n] of cuenta) if (n > maximo) { mejor = c; maximo = n; }
  return mejor;
}

export function rearmarMenuAlimentos(inventario: any[]): { categorias: CategoriaMenuAlimentos[]; productos: ProductoMenuAlimentos[] } {
  const delMenu = (inventario || []).filter((p) => p && String(p.id).startsWith('pprod-') && p.activo !== false);
  const porCategoria = new Map<string, any[]>();
  for (const p of delMenu) {
    const nombre = String(p.categoria || '').trim() || 'Alimentos y Bebidas';
    if (!porCategoria.has(nombre)) porCategoria.set(nombre, []);
    porCategoria.get(nombre)!.push(p);
  }

  const categorias: CategoriaMenuAlimentos[] = [];
  const productos: ProductoMenuAlimentos[] = [];
  for (const [nombre, lista] of [...porCategoria].sort(([a], [b]) => a.localeCompare(b, 'es'))) {
    const categoria = { id: idCategoria(nombre), nombre, icono: iconoParaCategoria(nombre), color: colorDominante(lista.map((p) => p.color)) };
    categorias.push(categoria);
    // Orden de creación: el id lleva la hora en que se creó el producto.
    const ordenados = [...lista].sort((a, b) => (Number(String(a.id).slice(6)) || 0) - (Number(String(b.id).slice(6)) || 0));
    for (const p of ordenados) {
      productos.push({
        id: String(p.id), categoriaId: categoria.id, nombre: p.nombre,
        precio: Number(p.precio) || 0, costo: Number(p.costo) || 0, stock: Number(p.stock) || 0,
        icono: categoria.icono, color: p.color || categoria.color, codigo: p.codigo || '',
        ...(p.tipoInventario ? { tipoInventario: p.tipoInventario } : {}),
        ...(p.recipeId ? { recipeId: p.recipeId } : {}),
      });
    }
  }
  return { categorias, productos };
}
