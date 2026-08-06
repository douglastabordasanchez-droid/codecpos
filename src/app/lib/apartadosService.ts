/**
 * 🎯 SERVICIO DE APARTADOS / RESERVAS
 * Control de productos apartados con abonos
 * 100% offline - IndexedDB
 */

import { openDB } from './indexedDB';
import { logAction } from './logger';

export interface Apartado {
  id: string;
  numero: string; // APART-001, APART-002
  clienteId?: string;
  clienteNombre: string;
  clienteTelefono: string;
  clienteDocumento?: string;
  
  productos: ProductoApartado[];
  subtotal: number;
  descuento: number;
  total: number;
  
  abonos: Abono[];
  totalAbonado: number;
  saldo: number;
  
  estado: 'activo' | 'pagado' | 'entregado' | 'cancelado' | 'vencido';
  
  fechaCreacion: string;
  fechaVencimiento: string;
  fechaPagoCompleto?: string;
  fechaEntrega?: string;
  fechaCancelacion?: string;
  
  diasVigencia: number; // Días para completar el pago
  porcentajeAbonoMinimo: number; // % mínimo del total para apartar
  
  usuarioCreador: string;
  notas?: string;
  motivoCancelacion?: string;
}

export interface ProductoApartado {
  productoId: string;
  productoNombre: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  subtotal: number;
  bloqueado: boolean; // Si se bloquea del inventario
}

export interface Abono {
  id: string;
  monto: number;
  metodoPago: string;
  fecha: string;
  usuario: string;
  referencia?: string;
  notas?: string;
}

export interface ConfiguracionApartados {
  abonoMinimoPorcentaje: number; // % mínimo del total
  diasVigenciaDefault: number; // Días default
  bloquearInventario: boolean; // Si se bloquea stock
  permitirDescuentos: boolean;
  notificarVencimiento: boolean;
  diasAntesNotificar: number;
  activo: boolean;
}

const CONFIG_DEFAULT: ConfiguracionApartados = {
  abonoMinimoPorcentaje: 30, // 30% mínimo
  diasVigenciaDefault: 15, // 15 días
  bloquearInventario: true,
  permitirDescuentos: true,
  notificarVencimiento: true,
  diasAntesNotificar: 3,
  activo: true,
};

/**
 * Obtener configuración
 */
export async function obtenerConfiguracionApartados(): Promise<ConfiguracionApartados> {
  try {
    const config = localStorage.getItem('apartados_config');
    if (config) {
      return JSON.parse(config);
    }
    localStorage.setItem('apartados_config', JSON.stringify(CONFIG_DEFAULT));
    return CONFIG_DEFAULT;
  } catch (error) {
    console.error('Error obteniendo configuración:', error);
    return CONFIG_DEFAULT;
  }
}

/**
 * Actualizar configuración
 */
export async function actualizarConfiguracionApartados(
  config: Partial<ConfiguracionApartados>
): Promise<void> {
  try {
    const actual = await obtenerConfiguracionApartados();
    const nueva = { ...actual, ...config };
    localStorage.setItem('apartados_config', JSON.stringify(nueva));
    
    await logAction('apartados', 'configuracion_actualizada', { cambios: config });
  } catch (error) {
    console.error('Error actualizando configuración:', error);
    throw error;
  }
}

/**
 * Generar número de apartado
 */
async function generarNumeroApartado(): Promise<string> {
  try {
    const db = await openDB();
    const apartados = await db.getAll('apartados');
    const numero = apartados.length + 1;
    return `APART-${numero.toString().padStart(6, '0')}`;
  } catch (error) {
    console.error('Error generando número:', error);
    return `APART-${Date.now()}`;
  }
}

/**
 * Crear apartado
 */
export async function crearApartado(datos: {
  clienteNombre: string;
  clienteTelefono: string;
  clienteDocumento?: string;
  clienteId?: string;
  productos: Array<{
    productoId: string;
    productoNombre: string;
    cantidad: number;
    precioUnitario: number;
    descuento?: number;
  }>;
  abonoInicial: number;
  metodoPago: string;
  diasVigencia?: number;
  notas?: string;
}): Promise<Apartado> {
  try {
    const db = await openDB();
    const config = await obtenerConfiguracionApartados();
    
    if (!config.activo) {
      throw new Error('El sistema de apartados está desactivado');
    }

    // Calcular totales
    const productos: ProductoApartado[] = datos.productos.map(p => ({
      productoId: p.productoId,
      productoNombre: p.productoNombre,
      cantidad: p.cantidad,
      precioUnitario: p.precioUnitario,
      descuento: p.descuento || 0,
      subtotal: (p.cantidad * p.precioUnitario) - (p.descuento || 0),
      bloqueado: config.bloquearInventario,
    }));

    const subtotal = productos.reduce((sum, p) => sum + p.subtotal, 0);
    const descuento = productos.reduce((sum, p) => sum + p.descuento, 0);
    const total = subtotal;

    // Validar abono mínimo
    const abonoMinimo = total * (config.abonoMinimoPorcentaje / 100);
    if (datos.abonoInicial < abonoMinimo) {
      throw new Error(
        `El abono mínimo es de $${abonoMinimo.toLocaleString('es-CO')} (${config.abonoMinimoPorcentaje}%)`
      );
    }

    if (datos.abonoInicial > total) {
      throw new Error('El abono no puede ser mayor al total');
    }

    const diasVigencia = datos.diasVigencia || config.diasVigenciaDefault;
    const fechaVencimiento = new Date();
    fechaVencimiento.setDate(fechaVencimiento.getDate() + diasVigencia);

    const abono: Abono = {
      id: `AB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      monto: datos.abonoInicial,
      metodoPago: datos.metodoPago,
      fecha: new Date().toISOString(),
      usuario: localStorage.getItem('usuario_actual') || 'Sistema',
      notas: 'Abono inicial',
    };

    const apartado: Apartado = {
      id: `APART-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      numero: await generarNumeroApartado(),
      clienteId: datos.clienteId,
      clienteNombre: datos.clienteNombre,
      clienteTelefono: datos.clienteTelefono,
      clienteDocumento: datos.clienteDocumento,
      productos,
      subtotal,
      descuento,
      total,
      abonos: [abono],
      totalAbonado: datos.abonoInicial,
      saldo: total - datos.abonoInicial,
      estado: datos.abonoInicial >= total ? 'pagado' : 'activo',
      fechaCreacion: new Date().toISOString(),
      fechaVencimiento: fechaVencimiento.toISOString(),
      fechaPagoCompleto: datos.abonoInicial >= total ? new Date().toISOString() : undefined,
      diasVigencia,
      porcentajeAbonoMinimo: config.abonoMinimoPorcentaje,
      usuarioCreador: localStorage.getItem('usuario_actual') || 'Sistema',
      notas: datos.notas,
    };

    await db.put('apartados', apartado);

    // TODO: Bloquear inventario si está configurado
    if (config.bloquearInventario) {
      // Integrar con sistema de inventario
    }

    await logAction('apartados', 'apartado_creado', {
      apartadoId: apartado.id,
      numero: apartado.numero,
      cliente: apartado.clienteNombre,
      total: apartado.total,
      abonoInicial: datos.abonoInicial,
    });

    return apartado;
  } catch (error) {
    console.error('Error creando apartado:', error);
    throw error;
  }
}

/**
 * Obtener apartado
 */
export async function obtenerApartado(id: string): Promise<Apartado | null> {
  try {
    const db = await openDB();
    return await db.get('apartados', id) || null;
  } catch (error) {
    console.error('Error obteniendo apartado:', error);
    return null;
  }
}

/**
 * Buscar apartado por número
 */
export async function buscarApartadoPorNumero(numero: string): Promise<Apartado | null> {
  try {
    const db = await openDB();
    const apartados = await db.getAll('apartados');
    return apartados.find(a => a.numero === numero) || null;
  } catch (error) {
    console.error('Error buscando apartado:', error);
    return null;
  }
}

/**
 * Listar apartados
 */
export async function listarApartados(filtros?: {
  estado?: Apartado['estado'];
  clienteId?: string;
  desde?: string;
  hasta?: string;
}): Promise<Apartado[]> {
  try {
    const db = await openDB();
    let apartados = await db.getAll('apartados');

    if (filtros?.estado) {
      apartados = apartados.filter(a => a.estado === filtros.estado);
    }

    if (filtros?.clienteId) {
      apartados = apartados.filter(a => a.clienteId === filtros.clienteId);
    }

    if (filtros?.desde) {
      apartados = apartados.filter(a => a.fechaCreacion >= filtros.desde!);
    }

    if (filtros?.hasta) {
      apartados = apartados.filter(a => a.fechaCreacion <= filtros.hasta!);
    }

    return apartados.sort(
      (a, b) => new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime()
    );
  } catch (error) {
    console.error('Error listando apartados:', error);
    return [];
  }
}

/**
 * Registrar abono
 */
export async function registrarAbono(
  apartadoId: string,
  monto: number,
  metodoPago: string,
  referencia?: string,
  notas?: string
): Promise<void> {
  try {
    const db = await openDB();
    const apartado = await obtenerApartado(apartadoId);
    
    if (!apartado) {
      throw new Error('Apartado no encontrado');
    }

    if (apartado.estado !== 'activo') {
      throw new Error('El apartado no está activo');
    }

    if (monto <= 0) {
      throw new Error('El monto debe ser mayor a cero');
    }

    if (monto > apartado.saldo) {
      throw new Error('El monto supera el saldo pendiente');
    }

    const abono: Abono = {
      id: `AB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      monto,
      metodoPago,
      fecha: new Date().toISOString(),
      usuario: localStorage.getItem('usuario_actual') || 'Sistema',
      referencia,
      notas,
    };

    const nuevoTotalAbonado = apartado.totalAbonado + monto;
    const nuevoSaldo = apartado.total - nuevoTotalAbonado;
    const nuevoEstado = nuevoSaldo <= 0 ? 'pagado' : 'activo';

    const actualizado: Partial<Apartado> = {
      abonos: [...apartado.abonos, abono],
      totalAbonado: nuevoTotalAbonado,
      saldo: nuevoSaldo,
      estado: nuevoEstado,
    };

    if (nuevoEstado === 'pagado') {
      actualizado.fechaPagoCompleto = new Date().toISOString();
    }

    await db.put('apartados', { ...apartado, ...actualizado });

    await logAction('apartados', 'abono_registrado', {
      apartadoId,
      numero: apartado.numero,
      monto,
      saldoRestante: nuevoSaldo,
    });
  } catch (error) {
    console.error('Error registrando abono:', error);
    throw error;
  }
}

/**
 * Entregar apartado
 */
export async function entregarApartado(apartadoId: string): Promise<void> {
  try {
    const db = await openDB();
    const apartado = await obtenerApartado(apartadoId);
    
    if (!apartado) {
      throw new Error('Apartado no encontrado');
    }

    if (apartado.estado !== 'pagado') {
      throw new Error('El apartado debe estar pagado para entregarse');
    }

    await db.put('apartados', {
      ...apartado,
      estado: 'entregado',
      fechaEntrega: new Date().toISOString(),
    });

    // TODO: Desbloquear inventario
    // TODO: Generar venta en el sistema de ventas

    await logAction('apartados', 'apartado_entregado', {
      apartadoId,
      numero: apartado.numero,
    });
  } catch (error) {
    console.error('Error entregando apartado:', error);
    throw error;
  }
}

/**
 * Cancelar apartado
 */
export async function cancelarApartado(
  apartadoId: string,
  motivo: string,
  reembolsar = false
): Promise<void> {
  try {
    const db = await openDB();
    const apartado = await obtenerApartado(apartadoId);
    
    if (!apartado) {
      throw new Error('Apartado no encontrado');
    }

    if (apartado.estado === 'entregado') {
      throw new Error('No se puede cancelar un apartado ya entregado');
    }

    await db.put('apartados', {
      ...apartado,
      estado: 'cancelado',
      fechaCancelacion: new Date().toISOString(),
      motivoCancelacion: motivo,
    });

    // TODO: Desbloquear inventario
    // TODO: Registrar reembolso si aplica

    await logAction('apartados', 'apartado_cancelado', {
      apartadoId,
      numero: apartado.numero,
      motivo,
      reembolsar,
    });
  } catch (error) {
    console.error('Error cancelando apartado:', error);
    throw error;
  }
}

/**
 * Verificar apartados vencidos
 */
export async function verificarApartadosVencidos(): Promise<void> {
  try {
    const db = await openDB();
    const apartados = await listarApartados({ estado: 'activo' });
    const ahora = new Date();

    for (const apartado of apartados) {
      const vencimiento = new Date(apartado.fechaVencimiento);
      
      if (ahora > vencimiento) {
        await db.put('apartados', {
          ...apartado,
          estado: 'vencido',
        });

        // TODO: Desbloquear inventario

        await logAction('apartados', 'apartado_vencido', {
          apartadoId: apartado.id,
          numero: apartado.numero,
        });
      }
    }
  } catch (error) {
    console.error('Error verificando vencimientos:', error);
  }
}

/**
 * Obtener apartados próximos a vencer
 */
export async function obtenerApartadosProximosVencer(dias = 3): Promise<Apartado[]> {
  try {
    const apartados = await listarApartados({ estado: 'activo' });
    const ahora = new Date();
    const limite = new Date();
    limite.setDate(limite.getDate() + dias);

    return apartados.filter(a => {
      const vencimiento = new Date(a.fechaVencimiento);
      return vencimiento >= ahora && vencimiento <= limite;
    });
  } catch (error) {
    console.error('Error obteniendo apartados próximos a vencer:', error);
    return [];
  }
}

/**
 * Obtener estadísticas de apartados
 */
export async function obtenerEstadisticasApartados() {
  try {
    const apartados = await listarApartados();
    
    const totalApartados = apartados.length;
    const activos = apartados.filter(a => a.estado === 'activo').length;
    const pagados = apartados.filter(a => a.estado === 'pagado').length;
    const entregados = apartados.filter(a => a.estado === 'entregado').length;
    const cancelados = apartados.filter(a => a.estado === 'cancelado').length;
    const vencidos = apartados.filter(a => a.estado === 'vencido').length;

    const montoTotal = apartados.reduce((sum, a) => sum + a.total, 0);
    const montoAbonado = apartados.reduce((sum, a) => sum + a.totalAbonado, 0);
    const montoPendiente = apartados
      .filter(a => a.estado === 'activo')
      .reduce((sum, a) => sum + a.saldo, 0);

    const tasaCompletacion = totalApartados > 0 
      ? ((entregados / totalApartados) * 100) 
      : 0;

    const tasaCancelacion = totalApartados > 0 
      ? ((cancelados / totalApartados) * 100) 
      : 0;

    return {
      totalApartados,
      activos,
      pagados,
      entregados,
      cancelados,
      vencidos,
      montoTotal,
      montoAbonado,
      montoPendiente,
      tasaCompletacion,
      tasaCancelacion,
    };
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    return null;
  }
}
