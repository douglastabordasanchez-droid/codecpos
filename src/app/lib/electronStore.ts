/**
 * Sistema de Almacenamiento Empresarial para Electron
 * Reemplaza localStorage con persistencia robusta en %APPDATA%
 * Todos los datos se comparten en tiempo real entre POS y Dashboard
 */

import { dbManager } from './indexedDB';
import { logger } from './logger';

// Tipos del sistema
export interface Venta {
  id: string;
  numero: number;
  fecha: string;
  fechaOperativa?: string;
  sesionCajaId?: string;
  items: VentaItem[];
  subtotal: number;
  descuento: number;
  total: number;
  metodoPago: MetodoPago;
  pagoMixto?: PagoMixtoDetalle; // Para pagos distribuidos
  cajero: string;
  cajeroId: string;
  cliente?: string;
  sincronizado: boolean;
  puntoVentaId: string;
  createdAt: number;
  syncStatus: 'pending' | 'synced';
  costoTotal?: number; // Costo total de la venta (para calcular utilidad)
  facturaEstado?: string;
  folioElectronico?: string | null;
  cufe?: string | null;
  qrUrl?: string | null;
  facturacionElectronica?: boolean;
  mesa?: string;
  referencia_mesa?: string;
}

export interface VentaItem {
  id: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  precio: number;
  precioVenta: number; // Precio de venta unitario
  precioCompra: number; // Precio de compra unitario (para utilidad)
  subtotal: number;
  categoria: string;
  costo?: number; // Alias de precioCompra para compatibilidad
  productoTipo?: 'directo' | 'receta';
  recipeId?: string;
  modifiers?: ModifierSaleItem[];
  recipeSnapshot?: {
    recipeId: string;
    ingredientes: Array<{ ingredientId: string; nombre?: string; cantidad: number; unidad: string }>;
  };
  modifiersSnapshot?: Array<{
    modifierOptionId: string;
    nombre: string;
    cantidad: number;
    precioVenta: number;
    costo: number;
    ingredientId?: string;
    consumoInventario?: number;
    unidadInventario?: string;
  }>;
  comboComponents?: Array<{
    tipo: 'producto' | 'ingrediente';
    refId: string;
    nombre: string;
    cantidad: number;
    unidad?: string;
  }>;
}

export interface ModifierSaleItem {
  modifierOptionId: string;
  nombre: string;
  cantidad?: number;
  precioVenta?: number;
  costo?: number;
  ingredientId?: string;
  consumoInventario?: number;
  unidadInventario?: string;
}

interface InventoryValidationResult {
  ok: boolean;
  faltantes: Array<{
    tipo: 'producto' | 'ingrediente';
    id: string;
    nombre: string;
    requerido: number;
    disponible: number;
    unidad?: string;
  }>;
}

export type MetodoPago = 'efectivo' | 'tarjeta' | 'nequi' | 'daviplata' | 'transferencia' | 'rappi' | 'mixto' | 'bonos';

export interface PagoMixtoDetalle {
  efectivo?: number;
  tarjeta?: number;
  nequi?: number;
  daviplata?: number;
  transferencia?: number;
  rappi?: number;
}

export interface TurnoEmpleado {
  id: string;
  cajeroId: string;
  cajeroNombre: string;
  horaInicio: string; // ISO string
  horaFin?: string; // ISO string (null si sigue activo)
  duracion?: number; // minutos
  ventasRealizadas: number;
  totalVendido: number;
  puntoVentaId: string;
}

export interface EstadisticasDia {
  fecha: string;
  totalVentas: number;
  totalTransacciones?: number;
  totalIngresosBrutos?: number;
  totalIngresos: number;
  totalCostos: number;
  utilidadProductos?: number;
  utilidadVentasDevueltas?: number;
  ventasSinCostoBaseCantidad?: number;
  utilidadNeta: number;
  ventasPorMetodo: Record<MetodoPago, number>;
  ventasPorCajero: Record<string, number>;
  totalDevolucionesMonto?: number;
  totalDevolucionesCantidad?: number;
  ticketPromedio?: number;
  ventasPorHora?: any[];
  productosMasVendidos?: any[];
  productosPopulares?: any[];
}

interface DevolucionDia {
  id: string;
  fecha: string;
  ventaId?: string;
  totalDevolucion: number;
  metodoPago?: MetodoPago | string;
  procesadoPor?: string;
  items?: Array<{
    productoId: string;
    cantidadDevuelta: number;
    precioUnitario?: number;
    subtotal?: number;
  }>;
}

interface RegistrarDevolucionPayload {
  devolucion: DevolucionDia;
  marcarVentaComoDevuelta?: boolean;
}

interface FiltroDashboard {
  cajeroId?: string;
  cajeroNombre?: string;
  incluirTodosLosCajeros?: boolean;
  sesionCajaId?: string;
}

const normalizarTexto = (valor: unknown): string =>
  String(valor || '')
    .trim()
    .toLowerCase();

interface ResultadoResetSistema {
  exito: boolean;
  mensaje: string;
}

export interface IngredienteInventarioItem {
  id: string;
  nombre: string;
  unidad: string;
  stockActual: number;
  stockMinimo: number;
  costoUnitario?: number;
  categoria?: string;
  activo?: boolean;
  updatedAt?: number;
  /** Si es true, el ingrediente aparece en el inventario general del POS (ProductosPage) */
  enInventarioGeneral?: boolean;
  /** Módulo que lo creó: 'panaderia_onces', 'taller_reparaciones', etc. */
  moduloOrigen?: string;
}

export interface RecetaItem {
  id: string;
  nombre: string;
  productoId: string;
  rendimiento?: number;
  activa?: boolean;
  updatedAt?: number;
}

export interface RecetaIngredienteItem {
  id: string;
  recipeId: string;
  ingredientId: string;
  cantidad: number;
  unidad: string;
  mermaPct?: number;
}

export interface ModificadorProductoItem {
  id: string;
  productoId: string;
  nombre: string;
  requerido?: boolean;
  maxOpciones?: number;
  activo?: boolean;
}

export interface OpcionModificadorItem {
  id: string;
  modificadorId: string;
  nombre: string;
  precioVenta: number;
  costo?: number;
  ingredientId?: string;
  consumoInventario?: number;
  unidadInventario?: string;
  activo?: boolean;
}

export interface MermaItem {
  id: string;
  fecha: string;
  ingredientId: string;
  cantidad: number;
  unidad: string;
  motivo?: string;
  costoUnitario?: number;
}

export interface ComboOncesItem {
  id: string;
  nombre: string;
  codigo: string;
  keyword: string;
  precio: number;
  activo?: boolean;
  createdAt?: number;
  componentes: Array<{
    tipo: 'producto' | 'ingrediente';
    refId: string;
    nombre: string;
    cantidad: number;
    unidad?: string;
  }>;
}

export interface InventarioProductoItem {
  id: string;
  codigo: string;
  nombre: string;
  precio: number;
  stock: number;
  categoria: string;
  categoriaId?: string; // ID de la categoría unificada (codecpos_categorias_global)
  costo: number;
  pesable?: boolean;
  aplicaIVA?: boolean;
  tipoInventario?: 'directo' | 'receta';
  recipeId?: string;
  comboComponents?: Array<{
    tipo: 'producto' | 'ingrediente';
    refId: string;
    nombre: string;
    cantidad: number;
    unidad?: string;
  }>;
  modifiersConfig?: Array<{
    modifierOptionId: string;
    nombre: string;
    precioVenta?: number;
    costo?: number;
    ingredientId?: string;
    consumoInventario?: number;
    unidadInventario?: string;
  }>;
  [key: string]: any;
}

// Emisor de eventos para sincronización en tiempo real
class EventEmitter {
  private listeners: Map<string, Set<Function>> = new Map();

  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function) {
    this.listeners.get(event)?.delete(callback);
  }

  emit(event: string, data?: any) {
    this.listeners.get(event)?.forEach(callback => callback(data));
  }
}

export const storeEvents = new EventEmitter();

/**
 * Servicio de Almacenamiento Empresarial
 */
class ElectronStoreService {
  private turnoActual: Map<string, TurnoEmpleado> = new Map();

  private getFechaLocalISO(date: Date = new Date()): string {
    const tzOffsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffsetMs).toISOString().split('T')[0];
  }

  private esVentaDevueltaOAnulada(venta: Venta): boolean {
    const estado = String((venta as any)?.estado || '').toLowerCase();
    return estado === 'devuelto' || estado === 'anulado';
  }

  // ==================== TURNOS Y EMPLEADOS ====================
  
  async iniciarTurno(cajeroId: string, cajeroNombre: string): Promise<TurnoEmpleado> {
    const puntoVentaId = await dbManager.getConfig('puntoVentaId') || 'POS-001';
    
    const turno: TurnoEmpleado = {
      id: `TURNO-${Date.now()}-${cajeroId}`,
      cajeroId,
      cajeroNombre,
      horaInicio: new Date().toISOString(),
      ventasRealizadas: 0,
      totalVendido: 0,
      puntoVentaId
    };

    this.turnoActual.set(cajeroId, turno);
    await dbManager.setConfig(`turno_${cajeroId}`, turno);
    
    console.log(`⏰ Turno iniciado: ${cajeroNombre} a las ${new Date(turno.horaInicio).toLocaleTimeString()}`);
    storeEvents.emit('turno:inicio', turno);
    
    return turno;
  }

  async finalizarTurno(cajeroId: string): Promise<TurnoEmpleado | null> {
    const turno = this.turnoActual.get(cajeroId);
    if (!turno) return null;

    const horaFin = new Date().toISOString();
    const duracion = Math.floor((new Date(horaFin).getTime() - new Date(turno.horaInicio).getTime()) / 60000);

    const turnoFinalizado: TurnoEmpleado = {
      ...turno,
      horaFin,
      duracion
    };

    this.turnoActual.delete(cajeroId);
    await dbManager.setConfig(`turno_${cajeroId}_finalizado_${Date.now()}`, turnoFinalizado);
    
    console.log(`⏸️ Turno finalizado: ${turno.cajeroNombre} - Duración: ${duracion} minutos`);
    storeEvents.emit('turno:fin', turnoFinalizado);
    
    return turnoFinalizado;
  }

  async obtenerTurnoActual(cajeroId: string): Promise<TurnoEmpleado | null> {
    if (this.turnoActual.has(cajeroId)) {
      return this.turnoActual.get(cajeroId)!;
    }

    // Intentar recuperar del almacenamiento
    const turno = await dbManager.getConfig(`turno_${cajeroId}`);
    if (turno && !turno.horaFin) {
      this.turnoActual.set(cajeroId, turno);
      return turno;
    }

    return null;
  }

  async obtenerTodosLosTurnosActivos(): Promise<TurnoEmpleado[]> {
    const turnos: TurnoEmpleado[] = [];
    
    // Recuperar todos los turnos activos
    const allConfigs = await dbManager.getAllConfigs();
    
    for (const [key, value] of Object.entries(allConfigs)) {
      if (key.startsWith('turno_') && !key.includes('_finalizado_') && value && !value.horaFin) {
        turnos.push(value as TurnoEmpleado);
      }
    }
    
    return turnos;
  }

  // Alias para obtenerTodosLosTurnosActivos
  async obtenerTurnosActivos(): Promise<TurnoEmpleado[]> {
    return this.obtenerTodosLosTurnosActivos();
  }

  calcularDuracionTurno(turno: TurnoEmpleado): number {
    const inicio = new Date(turno.horaInicio).getTime();
    const fin = turno.horaFin ? new Date(turno.horaFin).getTime() : Date.now();
    return Math.floor((fin - inicio) / 60000); // Retornar en minutos
  }

  formatearDuracionTurno(minutos: number): string {
    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    return `${horas}h ${mins}m`;
  }

  // ==================== VENTAS ====================

  /** Registra un ingreso de servicio (taller u otros) sin validar ni descontar inventario */
  async registrarVentaServicio(venta: Venta): Promise<void> {
    await dbManager.addVenta(venta as any);
    storeEvents.emit('venta:nueva', venta);
  }

  /**
   * 🛡️ Intenta re-guardar en IndexedDB cualquier venta que haya quedado
   * varada en 'pos-ventas-pendientes' (ver catch de registrarVenta). Antes
   * esa clave se escribía pero nunca se volvía a leer en ningún lugar del
   * código — una venta que caía ahí quedaba perdida para siempre (no
   * aparecía en reportes, cierres ni estadísticas). Se ejecuta best-effort
   * al inicio de cada venta nueva, así que la app se auto-repara sola en
   * cuanto IndexedDB vuelve a estar disponible.
   */
  private async flushVentasPendientes(): Promise<void> {
    let pendientes: any[] = [];
    try { pendientes = JSON.parse(localStorage.getItem('pos-ventas-pendientes') || '[]'); } catch { return; }
    if (!Array.isArray(pendientes) || pendientes.length === 0) return;

    const siguenPendientes: any[] = [];
    for (const ventaPendiente of pendientes) {
      try { await dbManager.addVenta(ventaPendiente); } catch { siguenPendientes.push(ventaPendiente); }
    }
    try { localStorage.setItem('pos-ventas-pendientes', JSON.stringify(siguenPendientes)); } catch { /* no crítico */ }

    const recuperadas = pendientes.length - siguenPendientes.length;
    if (recuperadas > 0) {
      logger.info(`♻️ ${recuperadas} venta(s) que había(n) quedado pendiente(s) se recuperaron en IndexedDB`);
    }
  }

  async registrarVenta(venta: Venta): Promise<void> {
    // Descontar inventario (best-effort, nunca bloquea la venta)
    try { await this.descontarInventarioVenta(venta.items || []); } catch { /* continuar */ }

    // 🛡️ Antes de guardar la venta actual, intenta recuperar cualquier venta
    // anterior que se haya quedado varada (best-effort, nunca bloquea).
    try { await this.flushVentasPendientes(); } catch { /* no crítico */ }

    // Guardar en IndexedDB; si falla, se deja constancia en localStorage
    // COMO RESPALDO (para poder recuperarla luego con flushVentasPendientes),
    // pero el error se relanza — el llamador (POSPageNew.tsx) es quien decide
    // cómo avisar al cajero y auditar el fallo en la Caja Negra. Antes este
    // catch absorbía el error silenciosamente y la venta quedaba varada sin
    // que nadie se enterara.
    try {
      await dbManager.addVenta(venta as any);
    } catch (error) {
      try {
        const pendientes: any[] = JSON.parse(localStorage.getItem('pos-ventas-pendientes') || '[]');
        pendientes.push(venta);
        localStorage.setItem('pos-ventas-pendientes', JSON.stringify(pendientes));
      } catch { /* sin almacenamiento — continuar */ }
      throw error;
    }

    // Actualizar turno del cajero (no crítico)
    try {
      const turno = await this.obtenerTurnoActual(venta.cajeroId);
      if (turno) {
        turno.ventasRealizadas++;
        turno.totalVendido += venta.total;
        this.turnoActual.set(venta.cajeroId, turno);
        await dbManager.setConfig(`turno_${venta.cajeroId}`, turno);
        storeEvents.emit('turno:actualizado', turno);
      }
    } catch { /* turno no crítico */ }

    storeEvents.emit('venta:nueva', venta);
    console.log(`💰 Venta registrada: #${venta.numero} - Total: $${venta.total.toLocaleString()}`);
  }

  async obtenerVentas(): Promise<Venta[]> {
    return (await dbManager.getAllVentas()) as unknown as Venta[];
  }

  async getUltimoNumeroVenta(): Promise<number> {
    return dbManager.getUltimoNumeroVenta();
  }

  async obtenerVentasDelDia(filtro?: FiltroDashboard): Promise<Venta[]> {
    const ventas = await this.obtenerVentas();
    const sesionCajaId = normalizarTexto(filtro?.sesionCajaId);

    if (sesionCajaId) {
      let ventasSesion = ventas.filter(v => normalizarTexto((v as any)?.sesionCajaId) === sesionCajaId);

      if (!filtro?.incluirTodosLosCajeros && (filtro?.cajeroId || filtro?.cajeroNombre)) {
        const cajeroIdFiltro = normalizarTexto(filtro?.cajeroId);
        const cajeroNombreFiltro = normalizarTexto(filtro?.cajeroNombre);

        ventasSesion = ventasSesion.filter(v => {
          const coincidePorId = cajeroIdFiltro
            ? normalizarTexto((v as any)?.cajeroId) === cajeroIdFiltro
            : false;

          const coincidePorNombre = cajeroNombreFiltro
            ? normalizarTexto((v as any)?.cajero) === cajeroNombreFiltro
            : false;

          return coincidePorId || coincidePorNombre;
        });
      }

      return ventasSesion;
    }

    const hoy = this.getFechaLocalISO();

    // ✅ Día operativo: inicia desde el último cierre de caja
    const ultimoCierreTs = Number(localStorage.getItem('pos_ultimo_cierre_ts') || 0);
    const inicioCalendario = new Date(`${hoy}T00:00:00`).getTime();
    const inicioOperativo = Math.max(inicioCalendario, ultimoCierreTs);

    let ventasFiltradas = ventas.filter(v => new Date(v.fecha).getTime() >= inicioOperativo);

    if (!filtro?.incluirTodosLosCajeros && (filtro?.cajeroId || filtro?.cajeroNombre)) {
      const cajeroIdFiltro = normalizarTexto(filtro?.cajeroId);
      const cajeroNombreFiltro = normalizarTexto(filtro?.cajeroNombre);

      ventasFiltradas = ventasFiltradas.filter(v => {
        const coincidePorId = cajeroIdFiltro
          ? normalizarTexto((v as any)?.cajeroId) === cajeroIdFiltro
          : false;

        const coincidePorNombre = cajeroNombreFiltro
          ? normalizarTexto((v as any)?.cajero) === cajeroNombreFiltro
          : false;

        return coincidePorId || coincidePorNombre;
      });
    }

    return ventasFiltradas;
  }

  // ==================== ESTADÍSTICAS Y DASHBOARD ====================

  async calcularEstadisticasDelDia(filtro?: FiltroDashboard): Promise<EstadisticasDia> {
    const ventas = await this.obtenerVentasDelDia(filtro);
    const hoy = this.getFechaLocalISO();
    const productosInventario = await this.obtenerProductos();
    const indexCostoInventario = new Map<string, number>();
    for (const p of (Array.isArray(productosInventario) ? productosInventario : [])) {
      const costo = Number((p as any)?.costo);
      if (!Number.isFinite(costo)) continue;
      const id = normalizarTexto((p as any)?.id);
      const codigo = normalizarTexto((p as any)?.codigo);
      const nombre = normalizarTexto((p as any)?.nombre);
      if (id) indexCostoInventario.set(`id:${id}`, costo);
      if (codigo) indexCostoInventario.set(`codigo:${codigo}`, costo);
      if (nombre) indexCostoInventario.set(`nombre:${nombre}`, costo);
    }

    // 💰 LEER CONFIGURACIÓN DE MARGEN PERSONALIZADO
    let margenConfig = { activo: false, porcentaje: 30 };
    try {
      const saved = localStorage.getItem('pos-margen-automatico-config');
      if (saved) {
        margenConfig = JSON.parse(saved);
      }
    } catch (error) {
      console.error('Error leyendo config de margen:', error);
    }

    let totalIngresos = 0;
    let totalIngresosBrutos = 0;
    let totalCostos = 0;
    let utilidadProductos = 0;
    let utilidadVentasDevueltas = 0;
    let ventasSinCostoBaseCantidad = 0;
    const ventasPorMetodo: Record<MetodoPago, number> = {
      efectivo: 0,
      tarjeta: 0,
      nequi: 0,
      daviplata: 0,
      transferencia: 0,
      rappi: 0,
      mixto: 0,
      bonos: 0,
    };
    const ventasPorCajero: Record<string, number> = {};

    const ventasInvalidasPorEstado = ventas.filter(v => this.esVentaDevueltaOAnulada(v));
    const ventasNeteables = ventas.filter(v => !this.esVentaDevueltaOAnulada(v));

    for (const venta of ventasNeteables) {
      // Asegurar que total es un número
      const total = Number(venta.total) || 0;
      totalIngresos += total;
      totalIngresosBrutos += total;

      // Calcular costos
      for (const item of venta.items) {
        const keyId = `id:${normalizarTexto((item as any)?.id)}`;
        const keyCodigo = `codigo:${normalizarTexto((item as any)?.codigo)}`;
        const keyNombre = `nombre:${normalizarTexto((item as any)?.nombre)}`;
        const costoInventario = indexCostoInventario.get(keyId)
          ?? indexCostoInventario.get(keyCodigo)
          ?? indexCostoInventario.get(keyNombre);
        // Fuente obligatoria: inventario; fallback a venta para compatibilidad histórica
        const costo = Number(
          costoInventario ?? (item as any)?.costo ?? (item as any)?.precioCompra
        ) || 0;
        if (!(Number(costoInventario) > 0)) {
          ventasSinCostoBaseCantidad += 1;
        }
        const cantidad = Number(item.cantidad) || 0;
        const precioVenta = Number((item as any)?.precioVenta ?? (item as any)?.precio) || 0;
        totalCostos += costo * cantidad;
        utilidadProductos += (precioVenta - costo) * cantidad;
      }

      // 💰 CONTAR POR MÉTODO DE PAGO (con soporte para pagos mixtos)
      if (venta.metodoPago === 'mixto' && venta.pagoMixto) {
        // 🔥 DISTRIBUIR PAGO MIXTO A CADA MÉTODO INDIVIDUAL
        const pagoMixto = venta.pagoMixto;
        if (pagoMixto.efectivo && pagoMixto.efectivo > 0) {
          ventasPorMetodo.efectivo += Number(pagoMixto.efectivo);
        }
        if (pagoMixto.tarjeta && pagoMixto.tarjeta > 0) {
          ventasPorMetodo.tarjeta += Number(pagoMixto.tarjeta);
        }
        if (pagoMixto.nequi && pagoMixto.nequi > 0) {
          ventasPorMetodo.nequi += Number(pagoMixto.nequi);
        }
        if (pagoMixto.daviplata && pagoMixto.daviplata > 0) {
          ventasPorMetodo.daviplata += Number(pagoMixto.daviplata);
        }
        if (pagoMixto.transferencia && pagoMixto.transferencia > 0) {
          ventasPorMetodo.transferencia += Number(pagoMixto.transferencia);
        }
        if (pagoMixto.rappi && pagoMixto.rappi > 0) {
          ventasPorMetodo.rappi += Number(pagoMixto.rappi);
        }
      } else if (venta.metodoPago && ventasPorMetodo[venta.metodoPago] !== undefined) {
        // Pago simple - sumar al método correspondiente
        ventasPorMetodo[venta.metodoPago] += total;
      }

      // Contar por cajero
      if (venta.cajero) {
        ventasPorCajero[venta.cajero] = (ventasPorCajero[venta.cajero] || 0) + total;
      }
    }

    // ↩️ Neteo por devoluciones del día operativo
    const devoluciones = await this.obtenerDevolucionesDelDia(filtro);
    const totalDevolucionesRegistradas = devoluciones.reduce(
      (sum, d) => sum + (Number(d.totalDevolucion) || 0),
      0
    );
    let totalDevolucionesNeteables = 0;

    for (const devolucion of devoluciones) {
      const monto = Number(devolucion.totalDevolucion) || 0;
      if (monto <= 0) continue;

      const ventaOrigen = devolucion.ventaId
        ? ventas.find((v) => String(v?.id || '') === String(devolucion.ventaId || ''))
        : null;

      // ✅ Evitar doble descuento:
      // si la venta origen ya está en estado devuelto/anulado,
      // no descontar otra vez esta devolución en métodos ni en totalIngresos.
      const ventaYaExcluidaPorEstado = ventaOrigen ? this.esVentaDevueltaOAnulada(ventaOrigen) : false;
      if (ventaYaExcluidaPorEstado) {
        continue;
      }

      // Solo acumular devoluciones realmente neteables
      totalDevolucionesNeteables += monto;

      // Anular utilidad de ventas devueltas: (precio - costo inventario) * cantidad
      if (Array.isArray(devolucion.items)) {
        for (const itemDevuelto of devolucion.items) {
          const ventaOrigenItem = (ventaOrigen?.items || []).find((vi: any) => String(vi?.id || '') === String(itemDevuelto?.productoId || ''));
          const precioVenta = Number(itemDevuelto?.precioUnitario ?? ventaOrigenItem?.precioVenta ?? ventaOrigenItem?.precio) || 0;
          const keyId = `id:${normalizarTexto(itemDevuelto?.productoId)}`;
          const keyCodigo = `codigo:${normalizarTexto(ventaOrigenItem?.codigo)}`;
          const keyNombre = `nombre:${normalizarTexto(ventaOrigenItem?.nombre)}`;
          const costoInventario = indexCostoInventario.get(keyId)
            ?? indexCostoInventario.get(keyCodigo)
            ?? indexCostoInventario.get(keyNombre);
          const costo = Number(costoInventario ?? ventaOrigenItem?.costo ?? ventaOrigenItem?.precioCompra) || 0;
          const cantidad = Number(itemDevuelto?.cantidadDevuelta) || 0;
          utilidadVentasDevueltas += (precioVenta - costo) * cantidad;
        }
      }

      // ✅ Si la venta original fue mixta, repartir devolución proporcional
      // entre métodos para no distorsionar efectivo en cierre de caja.
      if (ventaOrigen?.metodoPago === 'mixto' && ventaOrigen?.pagoMixto) {
        const totalVenta = Number(ventaOrigen.total) || 0;
        const pagoMixto = ventaOrigen.pagoMixto;

        if (totalVenta > 0) {
          const metodosBase: Array<Exclude<MetodoPago, 'mixto'>> = [
            'efectivo',
            'tarjeta',
            'nequi',
            'daviplata',
            'transferencia',
            'rappi',
          ];

          for (const metodoBase of metodosBase) {
            const montoMetodo = Number(pagoMixto[metodoBase] || 0);
            if (montoMetodo <= 0) continue;

            const proporcion = montoMetodo / totalVenta;
            const descuentoMetodo = monto * proporcion;
            ventasPorMetodo[metodoBase] = Math.max(
              0,
              ventasPorMetodo[metodoBase] - descuentoMetodo
            );
          }

          continue;
        }
      }

      // Venta no mixta: descontar por método directo de la devolución
      const metodo = (devolucion.metodoPago || '') as MetodoPago;
      if (metodo && ventasPorMetodo[metodo] !== undefined) {
        ventasPorMetodo[metodo] = Math.max(0, ventasPorMetodo[metodo] - monto);
      }
    }

    // ✅ totalIngresos ya se construye con ventasNeteables (excluye devueltas/anuladas)
    // así que aquí solo se deben descontar devoluciones registradas para evitar doble descuento.
    totalIngresos = Math.max(0, totalIngresos - totalDevolucionesNeteables);

    // 🆕 INCLUIR GASTOS EN EL CÁLCULO DE UTILIDAD NETA
    let totalGastos = 0;
    try {
      const gastosStr = localStorage.getItem('pos-gastos');
      if (gastosStr) {
        const gastos = JSON.parse(gastosStr);
        // Filtrar solo los gastos del día actual
        const gastosHoy = gastos.filter((g: any) => {
          const fechaGasto = g.fecha.split('T')[0];
          return fechaGasto === hoy;
        });
        totalGastos = gastosHoy.reduce((sum: number, g: any) => sum + (Number(g.monto) || 0), 0);
      }
    } catch (error) {
      console.error('Error calculando gastos del día:', error);
    }

    // ✅ Utilidad Neta = Ingresos - Costos - Gastos
    const utilidadNeta = totalIngresos - totalCostos - totalGastos;

    const estadisticas: EstadisticasDia = {
      fecha: hoy,
      // ✅ ventasNeteables ya excluye estados devuelto/anulado
      // por lo tanto solo descontamos cantidad de devoluciones registradas.
      totalVentas: Math.max(0, ventasNeteables.length - devoluciones.length),
      totalIngresosBrutos,
      totalIngresos,
      totalCostos,
      utilidadProductos,
      utilidadVentasDevueltas,
      ventasSinCostoBaseCantidad,
      utilidadNeta,
      ventasPorMetodo,
      ventasPorCajero,
      // Mostrar todas las devoluciones registradas del día (incluye las
      // que ya dejaron la venta en estado devuelto/anulado).
      totalDevolucionesMonto: totalDevolucionesRegistradas,
      totalDevolucionesCantidad: devoluciones.length,
    };

    // Guardar en cache
    await dbManager.setConfig('estadisticas_dia', estadisticas);
    storeEvents.emit('estadisticas:actualizadas', estadisticas);

    console.log(`📊 Estadísticas calculadas - Ingresos Netos: $${totalIngresos} | Devoluciones registradas: $${totalDevolucionesRegistradas} | Devoluciones neteables: $${totalDevolucionesNeteables} | Costos: $${totalCostos} | Gastos: $${totalGastos} | Utilidad Neta: $${utilidadNeta}`);

    return estadisticas;
  }

  // ==================== VALIDACIÓN DE PAGOS MIXTOS ====================

  validarPagoMixto(pagoMixto: PagoMixtoDetalle, totalVenta: number): boolean {
    const totalPagado = 
      (pagoMixto.efectivo || 0) +
      (pagoMixto.tarjeta || 0) +
      (pagoMixto.nequi || 0) +
      (pagoMixto.daviplata || 0) +
      (pagoMixto.transferencia || 0);

    return Math.abs(totalPagado - totalVenta) < 0.01; // Tolerancia de 1 centavo
  }

  formatearPagoMixto(pagoMixto: PagoMixtoDetalle): string {
    const partes: string[] = [];
    
    if (pagoMixto.efectivo && pagoMixto.efectivo > 0) {
      partes.push(`Efectivo: $${pagoMixto.efectivo.toLocaleString()}`);
    }
    if (pagoMixto.tarjeta && pagoMixto.tarjeta > 0) {
      partes.push(`Tarjeta: $${pagoMixto.tarjeta.toLocaleString()}`);
    }
    if (pagoMixto.nequi && pagoMixto.nequi > 0) {
      partes.push(`Nequi: $${pagoMixto.nequi.toLocaleString()}`);
    }
    if (pagoMixto.daviplata && pagoMixto.daviplata > 0) {
      partes.push(`Daviplata: $${pagoMixto.daviplata.toLocaleString()}`);
    }
    if (pagoMixto.transferencia && pagoMixto.transferencia > 0) {
      partes.push(`Transferencia: $${pagoMixto.transferencia.toLocaleString()}`);
    }

    return partes.join(' / ');
  }

  // ==================== INVENTARIO Y PRODUCTOS ====================

  async actualizarStockProducto(productoId: string, cantidadVendida: number): Promise<void> {
    try {
      // Obtener productos del localStorage
      const productosStr = localStorage.getItem('pos-productos');
      if (!productosStr) return;

      const productos = JSON.parse(productosStr);
      const producto = productos.find((p: any) => p.id === productoId);
      
      if (producto) {
        producto.stock = Math.max(0, producto.stock - cantidadVendida);
        localStorage.setItem('pos-productos', JSON.stringify(productos));
        
        // Emitir evento de actualización de inventario
        storeEvents.emit('inventario:actualizado', { productoId, nuevoStock: producto.stock });
        
        // Verificar alerta de stock bajo
        if (producto.stock <= (producto.stockMinimo || 5)) {
          storeEvents.emit('alerta:stock-bajo', producto);
          console.warn(`⚠️ ALERTA: Stock bajo para ${producto.nombre} (${producto.stock} unidades)`);
        }
      }
    } catch (error) {
      console.error('Error actualizando stock:', error);
    }
  }

  async devolverProductoAlInventario(productoId: string, cantidadDevuelta: number): Promise<void> {
    try {
      const productosStr = localStorage.getItem('pos-productos');
      if (!productosStr) return;

      const productos = JSON.parse(productosStr);
      const producto = productos.find((p: any) => p.id === productoId);

      if (producto) {
        producto.stock = (Number(producto.stock) || 0) + (Number(cantidadDevuelta) || 0);
        localStorage.setItem('pos-productos', JSON.stringify(productos));
        storeEvents.emit('inventario:actualizado', { productoId, nuevoStock: producto.stock });
      }
    } catch (error) {
      console.error('Error devolviendo producto al inventario:', error);
      throw error;
    }
  }

  async addInventoryItem(item: any): Promise<any> {
    try {
      const productosStr = localStorage.getItem('pos-productos');
      const productos = productosStr ? JSON.parse(productosStr) : [];

      const productoNormalizado = {
        id: String(item?.id || `MAN-${Date.now()}`),
        codigo: String(item?.codigo || `MAN-${Date.now()}`),
        nombre: String(item?.nombre || 'Producto Manual').trim(),
        precio: Number(item?.precio) || 0,
        stock: Math.max(0, Number(item?.stock) || 0),
        categoria: String(item?.categoria || 'Manuales').trim() || 'Manuales',
        costo: Math.max(0, Number(item?.costo) || 0),
        pesable: false,
        aplicaIVA: Boolean(item?.aplicaIVA),
      };

      const yaExiste = (productos as any[]).some(
        (p: any) => p?.id === productoNormalizado.id || p?.codigo === productoNormalizado.codigo
      );

      if (yaExiste) {
        throw new Error('Ya existe un producto con ese ID o código manual.');
      }

      const productosActualizados = [...productos, productoNormalizado];
      localStorage.setItem('pos-productos', JSON.stringify(productosActualizados));

      storeEvents.emit('inventario:actualizado', {
        productoId: productoNormalizado.id,
        nuevoStock: productoNormalizado.stock,
      });

      return productoNormalizado;
    } catch (error) {
      console.error('Error agregando item manual al inventario:', error);
      throw error;
    }
  }

  async upsertProducto(item: Partial<InventarioProductoItem>): Promise<InventarioProductoItem> {
    try {
      const productosStr = localStorage.getItem('pos-productos');
      const productos = productosStr ? JSON.parse(productosStr) : [];

      const productoNormalizado: InventarioProductoItem = {
        ...item,
        id: String(item?.id || `PROD-${Date.now()}`),
        codigo: String(item?.codigo || `PROD-${Date.now()}`),
        nombre: String(item?.nombre || 'Producto').trim(),
        precio: Number(item?.precio) || 0,
        stock: Math.max(0, Number(item?.stock) || 0),
        categoria: String(item?.categoria || 'General').trim() || 'General',
        costo: Math.max(0, Number(item?.costo) || 0),
        pesable: Boolean(item?.pesable),
        aplicaIVA: Boolean(item?.aplicaIVA),
      } as InventarioProductoItem;

      const index = (productos as any[]).findIndex(
        (p: any) => String(p?.id) === productoNormalizado.id || String(p?.codigo) === productoNormalizado.codigo
      );

      if (index >= 0) {
        productos[index] = { ...productos[index], ...productoNormalizado };
      } else {
        productos.unshift(productoNormalizado);
      }

      localStorage.setItem('pos-productos', JSON.stringify(productos));
      storeEvents.emit('inventario:actualizado', {
        productoId: productoNormalizado.id,
        nuevoStock: productoNormalizado.stock,
      });

      return productoNormalizado;
    } catch (error) {
      console.error('Error guardando producto en inventario:', error);
      throw error;
    }
  }

  async obtenerDevolucionesDelDia(filtro?: FiltroDashboard): Promise<DevolucionDia[]> {
    try {
      const devoluciones = JSON.parse(localStorage.getItem('codecpos_devoluciones') || '[]');
      const hoy = this.getFechaLocalISO();
      const ultimoCierreTs = Number(localStorage.getItem('pos_ultimo_cierre_ts') || 0);
      const inicioCalendario = new Date(`${hoy}T00:00:00`).getTime();
      const inicioOperativo = Math.max(inicioCalendario, ultimoCierreTs);

      let devolucionesFiltradas = devoluciones.filter((d: DevolucionDia) => new Date(d.fecha).getTime() >= inicioOperativo);

      if (!filtro?.incluirTodosLosCajeros && filtro?.cajeroId) {
        const ventas = await this.obtenerVentas();
        const ventaIdPorCajero = new Set(
          (ventas || [])
            .filter((v: any) => v?.cajeroId === filtro.cajeroId)
            .map((v: any) => v?.id)
        );

        const nombresCajero = new Set(
          (ventas || [])
            .filter((v: any) => v?.cajeroId === filtro.cajeroId)
            .map((v: any) => String(v?.cajero || '').trim().toLowerCase())
            .filter(Boolean)
        );

        devolucionesFiltradas = devolucionesFiltradas.filter((d: DevolucionDia) => {
          if (d.ventaId && ventaIdPorCajero.has(d.ventaId)) return true;
          const procesadoPor = String(d?.procesadoPor || '').trim().toLowerCase();
          return !!procesadoPor && nombresCajero.has(procesadoPor);
        });
      }

      return devolucionesFiltradas;
    } catch (error) {
      console.error('Error obteniendo devoluciones del día:', error);
      return [];
    }
  }

  async obtenerResumenDevolucionesDelDia(filtro?: FiltroDashboard): Promise<{ cantidad: number; monto: number }> {
    const devoluciones = await this.obtenerDevolucionesDelDia(filtro);
    return {
      cantidad: devoluciones.length,
      monto: devoluciones.reduce((sum, d) => sum + (Number(d.totalDevolucion) || 0), 0),
    };
  }

  async obtenerDevolucionesPorRango(inicio: Date, fin: Date, filtro?: FiltroDashboard): Promise<DevolucionDia[]> {
    try {
      const devoluciones = JSON.parse(localStorage.getItem('codecpos_devoluciones') || '[]');
      const inicioTs = inicio.getTime();
      const finTs = fin.getTime();

      let devolucionesFiltradas = devoluciones.filter((d: DevolucionDia) => {
        const fecha = new Date(d.fecha).getTime();
        return fecha >= inicioTs && fecha <= finTs;
      });

      if (!filtro?.incluirTodosLosCajeros && filtro?.cajeroId) {
        const ventas = await this.obtenerVentas();
        const ventaIdPorCajero = new Set(
          (ventas || [])
            .filter((v: any) => v?.cajeroId === filtro.cajeroId)
            .map((v: any) => v?.id)
        );

        const nombresCajero = new Set(
          (ventas || [])
            .filter((v: any) => v?.cajeroId === filtro.cajeroId)
            .map((v: any) => String(v?.cajero || '').trim().toLowerCase())
            .filter(Boolean)
        );

        devolucionesFiltradas = devolucionesFiltradas.filter((d: DevolucionDia) => {
          if (d.ventaId && ventaIdPorCajero.has(d.ventaId)) return true;
          const procesadoPor = String(d?.procesadoPor || '').trim().toLowerCase();
          return !!procesadoPor && nombresCajero.has(procesadoPor);
        });
      }

      return devolucionesFiltradas;
    } catch (error) {
      console.error('Error obteniendo devoluciones por rango:', error);
      return [];
    }
  }

  async registrarDevolucionAtomica(payload: RegistrarDevolucionPayload): Promise<void> {
    const { devolucion, marcarVentaComoDevuelta = true } = payload;
    const ventas = await this.obtenerVentas();
    const venta = devolucion.ventaId ? ventas.find(v => v.id === devolucion.ventaId) : null;

    if (!devolucion?.id || !devolucion?.fecha || !devolucion?.ventaId || !venta) {
      throw new Error('No se pudo registrar devolución: venta origen no válida');
    }

    const backupDevoluciones = localStorage.getItem('codecpos_devoluciones') || '[]';
    const backupProductos = localStorage.getItem('pos-productos') || '[]';

    try {
      const devoluciones = JSON.parse(backupDevoluciones);
      if (devoluciones.some((d: any) => d?.id === devolucion.id)) {
        return;
      }

      // 1) Persistir devolución
      devoluciones.push(devolucion);
      localStorage.setItem('codecpos_devoluciones', JSON.stringify(devoluciones));

      // 2) Regresar inventario de todos los ítems devueltos
      const items = Array.isArray(devolucion.items) ? devolucion.items : [];
      for (const item of items) {
        await this.devolverProductoAlInventario(item.productoId, Number(item.cantidadDevuelta) || 0);
      }

      // 3) Marcar venta original como devuelta SOLO si la devolución cubre
      // el 100% de cantidades de la venta (blindaje contra devoluciones parciales)
      const cantidadesDevueltasPorProducto = new Map<string, number>();
      for (const item of items) {
        const productoId = String(item.productoId || '');
        const cantidadDevuelta = Number(item.cantidadDevuelta) || 0;
        if (!productoId || cantidadDevuelta <= 0) continue;
        cantidadesDevueltasPorProducto.set(
          productoId,
          (cantidadesDevueltasPorProducto.get(productoId) || 0) + cantidadDevuelta
        );
      }

      const devolucionCubreTodaLaVenta =
        Array.isArray((venta as any).items) &&
        (venta as any).items.length > 0 &&
        (venta as any).items.every((ventaItem: any) => {
          const productoId = String(ventaItem?.id || '');
          const cantidadOriginal = Number(ventaItem?.cantidad) || 0;
          const cantidadDevuelta = cantidadesDevueltasPorProducto.get(productoId) || 0;
          return cantidadOriginal > 0 && cantidadDevuelta >= cantidadOriginal;
        });

      if (marcarVentaComoDevuelta && devolucionCubreTodaLaVenta) {
        await dbManager.updateVenta({
          ...(venta as any),
          estado: 'devuelto',
          updatedAt: Date.now(),
        } as any);
      }

      storeEvents.emit('devolucion:registrada', devolucion);
      storeEvents.emit('venta:nueva', { id: venta.id, tipo: 'devolucion' });
      storeEvents.emit('estadisticas:actualizadas');
    } catch (error) {
      // rollback best effort
      localStorage.setItem('codecpos_devoluciones', backupDevoluciones);
      localStorage.setItem('pos-productos', backupProductos);
      console.error('Error en devolución atómica, rollback aplicado:', error);
      throw error;
    }
  }

  async resetearSistemaEnCero(): Promise<ResultadoResetSistema> {
    try {
      // 🚨 Caja negra: este es EXACTAMENTE el tipo de acción que un cliente
      // podría negar haber ejecutado ("el sistema se borró solo"). Se registra
      // ANTES de borrar, con el conteo de lo que se está eliminando, para que
      // quede evidencia física e irrefutable en el .log fuera de %AppData%.
      const [productosPrevios, ventasPrevias] = await Promise.all([
        dbManager.getAllProductos().catch(() => []),
        dbManager.getAllVentas().catch(() => []),
      ]);
      logger.critical(
        'RESETEO TOTAL DEL SISTEMA ejecutado desde Configuración (acción manual e irreversible del usuario)',
        undefined,
        { productosEliminados: productosPrevios.length, ventasEliminadas: ventasPrevias.length }
      );

      await dbManager.clearAllData();

      // 🛡️ FIX: todo cliente creado desde el Panel de Administración recibe
      // rol 'super_usuario' (ver DeveloperPanel.tsx), el MISMO rol que
      // habilita este botón (esSuperUsuario, AuthContext.tsx) — sin esta
      // protección, cualquier cliente podía borrar su propia cuenta/licencia
      // local sin querer, dejándolo sin acceso a su propio sistema. Este
      // reseteo sigue limpiando los datos operativos de la tienda (productos,
      // ventas, config, personal/cajeros) tal como antes; lo único que ahora
      // se preserva es la cuenta/licencia administrada por el reseller.
      const clavesPreservadas = new Set([
        'theme',
        'darkMode',
        'codecpos_dev_clientes',
      ]);
      const prefijosPreservados = [
        'codec_pos_modulos_cliente_',
        'codec_pos_permisos_usuarios',
      ];
      // Estas dos claves mezclan cuentas de personal/cajeros (se deben borrar
      // en un reseteo) con la cuenta del cliente creada por el panel
      // (creadoPor === 'PANEL_DESARROLLADOR', nunca se debe borrar) — se
      // filtran en vez de borrarse por completo.
      const clavesUsuariosAFiltrar = ['codecpos_usuarios', 'codec_pos_usuarios'];
      for (const clave of clavesUsuariosAFiltrar) {
        try {
          const lista = JSON.parse(localStorage.getItem(clave) || '[]');
          if (Array.isArray(lista)) {
            const conservados = lista.filter((u: any) => u?.creadoPor === 'PANEL_DESARROLLADOR');
            if (conservados.length > 0) {
              localStorage.setItem(clave, JSON.stringify(conservados));
              clavesPreservadas.add(clave);
            }
          }
        } catch { /* si no se puede parsear, se borra normalmente abajo */ }
      }

      const claves = Object.keys(localStorage);
      for (const clave of claves) {
        if (clavesPreservadas.has(clave)) continue;
        if (prefijosPreservados.some(p => clave.startsWith(p))) continue;
        localStorage.removeItem(clave);
      }

      sessionStorage.clear();
      storeEvents.emit('sistema:reseteado');

      return {
        exito: true,
        mensaje: 'Sistema reiniciado en 0 correctamente',
      };
    } catch (error) {
      console.error('Error reseteando sistema en 0:', error);
      logger.error('Error reseteando sistema en 0', error as Error);
      return {
        exito: false,
        mensaje: 'No se pudo resetear el sistema. Intenta nuevamente.',
      };
    }
  }

  async descontarInventarioVenta(items: VentaItem[]): Promise<void> {
    const productos = this.getLS<any[]>('pos-productos', []);
    const ingredientes = this.getLS<any[]>('pos-ingredientes-inventario', []);
    const recipes = this.getLS<any[]>('pos-recetas', []);
    const recipeIngredients = this.getLS<any[]>('pos-receta-ingredientes', []);
    const movimientos = this.getLS<any[]>('codecpos_stock_movements', []);

    const mapProductos = new Map(productos.map((p: any) => [String(p.id), p]));
    const mapIngredientes = new Map(ingredientes.map((i: any) => [String(i.id), i]));

    for (const item of items) {
      const cantidadVenta = Number(item.cantidad) || 0;
      if (cantidadVenta <= 0) continue;

      if (Array.isArray(item.comboComponents) && item.comboComponents.length > 0) {
        for (const comp of item.comboComponents) {
          const requeridoCombo = (Number(comp.cantidad) || 0) * cantidadVenta;
          if (requeridoCombo <= 0) continue;

          if (comp.tipo === 'ingrediente') {
            const ing = mapIngredientes.get(String(comp.refId));
            if (!ing) continue;
            ing.stockActual = Math.max(0, (Number(ing.stockActual) || 0) - requeridoCombo);
            movimientos.push({
              id: `MOV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              fecha: new Date().toISOString(),
              tipo: 'venta_combo_ingrediente',
              productoId: item.id,
              productoNombre: item.nombre,
              ingredientId: ing.id,
              ingredientNombre: ing.nombre,
              cantidad: requeridoCombo,
              unidad: comp.unidad || ing.unidad,
            });
            continue;
          }

          const prodComp = mapProductos.get(String(comp.refId));
          if (!prodComp) continue;
          prodComp.stock = Math.max(0, (Number(prodComp.stock) || 0) - requeridoCombo);
          movimientos.push({
            id: `MOV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            fecha: new Date().toISOString(),
            tipo: 'venta_combo_producto',
            productoId: item.id,
            productoNombre: item.nombre,
            componenteProductoId: prodComp.id,
            componenteProductoNombre: prodComp.nombre,
            cantidad: requeridoCombo,
            unidad: comp.unidad || prodComp.unidad || 'und',
          });
        }
      }

      const producto = mapProductos.get(String(item.id));
      const tipoInventario = (item.productoTipo || producto?.tipoInventario || 'directo') as 'directo' | 'receta';
      const recipeId = String(item.recipeId || producto?.recipeId || '');

      if (tipoInventario === 'receta' && recipeId) {
        const receta = recipes.find((r: any) => String(r.id) === recipeId);
        const insumos = recipeIngredients.filter((ri: any) => String(ri.recipeId) === recipeId);

        if (producto) {
          producto.stock = Math.max(0, (Number(producto.stock) || 0) - cantidadVenta);
          movimientos.push({
            id: `MOV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            fecha: new Date().toISOString(),
            tipo: 'venta_receta_producto',
            productoId: producto.id,
            productoNombre: producto.nombre,
            cantidad: cantidadVenta,
            unidad: producto.unidad || 'und',
          });
          storeEvents.emit('inventario:actualizado', { productoId: producto.id, nuevoStock: producto.stock });
          if (producto.stock <= (producto.stockMinimo || 5)) {
            storeEvents.emit('alerta:stock-bajo', producto);
          }
        }

        for (const ri of insumos) {
          const ing = mapIngredientes.get(String(ri.ingredientId));
          if (!ing) continue;
          const requerido = (Number(ri.cantidad) || 0) * cantidadVenta;
          ing.stockActual = Math.max(0, (Number(ing.stockActual) || 0) - requerido);
          movimientos.push({
            id: `MOV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            fecha: new Date().toISOString(),
            tipo: 'venta_receta_ingrediente',
            productoId: item.id,
            productoNombre: item.nombre,
            recipeId,
            recipeNombre: receta?.nombre || item.nombre,
            ingredientId: ing.id,
            ingredientNombre: ing.nombre,
            cantidad: requerido,
            unidad: ri.unidad || ing.unidad,
          });
          storeEvents.emit('inventario:actualizado', { productoId: ing.id, nuevoStock: ing.stockActual });
          if (ing.stockActual <= (Number(ing.stockMinimo) || 0)) {
            storeEvents.emit('alerta:stock-bajo', { ...ing, tipo: 'ingrediente' });
          }
        }
      } else if (producto) {
        producto.stock = Math.max(0, (Number(producto.stock) || 0) - cantidadVenta);
        movimientos.push({
          id: `MOV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          fecha: new Date().toISOString(),
          tipo: 'venta_directa',
          productoId: producto.id,
          productoNombre: producto.nombre,
          cantidad: cantidadVenta,
          unidad: producto.unidad || 'und',
        });
        storeEvents.emit('inventario:actualizado', { productoId: producto.id, nuevoStock: producto.stock });
        if (producto.stock <= (producto.stockMinimo || 5)) {
          storeEvents.emit('alerta:stock-bajo', producto);
        }
      }

      for (const mod of (item.modifiers || [])) {
        if (!mod.ingredientId || !mod.consumoInventario) continue;
        const ing = mapIngredientes.get(String(mod.ingredientId));
        if (!ing) continue;
        const modCant = Number(mod.cantidad) || 1;
        const requeridoMod = (Number(mod.consumoInventario) || 0) * modCant * cantidadVenta;
        ing.stockActual = Math.max(0, (Number(ing.stockActual) || 0) - requeridoMod);
        movimientos.push({
          id: `MOV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          fecha: new Date().toISOString(),
          tipo: 'venta_modificador',
          productoId: item.id,
          productoNombre: item.nombre,
          ingredientId: ing.id,
          ingredientNombre: ing.nombre,
          modifierOptionId: mod.modifierOptionId,
          modifierNombre: mod.nombre,
          cantidad: requeridoMod,
          unidad: mod.unidadInventario || ing.unidad,
        });
        storeEvents.emit('inventario:actualizado', { productoId: ing.id, nuevoStock: ing.stockActual });
        if (ing.stockActual <= (Number(ing.stockMinimo) || 0)) {
          storeEvents.emit('alerta:stock-bajo', { ...ing, tipo: 'ingrediente' });
        }
      }
    }

    this.setLS('pos-productos', productos);
    this.setLS('pos-ingredientes-inventario', ingredientes);
    this.setLS('codecpos_stock_movements', movimientos);
    console.log(`📦 Inventario híbrido actualizado para ${items.length} productos`);
  }

  // ==================== MÓDULO CAFETERÍA / PANADERÍA ====================

  async obtenerIngredientesInventario(): Promise<IngredienteInventarioItem[]> {
    return this.getLS<IngredienteInventarioItem[]>('pos-ingredientes-inventario', []);
  }

  async guardarIngredientesInventario(items: IngredienteInventarioItem[]): Promise<void> {
    this.setLS('pos-ingredientes-inventario', items);
    storeEvents.emit('inventario:actualizado', { tipo: 'ingredientes', total: items.length });
  }

  async upsertIngrediente(item: IngredienteInventarioItem): Promise<IngredienteInventarioItem> {
    const items = await this.obtenerIngredientesInventario();
    const idx = items.findIndex(i => i.id === item.id);
    const normalized: IngredienteInventarioItem = {
      ...item,
      stockActual: Math.max(0, Number(item.stockActual) || 0),
      stockMinimo: Math.max(0, Number(item.stockMinimo) || 0),
      updatedAt: Date.now(),
      activo: item.activo !== false,
    };
    if (idx >= 0) items[idx] = normalized;
    else items.unshift(normalized);
    await this.guardarIngredientesInventario(items);
    return normalized;
  }

  async obtenerRecetas(): Promise<RecetaItem[]> {
    return this.getLS<RecetaItem[]>('pos-recetas', []);
  }

  async obtenerRecetaIngredientes(): Promise<RecetaIngredienteItem[]> {
    return this.getLS<RecetaIngredienteItem[]>('pos-receta-ingredientes', []);
  }

  async guardarRecetas(recetas: RecetaItem[], recipeIngredients: RecetaIngredienteItem[]): Promise<void> {
    this.setLS('pos-recetas', recetas);
    this.setLS('pos-receta-ingredientes', recipeIngredients);
  }

  async obtenerCombosOnces(): Promise<ComboOncesItem[]> {
    return this.getLS<ComboOncesItem[]>('pos-combos-onces', []);
  }

  async guardarCombosOnces(items: ComboOncesItem[]): Promise<void> {
    this.setLS('pos-combos-onces', items);
  }

  async upsertComboOnces(item: ComboOncesItem): Promise<ComboOncesItem> {
    const combos = await this.obtenerCombosOnces();
    const idx = combos.findIndex(c => c.id === item.id || c.codigo === item.codigo);
    const normalized: ComboOncesItem = {
      ...item,
      precio: Number(item.precio) || 0,
      keyword: String(item.keyword || '').trim().toLowerCase(),
      activo: item.activo !== false,
      createdAt: item.createdAt || Date.now(),
    };
    if (idx >= 0) combos[idx] = normalized;
    else combos.unshift(normalized);
    await this.guardarCombosOnces(combos);
    return normalized;
  }

  async guardarMermas(mermas: MermaItem[]): Promise<void> {
    this.setLS('codecpos_mermas', mermas);
    storeEvents.emit('inventario:actualizado', { tipo: 'mermas', total: mermas.length });
  }

  async registrarMerma(payload: Omit<MermaItem, 'id' | 'fecha'> & { fecha?: string }): Promise<MermaItem> {
    const ingredientes = await this.obtenerIngredientesInventario();
    const idx = ingredientes.findIndex(i => i.id === payload.ingredientId);
    if (idx < 0) throw new Error('Ingrediente no encontrado para registrar merma');

    const cantidad = Math.max(0, Number(payload.cantidad) || 0);
    ingredientes[idx].stockActual = Math.max(0, Number(ingredientes[idx].stockActual || 0) - cantidad);
    await this.guardarIngredientesInventario(ingredientes);

    const mermas = this.getLS<MermaItem[]>('codecpos_mermas', []);
    const merma: MermaItem = {
      id: `MER-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fecha: payload.fecha || new Date().toISOString(),
      ingredientId: payload.ingredientId,
      cantidad,
      unidad: payload.unidad,
      motivo: payload.motivo,
      costoUnitario: Number(payload.costoUnitario) || Number(ingredientes[idx].costoUnitario) || 0,
    };
    mermas.unshift(merma);
    await this.guardarMermas(mermas);

    const movimientos = this.getLS<any[]>('codecpos_stock_movements', []);
    movimientos.unshift({
      id: `MOV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fecha: merma.fecha,
      tipo: 'merma',
      ingredientId: payload.ingredientId,
      ingredientNombre: ingredientes[idx].nombre,
      cantidad,
      unidad: payload.unidad,
      motivo: payload.motivo || 'Merma manual',
    });
    this.setLS('codecpos_stock_movements', movimientos);

    return merma;
  }

  async obtenerOpcionesModificadorPorProducto(productoId: string): Promise<OpcionModificadorItem[]> {
    const modificadores = this.getLS<ModificadorProductoItem[]>('pos-modificadores-producto', [])
      .filter(m => m.productoId === productoId && m.activo !== false);
    const opciones = this.getLS<OpcionModificadorItem[]>('pos-opciones-modificador', []);
    const modIds = new Set(modificadores.map(m => m.id));
    return opciones.filter(o => modIds.has(o.modificadorId) && o.activo !== false);
  }

  async obtenerResumenHibridoDashboard(): Promise<{
    ingredientesCriticos: IngredienteInventarioItem[];
    mermaHoy: { cantidad: number; costo: number; registros: number };
  }> {
    const ingredientes = await this.obtenerIngredientesInventario();
    const ingredientesCriticos = ingredientes
      .filter(i => (Number(i.stockActual) || 0) <= (Number(i.stockMinimo) || 0))
      .sort((a, b) => Number(a.stockActual) - Number(b.stockActual))
      .slice(0, 10);

    const hoy = new Date().toISOString().split('T')[0];
    const mermas = this.getLS<MermaItem[]>('codecpos_mermas', [])
      .filter(m => String(m.fecha || '').split('T')[0] === hoy);
    const mermaHoy = {
      cantidad: mermas.reduce((s, m) => s + (Number(m.cantidad) || 0), 0),
      costo: mermas.reduce((s, m) => s + ((Number(m.costoUnitario) || 0) * (Number(m.cantidad) || 0)), 0),
      registros: mermas.length,
    };

    return { ingredientesCriticos, mermaHoy };
  }

  async validarDisponibilidadVenta(items: VentaItem[]): Promise<InventoryValidationResult> {
    const productos = this.getLS<any[]>('pos-productos', []);
    const ingredientes = this.getLS<any[]>('pos-ingredientes-inventario', []);
    const recipeIngredients = this.getLS<any[]>('pos-receta-ingredientes', []);

    const mapProductos = new Map(productos.map((p: any) => [String(p.id), p]));
    const mapIngredientes = new Map(ingredientes.map((i: any) => [String(i.id), i]));
    const consumoIngredientes = new Map<string, number>();
    const faltantes: InventoryValidationResult['faltantes'] = [];

    for (const item of items) {
      const cantidadVenta = Number(item.cantidad) || 0;
      if (cantidadVenta <= 0) continue;

      if (Array.isArray(item.comboComponents) && item.comboComponents.length > 0) {
        for (const comp of item.comboComponents) {
          const req = (Number(comp.cantidad) || 0) * cantidadVenta;
          if (req <= 0) continue;

          if (comp.tipo === 'ingrediente') {
            const prev = consumoIngredientes.get(String(comp.refId)) || 0;
            consumoIngredientes.set(String(comp.refId), prev + req);
          } else {
            const prodComp = mapProductos.get(String(comp.refId));
            const disponibleComp = Number(prodComp?.stock) || 0;
            if (disponibleComp < req) {
              faltantes.push({
                tipo: 'producto',
                id: String(comp.refId),
                nombre: comp.nombre || prodComp?.nombre || `Producto ${comp.refId}`,
                requerido: req,
                disponible: disponibleComp,
                unidad: comp.unidad || prodComp?.unidad || 'und',
              });
            }
          }
        }
      }

      const producto = mapProductos.get(String(item.id));
      const tipoInventario = (item.productoTipo || producto?.tipoInventario || 'directo') as 'directo' | 'receta';
      const recipeId = String(item.recipeId || producto?.recipeId || '');

      if (tipoInventario === 'receta' && recipeId) {
        // Solo verificar stock del producto si está registrado en inventario
        if (producto !== undefined) {
          const disponibleProducto = Number(producto.stock) || 0;
          if (disponibleProducto < cantidadVenta) {
            faltantes.push({
              tipo: 'producto',
              id: String(item.id),
              nombre: producto.nombre || item.nombre,
              requerido: cantidadVenta,
              disponible: disponibleProducto,
              unidad: producto.unidad || 'und',
            });
          }
        }

        const insumos = recipeIngredients.filter((ri: any) => String(ri.recipeId) === recipeId);
        for (const ri of insumos) {
          const req = (Number(ri.cantidad) || 0) * cantidadVenta;
          if (req <= 0) continue;
          const prev = consumoIngredientes.get(String(ri.ingredientId)) || 0;
          consumoIngredientes.set(String(ri.ingredientId), prev + req);
        }
      } else {
        // Solo verificar stock si el producto está registrado en inventario local
        if (producto !== undefined) {
          const disponible = Number(producto.stock) || 0;
          if (disponible < cantidadVenta) {
            faltantes.push({
              tipo: 'producto',
              id: String(item.id),
              nombre: producto.nombre || item.nombre,
              requerido: cantidadVenta,
              disponible,
              unidad: producto.unidad || 'und',
            });
          }
        }
      }

      for (const mod of (item.modifiers || [])) {
        if (!mod.ingredientId || !mod.consumoInventario) continue;
        const modCant = Number(mod.cantidad) || 1;
        const reqMod = (Number(mod.consumoInventario) || 0) * modCant * cantidadVenta;
        const prev = consumoIngredientes.get(String(mod.ingredientId)) || 0;
        consumoIngredientes.set(String(mod.ingredientId), prev + reqMod);
      }
    }

    for (const [ingredientId, requerido] of consumoIngredientes.entries()) {
      const ing = mapIngredientes.get(ingredientId);
      if (ing === undefined) continue; // ingrediente no registrado → omitir
      const disponible = Number(ing.stockActual) || 0;
      if (disponible < requerido) {
        faltantes.push({
          tipo: 'ingrediente',
          id: ingredientId,
          nombre: ing.nombre || `Ingrediente ${ingredientId}`,
          requerido,
          disponible,
          unidad: ing.unidad || 'und',
        });
      }
    }

    return { ok: faltantes.length === 0, faltantes };
  }

  async obtenerProductosStockBajo(umbral: number = 10): Promise<any[]> {
    try {
      const productosStr = localStorage.getItem('pos-productos');
      if (!productosStr) return [];

      const productos = JSON.parse(productosStr);
      return productos.filter((p: any) => p.stock <= umbral);
    } catch (error) {
      console.error('Error obteniendo productos con stock bajo:', error);
      return [];
    }
  }

  async obtenerProductosCriticos(): Promise<any[]> {
    return this.obtenerProductosStockBajo(5);
  }

  // Nuevos métodos para Dashboard y Reportes
  async obtenerProductos(): Promise<any[]> {
    try {
      const productosStr = localStorage.getItem('pos-productos');
      if (!productosStr) return [];
      return JSON.parse(productosStr);
    } catch (error) {
      console.error('Error obteniendo productos:', error);
      return [];
    }
  }

  async obtenerTodasLasVentas(): Promise<Venta[]> {
    return (await dbManager.getAllVentas()) as unknown as Venta[];
  }

  async obtenerVentasPorRango(inicio: Date, fin: Date): Promise<Venta[]> {
    const ventas = await this.obtenerTodasLasVentas();
    return ventas.filter(v => {
      const fechaVenta = new Date(v.fecha);
      return fechaVenta >= inicio && fechaVenta <= fin;
    });
  }

  async guardarArqueoCaja(arqueo: any): Promise<void> {
    try {
      const arqueos = await dbManager.getConfig('arqueos_caja') || [];
      arqueos.push(arqueo);
      await dbManager.setConfig('arqueos_caja', arqueos);
      console.log(`✅ Arqueo de caja guardado: ${arqueo.id}`);
    } catch (error) {
      console.error('Error guardando arqueo de caja:', error);
      throw error;
    }
  }

  async obtenerArqueosCaja(): Promise<any[]> {
    try {
      return await dbManager.getConfig('arqueos_caja') || [];
    } catch (error) {
      console.error('Error obteniendo arqueos:', error);
      return [];
    }
  }

  // ==================== LISTENERS PARA TIEMPO REAL ====================

  onVentaNueva(callback: (venta: Venta) => void) {
    storeEvents.on('venta:nueva', callback);
  }

  onEstadisticasActualizadas(callback: (stats: EstadisticasDia) => void) {
    storeEvents.on('estadisticas:actualizadas', callback);
  }

  onTurnoActualizado(callback: (turno: TurnoEmpleado) => void) {
    storeEvents.on('turno:actualizado', callback);
  }

  onInventarioActualizado(callback: (data: { productoId: string, nuevoStock: number }) => void) {
    storeEvents.on('inventario:actualizado', callback);
  }

  onAlertaStockBajo(callback: (producto: any) => void) {
    storeEvents.on('alerta:stock-bajo', callback);
  }

  offVentaNueva(callback: (venta: Venta) => void) {
    storeEvents.off('venta:nueva', callback);
  }

  offEstadisticasActualizadas(callback: (stats: EstadisticasDia) => void) {
    storeEvents.off('estadisticas:actualizadas', callback);
  }

  offTurnoActualizado(callback: (turno: TurnoEmpleado) => void) {
    storeEvents.off('turno:actualizado', callback);
  }

  offInventarioActualizado(callback: (data: { productoId: string, nuevoStock: number }) => void) {
    storeEvents.off('inventario:actualizado', callback);
  }

  offAlertaStockBajo(callback: (producto: any) => void) {
    storeEvents.off('alerta:stock-bajo', callback);
  }

  private getLS<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private setLS<T>(key: string, value: T): void {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage lleno */ }
  }
}

// Exportar instancia singleton
export const electronStore = new ElectronStoreService();

// Métodos de utilidad para getAllConfigs en indexedDB
declare module './indexedDB' {
  interface DBManager {
    getAllConfigs(): Promise<Record<string, any>>;
  }
}
