/**
 * Papelería y Piñatería — 5 plantillas Excel especializadas.
 *
 * Una sola plantilla genérica de producto no alcanza para este rubro: un
 * globo necesita calibre/color/marca, un dulce necesita lote/vencimiento, un
 * combo necesita referenciar OTROS productos ya existentes. En vez de una
 * tabla gigante con 30 columnas casi siempre vacías, se separan por familia
 * — cada una solo pide lo que de verdad aplica.
 *
 * `xlsx` se importa dinámico (dependencia pesada, solo la paga quien
 * realmente descarga o sube un archivo), mismo patrón que
 * artesGraficasService.ts y el importador de Panadería.
 */

export type TipoPlantillaPapeleria =
  | 'papeleria_servicios'
  | 'globos_decoracion'
  | 'dulceria_jugueteria'
  | 'fiestas_tematicas_desechables'
  | 'combos_kits_sorpresas';

export interface InfoPlantilla {
  tipo: TipoPlantillaPapeleria;
  archivo: string;
  hoja: string;
  titulo: string;
  descripcion: string;
  columnas: string[];
  filaEjemplo: Record<string, string | number>;
}

export const PLANTILLAS_PAPELERIA: InfoPlantilla[] = [
  {
    tipo: 'papeleria_servicios',
    archivo: 'Plantilla_1_Papeleria_y_Servicios.xlsx',
    hoja: 'Papelería y Servicios',
    titulo: 'Papelería y Servicios',
    descripcion: 'Escolar, oficina, manualidades, pliegos/papeles especiales y servicios (fotocopias, impresiones, anillados)',
    columnas: ['codigo', 'nombre', 'categoria_especifica', 'precio', 'costo', 'stock', 'unidad', 'servicio'],
    filaEjemplo: {
      codigo: 'PAP-001', nombre: 'Cuaderno cosido 100 hojas', categoria_especifica: 'Escolar',
      precio: 4500, costo: 2800, stock: 40, unidad: 'unidad', servicio: 'no',
    },
  },
  {
    tipo: 'globos_decoracion',
    archivo: 'Plantilla_2_Globos_y_Decoracion.xlsx',
    hoja: 'Globos y Decoración',
    titulo: 'Globos y Decoración en Látex/Metalizados',
    descripcion: 'Calibre (R-5, R-9, R-12, R-18, Link-o-Loon, 260 globoflexia), color/acabado y marca. Venta individual o por bolsa.',
    columnas: ['codigo', 'nombre', 'calibre_globo', 'color_acabado', 'marca', 'precio', 'costo', 'stock', 'unidades_por_bolsa', 'venta_por_unidad'],
    filaEjemplo: {
      codigo: 'GLO-R12-ROJ', nombre: 'Globo R-12 Rojo Sempertex', calibre_globo: 'R-12', color_acabado: 'Satín',
      marca: 'Sempertex', precio: 800, costo: 400, stock: 500, unidades_por_bolsa: 50, venta_por_unidad: 'si',
    },
  },
  {
    tipo: 'dulceria_jugueteria',
    archivo: 'Plantilla_3_Dulceria_y_Jugueteria_Pinata.xlsx',
    hoja: 'Dulcería y Juguetería',
    titulo: 'Dulcería y Juguetería de Piñata',
    descripcion: 'Venta por paquete o por unidad/dulce suelto, control opcional de lote y vencimiento. Deja "codigo" vacío para generarlo automático.',
    columnas: ['codigo', 'nombre', 'categoria_especifica', 'precio', 'costo', 'stock', 'venta_por_unidad', 'permitir_fraccion', 'lote', 'fecha_vencimiento'],
    filaEjemplo: {
      codigo: '', nombre: 'Bombombum sabores x 100', categoria_especifica: 'Dulcería',
      precio: 15000, costo: 9000, stock: 30, venta_por_unidad: 'no', permitir_fraccion: 'si', lote: 'L-2026-08', fecha_vencimiento: '2026-12-31',
    },
  },
  {
    tipo: 'fiestas_tematicas_desechables',
    archivo: 'Plantilla_4_Fiestas_Tematicas_y_Desechables.xlsx',
    hoja: 'Fiestas Temáticas',
    titulo: 'Fiestas Temáticas y Desechables',
    descripcion: 'Vasos, platos, manteles, cotillón — con la temática/personaje para filtrar rápido en caja.',
    columnas: ['codigo', 'nombre', 'categoria_especifica', 'tematica', 'precio', 'costo', 'stock'],
    filaEjemplo: {
      codigo: 'DES-VASO-MAR', nombre: 'Vasos x10 Marvel', categoria_especifica: 'Desechables',
      tematica: 'Marvel', precio: 6000, costo: 3200, stock: 25,
    },
  },
  {
    tipo: 'combos_kits_sorpresas',
    archivo: 'Plantilla_5_Combos_Kits_y_Sorpresas.xlsx',
    hoja: 'Combos y Sorpresas',
    titulo: 'Combos, Kits y Sorpresas',
    descripcion: 'Arma paquetes citando los códigos de productos QUE YA EXISTEN en tu inventario, separados por punto y coma, con su cantidad correspondiente en el mismo orden.',
    columnas: ['codigo', 'nombre', 'precio', 'costo', 'stock', 'componentes_codigos', 'componentes_cantidades'],
    filaEjemplo: {
      codigo: 'COMBO-SORPRESA-1', nombre: 'Bolsa sorpresa armada', precio: 8000, costo: 4500, stock: 20,
      componentes_codigos: 'GLO-R12-ROJ;DES-VASO-MAR', componentes_cantidades: '2;1',
    },
  },
];

export function infoPlantilla(tipo: TipoPlantillaPapeleria): InfoPlantilla {
  const info = PLANTILLAS_PAPELERIA.find((p) => p.tipo === tipo);
  if (!info) throw new Error(`Plantilla desconocida: ${tipo}`);
  return info;
}

export async function descargarPlantillaPapeleria(tipo: TipoPlantillaPapeleria): Promise<void> {
  const XLSX = await import('xlsx');
  const info = infoPlantilla(tipo);
  const ws = XLSX.utils.json_to_sheet([info.filaEjemplo], { header: info.columnas });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, info.hoja);
  XLSX.writeFile(wb, info.archivo);
}

export async function descargarTodasLasPlantillasPapeleria(): Promise<void> {
  for (const p of PLANTILLAS_PAPELERIA) {
    await descargarPlantillaPapeleria(p.tipo);
  }
}
