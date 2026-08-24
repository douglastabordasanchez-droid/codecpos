/**
 * ============================================
 * SERVICIO DE PERSISTENCIA HISTÓRICA - CODEC POS v2.0
 * Sistema "Cero Borrón y Cuenta Nueva"
 * ============================================
 *
 * Este servicio guarda automáticamente:
 * - Datos de ventas diarias antes del cierre de caja
 * - Estadísticas por hora, día, semana, mes y año
 * - Histórico de cierres de caja
 * - Productos más vendidos por período
 * - Comparativas de ingresos
 *
 * Los datos se guardan en IndexedDB (invisible para el usuario)
 * y pueden ser consultados para reportes y dashboard.
 */

import { openDB, IDBPDatabase } from 'idb';

// ===========================
// TIPOS DE DATOS HISTÓRICOS
// ===========================

export interface VentaHistorica {
  id: string;
  fecha: string; // ISO string
  hora: string; // HH:mm
  cajero: string;
  cajeroId: string;
  totalVenta: number;
  metodoPago: 'efectivo' | 'tarjeta' | 'nequi' | 'daviplata' | 'transferencia' | 'bancolombia';
  productos: {
    id: string;
    nombre: string;
    cantidad: number;
    precio: number;
    subtotal: number;
  }[];
}

export interface CierreHistorico {
  id: string;
  fecha: string; // ISO string - día completo
  cajero: string;
  cajeroId: string;
  baseInicial: number;
  totalSistema: number;
  totalFisico: number;
  diferencia: number;
  estado: 'cuadrado' | 'faltante' | 'sobrante';
  desglose: {
    efectivo: number;
    tarjeta: number;
    nequi: number;
    daviplata: number;
    transferencia: number;
    bancolombia?: number;
    rappi?: number;
  };
  cantidadVentas: number;
  observaciones?: string;
}

export interface EstadisticaDiaria {
  fecha: string; // YYYY-MM-DD
  totalIngresos: number;
  totalVentas: number; // cantidad
  ticketPromedio: number;
  ventasPorHora: { hora: string; ventas: number; ingresos: number }[];
  productosMasVendidos: { id: string; nombre: string; cantidad: number; totalVentas: number }[];
  metodosPago: {
    efectivo: number;
    tarjeta: number;
    nequi: number;
    daviplata: number;
    transferencia: number;
    bancolombia?: number;
    rappi?: number;
  };
}

export interface RangoFechas {
  inicio: string; // YYYY-MM-DD
  fin: string; // YYYY-MM-DD
}

export interface ContabilidadDiaria {
  id: string;
  fecha: string; // YYYY-MM-DD
  cajero: string;
  cajeroId: string;
  saldoInicialCaja: number;
  ventasDelDia: number;
  saldoFinalCaja: number; // saldoInicialCaja + ventasDelDia
  totalTransacciones: number;
}

// ===========================
// CONFIGURACIÓN INDEXEDDB
// ===========================

const DB_NAME = 'codec_pos_historico';
const DB_VERSION = 2;

const STORES = {
  VENTAS: 'ventas_historico',
  CIERRES: 'cierres_historico',
  ESTADISTICAS: 'estadisticas_diarias',
  CONTABILIDAD_DIARIA: 'contabilidad_diaria',
};

class HistoricoService {
  private db: IDBPDatabase | null = null;

  /**
   * Inicializar base de datos
   */
  async init(): Promise<void> {
    try {
      this.db = await openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          // Store de ventas históricas
          if (!db.objectStoreNames.contains(STORES.VENTAS)) {
            const ventasStore = db.createObjectStore(STORES.VENTAS, { keyPath: 'id' });
            ventasStore.createIndex('fecha', 'fecha', { unique: false });
            ventasStore.createIndex('cajeroId', 'cajeroId', { unique: false });
            ventasStore.createIndex('metodoPago', 'metodoPago', { unique: false });
          }

          // Store de cierres históricos
          if (!db.objectStoreNames.contains(STORES.CIERRES)) {
            const cierresStore = db.createObjectStore(STORES.CIERRES, { keyPath: 'id' });
            cierresStore.createIndex('fecha', 'fecha', { unique: false });
            cierresStore.createIndex('cajeroId', 'cajeroId', { unique: false });
          }

          // Store de estadísticas diarias
          if (!db.objectStoreNames.contains(STORES.ESTADISTICAS)) {
            const statsStore = db.createObjectStore(STORES.ESTADISTICAS, { keyPath: 'fecha' });
          }

          // Store de contabilidad diaria consolidada
          if (!db.objectStoreNames.contains(STORES.CONTABILIDAD_DIARIA)) {
            const contStore = db.createObjectStore(STORES.CONTABILIDAD_DIARIA, { keyPath: 'id' });
            contStore.createIndex('fecha', 'fecha', { unique: false });
            contStore.createIndex('cajeroId', 'cajeroId', { unique: false });
          }
        },
      });

      console.log('✅ Base de datos histórica inicializada');
    } catch (error) {
      console.error('❌ Error inicializando base de datos histórica:', error);
      throw error;
    }
  }

  /**
   * Verificar si la base de datos está inicializada
   */
  private async ensureDB(): Promise<void> {
    if (!this.db) {
      await this.init();
    }
  }

  // ===========================
  // GUARDAR DATOS
  // ===========================

  /**
   * Guardar una venta en el histórico
   */
  async guardarVenta(venta: VentaHistorica): Promise<void> {
    await this.ensureDB();
    if (!this.db) return;

    try {
      await this.db.add(STORES.VENTAS, venta);
      console.log(`✅ Venta guardada en histórico: ${venta.id}`);
    } catch (error) {
      console.error('❌ Error guardando venta:', error);
      throw error;
    }
  }

  /**
   * Guardar cierre de caja en el histórico
   */
  async guardarCierre(cierre: CierreHistorico): Promise<void> {
    await this.ensureDB();
    if (!this.db) return;

    try {
      await this.db.add(STORES.CIERRES, cierre);
      console.log(`✅ Cierre guardado en histórico: ${cierre.id}`);
    } catch (error) {
      console.error('❌ Error guardando cierre:', error);
      throw error;
    }
  }

  /**
   * Guardar estadísticas diarias
   */
  async guardarEstadisticasDiarias(stats: EstadisticaDiaria): Promise<void> {
    await this.ensureDB();
    if (!this.db) return;

    try {
      await this.db.put(STORES.ESTADISTICAS, stats);
      console.log(`✅ Estadísticas guardadas para: ${stats.fecha}`);
    } catch (error) {
      console.error('❌ Error guardando estadísticas:', error);
      throw error;
    }
  }

  async guardarContabilidadDiaria(contabilidad: ContabilidadDiaria): Promise<void> {
    await this.ensureDB();
    if (!this.db) return;

    try {
      await this.db.put(STORES.CONTABILIDAD_DIARIA, contabilidad);
      console.log(`✅ Contabilidad diaria guardada para: ${contabilidad.fecha}`);
    } catch (error) {
      console.error('❌ Error guardando contabilidad diaria:', error);
      throw error;
    }
  }

  // ===========================
  // CONSULTAR DATOS
  // ===========================

  /**
   * Obtener ventas de un rango de fechas
   */
  async getVentasPorRango(rango: RangoFechas): Promise<VentaHistorica[]> {
    await this.ensureDB();
    if (!this.db) return [];

    try {
      const inicio = new Date(rango.inicio).toISOString();
      const fin = new Date(rango.fin + 'T23:59:59').toISOString();

      const todasVentas = await this.db.getAllFromIndex(STORES.VENTAS, 'fecha');

      return todasVentas.filter(venta =>
        venta.fecha >= inicio && venta.fecha <= fin
      );
    } catch (error) {
      console.error('❌ Error obteniendo ventas:', error);
      return [];
    }
  }

  /**
   * Obtener cierres de un rango de fechas
   */
  async getCierresPorRango(rango: RangoFechas): Promise<CierreHistorico[]> {
    await this.ensureDB();
    if (!this.db) return [];

    try {
      const todosCierres = await this.db.getAll(STORES.CIERRES);

      return todosCierres.filter(cierre =>
        cierre.fecha >= rango.inicio && cierre.fecha <= rango.fin
      );
    } catch (error) {
      console.error('❌ Error obteniendo cierres:', error);
      return [];
    }
  }

  /**
   * Obtener estadísticas diarias
   */
  async getEstadisticasDiarias(fecha: string): Promise<EstadisticaDiaria | null> {
    await this.ensureDB();
    if (!this.db) return null;

    try {
      return await this.db.get(STORES.ESTADISTICAS, fecha);
    } catch (error) {
      console.error('❌ Error obteniendo estadísticas:', error);
      return null;
    }
  }

  /**
   * Obtener estadísticas de un rango (semana, mes, año)
   */
  async getEstadisticasRango(rango: RangoFechas): Promise<EstadisticaDiaria[]> {
    await this.ensureDB();
    if (!this.db) return [];

    try {
      const todasStats = await this.db.getAll(STORES.ESTADISTICAS);

      return todasStats.filter(stat =>
        stat.fecha >= rango.inicio && stat.fecha <= rango.fin
      );
    } catch (error) {
      console.error('❌ Error obteniendo estadísticas de rango:', error);
      return [];
    }
  }

  async getContabilidadPorRango(rango: RangoFechas): Promise<ContabilidadDiaria[]> {
    await this.ensureDB();
    if (!this.db) return [];

    try {
      const data = await this.db.getAll(STORES.CONTABILIDAD_DIARIA);
      return data.filter(item => item.fecha >= rango.inicio && item.fecha <= rango.fin);
    } catch (error) {
      console.error('❌ Error obteniendo contabilidad por rango:', error);
      return [];
    }
  }

  // ===========================
  // UTILIDADES
  // ===========================

  /**
   * Limpiar datos antiguos (opcional - para liberar espacio)
   * Elimina datos de más de X días
   */
  async limpiarDatosAntiguos(diasRetener: number = 180): Promise<void> {
    await this.ensureDB();
    if (!this.db) return;

    try {
      const fechaLimite = new Date();
      fechaLimite.setDate(fechaLimite.getDate() - diasRetener);
      const fechaLimiteISO = fechaLimite.toISOString();

      // Limpiar ventas
      const ventas = await this.db.getAllFromIndex(STORES.VENTAS, 'fecha');
      for (const venta of ventas) {
        if (venta.fecha < fechaLimiteISO) {
          await this.db.delete(STORES.VENTAS, venta.id);
        }
      }

      // Limpiar cierres
      const cierres = await this.db.getAll(STORES.CIERRES);
      for (const cierre of cierres) {
        if (cierre.fecha < fechaLimiteISO.split('T')[0]) {
          await this.db.delete(STORES.CIERRES, cierre.id);
        }
      }

      console.log(`✅ Datos antiguos (>${diasRetener} días) eliminados`);
    } catch (error) {
      console.error('❌ Error limpiando datos antiguos:', error);
    }
  }

  /**
   * Exportar todos los datos históricos (para backup)
   */
  async exportarDatos(): Promise<{
    ventas: VentaHistorica[];
    cierres: CierreHistorico[];
    estadisticas: EstadisticaDiaria[];
    contabilidad: ContabilidadDiaria[];
    metadata: {
      version: string;
      exportedAt: string;
    };
  }> {
    await this.ensureDB();
    if (!this.db) {
      return {
        ventas: [],
        cierres: [],
        estadisticas: [],
        contabilidad: [],
        metadata: { version: '2.0', exportedAt: new Date().toISOString() },
      };
    }

    try {
      const ventas = await this.db.getAll(STORES.VENTAS);
      const cierres = await this.db.getAll(STORES.CIERRES);
      const estadisticas = await this.db.getAll(STORES.ESTADISTICAS);
      const contabilidad = await this.db.getAll(STORES.CONTABILIDAD_DIARIA);

      return {
        ventas,
        cierres,
        estadisticas,
        contabilidad,
        metadata: {
          version: '2.0',
          exportedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error('❌ Error exportando datos:', error);
      return {
        ventas: [],
        cierres: [],
        estadisticas: [],
        contabilidad: [],
        metadata: { version: '2.0', exportedAt: new Date().toISOString() },
      };
    }
  }

  /**
   * Importar datos históricos desde JSON (compatible con formatos previos)
   */
  async importarDatos(payload: any): Promise<{ ok: boolean; ventas: number; cierres: number; estadisticas: number; contabilidad: number }> {
    await this.ensureDB();
    if (!this.db) return { ok: false, ventas: 0, cierres: 0, estadisticas: 0, contabilidad: 0 };

    try {
      const ventas = Array.isArray(payload?.ventas) ? payload.ventas : [];
      const cierres = Array.isArray(payload?.cierres) ? payload.cierres : [];
      const estadisticas = Array.isArray(payload?.estadisticas) ? payload.estadisticas : [];
      const contabilidad = Array.isArray(payload?.contabilidad) ? payload.contabilidad : [];

      let ventasOk = 0;
      let cierresOk = 0;
      let statsOk = 0;
      let contOk = 0;

      for (const venta of ventas) {
        if (!venta?.id || !venta?.fecha) continue;
        await this.db.put(STORES.VENTAS, venta as VentaHistorica);
        ventasOk++;
      }

      for (const cierre of cierres) {
        if (!cierre?.id || !cierre?.fecha) continue;
        await this.db.put(STORES.CIERRES, cierre as CierreHistorico);
        cierresOk++;
      }

      for (const stat of estadisticas) {
        if (!stat?.fecha) continue;
        await this.db.put(STORES.ESTADISTICAS, stat as EstadisticaDiaria);
        statsOk++;
      }

      for (const cont of contabilidad) {
        if (!cont?.id || !cont?.fecha) continue;
        await this.db.put(STORES.CONTABILIDAD_DIARIA, cont as ContabilidadDiaria);
        contOk++;
      }

      return { ok: true, ventas: ventasOk, cierres: cierresOk, estadisticas: statsOk, contabilidad: contOk };
    } catch (error) {
      console.error('❌ Error importando datos históricos:', error);
      return { ok: false, ventas: 0, cierres: 0, estadisticas: 0, contabilidad: 0 };
    }
  }

  /**
   * Eliminar TODO el histórico (usar solo tras respaldo)
   */
  async limpiarTodoHistorico(): Promise<{ ok: boolean; borrados: { ventas: number; cierres: number; estadisticas: number; contabilidad: number } }> {
    await this.ensureDB();
    if (!this.db) {
      return { ok: false, borrados: { ventas: 0, cierres: 0, estadisticas: 0, contabilidad: 0 } };
    }

    try {
      const ventas = await this.db.count(STORES.VENTAS);
      const cierres = await this.db.count(STORES.CIERRES);
      const estadisticas = await this.db.count(STORES.ESTADISTICAS);
      const contabilidad = await this.db.count(STORES.CONTABILIDAD_DIARIA);

      await this.db.clear(STORES.VENTAS);
      await this.db.clear(STORES.CIERRES);
      await this.db.clear(STORES.ESTADISTICAS);
      await this.db.clear(STORES.CONTABILIDAD_DIARIA);

      return { ok: true, borrados: { ventas, cierres, estadisticas, contabilidad } };
    } catch (error) {
      console.error('❌ Error limpiando histórico completo:', error);
      return { ok: false, borrados: { ventas: 0, cierres: 0, estadisticas: 0, contabilidad: 0 } };
    }
  }

  /**
   * Obtener tamaño aproximado de la base de datos
   */
  async getTamañoBaseDatos(): Promise<{
    ventas: number;
    cierres: number;
    estadisticas: number;
    total: number;
  }> {
    await this.ensureDB();
    if (!this.db) return { ventas: 0, cierres: 0, estadisticas: 0, total: 0 };

    try {
      const ventasCount = await this.db.count(STORES.VENTAS);
      const cierresCount = await this.db.count(STORES.CIERRES);
      const estadisticasCount = await this.db.count(STORES.ESTADISTICAS);

      return {
        ventas: ventasCount,
        cierres: cierresCount,
        estadisticas: estadisticasCount,
        total: ventasCount + cierresCount + estadisticasCount,
      };
    } catch (error) {
      console.error('❌ Error obteniendo tamaño de base de datos:', error);
      return { ventas: 0, cierres: 0, estadisticas: 0, total: 0 };
    }
  }
}

// Singleton
export const historicoService = new HistoricoService();

// Inicializar automáticamente
historicoService.init().catch(console.error);
