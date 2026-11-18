/**
 * ============================================
 * SERVICIO DE GESTIÓN DE TALLER
 * Sistema de Órdenes de Servicio y Reparaciones
 * ============================================
 */

import { openDB, IDBPDatabase } from 'idb';
import type {
  OrdenServicio,
  EstadoOrden,
  ClienteTaller,
  PagoOrden,
  CambioEstado,
  NotaInterna,
  FiltrosOrden,
  EstadisticasTaller,
  ResumenTecnico,
  Diagnostico,
  InsumoReparacion,
} from '../types/taller';

// ===========================
// CONFIGURACIÓN BASE DE DATOS
// ===========================

const DB_NAME = 'codec_pos_taller';
// v2: el índice numeroOrden deja de ser único. Con dos equipos numerando cada
// uno por su lado, la orden del otro PC traía un número que aquí ya existía y
// IndexedDB la rechazaba en silencio: nunca llegaba. La identidad es el `id`.
const DB_VERSION = 2;

const STORES = {
  ORDENES: 'ordenes_servicio',
  CLIENTES: 'clientes_taller',
  CONFIGURACION: 'configuracion_taller',
};

class TallerService {
  private db: IDBPDatabase | null = null;
  private contadorOrden: number = 1;

  /**
   * Inicializar base de datos
   */
  async init(): Promise<void> {
    try {
      this.db = await openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion, _newVersion, tx) {
          if (oldVersion >= 1 && oldVersion < 2 && db.objectStoreNames.contains(STORES.ORDENES)) {
            const store = tx.objectStore(STORES.ORDENES);
            if (store.indexNames.contains('numeroOrden')) store.deleteIndex('numeroOrden');
            store.createIndex('numeroOrden', 'numeroOrden', { unique: false });
          }
          // Store de órdenes de servicio
          if (!db.objectStoreNames.contains(STORES.ORDENES)) {
            const ordenesStore = db.createObjectStore(STORES.ORDENES, { keyPath: 'id' });
            ordenesStore.createIndex('numeroOrden', 'numeroOrden', { unique: false });
            ordenesStore.createIndex('estado', 'estado', { unique: false });
            ordenesStore.createIndex('fechaRecepcion', 'fechaRecepcion', { unique: false });
            ordenesStore.createIndex('clienteTelefono', 'cliente.telefono', { unique: false });
            ordenesStore.createIndex('dispositivoSerial', 'dispositivo.serial', { unique: false });
            ordenesStore.createIndex('dispositivoImei', 'dispositivo.imei', { unique: false });
            ordenesStore.createIndex('tecnicoAsignado', 'tecnicoAsignado', { unique: false });
          }

          // Store de clientes del taller
          if (!db.objectStoreNames.contains(STORES.CLIENTES)) {
            const clientesStore = db.createObjectStore(STORES.CLIENTES, { keyPath: 'id' });
            clientesStore.createIndex('telefono', 'telefono', { unique: false });
            clientesStore.createIndex('cedula', 'cedula', { unique: false });
          }

          // Store de configuración
          if (!db.objectStoreNames.contains(STORES.CONFIGURACION)) {
            db.createObjectStore(STORES.CONFIGURACION, { keyPath: 'key' });
          }
        },
      });

      // Cargar contador de órdenes
      await this.cargarContadorOrden();

      console.log('✅ Base de datos de taller inicializada');
    } catch (error) {
      console.error('❌ Error inicializando base de datos de taller:', error);
      throw error;
    }
  }

  private async ensureDB(): Promise<void> {
    if (!this.db) {
      await this.init();
    }
  }

  private calcularCostoInsumos(insumos: InsumoReparacion[] = []): number {
    return insumos.reduce((sum, item) => sum + (Number(item.costoAdquisicion) || 0), 0);
  }

  private normalizarOrden(orden: OrdenServicio): OrdenServicio {
    const insumos = Array.isArray(orden.insumos) ? orden.insumos : [];
    const sinRepuestos = Boolean(orden.sinRepuestos);
    const costoInsumos = this.calcularCostoInsumos(insumos);
    const valorCobrado = Number(orden.valorCobrado ?? orden.costoFinal ?? orden.costoEstimado ?? 0);
    const utilidadNeta = valorCobrado - costoInsumos;

    return {
      ...orden,
      valorCobrado,
      insumos,
      sinRepuestos,
      costoInsumos,
      utilidadNeta,
    };
  }

  // ===========================
  // GESTIÓN DE ÓRDENES
  // ===========================

  /**
   * Crear nueva orden de servicio
   */
  /**
   * ☁️ Publica la orden en la nube para que la app del celular la vea.
   *
   * Best-effort y NUNCA bloqueante: si no hay internet, si el negocio no está
   * vinculado o si el módulo Taller no está activado para móvil, simplemente
   * no pasa nada — la orden ya quedó guardada en IndexedDB, que sigue siendo
   * la fuente de verdad local. El import es dinámico para no arrastrar el
   * cliente de Supabase al bundle del taller cuando no se usa.
   *
   * Se llama desde cada escritura LOCAL, pero deliberadamente NO desde
   * `upsertOrdenRemota()`: esa recibe órdenes que vienen de la red (LAN o
   * celular), y volver a publicarlas crearía un eco infinito.
   */
  private publicarEnNube(orden: OrdenServicio & { eliminada?: boolean }): void {
    import('../lib/supabase/tallerSyncService')
      .then(({ pushOrdenTaller }) => pushOrdenTaller(orden))
      .catch(() => { /* sin internet: queda en cola y sube en el siguiente intento */ });
  }

  async crearOrden(orden: Omit<OrdenServicio, 'id' | 'numeroOrden' | 'fechaCreacion' | 'ultimaActualizacion' | 'historialEstados'>): Promise<OrdenServicio> {
    await this.ensureDB();
    if (!this.db) throw new Error('Base de datos no disponible');

    try {
      const ahora = new Date().toISOString();
      const numeroOrden = await this.generarNumeroOrden();

      const nuevaOrden: OrdenServicio = {
        ...orden,
        id: `orden_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        numeroOrden,
        fechaCreacion: ahora,
        ultimaActualizacion: ahora,
        historialEstados: [
          {
            id: `cambio_${Date.now()}`,
            fecha: ahora,
            estadoAnterior: 'recibido',
            estadoNuevo: orden.estado,
            usuario: orden.creadoPor,
            notas: 'Orden creada',
          },
        ],
      };

      const nuevaOrdenNormalizada = this.normalizarOrden(nuevaOrden);

      await this.db.add(STORES.ORDENES, nuevaOrdenNormalizada);
      this.publicarEnNube(nuevaOrdenNormalizada);

      // Guardar/actualizar cliente
      if (orden.cliente.telefono) {
        await this.guardarCliente(orden.cliente);
      }

      console.log(`✅ Orden creada: ${numeroOrden}`);
      return nuevaOrdenNormalizada;
    } catch (error) {
      console.error('❌ Error creando orden:', error);
      throw error;
    }
  }

  /**
   * Inserta o reemplaza una orden completa recibida de OTRA terminal por red
   * (LanContext, evento TALLER_ORDEN_NUEVA), preservando su `id` y
   * `numeroOrden` originales — a diferencia de `crearOrden()`, que siempre
   * genera un id/numeroOrden nuevos y por lo tanto NO sirve para espejar una
   * orden ya existente en otra terminal (produciría un duplicado con
   * identidad distinta en cada lado). `put` sobre keyPath:'id' inserta si no
   * existe o reemplaza si ya existe, dejando ambas terminales con el mismo
   * registro.
   */
  async upsertOrdenRemota(
    orden: OrdenServicio & { eliminada?: boolean }
  ): Promise<'nueva' | 'actualizada' | 'igual' | 'eliminada' | 'ignorada'> {
    await this.ensureDB();
    if (!this.db) throw new Error('Base de datos no disponible');

    const { eliminada, ...limpia } = orden;
    const local: OrdenServicio | undefined = await this.db.get(STORES.ORDENES, orden.id);

    if (eliminada) {
      if (!local) return 'ignorada';
      await this.db.delete(STORES.ORDENES, orden.id);
      return 'eliminada';
    }

    const normalizada = this.normalizarOrden(limpia as OrdenServicio);

    if (local) {
      // La nube manda, salvo que este equipo tenga cambios propios que todavía
      // no suben (sin internet) y la versión de la nube sea más vieja. No se
      // compara solo por hora porque el reloj de cada equipo puede estar mal.
      const tsLocal = Date.parse(local.ultimaActualizacion || '') || 0;
      const tsRemoto = Date.parse(normalizada.ultimaActualizacion || '') || 0;
      if (tsRemoto < tsLocal) {
        const pendiente = await import('../lib/supabase/tallerSyncService')
          .then((m) => m.tienePendienteDeSubir(orden.id))
          .catch(() => false);
        if (pendiente) return 'ignorada';
      }
      // Misma hora de cambio = la misma versión (por ejemplo, la que este
      // equipo subió y vuelve a bajar en el siguiente ciclo).
      if (tsRemoto === tsLocal || JSON.stringify(local) === JSON.stringify(normalizada)) return 'igual';
    }

    await this.db.put(STORES.ORDENES, normalizada);
    this.avanzarContadorDesde(normalizada.numeroOrden);

    if (normalizada.cliente?.telefono) {
      await this.guardarCliente(normalizada.cliente).catch(() => {});
    }
    return local ? 'actualizada' : 'nueva';
  }

  /**
   * Actualizar orden de servicio
   */
  async actualizarOrden(id: string, cambios: Partial<OrdenServicio>): Promise<OrdenServicio> {
    await this.ensureDB();
    if (!this.db) throw new Error('Base de datos no disponible');

    try {
      const ordenExistente = await this.db.get(STORES.ORDENES, id);
      if (!ordenExistente) {
        throw new Error(`Orden ${id} no encontrada`);
      }

      const ordenActualizada: OrdenServicio = {
        ...ordenExistente,
        ...cambios,
        ultimaActualizacion: new Date().toISOString(),
      };

      const ordenActualizadaNormalizada = this.normalizarOrden(ordenActualizada);

      await this.db.put(STORES.ORDENES, ordenActualizadaNormalizada);
      this.publicarEnNube(ordenActualizadaNormalizada);

      console.log(`✅ Orden actualizada: ${ordenActualizada.numeroOrden}`);
      return ordenActualizadaNormalizada;
    } catch (error) {
      console.error('❌ Error actualizando orden:', error);
      throw error;
    }
  }

  /**
   * Cambiar estado de la orden
   */
  async cambiarEstado(
    id: string,
    nuevoEstado: EstadoOrden,
    usuario: string,
    notas?: string
  ): Promise<OrdenServicio> {
    await this.ensureDB();
    if (!this.db) throw new Error('Base de datos no disponible');

    try {
      const orden = await this.db.get(STORES.ORDENES, id);
      if (!orden) {
        throw new Error(`Orden ${id} no encontrada`);
      }

      const cambio: CambioEstado = {
        id: `cambio_${Date.now()}`,
        fecha: new Date().toISOString(),
        estadoAnterior: orden.estado,
        estadoNuevo: nuevoEstado,
        usuario,
        notas,
      };

      const ordenActualizada: OrdenServicio = {
        ...orden,
        estado: nuevoEstado,
        historialEstados: [...orden.historialEstados, cambio],
        ultimaActualizacion: new Date().toISOString(),
      };

      const vieneDeCotizado = orden.estado === 'cotizado';
      const pasaAAprobado = nuevoEstado === 'aprobado';
      const pasaAEnReparacion = nuevoEstado === 'en_reparacion';

      if (vieneDeCotizado && (pasaAAprobado || pasaAEnReparacion)) {
        const insumosDefinidos = Array.isArray(orden.insumos) && orden.insumos.length > 0;
        const sinRepuestosConfirmado = Boolean(orden.sinRepuestos);

        // Permitir avanzar cuando existe confirmación explícita de "Sin Repuestos".
        if (pasaAAprobado && !insumosDefinidos && !sinRepuestosConfirmado) {
          throw new Error(
            'ALERTA CRÍTICA: Debes definir costos de repuestos en Cotizado o marcar "Sin Repuestos" antes de pasar a Aprobado.'
          );
        }

        // Para En Reparación se mantiene la misma validación (insumos o confirmación explícita sin repuestos).
        if (pasaAEnReparacion && !insumosDefinidos && !sinRepuestosConfirmado) {
          throw new Error(
            'ALERTA CRÍTICA: Debes definir costos de repuestos en Cotizado o marcar "Sin Repuestos" antes de pasar a En Reparación.'
          );
        }
      }

      // Si se entrega, guardar fecha de entrega
      if (nuevoEstado === 'entregado' && !orden.fechaEntrega) {
        ordenActualizada.fechaEntrega = new Date().toISOString();
      }

      const ordenActualizadaNormalizada = this.normalizarOrden(ordenActualizada);

      await this.db.put(STORES.ORDENES, ordenActualizadaNormalizada);
      this.publicarEnNube(ordenActualizadaNormalizada);

      console.log(`✅ Estado cambiado: ${orden.numeroOrden} → ${nuevoEstado}`);
      return ordenActualizadaNormalizada;
    } catch (error) {
      console.error('❌ Error cambiando estado:', error);
      throw error;
    }
  }

  /**
   * Agregar diagnóstico a la orden
   */
  async agregarDiagnostico(id: string, diagnostico: Diagnostico): Promise<OrdenServicio> {
    await this.ensureDB();
    if (!this.db) throw new Error('Base de datos no disponible');

    try {
      const orden = await this.db.get(STORES.ORDENES, id);
      if (!orden) {
        throw new Error(`Orden ${id} no encontrada`);
      }

      const ordenActualizada: OrdenServicio = {
        ...orden,
        diagnostico,
        costoEstimado: diagnostico.costoTotal,
        ultimaActualizacion: new Date().toISOString(),
      };

      const normalizada = this.normalizarOrden(ordenActualizada);
      await this.db.put(STORES.ORDENES, normalizada);
      this.publicarEnNube(normalizada);

      console.log(`✅ Diagnóstico agregado a orden: ${orden.numeroOrden}`);
      return normalizada;
    } catch (error) {
      console.error('❌ Error agregando diagnóstico:', error);
      throw error;
    }
  }

  async actualizarInsumos(
    id: string,
    payload: { insumos: InsumoReparacion[]; sinRepuestos: boolean }
  ): Promise<OrdenServicio> {
    await this.ensureDB();
    if (!this.db) throw new Error('Base de datos no disponible');

    const orden = await this.db.get(STORES.ORDENES, id);
    if (!orden) {
      throw new Error(`Orden ${id} no encontrada`);
    }

    const insumos = Array.isArray(payload.insumos) ? payload.insumos : [];
    const sinRepuestos = Boolean(payload.sinRepuestos);
    const costoInsumos = this.calcularCostoInsumos(insumos);
    const valorCobrado = Number(orden.valorCobrado ?? orden.costoFinal ?? orden.costoEstimado ?? 0);
    const utilidadNeta = valorCobrado - costoInsumos;

    const ordenActualizada = this.normalizarOrden({
      ...orden,
      insumos,
      sinRepuestos,
      costoInsumos,
      utilidadNeta,
      ultimaActualizacion: new Date().toISOString(),
    });

    await this.db.put(STORES.ORDENES, ordenActualizada);
    this.publicarEnNube(ordenActualizada);
    return ordenActualizada;
  }

  /**
   * Registrar pago/abono
   */
  async registrarPago(id: string, pago: Omit<PagoOrden, 'id' | 'fecha'>): Promise<OrdenServicio> {
    await this.ensureDB();
    if (!this.db) throw new Error('Base de datos no disponible');

    try {
      const orden = await this.db.get(STORES.ORDENES, id);
      if (!orden) {
        throw new Error(`Orden ${id} no encontrada`);
      }

      const nuevoPago: PagoOrden = {
        ...pago,
        id: `pago_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        fecha: new Date().toISOString(),
      };

      const totalPagado = [...orden.pagos, nuevoPago].reduce((sum, p) => sum + p.monto, 0);
      const costoEfectivo = Number(orden.valorCobrado ?? orden.costoFinal ?? orden.costoEstimado ?? 0);
      const saldoPendiente = costoEfectivo - totalPagado;

      const ordenActualizada: OrdenServicio = this.normalizarOrden({
        ...orden,
        pagos: [...orden.pagos, nuevoPago],
        anticipo: totalPagado,
        saldoPendiente: Math.max(0, saldoPendiente),
        ultimaActualizacion: new Date().toISOString(),
      });

      await this.db.put(STORES.ORDENES, ordenActualizada);
      this.publicarEnNube(ordenActualizada);

      console.log(`✅ Pago registrado: ${pago.monto} → ${orden.numeroOrden}`);
      return ordenActualizada;
    } catch (error) {
      console.error('❌ Error registrando pago:', error);
      throw error;
    }
  }

  /**
   * Agregar nota interna
   */
  async agregarNota(
    id: string,
    nota: Omit<NotaInterna, 'id' | 'fecha'>
  ): Promise<OrdenServicio> {
    await this.ensureDB();
    if (!this.db) throw new Error('Base de datos no disponible');

    try {
      const orden = await this.db.get(STORES.ORDENES, id);
      if (!orden) {
        throw new Error(`Orden ${id} no encontrada`);
      }

      const nuevaNota: NotaInterna = {
        ...nota,
        id: `nota_${Date.now()}`,
        fecha: new Date().toISOString(),
      };

      const ordenActualizada: OrdenServicio = {
        ...orden,
        notasInternas: [...orden.notasInternas, nuevaNota],
        ultimaActualizacion: new Date().toISOString(),
      };

      await this.db.put(STORES.ORDENES, ordenActualizada);
      this.publicarEnNube(ordenActualizada);

      console.log(`✅ Nota agregada a orden: ${orden.numeroOrden}`);
      return ordenActualizada;
    } catch (error) {
      console.error('❌ Error agregando nota:', error);
      throw error;
    }
  }

  /**
   * Obtener orden por ID
   */
  async obtenerOrden(id: string): Promise<OrdenServicio | null> {
    await this.ensureDB();
    if (!this.db) return null;

    try {
      const orden = await this.db.get(STORES.ORDENES, id);
      return orden || null;
    } catch (error) {
      console.error('❌ Error obteniendo orden:', error);
      return null;
    }
  }

  /**
   * Obtener orden por número
   */
  async obtenerOrdenPorNumero(numeroOrden: string): Promise<OrdenServicio | null> {
    await this.ensureDB();
    if (!this.db) return null;

    try {
      const orden = await this.db.getFromIndex(STORES.ORDENES, 'numeroOrden', numeroOrden);
      return orden || null;
    } catch (error) {
      console.error('❌ Error obteniendo orden por número:', error);
      return null;
    }
  }

  /**
   * Buscar órdenes con filtros
   */
  async buscarOrdenes(filtros: FiltrosOrden = {}): Promise<OrdenServicio[]> {
    await this.ensureDB();
    if (!this.db) return [];

    try {
      let ordenes = await this.db.getAll(STORES.ORDENES);

      // Aplicar filtros
      if (filtros.estado && filtros.estado.length > 0) {
        ordenes = ordenes.filter((o) => filtros.estado!.includes(o.estado));
      }

      if (filtros.prioridad && filtros.prioridad.length > 0) {
        ordenes = ordenes.filter((o) => filtros.prioridad!.includes(o.prioridad));
      }

      if (filtros.fechaDesde) {
        ordenes = ordenes.filter((o) => o.fechaRecepcion >= filtros.fechaDesde!);
      }

      if (filtros.fechaHasta) {
        ordenes = ordenes.filter((o) => o.fechaRecepcion <= filtros.fechaHasta!);
      }

      if (filtros.tecnico) {
        ordenes = ordenes.filter((o) => o.tecnicoAsignado === filtros.tecnico);
      }

      if (filtros.tipoDispositivo && filtros.tipoDispositivo.length > 0) {
        ordenes = ordenes.filter((o) => filtros.tipoDispositivo!.includes(o.dispositivo.tipo));
      }

      if (filtros.cliente) {
        const clienteLower = filtros.cliente.toLowerCase();
        ordenes = ordenes.filter((o) =>
          o.cliente.nombre.toLowerCase().includes(clienteLower)
        );
      }

      if (filtros.numeroOrden) {
        ordenes = ordenes.filter((o) => o.numeroOrden.includes(filtros.numeroOrden!));
      }

      if (filtros.telefono) {
        ordenes = ordenes.filter((o) => o.cliente.telefono.includes(filtros.telefono!));
      }

      if (filtros.serial) {
        ordenes = ordenes.filter((o) => o.dispositivo.serial?.includes(filtros.serial!) || false);
      }

      if (filtros.imei) {
        ordenes = ordenes.filter((o) => o.dispositivo.imei?.includes(filtros.imei!) || false);
      }

      // Ordenar por fecha de recepción (más recientes primero)
      ordenes.sort((a, b) => new Date(b.fechaRecepcion).getTime() - new Date(a.fechaRecepcion).getTime());

      return ordenes;
    } catch (error) {
      console.error('❌ Error buscando órdenes:', error);
      return [];
    }
  }

  /**
   * Obtener todas las órdenes
   */
  async obtenerTodasOrdenes(): Promise<OrdenServicio[]> {
    return this.buscarOrdenes();
  }

  /**
   * Obtener órdenes activas (no entregadas ni canceladas)
   */
  async obtenerOrdenesActivas(): Promise<OrdenServicio[]> {
    return this.buscarOrdenes({
      estado: [
        'recibido',
        'diagnostico',
        'cotizado',
        'aprobado',
        'en_reparacion',
        'esperando_repuestos',
        'reparado',
        'listo_entrega',
      ],
    });
  }

  /**
   * Eliminar orden
   */
  async eliminarOrden(id: string): Promise<void> {
    await this.ensureDB();
    if (!this.db) throw new Error('Base de datos no disponible');

    try {
      const orden: OrdenServicio | undefined = await this.db.get(STORES.ORDENES, id);
      await this.db.delete(STORES.ORDENES, id);
      // Los demás equipos y el celular también la quitan.
      if (orden) this.publicarEnNube({ ...orden, ultimaActualizacion: new Date().toISOString(), eliminada: true });
      console.log(`✅ Orden eliminada: ${id}`);
    } catch (error) {
      console.error('❌ Error eliminando orden:', error);
      throw error;
    }
  }

  // ===========================
  // GESTIÓN DE CLIENTES
  // ===========================

  async guardarCliente(cliente: ClienteTaller): Promise<ClienteTaller> {
    await this.ensureDB();
    if (!this.db) {
      throw new Error('Base de datos no disponible');
    }

    try {
      const clienteId = cliente.id || `cliente_${Date.now()}`;
      const clienteGuardado: ClienteTaller = { ...cliente, id: clienteId };
      await this.db.put(STORES.CLIENTES, clienteGuardado);
      return clienteGuardado;
    } catch (error) {
      console.error('❌ Error guardando cliente:', error);
      throw error;
    }
  }

  async buscarClientePorTelefono(telefono: string): Promise<ClienteTaller | null> {
    await this.ensureDB();
    if (!this.db) return null;

    try {
      const clientes = await this.db.getAllFromIndex(STORES.CLIENTES, 'telefono', telefono);
      return clientes[0] || null;
    } catch (error) {
      console.error('❌ Error buscando cliente:', error);
      return null;
    }
  }

  // ===========================
  // ESTADÍSTICAS
  // ===========================

  async obtenerEstadisticas(): Promise<EstadisticasTaller> {
    await this.ensureDB();
    if (!this.db) throw new Error('Base de datos no disponible');

    try {
      const todasOrdenes = await this.obtenerTodasOrdenes();
      const ahora = new Date();
      const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
      const inicioSemana = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
      const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

      const ordenesHoy = todasOrdenes.filter((o) => new Date(o.fechaRecepcion) >= inicioHoy);
      const ordenesSemana = todasOrdenes.filter((o) => new Date(o.fechaRecepcion) >= inicioSemana);
      const ordenesMes = todasOrdenes.filter((o) => new Date(o.fechaRecepcion) >= inicioMes);

      const ordenesActivas = todasOrdenes.filter((o) =>
        !['entregado', 'cancelado'].includes(o.estado)
      );

      const ordenesConSaldo = todasOrdenes.filter((o) => o.saldoPendiente > 0);
      const totalPendiente = ordenesConSaldo.reduce((sum, o) => sum + o.saldoPendiente, 0);
      const saldoPendienteVencido = ordenesConSaldo
        .filter((o) => o.fechaEstimadaEntrega && new Date(o.fechaEstimadaEntrega) < ahora)
        .reduce((sum, o) => sum + o.saldoPendiente, 0);

      // Órdenes por estado
      const ordenesPorEstado: any = {};
      todasOrdenes.forEach((o) => {
        ordenesPorEstado[o.estado] = (ordenesPorEstado[o.estado] || 0) + 1;
      });

      // Ingresos reales: solo dinero efectivamente pagado por el cliente
      const calcularIngresosPagados = (desde?: Date) => {
        return todasOrdenes.reduce((sumOrden, orden) => {
          const pagos = Array.isArray(orden.pagos) ? orden.pagos : [];

          const totalPagosOrden = pagos.reduce((sumPago, pago) => {
            const fechaPago = new Date(pago.fecha);
            if (desde && fechaPago < desde) return sumPago;
            return sumPago + (Number(pago.monto) || 0);
          }, 0);

          return sumOrden + totalPagosOrden;
        }, 0);
      };

      const estadisticas: EstadisticasTaller = {
        totalOrdenes: todasOrdenes.length,
        ordenesActivas: ordenesActivas.length,
        ordenesHoy: ordenesHoy.length,
        ordenesSemana: ordenesSemana.length,
        ordenesMes: ordenesMes.length,
        ordenesPorEstado,
        ingresosTotales: calcularIngresosPagados(),
        ingresosHoy: calcularIngresosPagados(inicioHoy),
        ingresosSemana: calcularIngresosPagados(inicioSemana),
        ingresosMes: calcularIngresosPagados(inicioMes),
        totalPendiente,
        ordenesConSaldoPendiente: ordenesConSaldo.length,
        saldoPendienteVencido,
        tiempoPromedioReparacion: this.tiempoPromedioHoras(todasOrdenes),
        ordenesAtrasadas: ordenesActivas.filter((o) => o.fechaEstimadaEntrega && new Date(o.fechaEstimadaEntrega) < ahora).length,
        dispositivosMasReparados: this.contarPor(todasOrdenes, (o) => o.dispositivo?.tipo).map(([tipo, cantidad]) => ({ tipo: tipo as any, cantidad })),
        marcasMasComunes: this.contarPor(todasOrdenes, (o) => o.dispositivo?.marca?.trim()).map(([marca, cantidad]) => ({ marca, cantidad })),
        ordenesporTecnico: resumenPorTecnico(todasOrdenes, inicioMes),
        ordenesConGarantia: todasOrdenes.filter((o) => o.garantia?.activa).length,
        devolucionesPorGarantia: todasOrdenes.filter((o) => o.estado === 'garantia').length,
      };

      return estadisticas;
    } catch (error) {
      console.error('❌ Error obteniendo estadísticas:', error);
      throw error;
    }
  }

  private contarPor(ordenes: OrdenServicio[], clave: (o: OrdenServicio) => string | undefined): [string, number][] {
    const mapa = new Map<string, number>();
    for (const o of ordenes) {
      const k = clave(o);
      if (k) mapa.set(k, (mapa.get(k) || 0) + 1);
    }
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }

  /** Horas promedio entre recibir y entregar, solo de las órdenes entregadas. */
  private tiempoPromedioHoras(ordenes: OrdenServicio[]): number {
    const tiempos = ordenes
      .filter((o) => o.estado === 'entregado' && o.fechaEntrega)
      .map((o) => (new Date(o.fechaEntrega!).getTime() - new Date(o.fechaRecepcion).getTime()) / 3600000)
      .filter((h) => Number.isFinite(h) && h >= 0);
    if (tiempos.length === 0) return 0;
    return Math.round((tiempos.reduce((s, h) => s + h, 0) / tiempos.length) * 10) / 10;
  }

  // ===========================
  // UTILIDADES
  // ===========================

  /**
   * El número lo da la nube (0156) para que dos equipos nunca repitan. Sin
   * internet se usa el contador de este equipo con la letra de la caja
   * (OS-2026-B0012), que no choca con los números de la nube.
   */
  private async generarNumeroOrden(): Promise<string> {
    try {
      const { siguienteNumeroOrdenNube } = await import('../lib/supabase/tallerSyncService');
      const nube = await siguienteNumeroOrdenNube();
      if (nube) {
        this.avanzarContadorDesde(nube);
        await this.guardarContadorOrden();
        return nube;
      }
    } catch { /* sin nube: contador local */ }

    await this.avanzarContadorDesdeLocal();
    const año = new Date().getFullYear();
    const numero = String(this.contadorOrden).padStart(4, '0');
    this.contadorOrden++;
    await this.guardarContadorOrden();

    let letra = 'X';
    try {
      const { letraDeEstaCaja } = await import('../lib/numeracionCaja');
      letra = letraDeEstaCaja() || 'X';
    } catch { /* sin letra */ }
    return `OS-${año}-${letra}${numero}`;
  }

  /** Lleva el contador local por encima de un número ya usado (OS-2026-0015 u OS-2026-B0015). */
  private avanzarContadorDesde(numeroOrden?: string): void {
    const m = /^OS-(\d{4})-[A-Z]?(\d+)$/.exec(String(numeroOrden || ''));
    if (!m || Number(m[1]) !== new Date().getFullYear()) return;
    const n = parseInt(m[2], 10);
    if (Number.isFinite(n) && n + 1 > this.contadorOrden) this.contadorOrden = n + 1;
  }

  private async avanzarContadorDesdeLocal(): Promise<void> {
    if (!this.db) return;
    try {
      const todas: OrdenServicio[] = await this.db.getAll(STORES.ORDENES);
      todas.forEach((o) => this.avanzarContadorDesde(o.numeroOrden));
    } catch { /* no crítico */ }
  }

  private async cargarContadorOrden(): Promise<void> {
    await this.ensureDB();
    if (!this.db) return;

    try {
      const config = await this.db.get(STORES.CONFIGURACION, 'contadorOrden');
      if (config) {
        this.contadorOrden = config.value;
      }
    } catch (error) {
      console.error('Error cargando contador:', error);
    }
  }

  private async guardarContadorOrden(): Promise<void> {
    await this.ensureDB();
    if (!this.db) return;

    try {
      await this.db.put(STORES.CONFIGURACION, {
        key: 'contadorOrden',
        value: this.contadorOrden,
      });
    } catch (error) {
      console.error('Error guardando contador:', error);
    }
  }
}

/**
 * Registro de cada técnico: cuántas órdenes tiene, cuántas entregó, cuánto se
 * ha cobrado por sus reparaciones (pagos recibidos) y cuánto queda de
 * ganancia después de los repuestos. `desde` marca el corte del mes.
 */
export function resumenPorTecnico(ordenes: OrdenServicio[], desde?: Date): ResumenTecnico[] {
  const mapa = new Map<string, ResumenTecnico>();
  const desdeTs = desde ? desde.getTime() : 0;
  for (const o of ordenes) {
    const nombre = (o.tecnicoAsignado || '').trim() || 'Sin técnico';
    const r = mapa.get(nombre) || {
      tecnico: nombre, cantidad: 0, activas: 0, entregadas: 0, entregadasMes: 0,
      cobrado: 0, cobradoMes: 0, repuestos: 0, utilidad: 0, porCobrar: 0,
    };
    r.cantidad++;
    if (!['entregado', 'cancelado'].includes(o.estado)) r.activas++;
    if (o.estado === 'entregado') {
      r.entregadas++;
      if (o.fechaEntrega && new Date(o.fechaEntrega).getTime() >= desdeTs) r.entregadasMes++;
    }
    if (o.estado !== 'cancelado') {
      const pagos = Array.isArray(o.pagos) ? o.pagos : [];
      for (const p of pagos) {
        const monto = Number(p.monto) || 0;
        r.cobrado += monto;
        if (new Date(p.fecha).getTime() >= desdeTs) r.cobradoMes += monto;
      }
      const repuestos = Number(o.costoInsumos) || 0;
      r.repuestos += repuestos;
      r.porCobrar += Number(o.saldoPendiente) || 0;
    }
    r.utilidad = r.cobrado - r.repuestos;
    mapa.set(nombre, r);
  }
  return [...mapa.values()].sort((a, b) => b.cobrado - a.cobrado || b.cantidad - a.cantidad);
}

// Singleton
export const tallerService = new TallerService();

// Inicializar automáticamente
tallerService.init().catch(console.error);
