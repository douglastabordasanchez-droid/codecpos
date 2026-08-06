/**
 * ============================================
 * TIPOS Y INTERFACES - MÓDULO DE TALLER
 * Sistema de Gestión de Reparaciones
 * ============================================
 */

// ===========================
// TIPOS DE DISPOSITIVOS
// ===========================

export type TipoDispositivo =
  | 'celular'
  | 'tablet'
  | 'laptop'
  | 'computador'
  | 'tv'
  | 'consola'
  | 'smartwatch'
  | 'audifonos'
  | 'otro';

export const TIPOS_DISPOSITIVO: { value: TipoDispositivo; label: string; icon: string }[] = [
  { value: 'celular', label: 'Celular/Smartphone', icon: '📱' },
  { value: 'tablet', label: 'Tablet', icon: '📲' },
  { value: 'laptop', label: 'Laptop/Portátil', icon: '💻' },
  { value: 'computador', label: 'Computador de Escritorio', icon: '🖥️' },
  { value: 'tv', label: 'Televisor', icon: '📺' },
  { value: 'consola', label: 'Consola de Videojuegos', icon: '🎮' },
  { value: 'smartwatch', label: 'Smartwatch/Reloj', icon: '⌚' },
  { value: 'audifonos', label: 'Audífonos/Headphones', icon: '🎧' },
  { value: 'otro', label: 'Otro Dispositivo', icon: '🔧' },
];

// ===========================
// ESTADOS DE LA ORDEN
// ===========================

export type EstadoOrden =
  | 'recibido'
  | 'diagnostico'
  | 'cotizado'
  | 'aprobado'
  | 'en_reparacion'
  | 'esperando_repuestos'
  | 'reparado'
  | 'listo_entrega'
  | 'entregado'
  | 'cancelado'
  | 'garantia';

export const ESTADOS_ORDEN: {
  value: EstadoOrden;
  label: string;
  color: string;
  icon: string;
  descripcion: string;
}[] = [
  {
    value: 'recibido',
    label: 'Recibido',
    color: '#6366f1',
    icon: '📥',
    descripcion: 'Equipo recibido, pendiente de diagnóstico',
  },
  {
    value: 'diagnostico',
    label: 'En Diagnóstico',
    color: '#8b5cf6',
    icon: '🔍',
    descripcion: 'Técnico está diagnosticando el equipo',
  },
  {
    value: 'cotizado',
    label: 'Cotizado',
    color: '#f59e0b',
    icon: '💰',
    descripcion: 'Cotización enviada, esperando aprobación del cliente',
  },
  {
    value: 'aprobado',
    label: 'Aprobado',
    color: '#10b981',
    icon: '✅',
    descripcion: 'Cliente aprobó la reparación, listo para iniciar',
  },
  {
    value: 'en_reparacion',
    label: 'En Reparación',
    color: '#3b82f6',
    icon: '🔧',
    descripcion: 'Equipo en proceso de reparación',
  },
  {
    value: 'esperando_repuestos',
    label: 'Esperando Repuestos',
    color: '#ef4444',
    icon: '⏳',
    descripcion: 'Reparación pausada, esperando llegada de repuestos',
  },
  {
    value: 'reparado',
    label: 'Reparado',
    color: '#22c55e',
    icon: '✨',
    descripcion: 'Reparación completada, en pruebas finales',
  },
  {
    value: 'listo_entrega',
    label: 'Entregado',
    color: '#14b8a6',
    icon: '📦',
    descripcion: 'Equipo listo, esperando retiro del cliente',
  },
  {
    value: 'entregado',
    label: 'Completado',
    color: '#64748b',
    icon: '🎉',
    descripcion: 'Equipo entregado al cliente',
  },
  {
    value: 'cancelado',
    label: 'Cancelado',
    color: '#dc2626',
    icon: '❌',
    descripcion: 'Orden cancelada',
  },
  {
    value: 'garantia',
    label: 'En Garantía',
    color: '#f97316',
    icon: '🛡️',
    descripcion: 'Equipo regresó por garantía',
  },
];

// ===========================
// PRIORIDADES
// ===========================

export type Prioridad = 'baja' | 'normal' | 'alta' | 'urgente';

export const PRIORIDADES: { value: Prioridad; label: string; color: string; icon: string }[] = [
  { value: 'baja', label: 'Baja', color: '#64748b', icon: '🟢' },
  { value: 'normal', label: 'Normal', color: '#3b82f6', icon: '🔵' },
  { value: 'alta', label: 'Alta', color: '#f59e0b', icon: '🟠' },
  { value: 'urgente', label: 'Urgente', color: '#ef4444', icon: '🔴' },
];

// ===========================
// INTERFACES PRINCIPALES
// ===========================

/**
 * Información del cliente
 */
export interface ClienteTaller {
  id?: string;
  nombre: string;
  cedula?: string;
  telefono: string;
  email?: string;
  direccion?: string;
  notas?: string;
}

/**
 * Información del dispositivo
 */
export interface DispositivoTaller {
  tipo: TipoDispositivo;
  marca: string;
  modelo: string;
  serial?: string;
  imei?: string;
  color?: string;
  patron?: string; // Patrón de desbloqueo si aplica
  contraseña?: string; // Contraseña si aplica
  accesorios: string[]; // Batería, cargador, funda, etc.
  condicionFisica: string; // Descripción del estado físico
  fotosRecepcion?: string[]; // URLs de fotos al recibir
}

/**
 * Problema reportado por el cliente
 */
export interface ProblemaReportado {
  descripcion: string;
  sintomas: string[];
  reproduceProblema: boolean; // ¿Se puede reproducir el problema?
}

/**
 * Diagnóstico técnico
 */
export interface Diagnostico {
  fecha: string;
  tecnico: string;
  descripcion: string;
  problemasEncontrados: string[];
  solucionPropuesta: string;
  repuestosNecesarios: RepuestoNecesario[];
  tiempoEstimado: number; // En horas
  costoManoObra: number;
  costoRepuestos: number;
  costoTotal: number;
  observaciones?: string;
}

/**
 * Repuesto necesario
 */
export interface RepuestoNecesario {
  id: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  precioTotal: number;
  enStock: boolean;
  proveedor?: string;
  tiempoEntrega?: string;
}

/**
 * Insumo/repuesto consumido en la reparación (control contable real)
 */
export interface InsumoReparacion {
  id: string;
  nombre: string;
  costoAdquisicion: number;
  detalles?: string;
}

/**
 * Pago/Abono realizado
 */
export interface PagoOrden {
  id: string;
  fecha: string;
  monto: number;
  metodoPago: 'efectivo' | 'tarjeta' | 'transferencia' | 'nequi' | 'daviplata';
  referencia?: string;
  recibidoPor: string;
  comprobante?: string; // URL del comprobante
}

/**
 * Cambio de estado en el historial
 */
export interface CambioEstado {
  id: string;
  fecha: string;
  estadoAnterior: EstadoOrden;
  estadoNuevo: EstadoOrden;
  usuario: string;
  notas?: string;
}

/**
 * Nota interna del taller
 */
export interface NotaInterna {
  id: string;
  fecha: string;
  usuario: string;
  nota: string;
  tipo: 'info' | 'alerta' | 'problema';
}

/**
 * Garantía de la reparación
 */
export interface Garantia {
  diasGarantia: number;
  fechaInicio: string;
  fechaVencimiento: string;
  cobertura: string; // Qué cubre la garantía
  condiciones: string[]; // Condiciones de la garantía
  activa: boolean;
}

/**
 * Orden de Servicio Completa
 */
export interface OrdenServicio {
  // Identificación
  id: string;
  numeroOrden: string; // Ej: "OS-2024-0001"

  // Fechas
  fechaRecepcion: string;
  fechaEstimadaEntrega?: string;
  fechaEntrega?: string;

  // Cliente
  cliente: ClienteTaller;

  // Dispositivo
  dispositivo: DispositivoTaller;

  // Problema
  problemaReportado: ProblemaReportado;

  // Estado
  estado: EstadoOrden;
  prioridad: Prioridad;

  // Técnico asignado
  tecnicoAsignado?: string;

  // Diagnóstico
  diagnostico?: Diagnostico;

  // Costos
  costoEstimado: number;
  costoFinal: number;
  valorCobrado?: number;
  anticipo: number;
  saldoPendiente: number;
  insumos: InsumoReparacion[];
  sinRepuestos: boolean;
  costoInsumos: number;
  utilidadNeta: number;

  // Pagos
  pagos: PagoOrden[];

  // Garantía
  garantia?: Garantia;

  // Historial
  historialEstados: CambioEstado[];
  notasInternas: NotaInterna[];

  // Metadatos
  creadoPor: string;
  fechaCreacion: string;
  ultimaActualizacion: string;

  // Configuración
  notificarCliente: boolean;
  urgente: boolean;

  // Firma del cliente
  firmaCliente?: string; // URL de la firma al recibir
  firmaEntrega?: string; // URL de la firma al entregar
}

/**
 * Estadísticas del taller
 */
export interface EstadisticasTaller {
  // Órdenes
  totalOrdenes: number;
  ordenesActivas: number;
  ordenesHoy: number;
  ordenesSemana: number;
  ordenesMes: number;

  // Estados
  ordenesPorEstado: Record<EstadoOrden, number>;

  // Ingresos
  ingresosTotales: number;
  ingresosHoy: number;
  ingresosSemana: number;
  ingresosMes: number;

  // Cartera / cuentas por cobrar
  totalPendiente: number;
  ordenesConSaldoPendiente: number;
  saldoPendienteVencido: number;

  // Tiempos
  tiempoPromedioReparacion: number; // En horas
  ordenesAtrasadas: number;

  // Dispositivos
  dispositivosMasReparados: { tipo: TipoDispositivo; cantidad: number }[];
  marcasMasComunes: { marca: string; cantidad: number }[];

  // Técnicos
  ordenesporTecnico: { tecnico: string; cantidad: number }[];

  // Satisfacción
  ordenesConGarantia: number;
  devolucionesPorGarantia: number;
}

/**
 * Filtros para búsqueda de órdenes
 */
export interface FiltrosOrden {
  estado?: EstadoOrden[];
  prioridad?: Prioridad[];
  fechaDesde?: string;
  fechaHasta?: string;
  tecnico?: string;
  tipoDispositivo?: TipoDispositivo[];
  cliente?: string;
  numeroOrden?: string;
  telefono?: string;
  serial?: string;
  imei?: string;
}
