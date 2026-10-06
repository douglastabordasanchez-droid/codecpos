import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

vi.mock('./supabase/config', () => ({ getSupabaseClient: () => null }));
const { COLUMNAS, leerArchivoProductos, leerNumero } = await import('./importarProductos');

function excel(filas: unknown[][], hoja = 'Productos'): File {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), hoja);
  const datos = XLSX.write(libro, { type: 'array', bookType: 'xlsx' });
  return new File([datos], 'productos.xlsx');
}

describe('importar productos', () => {
  it('lee números en formato colombiano y de Excel', () => {
    expect(leerNumero('$ 12.500')).toBe(12500);
    expect(leerNumero('12.500,50')).toBe(12500.5);
    expect(leerNumero('12,500.50')).toBe(12500.5);
    expect(leerNumero('1.250.000')).toBe(1250000);
    expect(leerNumero('3500')).toBe(3500);
    expect(leerNumero(19)).toBe(19);
    expect(leerNumero('abc')).toBeNull();
  });

  it('lee la plantilla con sus encabezados (con *) y valida cada fila', async () => {
    const encabezados = COLUMNAS.map((c) => c.encabezado + (c.obligatoria ? ' *' : ''));
    const r = await leerArchivoProductos(excel([
      encabezados,
      ['7702001001', 'Arroz Diana x 500 g', 'Granos', 3500, 2500, 150, 30, 0, 'unidad', 'Diana', '', '31/12/2027', '', '', ''],
      ['7702001001', 'Arroz repetido', 'Granos', 3500, 2500, 1, '', '', '', '', '', '', '', '', ''],
      ['', '', 'Sin nombre', 1000, '', '', '', '', '', '', '', '', '', '', ''],
      ['REF-9', 'Vaso cristal', 'Cristalería', '$ 8.900', 9500, '', '', 7, '', '', '', 'mañana', '', '', ''],
    ]));
    expect(r.filas).toHaveLength(4);
    expect(r.filas[0].errores).toEqual([]);
    expect(r.filas[0].datos).toMatchObject({ codigo_barras: '7702001001', nombre: 'Arroz Diana x 500 g', precio_venta: 3500, stock: 150, fecha_vencimiento: '2027-12-31' });
    expect(r.filas[1].errores[0]).toMatch(/Código repetido/);
    expect(r.filas[2].errores).toContain('Falta el nombre');
    expect(r.filas[3].errores).toEqual([]);
    expect(r.filas[3].datos.precio_venta).toBe(8900);
    expect(r.filas[3].avisos.join(' ')).toMatch(/IVA 7%|costo es mayor|Fecha/);
  });

  it('reconoce un CSV exportado de otro sistema (Referencia, PVP, Existencias) con punto y coma', async () => {
    const csv = '﻿Referencia;Descripción corta;Línea;PVP;Costo unitario;Existencias;Columna rara\nVAJ-01;Vajilla 20 piezas;Vajillas;189.900;120.000;12;x\nVAJ-02;Plato hondo;Vajillas;12.500;7.000;300;y\n';
    const r = await leerArchivoProductos(new File([csv], 'oasis.csv'));
    expect(r.columnasReconocidas).toEqual(expect.arrayContaining(['codigo_barras', 'nombre', 'categoria', 'precio_venta', 'costo', 'stock']));
    expect(r.columnasIgnoradas).toContain('Columna rara');
    expect(r.filas.map((f) => f.datos.precio_venta)).toEqual([189900, 12500]);
    expect(r.filas.every((f) => f.errores.length === 0)).toBe(true);
  });

  it('avisa claro si falta la columna de precio', async () => {
    await expect(leerArchivoProductos(excel([['Código', 'Nombre'], ['1', 'Algo']]))).rejects.toThrow(/Precio de venta/);
  });
});
