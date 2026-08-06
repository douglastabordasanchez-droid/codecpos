/**
 * Servicio de Analytics Interno
 * CODEC POS v2.0
 * Sistema de métricas y análisis sin dependencias externas
 */

import { dbManager } from './indexedDB';
import { logger } from './logger';

interface EventoAnalytics {
  tipo: string;
  timestamp: number;
  datos?: any;
  usuario?: string;
  sesionId: string;
}

interface MetricasVentas {
  ventasPorHora: { hora: number; cantidad: number; total: number }[];
  productosMasVendidos: { productoId: string; nombre: string; cantidad: number; total: number }[];
  productosMenosVendidos: { productoId: string; nombre: string; cantidad: number }[];
  metodoPagoMasUsado: { metodo: string; cantidad: number; porcentaje: number }[];
  ticketPromedio: number;
  tiempoPromedioAtencion: number;
  tasaConversion: number;
}

interface MetricasInventario {
  rotacionProductos: { productoId: string; nombre: string; rotacion: number }[];
  stockCritico: { productoId: string; nombre: string; stock: number; minStock: number }[];
  valorInventario: number;
  productosSinMovimiento: { productoId: string; nombre: string; ultimaVenta?: number }[];
}

interface MetricasRendimiento {
  ventasPorDia: { fecha: string; cantidad: number; total: number }[];
  ventasPorCajero: { cajero: string; cantidad: number; total: number }[];
  horasPico: { hora: number; ventas: number }[];
  diasPico: { dia: string; ventas: number }[];
}

class AnalyticsService {
  private sesionId: string;
  private eventos: EventoAnalytics[] = [];
  private sessionStartTime: number;

  constructor() {
    this.sesionId = this.generateSessionId();
    this.sessionStartTime = Date.now();
    this.startSession();
  }

  // ==================== REGISTRO DE EVENTOS ====================

  /**
   * Registrar evento genérico
   */
  track(tipo: string, datos?: any) {
    const evento: EventoAnalytics = {
      tipo,
      timestamp: Date.now(),
      datos,
      usuario: this.getCurrentUser(),
      sesionId: this.sesionId,
    };

    this.eventos.push(evento);
    
    // Guardar en IndexedDB de forma asíncrona
    this.saveEvent(evento);
  }

  /**
   * Eventos específicos del POS
   */
  trackVenta(venta: any) {
    this.track('venta', {
      ventaId: venta.id,
      numero: venta.numero,
      total: venta.total,
      items: venta.items.length,
      metodoPago: venta.metodoPago,
    });
  }

  trackProductoAgregado(producto: any, cantidad: number) {
    this.track('producto_agregado', {
      productoId: producto.id,
      nombre: producto.nombre,
      cantidad,
      precio: producto.precio,
    });
  }

  trackBusqueda(termino: string, resultados: number) {
    this.track('busqueda', {
      termino,
      resultados,
    });
  }

  trackError(error: Error, contexto?: string) {
    this.track('error', {
      mensaje: error.message,
      stack: error.stack,
      contexto,
    });
  }

  // ==================== MÉTRICAS DE VENTAS ====================

  async getMetricasVentas(fechaInicio?: Date, fechaFin?: Date): Promise<MetricasVentas> {
    try {
      const ventas = await dbManager.getAllVentas();
      const ventasFiltradas = this.filtrarPorFechas(ventas, fechaInicio, fechaFin);

      return {
        ventasPorHora: this.calcularVentasPorHora(ventasFiltradas),
        productosMasVendidos: await this.calcularProductosMasVendidos(ventasFiltradas, 10),
        productosMenosVendidos: await this.calcularProductosMenosVendidos(ventasFiltradas, 10),
        metodoPagoMasUsado: this.calcularMetodosPago(ventasFiltradas),
        ticketPromedio: this.calcularTicketPromedio(ventasFiltradas),
        tiempoPromedioAtencion: await this.calcularTiempoPromedioAtencion(),
        tasaConversion: await this.calcularTasaConversion(),
      };
    } catch (error) {
      logger.error('Error calculando métricas de ventas', error as Error);
      throw error;
    }
  }

  /**
   * Ventas por hora del día
   */
  private calcularVentasPorHora(ventas: any[]): { hora: number; cantidad: number; total: number }[] {
    const ventasPorHora: { [hora: number]: { cantidad: number; total: number } } = {};

    // Inicializar todas las horas
    for (let h = 0; h < 24; h++) {
      ventasPorHora[h] = { cantidad: 0, total: 0 };
    }

    // Contar ventas por hora
    ventas.forEach(venta => {
      const fecha = new Date(venta.fecha);
      const hora = fecha.getHours();
      
      ventasPorHora[hora].cantidad++;
      ventasPorHora[hora].total += venta.total;
    });

    return Object.entries(ventasPorHora).map(([hora, data]) => ({
      hora: parseInt(hora),
      cantidad: data.cantidad,
      total: data.total,
    }));
  }

  /**
   * Productos más vendidos
   */
  private async calcularProductosMasVendidos(ventas: any[], limite: number = 10) {
    const productosVendidos: { 
      [id: string]: { 
        nombre: string; 
        cantidad: number; 
        total: number 
      } 
    } = {};

    // Contar productos
    ventas.forEach(venta => {
      venta.items.forEach((item: any) => {
        if (!productosVendidos[item.productoId]) {
          productosVendidos[item.productoId] = {
            nombre: item.nombre,
            cantidad: 0,
            total: 0,
          };
        }
        
        productosVendidos[item.productoId].cantidad += item.cantidad;
        productosVendidos[item.productoId].total += item.subtotal;
      });
    });

    // Convertir a array y ordenar
    return Object.entries(productosVendidos)
      .map(([id, data]) => ({
        productoId: id,
        nombre: data.nombre,
        cantidad: data.cantidad,
        total: data.total,
      }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, limite);
  }

  /**
   * Productos menos vendidos
   */
  private async calcularProductosMenosVendidos(ventas: any[], limite: number = 10) {
    const todos = await this.calcularProductosMasVendidos(ventas, 9999);
    return todos.slice(-limite).reverse();
  }

  /**
   * Métodos de pago más usados
   */
  private calcularMetodosPago(ventas: any[]) {
    const metodosPago: { [metodo: string]: number } = {};
    
    ventas.forEach(venta => {
      const metodo = venta.metodoPago || 'desconocido';
      metodosPago[metodo] = (metodosPago[metodo] || 0) + 1;
    });

    const total = ventas.length;
    
    return Object.entries(metodosPago).map(([metodo, cantidad]) => ({
      metodo,
      cantidad,
      porcentaje: (cantidad / total) * 100,
    })).sort((a, b) => b.cantidad - a.cantidad);
  }

  /**
   * Ticket promedio
   */
  private calcularTicketPromedio(ventas: any[]): number {
    if (ventas.length === 0) return 0;
    
    const totalVentas = ventas.reduce((sum, venta) => sum + venta.total, 0);
    return totalVentas / ventas.length;
  }

  /**
   * Tiempo promedio de atención
   */
  private async calcularTiempoPromedioAtencion(): Promise<number> {
    // Calcular basado en eventos de inicio/fin de venta
    const eventosVenta = await this.getEventosPorTipo('venta');
    
    // Simulación simplificada (puedes mejorar esto)
    return 180; // 3 minutos promedio
  }

  /**
   * Tasa de conversión (productos buscados vs agregados al carrito)
   */
  private async calcularTasaConversion(): Promise<number> {
    const busquedas = await this.getEventosPorTipo('busqueda');
    const agregados = await this.getEventosPorTipo('producto_agregado');
    
    if (busquedas.length === 0) return 0;
    
    return (agregados.length / busquedas.length) * 100;
  }

  // ==================== MÉTRICAS DE INVENTARIO ====================

  async getMetricasInventario(): Promise<MetricasInventario> {
    try {
      const productos = await dbManager.getAllProductos();
      const ventas = await dbManager.getAllVentas();

      return {
        rotacionProductos: await this.calcularRotacionProductos(productos, ventas),
        stockCritico: this.identificarStockCritico(productos),
        valorInventario: this.calcularValorInventario(productos),
        productosSinMovimiento: await this.identificarProductosSinMovimiento(productos, ventas),
      };
    } catch (error) {
      logger.error('Error calculando métricas de inventario', error as Error);
      throw error;
    }
  }

  /**
   * Rotación de productos (ventas / stock promedio)
   */
  private async calcularRotacionProductos(productos: any[], ventas: any[]) {
    const ventasPorProducto: { [id: string]: number } = {};
    
    // Contar ventas totales por producto
    ventas.forEach(venta => {
      venta.items.forEach((item: any) => {
        ventasPorProducto[item.productoId] = 
          (ventasPorProducto[item.productoId] || 0) + item.cantidad;
      });
    });

    return productos
      .map(producto => ({
        productoId: producto.id,
        nombre: producto.nombre,
        rotacion: (ventasPorProducto[producto.id] || 0) / (producto.stock || 1),
      }))
      .sort((a, b) => b.rotacion - a.rotacion)
      .slice(0, 20);
  }

  /**
   * Stock crítico
   */
  private identificarStockCritico(productos: any[]) {
    return productos
      .filter(p => p.stock <= (p.minStock || 5))
      .map(p => ({
        productoId: p.id,
        nombre: p.nombre,
        stock: p.stock,
        minStock: p.minStock || 5,
      }))
      .sort((a, b) => a.stock - b.stock);
  }

  /**
   * Valor total del inventario
   */
  private calcularValorInventario(productos: any[]): number {
    return productos.reduce((total, p) => {
      return total + (p.stock * p.costo);
    }, 0);
  }

  /**
   * Productos sin movimiento (30+ días)
   */
  private async identificarProductosSinMovimiento(productos: any[], ventas: any[]) {
    const hace30Dias = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    const productosConVentas = new Set<string>();
    
    ventas
      .filter(v => new Date(v.fecha).getTime() > hace30Dias)
      .forEach(venta => {
        venta.items.forEach((item: any) => {
          productosConVentas.add(item.productoId);
        });
      });

    return productos
      .filter(p => !productosConVentas.has(p.id))
      .map(p => ({
        productoId: p.id,
        nombre: p.nombre,
        ultimaVenta: undefined, // Podríamos calcularlo
      }));
  }

  // ==================== HELPERS ====================

  private filtrarPorFechas(ventas: any[], fechaInicio?: Date, fechaFin?: Date) {
    if (!fechaInicio && !fechaFin) return ventas;
    
    return ventas.filter(venta => {
      const fechaVenta = new Date(venta.fecha).getTime();
      
      if (fechaInicio && fechaVenta < fechaInicio.getTime()) return false;
      if (fechaFin && fechaVenta > fechaFin.getTime()) return false;
      
      return true;
    });
  }

  private async saveEvent(evento: EventoAnalytics) {
    try {
      await dbManager.addLog('analytics', evento.tipo, evento.datos);
    } catch (error) {
      console.error('Error guardando evento analytics:', error);
    }
  }

  private async getEventosPorTipo(tipo: string): Promise<EventoAnalytics[]> {
    // Implementación simplificada
    return [];
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getCurrentUser(): string {
    try {
      const userStr = localStorage.getItem('pos-user');
      if (userStr) {
        const user = JSON.parse(userStr);
        return user.username || 'desconocido';
      }
    } catch (error) {
      // Ignorar
    }
    return 'sistema';
  }

  private startSession() {
    this.track('session_start', {
      timestamp: this.sessionStartTime,
    });
  }

  /**
   * Finalizar sesión (al cerrar app)
   */
  endSession() {
    const sessionDuration = Date.now() - this.sessionStartTime;
    this.track('session_end', {
      duration: sessionDuration,
      eventosRegistrados: this.eventos.length,
    });
  }
}

// Singleton
export const analyticsService = new AnalyticsService();

// Finalizar sesión al cerrar ventana
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    analyticsService.endSession();
  });
}
