/**
 * Recetario en Excel para Alimentos y Bebidas (ingredientes y recetas).
 *
 * Hoja «Ingredientes»: Nombre, Unidad (g, ml, und), Costo por unidad, Stock actual, Stock mínimo, Categoría.
 * Hoja «Recetas»: Producto (nombre o código del menú), Ingrediente, Cantidad, Unidad.
 *
 * Al importar: los ingredientes se crean o actualizan por nombre; cada
 * producto con filas en «Recetas» queda con su receta y pasa a descontar
 * ingredientes al venderse (tipo de inventario «receta»). Los ingredientes
 * y recetas se guardan en este equipo, como los que se crean a mano.
 */
import * as XLSX from 'xlsx';
import type { IngredienteInventarioItem, RecetaItem, RecetaIngredienteItem } from './electronStore';

const clave = (t: unknown) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const num = (v: unknown) => {
  if (typeof v === 'number') return v;
  const n = Number(String(v ?? '').replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

function filasDe(libro: XLSX.WorkBook, nombreHoja: string): Record<string, unknown>[] {
  const hoja = libro.SheetNames.find((n) => clave(n) === clave(nombreHoja));
  if (!hoja) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(libro.Sheets[hoja], { defval: '' }).map((f) =>
    Object.fromEntries(Object.entries(f).map(([k, v]) => [clave(k), v])));
}

export interface ResultadoRecetario {
  ingredientes: IngredienteInventarioItem[];
  recetas: RecetaItem[];
  lineas: RecetaIngredienteItem[];
  /** id de producto → id de receta, para marcarlos como «receta». */
  productosConReceta: Map<string, string>;
  ingredientesNuevos: number;
  recetasNuevas: number;
  productosNoEncontrados: string[];
}

export async function planearRecetario(
  archivo: File,
  productos: Array<{ id: string; nombre: string; codigo?: string }>,
  ingredientesActuales: IngredienteInventarioItem[],
  recetasActuales: RecetaItem[],
  lineasActuales: RecetaIngredienteItem[],
): Promise<ResultadoRecetario> {
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
  const marca = Date.now();

  // ── Ingredientes
  const ingredientes = [...ingredientesActuales];
  const porNombre = new Map(ingredientes.map((i) => [clave(i.nombre), i]));
  let ingredientesNuevos = 0;
  const asegurarIngrediente = (nombre: string, unidad: string, datos?: Partial<IngredienteInventarioItem>) => {
    const k = clave(nombre);
    const existente = porNombre.get(k);
    if (existente) {
      if (datos) Object.assign(existente, Object.fromEntries(Object.entries(datos).filter(([, v]) => v !== undefined)), { updatedAt: Date.now() });
      return existente;
    }
    const nuevo: IngredienteInventarioItem = {
      id: `ING-${marca}-${ingredientes.length}`, nombre: nombre.trim(), unidad: unidad || 'und',
      stockActual: 0, stockMinimo: 0, costoUnitario: 0, categoria: 'General', activo: true,
      moduloOrigen: 'panaderia_onces', updatedAt: Date.now(), ...datos,
    };
    ingredientes.push(nuevo);
    porNombre.set(k, nuevo);
    ingredientesNuevos++;
    return nuevo;
  };
  for (const f of filasDe(libro, 'Ingredientes')) {
    const nombre = String(f['nombre'] || '').trim();
    if (!nombre) continue;
    asegurarIngrediente(nombre, String(f['unidad'] || 'und').trim(), {
      unidad: String(f['unidad'] || 'und').trim() || 'und',
      costoUnitario: num(f['costo por unidad']),
      stockActual: num(f['stock actual']),
      stockMinimo: num(f['stock minimo']),
      stockAjustadoEn: Date.now(),
      categoria: String(f['categoria'] || 'General').trim() || 'General',
    });
  }

  // ── Recetas
  const porProducto = new Map<string, { id: string; nombre: string }>();
  for (const p of productos) {
    porProducto.set(clave(p.nombre), p);
    if (p.codigo) porProducto.set(clave(p.codigo), p);
  }
  const lineasPorProducto = new Map<string, Array<{ ing: IngredienteInventarioItem; cantidad: number; unidad: string }>>();
  const noEncontrados = new Set<string>();
  for (const f of filasDe(libro, 'Recetas')) {
    const nombreProducto = String(f['producto'] || '').trim();
    const nombreIng = String(f['ingrediente'] || '').trim();
    const cantidad = num(f['cantidad']);
    if (!nombreProducto || !nombreIng || cantidad <= 0) continue;
    const producto = porProducto.get(clave(nombreProducto));
    if (!producto) { noEncontrados.add(nombreProducto); continue; }
    const unidad = String(f['unidad'] || '').trim() || 'und';
    const ing = asegurarIngrediente(nombreIng, unidad);
    const lista = lineasPorProducto.get(producto.id) || [];
    lista.push({ ing, cantidad, unidad });
    lineasPorProducto.set(producto.id, lista);
  }

  // Cada producto del archivo reemplaza su receta anterior.
  const recetas = recetasActuales.filter((r) => !lineasPorProducto.has(r.productoId));
  const idsQuitados = new Set(recetasActuales.filter((r) => lineasPorProducto.has(r.productoId)).map((r) => r.id));
  const lineas = lineasActuales.filter((l) => !idsQuitados.has(l.recipeId));
  const productosConReceta = new Map<string, string>();
  let i = 0;
  for (const [productoId, items] of lineasPorProducto) {
    const producto = productos.find((p) => p.id === productoId)!;
    const recipeId = `REC-${marca}-${i++}`;
    recetas.push({ id: recipeId, nombre: `Receta ${producto.nombre}`, productoId, rendimiento: 1, activa: true, updatedAt: Date.now() });
    items.forEach((it, j) => lineas.push({ id: `RI-${marca}-${i}-${j}`, recipeId, ingredientId: it.ing.id, cantidad: it.cantidad, unidad: it.unidad }));
    productosConReceta.set(productoId, recipeId);
  }

  return {
    ingredientes, recetas, lineas, productosConReceta, ingredientesNuevos,
    recetasNuevas: lineasPorProducto.size, productosNoEncontrados: [...noEncontrados],
  };
}

/** Plantilla vacía del recetario (con dos filas de ejemplo). */
export function descargarPlantillaRecetario(): void {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
    ['Nombre', 'Unidad', 'Costo por unidad', 'Stock actual', 'Stock mínimo', 'Categoría'],
    ['Papa a la francesa', 'g', 12, 5000, 1000, 'Verduras'],
    ['Salchicha americana', 'und', 900, 100, 20, 'Cárnicos'],
  ]), 'Ingredientes');
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
    ['Producto', 'Ingrediente', 'Cantidad', 'Unidad'],
    ['SALCHIPAPA SENCILLA', 'Papa a la francesa', 200, 'g'],
    ['SALCHIPAPA SENCILLA', 'Salchicha americana', 1, 'und'],
  ]), 'Recetas');
  XLSX.writeFile(libro, 'Plantilla recetario.xlsx');
}
