// 📊 CODEC POS v2.0 - Servicio de Reportes
// Gestión completa de reportes con almacenamiento y auto-eliminación a 6 meses
import { electronStore } from '../lib/electronStore';

interface Venta {
  id: string;
  fecha: string;
  total: number;
  items: any[];
  metodoPago: string;
  cajero?: string;
  tipoVentaHibrida?: 'directo' | 'preparado';
}

interface Devolucion {
  id: string;
  fecha: string;
  totalDevolucion: number;
  metodoPago?: string;
  procesadoPor?: string;
  numeroFactura?: string;
}

interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  categoria: string;
  precio: number;
  stock: number;
  minStock: number;
  costo?: number;
  fechaVencimiento?: string;
  tipoInventario?: 'directo' | 'receta';
}

interface IngredienteInventario {
  id: string;
  nombre: string;
  unidad: string;
  stockActual: number;
  stockMinimo: number;
}

interface Gasto {
  id: string;
  fecha: string;
  monto: number;
  categoria: string;
  descripcion: string;
  metodoPago?: string;
  medioPagoEgreso?: 'efectivo' | 'transferencia' | 'tarjeta_banco';
  registradoPor?: string;
  registradoPorId?: string;
  categoriaConcepto?: string;
  autorizadoPor?: string;
}

interface CierreCaja {
  id: string;
  fecha: string;
  totalEfectivo: number;
  totalTarjeta: number;
  totalTransferencia: number;
  totalNequi: number;
  totalDaviplata: number;
  totalMixto: number;
  totalVentas: number;
  diferencia: number;
  cajero?: string;
}

export interface ReporteGenerado {
  id: string;
  tipo: 'ventas' | 'inventario' | 'gastos' | 'cierres' | 'financiero' | 'cajero' | 'taller';
  nombre: string;
  fechaGeneracion: string;
  fechaExpiracion: string;
  periodo: {
    inicio: string;
    fin: string;
  };
  datos: any;
  metadata: {
    totalRegistros: number;
    tamano?: string;
    generadoPor?: string;
    cajeroId?: string;
    cajeroNombre?: string;
  };
}

const STORAGE_KEY = 'pos-reportes-generados';
const DIAS_EXPIRACION = 180; // 6 meses

class ReportesService {
  // 🗑️ Limpiar reportes expirados automáticamente
  limpiarReportesExpirados(): number {
    const reportes = this.obtenerReportes();
    const ahora = new Date();
    const reportesValidos = reportes.filter(r => {
      const expiracion = new Date(r.fechaExpiracion);
      return expiracion > ahora;
    });

    const eliminados = reportes.length - reportesValidos.length;
    
    if (eliminados > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reportesValidos));
      console.log(`🗑️ Se eliminaron ${eliminados} reportes expirados`);
    }

    return eliminados;
  }

  // 📋 Obtener todos los reportes (y limpiar expirados)
  obtenerReportes(): ReporteGenerado[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      
      const reportes = JSON.parse(data);
      
      // Limpiar automáticamente los expirados
      const ahora = new Date();
      const reportesValidos = reportes.filter((r: ReporteGenerado) => {
        const expiracion = new Date(r.fechaExpiracion);
        return expiracion > ahora;
      });

      if (reportesValidos.length !== reportes.length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(reportesValidos));
      }

      return reportesValidos;
    } catch (error) {
      console.error('Error obteniendo reportes:', error);
      return [];
    }
  }

  // 💾 Guardar reporte
  guardarReporte(reporte: ReporteGenerado): void {
    const reportes = this.obtenerReportes();
    reportes.push(reporte);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reportes));
    console.log(`✅ Reporte guardado: ${reporte.nombre}`);
  }

  // 🗑️ Eliminar reporte manualmente
  eliminarReporte(id: string): boolean {
    const reportes = this.obtenerReportes();
    const filtrados = reportes.filter(r => r.id !== id);
    
    if (filtrados.length === reportes.length) {
      return false; // No se encontró
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtrados));
    console.log(`🗑️ Reporte eliminado: ${id}`);
    return true;
  }

  // 📊 Generar Reporte de Ventas (con filtro opcional por categoría)
  async generarReporteVentas(fechaInicio: string, fechaFin: string, categoriaFiltro?: string, generadoPor?: string): Promise<ReporteGenerado> {
    let ventas = await this.obtenerVentas(fechaInicio, fechaFin);
    const devoluciones = this.obtenerDevoluciones(fechaInicio, fechaFin);
    const egresosDetalle = this.obtenerGastos(fechaInicio, fechaFin);

    // Filtrar por categoría si se especifica (filtra items dentro de cada venta)
    if (categoriaFiltro) {
      ventas = ventas
        .map(v => ({
          ...v,
          items: (v.items || []).filter((it: any) =>
            String(it?.categoria || '').toLowerCase() === categoriaFiltro.toLowerCase() ||
            String(it?.categoriaId || '') === categoriaFiltro
          ),
        }))
        .filter(v => v.items.length > 0);
    }

    const totalVentas = ventas.reduce((sum, v) => sum + v.total, 0);
    const totalDevoluciones = devoluciones.reduce((sum, d) => sum + (Number(d.totalDevolucion) || 0), 0);
    const totalVentasNetas = Math.max(0, totalVentas - totalDevoluciones);
    const ventasPorMetodo = this.agruparPorMetodoPago(ventas);
    const ventasPorDia = this.agruparPorDia(ventas);
    const topProductos = this.calcularTopProductos(ventas);
    const topVentasHibrido = this.calcularTopVentasHibrido(ventas);
    const ventasPorCategoria = this.agruparVentasPorCategoria(ventas);

    const datos = {
      ventas,
      egresosDetalle,
      resumen: {
        totalVentas,
        totalDevoluciones,
        totalVentasNetas,
        cantidadTransacciones: ventas.length,
        ticketPromedio: ventas.length > 0 ? totalVentasNetas / ventas.length : 0,
        ventasPorMetodo,
        ventasPorDia,
        topProductos,
        topVentasHibrido,
        ventasPorCategoria,
        categoriaFiltro: categoriaFiltro || null,
      },
      devoluciones,
    };

    const nombre = categoriaFiltro
      ? `Reporte de Ventas — ${categoriaFiltro}`
      : 'Reporte de Ventas';
    return this.crearReporte('ventas', nombre, fechaInicio, fechaFin, datos, generadoPor);
  }

  // 📦 Generar Reporte de Inventario
  generarReporteInventario(generadoPor?: string): ReporteGenerado {
    const productos = this.obtenerProductos();
    const ingredientes = this.obtenerIngredientes();
    const mermas = this.obtenerMermas();
    const hoy = new Date().toISOString().split('T')[0];
    const egresosDetalle = this.obtenerGastos(hoy, hoy);
    
    const valorTotal = productos.reduce((sum, p) => sum + (p.precio * p.stock), 0);
    const valorCosto = productos.reduce((sum, p) => sum + ((p.costo || 0) * p.stock), 0);
    const productosBajoStock = productos.filter(p => p.stock <= p.minStock);
    const ingredientesBajoStock = ingredientes.filter(i => (Number(i.stockActual) || 0) <= (Number(i.stockMinimo) || 0));
    const productosPorCategoria = this.agruparPorCategoria(productos);

    const mermaTotalCantidad = mermas.reduce((sum, m: any) => sum + (Number(m.cantidad) || 0), 0);
    const mermaTotalCosto = mermas.reduce((sum, m: any) => sum + ((Number(m.costoUnitario) || 0) * (Number(m.cantidad) || 0)), 0);

    const ahora = new Date();
    const datos = {
      productos,
      resumen: {
        totalProductos: productos.length,
        valorInventario: valorTotal,
        valorCosto,
        utilidadPotencial: valorTotal - valorCosto,
        productosBajoStock: productosBajoStock.length,
        ingredientesBajoStock: ingredientesBajoStock.length,
        productosPorCategoria,
        merma: {
          totalRegistros: mermas.length,
          cantidadTotal: mermaTotalCantidad,
          costoEstimado: mermaTotalCosto,
        },
        alertas: {
          stockBajo: productosBajoStock,
          ingredientesStockCritico: ingredientesBajoStock,
          porVencer: productos.filter(p => {
            if (!p.fechaVencimiento) return false;
            const dias = this.diasHastaVencimiento(p.fechaVencimiento);
            return dias !== null && dias <= 7;
          })
        }
      },
      ingredientes,
      mermas,
      egresosDetalle,
    };

    return this.crearReporte('inventario', 'Reporte de Inventario', hoy, hoy, datos, generadoPor);
  }

  // 💰 Generar Reporte de Gastos
  generarReporteGastos(fechaInicio: string, fechaFin: string, generadoPor?: string): ReporteGenerado {
    const gastos = this.obtenerGastos(fechaInicio, fechaFin);
    
    const totalGastos = gastos.reduce((sum, g) => sum + g.monto, 0);
    const gastosPorCategoria = this.agruparGastosPorCategoria(gastos);
    const gastosPorDia = this.agruparGastosPorDia(gastos);

    const datos = {
      gastos,
      egresosDetalle: gastos,
      resumen: {
        totalGastos,
        cantidadGastos: gastos.length,
        promedioGasto: gastos.length > 0 ? totalGastos / gastos.length : 0,
        gastosPorCategoria,
        gastosPorDia,
        categoriaConMayorGasto: this.obtenerCategoriaMaxima(gastosPorCategoria)
      }
    };

    return this.crearReporte('gastos', 'Reporte de Gastos', fechaInicio, fechaFin, datos, generadoPor);
  }

  // 🏦 Generar Reporte de Cierres de Caja
  generarReporteCierres(fechaInicio: string, fechaFin: string, generadoPor?: string): ReporteGenerado {
    const cierres = this.obtenerCierres(fechaInicio, fechaFin);
    const egresosDetalle = this.obtenerGastos(fechaInicio, fechaFin);
    
    const totalRecaudado = cierres.reduce((sum, c) => sum + c.totalVentas, 0);
    const totalDiferencias = cierres.reduce((sum, c) => sum + Math.abs(c.diferencia), 0);
    const cierresConFaltante = cierres.filter(c => c.diferencia < 0);
    const cierresConSobrante = cierres.filter(c => c.diferencia > 0);

    const datos = {
      cierres,
      egresosDetalle,
      resumen: {
        totalCierres: cierres.length,
        totalRecaudado,
        totalDiferencias,
        cierresConFaltante: cierresConFaltante.length,
        cierresConSobrante: cierresConSobrante.length,
        promedioRecaudacion: cierres.length > 0 ? totalRecaudado / cierres.length : 0,
        metodoPagoMasUsado: this.obtenerMetodoPagoMasUsado(cierres)
      }
    };

    return this.crearReporte('cierres', 'Reporte de Cierres de Caja', fechaInicio, fechaFin, datos, generadoPor);
  }

  // 💼 Generar Reporte Financiero Consolidado
  async generarReporteFinanciero(fechaInicio: string, fechaFin: string, generadoPor?: string): Promise<ReporteGenerado> {
    const ventas = await this.obtenerVentas(fechaInicio, fechaFin);
    const devoluciones = this.obtenerDevoluciones(fechaInicio, fechaFin);
    const gastos = this.obtenerGastos(fechaInicio, fechaFin);
    
    const totalIngresosBrutos = ventas.reduce((sum, v) => sum + v.total, 0);
    const totalDevoluciones = devoluciones.reduce((sum, d) => sum + (Number(d.totalDevolucion) || 0), 0);
    const totalIngresos = Math.max(0, totalIngresosBrutos - totalDevoluciones);
    const totalGastos = gastos.reduce((sum, g) => sum + g.monto, 0);
    const utilidadNeta = totalIngresos - totalGastos;
    const margen = totalIngresos > 0 ? (utilidadNeta / totalIngresos) * 100 : 0;

    const datos = {
      ingresos: {
        total: totalIngresos,
        totalBruto: totalIngresosBrutos,
        totalDevoluciones,
        transacciones: ventas.length,
        porMetodo: this.agruparPorMetodoPago(ventas)
      },
      gastos: {
        total: totalGastos,
        transacciones: gastos.length,
        porCategoria: this.agruparGastosPorCategoria(gastos),
        detalle: gastos,
      },
      resumen: {
        utilidadNeta,
        margenUtilidad: margen,
        puntoEquilibrio: totalIngresos - totalGastos,
        ingresoPromedioDiario: this.calcularPromedioDiario(totalIngresos, fechaInicio, fechaFin),
        gastoPromedioDiario: this.calcularPromedioDiario(totalGastos, fechaInicio, fechaFin)
      },
      devoluciones,
      egresosDetalle: gastos,
    };

    return this.crearReporte('financiero', 'Reporte Financiero', fechaInicio, fechaFin, datos, generadoPor);
  }

  // 👤 Generar Reporte por Cajero
  async generarReporteCajero(fechaInicio: string, fechaFin: string, cajeroId?: string, generadoPor?: string): Promise<ReporteGenerado> {
    const todasLasVentas = await this.obtenerVentas(fechaInicio, fechaFin);
    const todosCierres = this.obtenerCierres(fechaInicio, fechaFin);
    const todosGastos = this.obtenerGastos(fechaInicio, fechaFin);
    
    // Si no se especifica cajero, generar reporte consolidado de todos
    let ventas = todasLasVentas;
    let cierres = todosCierres;
    let nombreCajero = 'Todos los Cajeros';
    
    if (cajeroId) {
      ventas = todasLasVentas.filter(v => (v as any).cajeroId === cajeroId);
      cierres = todosCierres.filter(c => (c as any).cajeroId === cajeroId);
      nombreCajero = ventas.length > 0 ? (ventas[0] as any).cajero || 'Cajero Desconocido' : 'Cajero Sin Ventas';
    }

    // Los gastos del período se muestran siempre completos (no solo los que ese cajero
    // registró literalmente): el objetivo es que el administrador vea "los gastos del día"
    // junto a las ventas de ese cajero para poder cuadrar caja/contabilidad de una vez.
    // Igual que ocurre con ventas/inventario/cierres/financiero, no se filtran por cajero.
    const egresosDetalle = todosGastos;

    const totalVentas = ventas.reduce((sum, v) => sum + v.total, 0);
    const ventasPorMetodo = this.agruparPorMetodoPago(ventas);
    const ventasPorDia = this.agruparPorDia(ventas);

    // Calcular estadísticas de cierres
    const totalDiferencias = cierres.reduce((sum, c) => sum + c.diferencia, 0);
    const cierresConFaltante = cierres.filter(c => c.diferencia < 0);
    const cierresConSobrante = cierres.filter(c => c.diferencia > 0);

    // Gastos/egresos del período (para contabilidad del administrador)
    const totalGastos = egresosDetalle.reduce((sum, g: any) => sum + (Number(g.monto) || 0), 0);
    const gastosPorCategoria = this.agruparGastosPorCategoria(egresosDetalle);

    const datos = {
      cajero: {
        id: cajeroId || 'TODOS',
        nombre: nombreCajero
      },
      ventas,
      cierres,
      egresosDetalle,
      resumen: {
        totalVentas,
        cantidadTransacciones: ventas.length,
        ticketPromedio: ventas.length > 0 ? totalVentas / ventas.length : 0,
        ventasPorMetodo,
        ventasPorDia,
        topProductos: this.calcularTopProductos(ventas),
        // Estadísticas de cierres
        totalCierres: cierres.length,
        diferenciasAcumuladas: totalDiferencias,
        cierresConFaltante: cierresConFaltante.length,
        cierresConSobrante: cierresConSobrante.length,
        promedioRecaudacion: cierres.length > 0 ? cierres.reduce((sum, c) => sum + c.totalVentas, 0) / cierres.length : 0,
        // Gastos del cajero en el período (para contabilidad)
        totalGastos,
        cantidadGastos: egresosDetalle.length,
        gastosPorCategoria,
        netoCaja: totalVentas - totalGastos,
      }
    };

    const reporte = this.crearReporte('cajero', `Reporte de ${nombreCajero}`, fechaInicio, fechaFin, datos, generadoPor);
    reporte.metadata.cajeroId = cajeroId;
    reporte.metadata.cajeroNombre = nombreCajero;
    
    return reporte;
  }

  // 🛠️ MÉTODOS AUXILIARES

  private crearReporte(
    tipo: ReporteGenerado['tipo'],
    nombre: string,
    fechaInicio: string,
    fechaFin: string,
    datos: any,
    generadoPor?: string
  ): ReporteGenerado {
    const ahora = new Date();
    const expiracion = new Date(ahora);
    expiracion.setDate(expiracion.getDate() + DIAS_EXPIRACION);

    return {
      id: `reporte-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      tipo,
      nombre: `${nombre} (${fechaInicio} a ${fechaFin})`,
      fechaGeneracion: ahora.toISOString(),
      fechaExpiracion: expiracion.toISOString(),
      periodo: {
        inicio: fechaInicio,
        fin: fechaFin
      },
      datos,
      metadata: {
        totalRegistros: Array.isArray(datos.ventas) ? datos.ventas.length :
                       Array.isArray(datos.gastos) ? datos.gastos.length :
                       Array.isArray(datos.cierres) ? datos.cierres.length :
                       Array.isArray(datos.productos) ? datos.productos.length : 0,
        generadoPor: generadoPor || 'Sistema POS'
      }
    };
  }

  private async obtenerVentas(fechaInicio: string, fechaFin: string): Promise<Venta[]> {
    try {
      const inicio = new Date(`${fechaInicio}T00:00:00`);
      const fin = new Date(`${fechaFin}T23:59:59`);
      const ventas = await electronStore.obtenerVentasPorRango(inicio, fin);
      return ventas as unknown as Venta[];
    } catch {
      // Fallback a localStorage si el electronStore falla
      try {
        const data = localStorage.getItem('pos-ventas') || localStorage.getItem('codecpos_ventas');
        if (!data) return [];
        const ventas = JSON.parse(data);
        return ventas.filter((v: Venta) => {
          const fecha = v.fecha.split('T')[0];
          return fecha >= fechaInicio && fecha <= fechaFin;
        });
      } catch {
        return [];
      }
    }
  }

  private obtenerProductos(): Producto[] {
    try {
      const data = localStorage.getItem('pos-productos') || localStorage.getItem('codecpos_productos');
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error obteniendo productos:', error);
      return [];
    }
  }

  private obtenerIngredientes(): IngredienteInventario[] {
    try {
      const data = localStorage.getItem('pos-ingredientes-inventario') || localStorage.getItem('codecpos_ingredientes_inventario');
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error obteniendo ingredientes:', error);
      return [];
    }
  }

  private obtenerMermas(): any[] {
    try {
      const data = localStorage.getItem('codecpos_mermas');
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error obteniendo mermas:', error);
      return [];
    }
  }

  private obtenerGastos(fechaInicio: string, fechaFin: string): Gasto[] {
    try {
      const data = localStorage.getItem('pos-gastos') || localStorage.getItem('codecpos_gastos');
      if (!data) return [];
      
      const gastos = JSON.parse(data);
      return gastos.filter((g: Gasto) => {
        const fecha = g.fecha.split('T')[0];
        return fecha >= fechaInicio && fecha <= fechaFin;
      }).map((g: any) => ({
        ...g,
        categoriaConcepto: g.categoriaConcepto || g.categoria || g.concepto || 'Sin concepto',
        metodoPago: this.normalizarMetodoPagoEgreso(String(g.medioPagoEgreso || g.metodoPago || 'efectivo')),
      }));
    } catch (error) {
      console.error('Error obteniendo gastos:', error);
      return [];
    }
  }

  private normalizarMetodoPagoEgreso(metodoPago: string): string {
    const key = String(metodoPago || '').toLowerCase();
    if (key === 'efectivo') return 'efectivo';
    if (['tarjeta', 'tarjeta_banco', 'banco', 'cheque'].includes(key)) return 'tarjeta_banco';
    return 'transferencia';
  }

  private obtenerCierres(fechaInicio: string, fechaFin: string): CierreCaja[] {
    try {
      const data = localStorage.getItem('pos-cierres-caja') || localStorage.getItem('codecpos_cierres_caja');
      if (!data) return [];
      
      const cierres = JSON.parse(data);
      return cierres.filter((c: CierreCaja) => {
        const fecha = c.fecha.split('T')[0];
        return fecha >= fechaInicio && fecha <= fechaFin;
      });
    } catch (error) {
      console.error('Error obteniendo cierres:', error);
      return [];
    }
  }

  private obtenerDevoluciones(fechaInicio: string, fechaFin: string): Devolucion[] {
    try {
      const data = localStorage.getItem('codecpos_devoluciones');
      if (!data) return [];

      const devoluciones = JSON.parse(data);
      return devoluciones.filter((d: Devolucion) => {
        const fecha = d.fecha.split('T')[0];
        return fecha >= fechaInicio && fecha <= fechaFin;
      });
    } catch (error) {
      console.error('Error obteniendo devoluciones:', error);
      return [];
    }
  }

  private agruparPorMetodoPago(ventas: Venta[]): Record<string, number> {
    const agrupado: Record<string, number> = {};
    ventas.forEach(v => {
      agrupado[v.metodoPago] = (agrupado[v.metodoPago] || 0) + v.total;
    });
    return agrupado;
  }

  private agruparPorDia(ventas: Venta[]): Record<string, number> {
    const agrupado: Record<string, number> = {};
    ventas.forEach(v => {
      const dia = v.fecha.split('T')[0];
      agrupado[dia] = (agrupado[dia] || 0) + v.total;
    });
    return agrupado;
  }

  private agruparPorCategoria(productos: Producto[]): Record<string, number> {
    const agrupado: Record<string, number> = {};
    productos.forEach(p => {
      agrupado[p.categoria] = (agrupado[p.categoria] || 0) + 1;
    });
    return agrupado;
  }

  private agruparVentasPorCategoria(ventas: Venta[]): Array<{ categoria: string; total: number; cantidad: number }> {
    const mapa: Record<string, { total: number; cantidad: number }> = {};
    ventas.forEach(v => {
      (v.items || []).forEach((item: any) => {
        const cat = String(item?.categoria || 'Sin categoría');
        if (!mapa[cat]) mapa[cat] = { total: 0, cantidad: 0 };
        mapa[cat].total += Number(item?.subtotal) || (Number(item?.precio) * Number(item?.cantidad)) || 0;
        mapa[cat].cantidad += Number(item?.cantidad) || 0;
      });
    });
    return Object.entries(mapa)
      .map(([categoria, data]) => ({ categoria, ...data }))
      .sort((a, b) => b.total - a.total);
  }

  private agruparGastosPorCategoria(gastos: Gasto[]): Record<string, number> {
    const agrupado: Record<string, number> = {};
    gastos.forEach(g => {
      agrupado[g.categoria] = (agrupado[g.categoria] || 0) + g.monto;
    });
    return agrupado;
  }

  private agruparGastosPorDia(gastos: Gasto[]): Record<string, number> {
    const agrupado: Record<string, number> = {};
    gastos.forEach(g => {
      const dia = g.fecha.split('T')[0];
      agrupado[dia] = (agrupado[dia] || 0) + g.monto;
    });
    return agrupado;
  }

  private calcularTopProductos(ventas: Venta[]): Array<{ nombre: string; cantidad: number; total: number }> {
    const productos: Record<string, { cantidad: number; total: number }> = {};
    
    ventas.forEach(v => {
      v.items.forEach((item: any) => {
        if (!productos[item.nombre]) {
          productos[item.nombre] = { cantidad: 0, total: 0 };
        }
        productos[item.nombre].cantidad += item.cantidad;
        productos[item.nombre].total += item.cantidad * item.precio;
      });
    });

    return Object.entries(productos)
      .map(([nombre, data]) => ({ nombre, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }

  private calcularTopVentasHibrido(ventas: Venta[]): {
    preparados: { cantidad: number; total: number };
    directos: { cantidad: number; total: number };
  } {
    const resumen = {
      preparados: { cantidad: 0, total: 0 },
      directos: { cantidad: 0, total: 0 },
    };

    ventas.forEach(v => {
      (v.items || []).forEach((item: any) => {
        const cantidad = Number(item?.cantidad) || 0;
        const totalItem = Number(item?.subtotal) || (cantidad * (Number(item?.precio) || 0));
        const esPreparado = item?.productoTipo === 'receta' || !!item?.recipeId;

        if (esPreparado) {
          resumen.preparados.cantidad += cantidad;
          resumen.preparados.total += totalItem;
        } else {
          resumen.directos.cantidad += cantidad;
          resumen.directos.total += totalItem;
        }
      });
    });

    return resumen;
  }

  private obtenerCategoriaMaxima(categorias: Record<string, number>): string {
    let maxCategoria = '';
    let maxMonto = 0;

    Object.entries(categorias).forEach(([categoria, monto]) => {
      if (monto > maxMonto) {
        maxMonto = monto;
        maxCategoria = categoria;
      }
    });

    return maxCategoria || 'N/A';
  }

  private obtenerMetodoPagoMasUsado(cierres: CierreCaja[]): string {
    const totales = {
      efectivo: 0,
      tarjeta: 0,
      transferencia: 0,
      nequi: 0,
      daviplata: 0,
      mixto: 0
    };

    cierres.forEach(c => {
      totales.efectivo += c.totalEfectivo;
      totales.tarjeta += c.totalTarjeta;
      totales.transferencia += c.totalTransferencia;
      totales.nequi += c.totalNequi;
      totales.daviplata += c.totalDaviplata;
      totales.mixto += c.totalMixto;
    });

    const max = Object.entries(totales).reduce((a, b) => a[1] > b[1] ? a : b);
    return max[0].charAt(0).toUpperCase() + max[0].slice(1);
  }

  private calcularPromedioDiario(total: number, fechaInicio: string, fechaFin: string): number {
    const inicio = new Date(fechaInicio);
    const fin = new Date(fechaFin);
    const dias = Math.ceil((fin.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return dias > 0 ? total / dias : 0;
  }

  private diasHastaVencimiento(fecha: string): number | null {
    try {
      const hoy = new Date();
      const vencimiento = new Date(fecha);
      const diff = Math.ceil((vencimiento.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
      return diff;
    } catch {
      return null;
    }
  }

  // 🔧 Generar Reporte de Taller de Reparaciones (async — usa IndexedDB)
  async generarReporteTaller(fechaInicio: string, fechaFin: string, generadoPor?: string): Promise<ReporteGenerado> {
    const { tallerService } = await import('./tallerService');
    const todasOrdenes = await tallerService.buscarOrdenes({
      fechaDesde: fechaInicio,
      fechaHasta: fechaFin,
    });

    const ordenes = todasOrdenes;

    const ingresosTotales = ordenes.reduce((sum, o) =>
      sum + (o.pagos || []).reduce((s, p) => s + (Number(p.monto) || 0), 0), 0);

    const costoTotalInsumos = ordenes.reduce((sum, o) => sum + (Number(o.costoInsumos) || 0), 0);

    const utilidadNeta = ingresosTotales - costoTotalInsumos;

    const porEstado: Record<string, number> = {};
    ordenes.forEach(o => { porEstado[o.estado] = (porEstado[o.estado] || 0) + 1; });

    const porTecnico: Record<string, { ordenes: number; ingresos: number }> = {};
    ordenes.forEach(o => {
      const tec = o.tecnicoAsignado || 'Sin asignar';
      if (!porTecnico[tec]) porTecnico[tec] = { ordenes: 0, ingresos: 0 };
      porTecnico[tec].ordenes++;
      porTecnico[tec].ingresos += (o.pagos || []).reduce((s, p) => s + (Number(p.monto) || 0), 0);
    });

    const repuestosMap: Record<string, { cantidad: number; costo: number }> = {};
    ordenes.forEach(o => {
      (o.insumos || []).forEach(ins => {
        if (!ins.nombre) return;
        if (!repuestosMap[ins.nombre]) repuestosMap[ins.nombre] = { cantidad: 0, costo: 0 };
        repuestosMap[ins.nombre].cantidad++;
        repuestosMap[ins.nombre].costo += Number(ins.costoAdquisicion) || 0;
      });
    });
    const topRepuestos = Object.entries(repuestosMap)
      .map(([nombre, d]) => ({ nombre, ...d }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 10);

    const saldosPendientes = ordenes
      .filter(o => (o.saldoPendiente ?? 0) > 0 && o.estado !== 'cancelado')
      .map(o => ({
        numeroOrden: o.numeroOrden,
        cliente: o.cliente.nombre,
        telefono: o.cliente.telefono,
        dispositivo: `${o.dispositivo.marca} ${o.dispositivo.modelo}`,
        saldo: o.saldoPendiente ?? 0,
        estado: o.estado,
      }));

    const totalPendiente = saldosPendientes.reduce((sum, s) => sum + s.saldo, 0);

    const ahora = new Date();
    const ordenesAtrasadas = ordenes.filter(o => {
      if (!o.fechaEstimadaEntrega) return false;
      if (['entregado', 'cancelado'].includes(o.estado)) return false;
      return new Date(o.fechaEstimadaEntrega) < ahora;
    });

    const datos = {
      ordenes,
      resumen: {
        totalOrdenes: ordenes.length,
        ordenesEntregadas: ordenes.filter(o => o.estado === 'entregado').length,
        ordenesCanceladas: ordenes.filter(o => o.estado === 'cancelado').length,
        ordenesActivas: ordenes.filter(o => !['entregado', 'cancelado'].includes(o.estado)).length,
        ordenesAtrasadas: ordenesAtrasadas.length,
        ingresosTotales,
        costoTotalInsumos,
        utilidadNeta,
        margenUtilidad: ingresosTotales > 0 ? (utilidadNeta / ingresosTotales) * 100 : 0,
        totalPendiente,
        cantidadConSaldo: saldosPendientes.length,
        porEstado,
        porTecnico,
        topRepuestos,
        saldosPendientes,
      },
    };

    return this.crearReporte('taller', 'Reporte Taller de Reparaciones', fechaInicio, fechaFin, datos, generadoPor);
  }

  // 📅 Calcular días restantes hasta expiración
  diasRestantesExpiracion(reporte: ReporteGenerado): number {
    const ahora = new Date();
    const expiracion = new Date(reporte.fechaExpiracion);
    const diff = Math.ceil((expiracion.getTime() - ahora.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }
}

export const reportesService = new ReportesService();
