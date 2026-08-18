/**
 * 💳 SERVICIO DE FIDELIZACIÓN (PUNTOS)
 * Sistema de lealtad para clientes frecuentes
 * 100% offline - IndexedDB
 */

import { openDB } from './indexedDB';
import { logAction } from './logger';

/** ☁️ Espeja el cliente de fidelización en la nube para que la PWA lo pueda ver — best-effort. */
function publicarClienteEnLaNube(cliente: Cliente): void {
  import('./supabase/fidelizacionContabilidadSyncService')
    .then(({ publicarClientesFidelizacion }) => publicarClientesFidelizacion([cliente]))
    .catch(() => {});
}

export interface Cliente {
  id: string;
  nombre: string;
  documento: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  puntos: number;
  puntosAcumulados: number; // Total histórico
  puntosRedimidos: number;
  nivelFidelidad: 'bronce' | 'plata' | 'oro' | 'platino';
  fechaRegistro: string;
  ultimaCompra?: string;
  totalCompras: number;
  numeroCompras: number;
  codigoBarras?: string; // Para tarjeta de fidelidad
  activo: boolean;
  notas?: string;
}

export interface MovimientoPuntos {
  id: string;
  clienteId: string;
  tipo: 'acumulacion' | 'redencion' | 'ajuste' | 'expiracion' | 'bono';
  puntos: number;
  saldo: number;
  ventaId?: string;
  motivo: string;
  fecha: string;
  usuario: string;
}

export interface ConfiguracionFidelizacion {
  puntosXPeso: number; // Ej: 1 punto por cada $100
  pesosXPunto: number; // Ej: 1 punto = $10 de descuento
  puntosBienvenida: number;
  multiplicadorBronce: number;
  multiplicadorPlata: number;
  multiplicadorOro: number;
  multiplicadorPlatino: number;
  umbrales: {
    plata: number;
    oro: number;
    platino: number;
  };
  expiracionMeses: number; // Puntos expiran después de X meses
  activo: boolean;
}

const CONFIG_DEFAULT: ConfiguracionFidelizacion = {
  puntosXPeso: 1, // 1 punto por cada $1
  pesosXPunto: 10, // 1 punto = $10
  puntosBienvenida: 100,
  multiplicadorBronce: 1,
  multiplicadorPlata: 1.2,
  multiplicadorOro: 1.5,
  multiplicadorPlatino: 2,
  umbrales: {
    plata: 5000,
    oro: 15000,
    platino: 50000,
  },
  expiracionMeses: 12,
  activo: true,
};

/**
 * Obtener configuración de fidelización
 */
export async function obtenerConfiguracionFidelizacion(): Promise<ConfiguracionFidelizacion> {
  try {
    const config = localStorage.getItem('fidelizacion_config');
    if (config) {
      return JSON.parse(config);
    }
    
    // Guardar config default
    localStorage.setItem('fidelizacion_config', JSON.stringify(CONFIG_DEFAULT));
    return CONFIG_DEFAULT;
  } catch (error) {
    console.error('Error obteniendo configuración:', error);
    return CONFIG_DEFAULT;
  }
}

/**
 * Actualizar configuración de fidelización
 */
export async function actualizarConfiguracionFidelizacion(
  config: Partial<ConfiguracionFidelizacion>
): Promise<void> {
  try {
    const actual = await obtenerConfiguracionFidelizacion();
    const nueva = { ...actual, ...config };
    localStorage.setItem('fidelizacion_config', JSON.stringify(nueva));
    
    await logAction('fidelizacion', 'configuracion_actualizada', {
      cambios: config,
    });
  } catch (error) {
    console.error('Error actualizando configuración:', error);
    throw error;
  }
}

/**
 * Crear nuevo cliente
 */
export async function crearCliente(datos: Partial<Cliente>): Promise<Cliente> {
  try {
    const db = await openDB();
    const config = await obtenerConfiguracionFidelizacion();
    
    const cliente: Cliente = {
      id: `CLI-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      nombre: datos.nombre || '',
      documento: datos.documento || '',
      telefono: datos.telefono,
      email: datos.email,
      direccion: datos.direccion,
      puntos: config.puntosBienvenida,
      puntosAcumulados: config.puntosBienvenida,
      puntosRedimidos: 0,
      nivelFidelidad: 'bronce',
      fechaRegistro: new Date().toISOString(),
      totalCompras: 0,
      numeroCompras: 0,
      codigoBarras: generarCodigoBarrasCliente(),
      activo: true,
      notas: datos.notas,
    };

    await db.put('clientes', cliente);
    publicarClienteEnLaNube(cliente);

    // Registrar puntos de bienvenida
    if (config.puntosBienvenida > 0) {
      await registrarMovimientoPuntos({
        clienteId: cliente.id,
        tipo: 'bono',
        puntos: config.puntosBienvenida,
        motivo: 'Puntos de bienvenida',
      });
    }

    await logAction('fidelizacion', 'cliente_creado', {
      clienteId: cliente.id,
      nombre: cliente.nombre,
    });

    return cliente;
  } catch (error) {
    console.error('Error creando cliente:', error);
    throw error;
  }
}

/**
 * Obtener cliente por ID
 */
export async function obtenerCliente(id: string): Promise<Cliente | null> {
  try {
    const db = await openDB();
    const cliente = await db.get('clientes', id);
    return cliente || null;
  } catch (error) {
    console.error('Error obteniendo cliente:', error);
    return null;
  }
}

/**
 * Buscar cliente por documento, código de barras o teléfono (coincidencia exacta)
 */
export async function buscarCliente(termino: string): Promise<Cliente | null> {
  try {
    const db = await openDB();
    const clientes = await db.getAll('clientes');

    const encontrado = clientes.find(
      c =>
        c.documento === termino ||
        c.codigoBarras === termino ||
        c.telefono === termino
    );

    return encontrado || null;
  } catch (error) {
    console.error('Error buscando cliente:', error);
    return null;
  }
}

/**
 * Buscar clientes por texto parcial (nombre, documento, teléfono) — para el buscador del POS
 */
export async function buscarClientesPorTexto(termino: string): Promise<Cliente[]> {
  try {
    const db = await openDB();
    const clientes = await db.getAll('clientes');
    const t = termino.toLowerCase().trim();

    return clientes
      .filter(c =>
        c.activo &&
        (
          c.nombre.toLowerCase().includes(t) ||
          c.documento.includes(t) ||
          (c.telefono || '').includes(t) ||
          (c.email || '').toLowerCase().includes(t)
        )
      )
      .slice(0, 10);
  } catch (error) {
    console.error('Error buscando clientes por texto:', error);
    return [];
  }
}

/**
 * Listar todos los clientes
 */
export async function listarClientes(activos = true): Promise<Cliente[]> {
  try {
    const db = await openDB();
    const clientes = await db.getAll('clientes');
    
    return clientes
      .filter(c => !activos || c.activo)
      .sort((a, b) => b.puntos - a.puntos);
  } catch (error) {
    console.error('Error listando clientes:', error);
    return [];
  }
}

/**
 * Actualizar cliente
 */
export async function actualizarCliente(
  id: string,
  datos: Partial<Cliente>
): Promise<void> {
  try {
    const db = await openDB();
    const cliente = await obtenerCliente(id);
    
    if (!cliente) {
      throw new Error('Cliente no encontrado');
    }

    const actualizado = { ...cliente, ...datos };
    await db.put('clientes', actualizado);
    publicarClienteEnLaNube(actualizado);

    await logAction('fidelizacion', 'cliente_actualizado', {
      clienteId: id,
      cambios: datos,
    });
  } catch (error) {
    console.error('Error actualizando cliente:', error);
    throw error;
  }
}

/**
 * Calcular nivel de fidelidad
 */
function calcularNivel(puntosAcumulados: number, config: ConfiguracionFidelizacion): Cliente['nivelFidelidad'] {
  if (puntosAcumulados >= config.umbrales.platino) return 'platino';
  if (puntosAcumulados >= config.umbrales.oro) return 'oro';
  if (puntosAcumulados >= config.umbrales.plata) return 'plata';
  return 'bronce';
}

/**
 * Obtener multiplicador según nivel
 */
function obtenerMultiplicador(nivel: Cliente['nivelFidelidad'], config: ConfiguracionFidelizacion): number {
  switch (nivel) {
    case 'platino': return config.multiplicadorPlatino;
    case 'oro': return config.multiplicadorOro;
    case 'plata': return config.multiplicadorPlata;
    default: return config.multiplicadorBronce;
  }
}

/**
 * Acumular puntos por compra
 */
export async function acumularPuntos(
  clienteId: string,
  montoCompra: number,
  ventaId?: string
): Promise<number> {
  try {
    const config = await obtenerConfiguracionFidelizacion();
    
    if (!config.activo) {
      return 0;
    }

    const cliente = await obtenerCliente(clienteId);
    if (!cliente || !cliente.activo) {
      throw new Error('Cliente no encontrado o inactivo');
    }

    // Calcular puntos base
    const puntosBase = Math.floor(montoCompra / config.puntosXPeso);
    
    // Aplicar multiplicador según nivel
    const multiplicador = obtenerMultiplicador(cliente.nivelFidelidad, config);
    const puntosGanados = Math.floor(puntosBase * multiplicador);

    if (puntosGanados <= 0) {
      return 0;
    }

    // Actualizar cliente
    const nuevoPuntos = cliente.puntos + puntosGanados;
    const nuevoPuntosAcumulados = cliente.puntosAcumulados + puntosGanados;
    const nuevoNivel = calcularNivel(nuevoPuntosAcumulados, config);
    
    await actualizarCliente(clienteId, {
      puntos: nuevoPuntos,
      puntosAcumulados: nuevoPuntosAcumulados,
      nivelFidelidad: nuevoNivel,
      totalCompras: cliente.totalCompras + montoCompra,
      numeroCompras: cliente.numeroCompras + 1,
      ultimaCompra: new Date().toISOString(),
    });

    // Registrar movimiento
    await registrarMovimientoPuntos({
      clienteId,
      tipo: 'acumulacion',
      puntos: puntosGanados,
      ventaId,
      motivo: `Compra de $${montoCompra.toLocaleString('es-CO')} (${multiplicador}x por nivel ${nuevoNivel})`,
    });

    return puntosGanados;
  } catch (error) {
    console.error('Error acumulando puntos:', error);
    throw error;
  }
}

/**
 * Redimir puntos (convertir a descuento)
 */
export async function redimirPuntos(
  clienteId: string,
  puntosARedimir: number,
  ventaId?: string
): Promise<number> {
  try {
    const config = await obtenerConfiguracionFidelizacion();
    const cliente = await obtenerCliente(clienteId);
    
    if (!cliente || !cliente.activo) {
      throw new Error('Cliente no encontrado o inactivo');
    }

    if (puntosARedimir > cliente.puntos) {
      throw new Error('Puntos insuficientes');
    }

    if (puntosARedimir <= 0) {
      throw new Error('Cantidad de puntos inválida');
    }

    // Calcular descuento
    const descuento = puntosARedimir * config.pesosXPunto;

    // Actualizar cliente
    await actualizarCliente(clienteId, {
      puntos: cliente.puntos - puntosARedimir,
      puntosRedimidos: cliente.puntosRedimidos + puntosARedimir,
    });

    // Registrar movimiento
    await registrarMovimientoPuntos({
      clienteId,
      tipo: 'redencion',
      puntos: -puntosARedimir,
      ventaId,
      motivo: `Redención de puntos - Descuento de $${descuento.toLocaleString('es-CO')}`,
    });

    return descuento;
  } catch (error) {
    console.error('Error redimiendo puntos:', error);
    throw error;
  }
}

/**
 * Registrar movimiento de puntos
 */
async function registrarMovimientoPuntos(datos: {
  clienteId: string;
  tipo: MovimientoPuntos['tipo'];
  puntos: number;
  ventaId?: string;
  motivo: string;
}): Promise<void> {
  try {
    const db = await openDB();
    const cliente = await obtenerCliente(datos.clienteId);
    
    if (!cliente) {
      throw new Error('Cliente no encontrado');
    }

    const movimiento: MovimientoPuntos = {
      id: `MOV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      clienteId: datos.clienteId,
      tipo: datos.tipo,
      puntos: datos.puntos,
      saldo: cliente.puntos,
      ventaId: datos.ventaId,
      motivo: datos.motivo,
      fecha: new Date().toISOString(),
      usuario: localStorage.getItem('usuario_actual') || 'Sistema',
    };

    await db.put('movimientosPuntos', movimiento);
  } catch (error) {
    console.error('Error registrando movimiento:', error);
    throw error;
  }
}

/**
 * Obtener historial de puntos de un cliente
 */
export async function obtenerHistorialPuntos(
  clienteId: string,
  limit = 50
): Promise<MovimientoPuntos[]> {
  try {
    const db = await openDB();
    const movimientos = await db.getAll('movimientosPuntos');
    
    return movimientos
      .filter(m => m.clienteId === clienteId)
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      .slice(0, limit);
  } catch (error) {
    console.error('Error obteniendo historial:', error);
    return [];
  }
}

/**
 * Generar código de barras único para cliente
 */
function generarCodigoBarrasCliente(): string {
  // Genera código EAN-13 para tarjeta de fidelidad
  // Formato: 200 + 9 dígitos + checksum
  const prefijo = '200'; // Prefijo interno
  const numeroAleatorio = Math.floor(Math.random() * 1000000000)
    .toString()
    .padStart(9, '0');
  
  const codigo = prefijo + numeroAleatorio;
  const checksum = calcularChecksumEAN13(codigo);
  
  return codigo + checksum;
}

/**
 * Calcular dígito de verificación EAN-13
 */
function calcularChecksumEAN13(codigo: string): string {
  let suma = 0;
  for (let i = 0; i < codigo.length; i++) {
    const digito = parseInt(codigo[i]);
    suma += i % 2 === 0 ? digito : digito * 3;
  }
  const checksum = (10 - (suma % 10)) % 10;
  return checksum.toString();
}

/**
 * Obtener top clientes por puntos
 */
export async function obtenerTopClientes(limit = 10): Promise<Cliente[]> {
  try {
    const clientes = await listarClientes(true);
    return clientes
      .sort((a, b) => b.puntosAcumulados - a.puntosAcumulados)
      .slice(0, limit);
  } catch (error) {
    console.error('Error obteniendo top clientes:', error);
    return [];
  }
}

/**
 * Obtener estadísticas generales
 */
export async function obtenerEstadisticasFidelizacion() {
  try {
    const clientes = await listarClientes(true);
    const config = await obtenerConfiguracionFidelizacion();
    
    const totalClientes = clientes.length;
    const puntosCirculacion = clientes.reduce((sum, c) => sum + c.puntos, 0);
    const puntosAcumuladosTotal = clientes.reduce((sum, c) => sum + c.puntosAcumulados, 0);
    const puntosRedimidosTotal = clientes.reduce((sum, c) => sum + c.puntosRedimidos, 0);
    
    const distribucionNiveles = {
      bronce: clientes.filter(c => c.nivelFidelidad === 'bronce').length,
      plata: clientes.filter(c => c.nivelFidelidad === 'plata').length,
      oro: clientes.filter(c => c.nivelFidelidad === 'oro').length,
      platino: clientes.filter(c => c.nivelFidelidad === 'platino').length,
    };

    return {
      totalClientes,
      puntosCirculacion,
      puntosAcumuladosTotal,
      puntosRedimidosTotal,
      distribucionNiveles,
      valorEnPesos: puntosCirculacion * config.pesosXPunto,
      tasaRedencion: puntosAcumuladosTotal > 0 
        ? (puntosRedimidosTotal / puntosAcumuladosTotal) * 100 
        : 0,
    };
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    return null;
  }
}
