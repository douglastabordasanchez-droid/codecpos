/**
 * Carga masiva de productos desde una plantilla de Excel (o CSV) a la nube.
 * La usa la web (Inventario › Importar). Plantilla descargable con
 * instrucciones, lectura flexible de encabezados (también archivos exportados
 * de otros sistemas), validación fila por fila antes de cargar, y carga por
 * lotes que actualiza por código los productos que ya existen en vez de
 * duplicarlos. Pensada para catálogos grandes (20.000 referencias).
 */
import * as XLSX from 'xlsx';
import { getSupabaseClient } from './supabase/config';

export type Campo =
  | 'codigo_barras' | 'nombre' | 'categoria' | 'precio_venta' | 'costo' | 'stock' | 'stock_minimo'
  | 'iva' | 'unidad' | 'marca' | 'proveedor' | 'fecha_vencimiento' | 'descripcion' | 'talla' | 'color';

interface Columna {
  campo: Campo;
  encabezado: string;
  ayuda: string;
  ejemplo: [string | number, string | number, string | number];
  obligatoria?: boolean;
  /** Otros nombres con que suele venir la columna en archivos de otros sistemas. */
  sinonimos: string[];
}

export const COLUMNAS: Columna[] = [
  { campo: 'codigo_barras', encabezado: 'Código', ayuda: 'Código de barras o referencia. Si ya existe, el producto se actualiza en vez de duplicarse.', ejemplo: ['7702001001', '7702004004', 'REF-1050'], sinonimos: ['codigo', 'codigo de barras', 'cod', 'ean', 'sku', 'referencia', 'ref', 'barcode', 'code', 'plu'] },
  { campo: 'nombre', encabezado: 'Nombre', ayuda: 'Nombre como se verá en la caja y en la factura. Obligatorio.', ejemplo: ['Arroz Diana x 500 g', 'Café Águila Roja x 250 g', 'Vaso cristal 12 oz'], obligatoria: true, sinonimos: ['producto', 'nombre del producto', 'articulo', 'descripcion corta', 'item', 'name'] },
  { campo: 'categoria', encabezado: 'Categoría', ayuda: 'Grupo o línea del producto.', ejemplo: ['Granos', 'Bebidas', 'Cristalería'], sinonimos: ['categoria', 'linea', 'grupo', 'familia', 'departamento', 'category'] },
  { campo: 'precio_venta', encabezado: 'Precio de venta', ayuda: 'Precio al público en pesos, sin puntos ni signo $ (se aceptan igual). Obligatorio.', ejemplo: [3500, 13500, 8900], obligatoria: true, sinonimos: ['precio', 'precio venta', 'pvp', 'valor', 'precio publico', 'precio al publico', 'price'] },
  { campo: 'costo', encabezado: 'Costo', ayuda: 'Lo que te cuesta el producto (para calcular ganancias).', ejemplo: [2500, 9500, 5200], sinonimos: ['precio compra', 'precio de compra', 'costo unitario', 'cost'] },
  { campo: 'stock', encabezado: 'Stock', ayuda: 'Cantidad que tienes hoy. Se carga en la sede principal.', ejemplo: [150, 60, 240], sinonimos: ['cantidad', 'existencias', 'existencia', 'inventario', 'unidades', 'qty'] },
  { campo: 'stock_minimo', encabezado: 'Stock mínimo', ayuda: 'Cuando queden estas unidades o menos, el sistema avisa.', ejemplo: [30, 15, 24], sinonimos: ['minimo', 'stock minimo', 'min stock', 'minstock', 'punto de reorden'] },
  { campo: 'iva', encabezado: 'IVA %', ayuda: '0, 5 o 19.', ejemplo: [0, 5, 19], sinonimos: ['iva', 'impuesto', 'tarifa iva', 'iva porcentaje'] },
  { campo: 'unidad', encabezado: 'Unidad', ayuda: 'unidad, kg, g, litro, caja, paquete...', ejemplo: ['unidad', 'unidad', 'caja'], sinonimos: ['unidad de medida', 'um', 'medida'] },
  { campo: 'marca', encabezado: 'Marca', ayuda: 'Opcional.', ejemplo: ['Diana', 'Águila Roja', 'Cristar'], sinonimos: ['fabricante', 'brand'] },
  { campo: 'proveedor', encabezado: 'Proveedor', ayuda: 'Opcional.', ejemplo: ['Distribuidora Norte', '', 'Cristar SAS'], sinonimos: ['provedor', 'supplier'] },
  { campo: 'fecha_vencimiento', encabezado: 'Fecha de vencimiento', ayuda: 'Opcional, formato día/mes/año.', ejemplo: ['31/12/2027', '', ''], sinonimos: ['vencimiento', 'fecha vencimiento', 'vence', 'caducidad', 'fechavencimiento'] },
  { campo: 'descripcion', encabezado: 'Descripción', ayuda: 'Opcional, detalle más largo del producto.', ejemplo: ['', 'Tostado y molido', 'Caja x 6 unidades'], sinonimos: ['detalle', 'observaciones', 'description'] },
  { campo: 'talla', encabezado: 'Talla', ayuda: 'Solo para ropa y calzado.', ejemplo: ['', '', ''], sinonimos: ['size'] },
  { campo: 'color', encabezado: 'Color', ayuda: 'Solo si aplica.', ejemplo: ['', '', 'Transparente'], sinonimos: [] },
];

const normalizar = (t: unknown) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[%_.\-]/g, ' ').replace(/\s+/g, ' ').trim();

// ── Plantilla ──────────────────────────────────────────────────────────────

export function descargarPlantilla(nombreNegocio?: string): void {
  const libro = XLSX.utils.book_new();
  const filas = [
    COLUMNAS.map((c) => c.encabezado + (c.obligatoria ? ' *' : '')),
    ...[0, 1, 2].map((i) => COLUMNAS.map((c) => c.ejemplo[i])),
  ];
  const hoja = XLSX.utils.aoa_to_sheet(filas);
  hoja['!cols'] = COLUMNAS.map((c) => ({ wch: Math.max(12, c.encabezado.length + 4, c.campo === 'nombre' ? 34 : 0) }));
  hoja['!freeze'] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(libro, hoja, 'Productos');

  const instrucciones = XLSX.utils.aoa_to_sheet([
    ['Cómo llenar la plantilla de productos de CODEC POS'],
    [''],
    ['1. Escribe un producto por fila en la hoja "Productos", desde la fila 2. Borra las 3 filas de ejemplo.'],
    ['2. Las columnas con * son obligatorias: Nombre y Precio de venta. Las demás se pueden dejar vacías.'],
    ['3. Si el Código ya existe en tu inventario, ese producto se actualiza con los datos del archivo (no se duplica).'],
    ['4. Los precios van en pesos, sin decimales. Se aceptan con o sin puntos y con o sin el signo $.'],
    ['5. No cambies los nombres de las columnas. Puedes borrar las columnas que no uses.'],
    ['6. Guarda el archivo y súbelo en Inventario › Importar. Antes de cargar verás cada fila revisada.'],
    [''],
    ['Columna', 'Para qué sirve'],
    ...COLUMNAS.map((c) => [c.encabezado + (c.obligatoria ? ' (obligatoria)' : ''), c.ayuda]),
  ]);
  instrucciones['!cols'] = [{ wch: 26 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(libro, instrucciones, 'Instrucciones');

  const nombre = `Plantilla productos${nombreNegocio ? ` ${nombreNegocio}` : ''}.xlsx`.replace(/[\\/:*?"<>|]+/g, '');
  XLSX.writeFile(libro, nombre);
}

// ── Lectura y validación ───────────────────────────────────────────────────

export interface FilaImportada {
  fila: number;                       // número de fila en el archivo (para el usuario)
  datos: Partial<Record<Campo, string | number | null>>;
  errores: string[];
  avisos: string[];
}

export interface ArchivoLeido {
  filas: FilaImportada[];
  columnasReconocidas: Campo[];
  columnasIgnoradas: string[];
}

/** Número en formato colombiano o de Excel: "$ 12.500", "12.500,50", "12,500.50", 12500. */
export function leerNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let t = String(v).replace(/[^\d.,-]/g, '');
  if (!t || t === '-') return null;
  const ultimaComa = t.lastIndexOf(',');
  const ultimoPunto = t.lastIndexOf('.');
  if (ultimaComa > -1 && ultimoPunto > -1) {
    t = ultimaComa > ultimoPunto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (ultimaComa > -1) {
    t = /,\d{1,2}$/.test(t) ? t.replace(',', '.') : t.replace(/,/g, '');
  } else if (ultimoPunto > -1 && !/\.\d{1,2}$/.test(t)) {
    t = t.replace(/\./g, ''); // 12.500 es doce mil quinientos
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function leerFecha(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null;
  }
  const t = String(v).trim();
  let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function reconocerColumna(encabezado: unknown): Campo | null {
  const t = normalizar(encabezado).replace(/\*/g, '').trim();
  if (!t) return null;
  for (const c of COLUMNAS) {
    if (normalizar(c.encabezado).replace(/\*/g, '').trim() === t || c.sinonimos.some((s) => normalizar(s) === t)) return c.campo;
  }
  // Coincidencias parciales comunes ("Precio venta unidad", "Código de barras EAN13"...)
  if (t.includes('precio') && (t.includes('venta') || t.includes('public'))) return 'precio_venta';
  if (t.includes('costo') || (t.includes('precio') && t.includes('compra'))) return 'costo';
  if (t.includes('codigo') || t.includes('barra')) return 'codigo_barras';
  if (t.includes('minim')) return 'stock_minimo';
  if (t.includes('vencim')) return 'fecha_vencimiento';
  return null;
}

/** Lee un .xlsx, .xls o .csv (con ; o ,) y revisa cada fila. */
export async function leerArchivoProductos(archivo: File): Promise<ArchivoLeido> {
  const esTexto = /\.(csv|txt)$/i.test(archivo.name);
  let libro: XLSX.WorkBook;
  if (esTexto) {
    const texto = (await archivo.text()).replace(/^﻿/, '');
    const primera = texto.split(/\r?\n/, 1)[0] || '';
    const separador = (primera.match(/;/g) || []).length >= (primera.match(/,/g) || []).length ? ';' : ',';
    libro = XLSX.read(texto, { type: 'string', FS: separador, raw: true });
  } else {
    libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array', cellDates: true });
  }
  const hoja = libro.Sheets['Productos'] || libro.Sheets[libro.SheetNames[0]];
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, blankrows: false, defval: '' });
  if (matriz.length === 0) throw new Error('El archivo está vacío');

  // El encabezado es la primera fila que reconoce al menos el nombre.
  let filaEncabezado = matriz.findIndex((f) => (f as unknown[]).some((c) => reconocerColumna(c) === 'nombre'));
  if (filaEncabezado < 0) throw new Error('No se encontró la columna "Nombre". Usa la plantilla o pon los nombres de las columnas en la primera fila.');
  const encabezados = matriz[filaEncabezado] as unknown[];
  const mapa = new Map<number, Campo>();
  const ignoradas: string[] = [];
  encabezados.forEach((e, i) => {
    const campo = reconocerColumna(e);
    if (campo && ![...mapa.values()].includes(campo)) mapa.set(i, campo);
    else if (String(e ?? '').trim()) ignoradas.push(String(e).trim());
  });
  if (![...mapa.values()].includes('precio_venta')) throw new Error('No se encontró la columna "Precio de venta".');

  const filas: FilaImportada[] = [];
  const codigosVistos = new Map<string, number>();
  for (let i = filaEncabezado + 1; i < matriz.length; i++) {
    const celdas = matriz[i] as unknown[];
    if (!celdas.some((c) => String(c ?? '').trim() !== '')) continue;
    const datos: FilaImportada['datos'] = {};
    const errores: string[] = [];
    const avisos: string[] = [];
    mapa.forEach((campo, col) => {
      const v = celdas[col];
      const vacio = v === null || v === undefined || String(v).trim() === '';
      if (vacio) return;
      if (['precio_venta', 'costo', 'stock', 'stock_minimo', 'iva'].includes(campo)) {
        const n = leerNumero(v);
        if (n === null) errores.push(`"${v}" no es un número válido en ${COLUMNAS.find((c) => c.campo === campo)!.encabezado}`);
        else datos[campo] = n;
      } else if (campo === 'fecha_vencimiento') {
        const f = leerFecha(v);
        if (!f) avisos.push(`Fecha "${v}" no reconocida: se deja vacía`);
        else datos[campo] = f;
      } else {
        datos[campo] = String(v).trim();
      }
    });
    if (!datos.nombre) errores.push('Falta el nombre');
    if (datos.precio_venta === undefined) errores.push('Falta el precio de venta');
    else if (Number(datos.precio_venta) < 0) errores.push('El precio no puede ser negativo');
    if (datos.iva !== undefined && ![0, 5, 19].includes(Number(datos.iva))) avisos.push(`IVA ${datos.iva}% poco común (normalmente 0, 5 o 19)`);
    if (datos.costo !== undefined && datos.precio_venta !== undefined && Number(datos.costo) > Number(datos.precio_venta)) avisos.push('El costo es mayor que el precio de venta');
    const codigo = datos.codigo_barras ? String(datos.codigo_barras) : '';
    if (codigo) {
      const repetida = codigosVistos.get(codigo);
      if (repetida) errores.push(`Código repetido en el archivo (también en la fila ${repetida})`);
      else codigosVistos.set(codigo, i + 1);
    } else {
      avisos.push('Sin código: se crea como producto nuevo');
    }
    filas.push({ fila: i + 1, datos, errores, avisos });
  }
  return { filas, columnasReconocidas: [...mapa.values()], columnasIgnoradas: ignoradas };
}

// ── Carga a la nube ────────────────────────────────────────────────────────

export interface ResultadoImportacion { nuevos: number; actualizados: number; omitidos: number; errores: string[] }

/**
 * Carga las filas sin errores. Los códigos que ya existen se actualizan (solo
 * con las columnas que traiga el archivo; una celda vacía no borra el dato) o
 * se omiten, según `actualizarExistentes`. Lotes de 500.
 */
export async function importarProductos(
  clienteId: string,
  empleadoId: string | null,
  filas: FilaImportada[],
  opciones: { actualizarExistentes: boolean },
  progreso?: (hechas: number, total: number) => void,
): Promise<ResultadoImportacion> {
  const client = getSupabaseClient();
  if (!client) throw new Error('No hay conexión con la nube');
  const validas = filas.filter((f) => f.errores.length === 0);
  const resultado: ResultadoImportacion = { nuevos: 0, actualizados: 0, omitidos: 0, errores: [] };
  const LOTE = 500;
  const ahora = new Date().toISOString();

  for (let i = 0; i < validas.length; i += LOTE) {
    const lote = validas.slice(i, i + LOTE);
    const codigos = lote.map((f) => String(f.datos.codigo_barras || '')).filter(Boolean);
    const existentes = new Map<string, Record<string, unknown>>();
    if (codigos.length > 0) {
      const { data, error } = await client.from('productos').select('*').eq('cliente_id', clienteId).in('codigo_barras', codigos);
      if (error) throw new Error(error.message);
      (data || []).forEach((p: any) => { if (p.codigo_barras && !existentes.has(p.codigo_barras)) existentes.set(p.codigo_barras, p); });
    }

    const nuevos: Record<string, unknown>[] = [];
    const cambios: Record<string, unknown>[] = [];
    for (const f of lote) {
      const datos = Object.fromEntries(Object.entries(f.datos).filter(([, v]) => v !== undefined && v !== ''));
      const previo = f.datos.codigo_barras ? existentes.get(String(f.datos.codigo_barras)) : undefined;
      if (previo) {
        if (!opciones.actualizarExistentes) { resultado.omitidos++; continue; }
        // Fila completa (lo que había más lo que trae el archivo) para que el lote tenga las mismas columnas.
        const { id, cliente_id, ...resto } = previo as any;
        cambios.push({ ...resto, ...datos, id, cliente_id, activo: true, updated_at: ahora, updated_by: empleadoId });
      } else {
        nuevos.push({
          cliente_id: clienteId, nombre: '', codigo_barras: null, categoria: null, precio_venta: 0, costo: 0, stock: 0,
          stock_minimo: null, iva: 0, unidad: 'unidad', marca: null, proveedor: null, fecha_vencimiento: null,
          descripcion: null, talla: null, color: null, activo: true, updated_by: empleadoId,
          ...datos,
        });
      }
    }

    if (nuevos.length > 0) {
      const { error } = await client.from('productos').insert(nuevos);
      if (error) resultado.errores.push(`Filas ${lote[0].fila} a ${lote[lote.length - 1].fila}: ${error.message}`);
      else resultado.nuevos += nuevos.length;
    }
    if (cambios.length > 0) {
      const { error } = await client.from('productos').upsert(cambios, { onConflict: 'id' });
      if (error) resultado.errores.push(`Actualizando filas ${lote[0].fila} a ${lote[lote.length - 1].fila}: ${error.message}`);
      else resultado.actualizados += cambios.length;
    }
    progreso?.(Math.min(i + LOTE, validas.length), validas.length);
  }
  return resultado;
}
