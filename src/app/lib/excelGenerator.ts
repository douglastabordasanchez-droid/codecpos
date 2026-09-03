/**
 * CODEC POS v2.0 - Generador de Excel Profesional
 * ✅ Reportes de ventas
 * ✅ Reportes de gastos
 * ✅ Reportes de inventario
 * ✅ Formato profesional con estilos
 */

import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Venta {
  numeroFactura: string;
  fecha: string;
  items: Array<{
    nombre: string;
    cantidad: number;
    precio: number;
    subtotal: number;
  }>;
  subtotal: number;
  iva: number;
  propina?: number;
  total: number;
  metodoPago: string;
  cajero: string;
  cliente?: string;
}

interface Gasto {
  id: string;
  fecha: string;
  descripcion: string;
  categoria: string;
  monto: number;
  metodoPago: string;
  registradoPor: string;
  notas?: string;
}

/**
 * Generar Excel de Reporte de Ventas
 */
export const generarReporteVentasExcel = (
  ventas: Venta[],
  fechaInicio: string,
  fechaFin: string,
  nombreEmpresa: string
): Blob => {
  // Crear libro de trabajo
  const workbook = XLSX.utils.book_new();

  // ==================== HOJA 1: RESUMEN ====================
  const resumenData = [
    ['REPORTE DE VENTAS'],
    [nombreEmpresa],
    [`Período: ${format(new Date(fechaInicio), 'dd/MM/yyyy')} - ${format(new Date(fechaFin), 'dd/MM/yyyy')}`],
    [`Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })}`],
    [],
    ['RESUMEN GENERAL'],
    ['Total de Ventas:', ventas.length],
    ['Total Ingresos:', ventas.reduce((sum, v) => sum + v.total, 0)],
    ['Total IVA:', ventas.reduce((sum, v) => sum + v.iva, 0)],
    ['Total sin IVA:', ventas.reduce((sum, v) => sum + v.subtotal, 0)],
    ['Total Propinas:', ventas.reduce((sum, v) => sum + (v.propina ?? 0), 0)],
  ];

  const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
  XLSX.utils.book_append_sheet(workbook, wsResumen, 'Resumen');

  // ==================== HOJA 2: DETALLE DE VENTAS ====================
  const ventasData = [
    ['Factura', 'Fecha', 'Hora', 'Cliente', 'Cajero', 'Método Pago', 'Subtotal', 'IVA', 'Propina / Tip', 'Total'],
    ...ventas.map(v => [
      v.numeroFactura,
      format(new Date(v.fecha), 'dd/MM/yyyy', { locale: es }),
      format(new Date(v.fecha), 'HH:mm', { locale: es }),
      v.cliente || 'Consumidor Final',
      v.cajero,
      v.metodoPago.toUpperCase(),
      v.subtotal,
      v.iva,
      v.propina ?? 0,
      v.total,
    ]),
  ];

  const wsVentas = XLSX.utils.aoa_to_sheet(ventasData);
  
  // Aplicar formato a números (columnas de dinero)
  const range = XLSX.utils.decode_range(wsVentas['!ref'] || 'A1');
  for (let R = 1; R <= range.e.r; ++R) {
    for (let C = 6; C <= 9; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      if (!wsVentas[cellAddress]) continue;
      wsVentas[cellAddress].z = '"$"#,##0.00';
    }
  }

  XLSX.utils.book_append_sheet(workbook, wsVentas, 'Ventas');

  // ==================== HOJA 3: PRODUCTOS VENDIDOS ====================
  const productosVendidos: Record<string, { cantidad: number; total: number }> = {};
  
  ventas.forEach(v => {
    v.items.forEach(item => {
      if (!productosVendidos[item.nombre]) {
        productosVendidos[item.nombre] = { cantidad: 0, total: 0 };
      }
      productosVendidos[item.nombre].cantidad += item.cantidad;
      productosVendidos[item.nombre].total += item.subtotal;
    });
  });

  const productosData = [
    ['Producto', 'Cantidad Vendida', 'Total Vendido'],
    ...Object.entries(productosVendidos)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([nombre, data]) => [nombre, data.cantidad, data.total]),
  ];

  const wsProductos = XLSX.utils.aoa_to_sheet(productosData);
  XLSX.utils.book_append_sheet(workbook, wsProductos, 'Productos Vendidos');

  // ==================== HOJA 4: MÉTODOS DE PAGO ====================
  const metodosPago: Record<string, { cantidad: number; total: number }> = {};
  
  ventas.forEach(v => {
    if (!metodosPago[v.metodoPago]) {
      metodosPago[v.metodoPago] = { cantidad: 0, total: 0 };
    }
    metodosPago[v.metodoPago].cantidad += 1;
    metodosPago[v.metodoPago].total += v.total;
  });

  const metodosData = [
    ['Método de Pago', 'Cantidad de Ventas', 'Total'],
    ...Object.entries(metodosPago).map(([metodo, data]) => [
      metodo.toUpperCase(),
      data.cantidad,
      data.total,
    ]),
  ];

  const wsMetodos = XLSX.utils.aoa_to_sheet(metodosData);
  XLSX.utils.book_append_sheet(workbook, wsMetodos, 'Métodos de Pago');

  // Generar archivo
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  
  return blob;
};

/**
 * Descargar Excel de reporte de ventas
 */
export const descargarReporteVentasExcel = (
  ventas: Venta[],
  fechaInicio: string,
  fechaFin: string,
  nombreEmpresa: string
) => {
  const blob = generarReporteVentasExcel(ventas, fechaInicio, fechaFin, nombreEmpresa);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Reporte_Ventas_${format(new Date(fechaInicio), 'yyyyMMdd')}_${format(new Date(fechaFin), 'yyyyMMdd')}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
};

/**
 * Generar Excel de Reporte de Gastos
 */
export const generarReporteGastosExcel = (
  gastos: Gasto[],
  fechaInicio: string,
  fechaFin: string,
  nombreEmpresa: string
): Blob => {
  const workbook = XLSX.utils.book_new();

  // Resumen
  const totalGastos = gastos.reduce((sum, g) => sum + g.monto, 0);
  
  const resumenData = [
    ['REPORTE DE GASTOS'],
    [nombreEmpresa],
    [`Período: ${format(new Date(fechaInicio), 'dd/MM/yyyy')} - ${format(new Date(fechaFin), 'dd/MM/yyyy')}`],
    [],
    ['Total de Gastos:', gastos.length],
    ['Total Monto:', totalGastos],
  ];

  const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
  XLSX.utils.book_append_sheet(workbook, wsResumen, 'Resumen');

  // Detalle de Gastos
  const gastosData = [
    ['Fecha', 'Descripción', 'Categoría', 'Monto', 'Método Pago', 'Registrado Por', 'Notas'],
    ...gastos.map(g => [
      format(new Date(g.fecha), 'dd/MM/yyyy HH:mm', { locale: es }),
      g.descripcion,
      g.categoria,
      g.monto,
      g.metodoPago.toUpperCase(),
      g.registradoPor,
      g.notas || '',
    ]),
  ];

  const wsGastos = XLSX.utils.aoa_to_sheet(gastosData);
  XLSX.utils.book_append_sheet(workbook, wsGastos, 'Gastos');

  // Gastos por Categoría
  const gastosPorCategoria: Record<string, number> = {};
  gastos.forEach(g => {
    gastosPorCategoria[g.categoria] = (gastosPorCategoria[g.categoria] || 0) + g.monto;
  });

  const categoriasData = [
    ['Categoría', 'Total'],
    ...Object.entries(gastosPorCategoria)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, total]) => [cat, total]),
  ];

  const wsCategorias = XLSX.utils.aoa_to_sheet(categoriasData);
  XLSX.utils.book_append_sheet(workbook, wsCategorias, 'Por Categoría');

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  
  return blob;
};

/**
 * Descargar Excel de reporte de gastos
 */
export const descargarReporteGastosExcel = (
  gastos: Gasto[],
  fechaInicio: string,
  fechaFin: string,
  nombreEmpresa: string
) => {
  const blob = generarReporteGastosExcel(gastos, fechaInicio, fechaFin, nombreEmpresa);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Reporte_Gastos_${format(new Date(fechaInicio), 'yyyyMMdd')}_${format(new Date(fechaFin), 'yyyyMMdd')}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
};
