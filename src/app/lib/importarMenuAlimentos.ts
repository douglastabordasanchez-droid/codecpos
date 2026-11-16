/**
 * Excel del menú de Alimentos y Bebidas, con la MISMA plantilla de
 * Inventario › Importar (importarProductos.ts): Código, Nombre, Categoría,
 * Precio de venta, Costo, Stock… y Descripción para los ingredientes.
 *
 * Al importar, el sistema reconoce solo lo que es nuevo:
 *  • un producto que ya existe (mismo código, o mismo nombre en la misma
 *    categoría) se actualiza en vez de duplicarse;
 *  • una categoría nueva recibe un emoji y un color según su nombre
 *    (estiloMenu.ts) y sus productos toman el mismo color.
 */
import * as XLSX from 'xlsx';
import { COLUMNAS, descargarPlantilla, leerArchivoProductos } from './importarProductos';
import { estiloCategoria } from './estiloMenu';

export interface CategoriaMenu { id: string; nombre: string; icono: string; color: string }
export interface ProductoMenu {
  id: string; categoriaId: string; nombre: string; precio: number; costo: number; stock: number;
  icono: string; color: string; codigo: string; descripcion?: string;
  tipoInventario?: 'directo' | 'receta'; recipeId?: string;
}

export interface PlanImportacionMenu {
  categorias: CategoriaMenu[];
  productos: ProductoMenu[];
  categoriasNuevas: string[];
  nuevos: number;
  actualizados: number;
  sinCambios: number;
  omitidas: Array<{ fila: number; motivo: string }>;
}

function clave(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Plantilla vacía (la misma de Inventario). */
export function descargarPlantillaMenu(nombreNegocio?: string): void {
  descargarPlantilla(nombreNegocio);
}

/** El menú actual en la plantilla, listo para editar en Excel y volver a subir. */
export function exportarMenuExcel(categorias: CategoriaMenu[], productos: ProductoMenu[], nombreNegocio?: string): void {
  const nombreCat = new Map(categorias.map((c) => [c.id, c.nombre]));
  const orden = new Map(categorias.map((c, i) => [c.id, i]));
  const filas = [...productos]
    .sort((a, b) => (orden.get(a.categoriaId) ?? 999) - (orden.get(b.categoriaId) ?? 999))
    .map((p) => COLUMNAS.map((col) => {
      switch (col.campo) {
        case 'codigo_barras': return p.codigo || '';
        case 'nombre': return p.nombre;
        case 'categoria': return nombreCat.get(p.categoriaId) || '';
        case 'precio_venta': return Number(p.precio) || 0;
        case 'costo': return Number(p.costo) || 0;
        case 'stock': return Number(p.stock) || 0;
        case 'unidad': return 'unidad';
        case 'descripcion': return p.descripcion || '';
        default: return '';
      }
    }));
  const hoja = XLSX.utils.aoa_to_sheet([COLUMNAS.map((c) => c.encabezado + (c.obligatoria ? ' *' : '')), ...filas]);
  hoja['!cols'] = COLUMNAS.map((c) => ({ wch: c.campo === 'nombre' ? 38 : c.campo === 'descripcion' ? 70 : Math.max(12, c.encabezado.length + 4) }));
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Productos');
  XLSX.writeFile(libro, `Menu${nombreNegocio ? ` ${nombreNegocio}` : ''}.xlsx`.replace(/[\\/:*?"<>|]+/g, ''));
}

/**
 * Lee el Excel y calcula cómo queda el menú, SIN guardar nada todavía
 * (la pantalla muestra el resumen y pide confirmar).
 */
export async function planearImportacionMenu(
  archivo: File,
  categoriasActuales: CategoriaMenu[],
  productosActuales: ProductoMenu[],
): Promise<PlanImportacionMenu> {
  const leido = await leerArchivoProductos(archivo);
  const categorias = [...categoriasActuales];
  const productos = [...productosActuales];
  const categoriasNuevas: string[] = [];
  const omitidas: PlanImportacionMenu['omitidas'] = [];
  let nuevos = 0; let actualizados = 0; let sinCambios = 0;
  const marca = Date.now();

  const catPorNombre = new Map(categorias.map((c) => [clave(c.nombre), c]));
  const obtenerCategoria = (nombre: string): CategoriaMenu => {
    const limpio = nombre.trim() || 'General';
    const existente = catPorNombre.get(clave(limpio));
    if (existente) return existente;
    const estilo = estiloCategoria(limpio, categorias.length);
    const nueva: CategoriaMenu = { id: `cat-${marca}-${categorias.length}`, nombre: limpio, icono: estilo.emoji, color: estilo.color };
    categorias.push(nueva);
    catPorNombre.set(clave(limpio), nueva);
    categoriasNuevas.push(limpio);
    return nueva;
  };

  for (const f of leido.filas) {
    if (f.errores.length) { omitidas.push({ fila: f.fila, motivo: f.errores.join('; ') }); continue; }
    const nombre = String(f.datos.nombre || '').trim();
    const precio = Number(f.datos.precio_venta);
    if (!nombre || !Number.isFinite(precio)) { omitidas.push({ fila: f.fila, motivo: 'Falta el nombre o el precio' }); continue; }
    const cat = obtenerCategoria(String(f.datos.categoria || ''));
    const codigo = String(f.datos.codigo_barras || '').trim();
    const descripcion = String(f.datos.descripcion || '').trim();

    const i = productos.findIndex((p) =>
      (codigo && p.codigo && clave(p.codigo) === clave(codigo))
      || (p.categoriaId === cat.id && clave(p.nombre) === clave(nombre)));

    if (i >= 0) {
      const previo = productos[i];
      const actualizado: ProductoMenu = {
        ...previo,
        nombre,
        categoriaId: cat.id,
        precio,
        costo: f.datos.costo != null ? Number(f.datos.costo) || 0 : previo.costo,
        stock: f.datos.stock != null ? Number(f.datos.stock) || 0 : previo.stock,
        codigo: codigo || previo.codigo,
        descripcion: descripcion || previo.descripcion,
      };
      const cambio = JSON.stringify(actualizado) !== JSON.stringify(previo);
      productos[i] = actualizado;
      if (cambio) actualizados++; else sinCambios++;
    } else {
      productos.push({
        id: `pprod-${marca}-${productos.length}`,
        categoriaId: cat.id,
        nombre,
        precio,
        costo: Number(f.datos.costo) || 0,
        stock: Number(f.datos.stock) || 0,
        // El producto toma el emoji y el color de su categoría.
        icono: cat.icono,
        color: cat.color,
        codigo: codigo || '',
        descripcion: descripcion || undefined,
        tipoInventario: 'directo',
      });
      nuevos++;
    }
  }

  return { categorias, productos, categoriasNuevas, nuevos, actualizados, sinCambios, omitidas };
}
