/**
 * 💬 SERVICIO DE WHATSAPP BUSINESS (LOCAL)
 * Sistema de pedidos por WhatsApp - Versión local sin API de pago
 */

import { openDB } from './indexedDB';
import { logAction } from './logger';

export interface MensajeWhatsApp {
  id: string;
  telefono: string;
  nombreContacto: string;
  mensaje: string;
  tipo: 'entrante' | 'saliente';
  estado: 'pendiente' | 'procesado' | 'respondido' | 'error';
  pedidoId?: string;
  fecha: string;
  leido: boolean;
}

export interface PedidoWhatsApp {
  id: string;
  numero: string; // WA-001, WA-002
  telefono: string;
  nombreCliente: string;
  items: ItemPedido[];
  subtotal: number;
  total: number;
  estado: 'pendiente' | 'confirmado' | 'preparando' | 'listo' | 'entregado' | 'cancelado';
  fechaCreacion: string;
  fechaConfirmacion?: string;
  fechaEntrega?: string;
  notas?: string;
  mensajeOriginal: string;
}

export interface ItemPedido {
  productoId?: string;
  productoNombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  encontrado: boolean; // Si se encontró el producto en el inventario
}

export interface PlantillaMensaje {
  id: string;
  nombre: string;
  tipo: 'bienvenida' | 'confirmacion' | 'pedido_listo' | 'recordatorio' | 'agradecimiento';
  mensaje: string;
  variables: string[]; // Ej: ['{nombre}', '{numero}', '{total}']
  activa: boolean;
}

const PLANTILLAS_DEFAULT: Omit<PlantillaMensaje, 'id'>[] = [
  {
    nombre: 'Bienvenida',
    tipo: 'bienvenida',
    mensaje: '¡Hola {nombre}! 👋\n\nBienvenido a nuestro servicio de pedidos por WhatsApp.\n\nPuedes enviarnos tu lista de compras y te responderemos con disponibilidad y precios.\n\n¿En qué podemos ayudarte hoy?',
    variables: ['{nombre}'],
    activa: true,
  },
  {
    nombre: 'Confirmación de Pedido',
    tipo: 'confirmacion',
    mensaje: '✅ *Pedido {numero} Confirmado*\n\n{nombre}, tu pedido ha sido recibido:\n\n{items}\n\n💰 *Total: ${total}*\n\n📦 Lo tendremos listo en aproximadamente {tiempo} minutos.\n\nTe avisaremos cuando esté listo para recoger. ¡Gracias!',
    variables: ['{numero}', '{nombre}', '{items}', '{total}', '{tiempo}'],
    activa: true,
  },
  {
    nombre: 'Pedido Listo',
    tipo: 'pedido_listo',
    mensaje: '🎉 *¡Tu pedido está listo!*\n\n{nombre}, tu pedido {numero} ya está disponible para recoger.\n\n💰 Total a pagar: ${total}\n\nEstamos en {direccion}.\n\n¡Te esperamos!',
    variables: ['{nombre}', '{numero}', '{total}', '{direccion}'],
    activa: true,
  },
  {
    nombre: 'Agradecimiento',
    tipo: 'agradecimiento',
    mensaje: '😊 *¡Gracias por tu compra!*\n\n{nombre}, gracias por preferirnos.\n\n¿Todo estuvo bien con tu pedido?\n\nTu opinión es muy importante para nosotros. ❤️',
    variables: ['{nombre}'],
    activa: true,
  },
];

/**
 * Inicializar plantillas por defecto
 */
export async function inicializarPlantillas(): Promise<void> {
  try {
    const db = await openDB();
    const plantillas = await db.getAll('plantillasWhatsApp');
    
    if (plantillas.length === 0) {
      for (const plantilla of PLANTILLAS_DEFAULT) {
        await db.put('plantillasWhatsApp', {
          ...plantilla,
          id: `PLANT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        });
      }
      console.log('✅ Plantillas de WhatsApp inicializadas');
    }
  } catch (error) {
    console.error('Error inicializando plantillas:', error);
  }
}

/**
 * Parsear mensaje de pedido
 * Intenta extraer productos y cantidades del mensaje
 */
export function parsearMensajePedido(mensaje: string): {
  items: Array<{ nombre: string; cantidad: number }>;
  notas?: string;
} {
  const items: Array<{ nombre: string; cantidad: number }> = [];
  const lineas = mensaje.split('\n').filter(l => l.trim());

  for (const linea of lineas) {
    // Patrones comunes:
    // "2 cervezas corona"
    // "1x arroz diana"
    // "pan tajado x 3"
    // "5 - gaseosa coca cola"
    
    const patterns = [
      /^(\d+)\s*x?\s*(.+)$/i,           // "2 cervezas" o "2x cervezas"
      /^(.+)\s*x\s*(\d+)$/i,             // "cervezas x 2"
      /^(\d+)\s*[-–—]\s*(.+)$/i,         // "2 - cervezas"
    ];

    for (const pattern of patterns) {
      const match = linea.trim().match(pattern);
      if (match) {
        const cantidad = parseInt(match[1]);
        const nombre = match[2] || match[1];
        
        if (!isNaN(cantidad) && cantidad > 0) {
          items.push({
            cantidad,
            nombre: nombre.trim(),
          });
          break;
        }
      }
    }
  }

  return { items };
}

/**
 * Buscar productos en inventario
 */
export async function buscarProductosEnInventario(
  nombresBuscados: string[]
): Promise<Map<string, any>> {
  try {
    const db = await openDB();
    const productos = await db.getAll('productos');
    const resultados = new Map();

    for (const nombreBuscado of nombresBuscados) {
      const nombreLower = nombreBuscado.toLowerCase();
      
      // Búsqueda flexible
      const encontrado = productos.find(p => {
        const nombreProducto = p.nombre.toLowerCase();
        return nombreProducto.includes(nombreLower) || 
               nombreLower.includes(nombreProducto) ||
               p.codigo?.toLowerCase() === nombreLower;
      });

      resultados.set(nombreBuscado, encontrado || null);
    }

    return resultados;
  } catch (error) {
    console.error('Error buscando productos:', error);
    return new Map();
  }
}

/**
 * Crear pedido desde mensaje de WhatsApp
 */
export async function crearPedidoDesdeWhatsApp(datos: {
  telefono: string;
  nombreCliente: string;
  mensaje: string;
}): Promise<PedidoWhatsApp> {
  try {
    const db = await openDB();

    // Parsear mensaje
    const { items: itemsParseados } = parsearMensajePedido(datos.mensaje);

    if (itemsParseados.length === 0) {
      throw new Error('No se pudieron identificar productos en el mensaje');
    }

    // Buscar productos en inventario
    const nombresProductos = itemsParseados.map(i => i.nombre);
    const productosEncontrados = await buscarProductosEnInventario(nombresProductos);

    // Crear items del pedido
    const items: ItemPedido[] = [];
    let subtotal = 0;

    for (const itemParseado of itemsParseados) {
      const producto = productosEncontrados.get(itemParseado.nombre);
      
      const item: ItemPedido = {
        productoId: producto?.id,
        productoNombre: itemParseado.nombre,
        cantidad: itemParseado.cantidad,
        precioUnitario: producto?.precio || 0,
        subtotal: (producto?.precio || 0) * itemParseado.cantidad,
        encontrado: !!producto,
      };

      items.push(item);
      subtotal += item.subtotal;
    }

    // Generar número
    const pedidos = await db.getAll('pedidosWhatsApp');
    const numero = `WA-${(pedidos.length + 1).toString().padStart(4, '0')}`;

    // Crear pedido
    const pedido: PedidoWhatsApp = {
      id: `PEDWA-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      numero,
      telefono: datos.telefono,
      nombreCliente: datos.nombreCliente,
      items,
      subtotal,
      total: subtotal,
      estado: 'pendiente',
      fechaCreacion: new Date().toISOString(),
      mensajeOriginal: datos.mensaje,
    };

    await db.put('pedidosWhatsApp', pedido);

    await logAction('whatsapp', 'pedido_creado', {
      pedidoId: pedido.id,
      numero: pedido.numero,
      cliente: datos.nombreCliente,
      items: items.length,
    });

    return pedido;
  } catch (error) {
    console.error('Error creando pedido:', error);
    throw error;
  }
}

/**
 * Generar mensaje de cotización
 */
export function generarMensajeCotizacion(pedido: PedidoWhatsApp): string {
  let mensaje = `📋 *Cotización - Pedido ${pedido.numero}*\n\n`;
  mensaje += `Hola ${pedido.nombreCliente}, aquí está tu cotización:\n\n`;

  let itemsEncontrados = 0;
  let itemsNoEncontrados: string[] = [];

  for (const item of pedido.items) {
    if (item.encontrado) {
      mensaje += `✅ ${item.cantidad}x ${item.productoNombre}\n`;
      mensaje += `   $${item.precioUnitario.toLocaleString('es-CO')} c/u = $${item.subtotal.toLocaleString('es-CO')}\n\n`;
      itemsEncontrados++;
    } else {
      itemsNoEncontrados.push(item.productoNombre);
    }
  }

  if (itemsNoEncontrados.length > 0) {
    mensaje += `❌ *No disponible:*\n`;
    itemsNoEncontrados.forEach(nombre => {
      mensaje += `• ${nombre}\n`;
    });
    mensaje += '\n';
  }

  if (itemsEncontrados > 0) {
    mensaje += `💰 *Total: $${pedido.total.toLocaleString('es-CO')}*\n\n`;
    mensaje += `¿Confirmas tu pedido? Responde *SÍ* para continuar.`;
  } else {
    mensaje += `Lo sentimos, ninguno de los productos está disponible en este momento. 😔`;
  }

  return mensaje;
}

/**
 * Generar mensaje de confirmación
 */
export function generarMensajeConfirmacion(pedido: PedidoWhatsApp, tiempoEstimado = 30): string {
  let mensaje = `✅ *Pedido ${pedido.numero} Confirmado*\n\n`;
  mensaje += `${pedido.nombreCliente}, tu pedido ha sido confirmado:\n\n`;

  pedido.items
    .filter(i => i.encontrado)
    .forEach(item => {
      mensaje += `• ${item.cantidad}x ${item.productoNombre}\n`;
    });

  mensaje += `\n💰 *Total: $${pedido.total.toLocaleString('es-CO')}*\n\n`;
  mensaje += `📦 Lo tendremos listo en aproximadamente ${tiempoEstimado} minutos.\n\n`;
  mensaje += `Te avisaremos cuando esté listo para recoger. ¡Gracias! 😊`;

  return mensaje;
}

/**
 * Generar mensaje de pedido listo
 */
export function generarMensajePedidoListo(pedido: PedidoWhatsApp, direccion?: string): string {
  let mensaje = `🎉 *¡Tu pedido está listo!*\n\n`;
  mensaje += `${pedido.nombreCliente}, tu pedido ${pedido.numero} ya está disponible para recoger.\n\n`;
  mensaje += `💰 Total a pagar: $${pedido.total.toLocaleString('es-CO')}\n\n`;
  
  if (direccion) {
    mensaje += `📍 Estamos en: ${direccion}\n\n`;
  }
  
  mensaje += `¡Te esperamos! 😊`;

  return mensaje;
}

/**
 * Listar pedidos
 */
export async function listarPedidosWhatsApp(filtros?: {
  estado?: PedidoWhatsApp['estado'];
  desde?: string;
  hasta?: string;
}): Promise<PedidoWhatsApp[]> {
  try {
    const db = await openDB();
    let pedidos = await db.getAll('pedidosWhatsApp');

    if (filtros?.estado) {
      pedidos = pedidos.filter(p => p.estado === filtros.estado);
    }

    if (filtros?.desde) {
      pedidos = pedidos.filter(p => p.fechaCreacion >= filtros.desde!);
    }

    if (filtros?.hasta) {
      pedidos = pedidos.filter(p => p.fechaCreacion <= filtros.hasta!);
    }

    return pedidos.sort(
      (a, b) => new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime()
    );
  } catch (error) {
    console.error('Error listando pedidos:', error);
    return [];
  }
}

/**
 * Actualizar estado del pedido
 */
export async function actualizarEstadoPedido(
  pedidoId: string,
  nuevoEstado: PedidoWhatsApp['estado']
): Promise<void> {
  try {
    const db = await openDB();
    const pedido = await db.get('pedidosWhatsApp', pedidoId);
    
    if (!pedido) {
      throw new Error('Pedido no encontrado');
    }

    const actualizado: Partial<PedidoWhatsApp> = {
      estado: nuevoEstado,
    };

    if (nuevoEstado === 'confirmado' && !pedido.fechaConfirmacion) {
      actualizado.fechaConfirmacion = new Date().toISOString();
    }

    if (nuevoEstado === 'entregado' && !pedido.fechaEntrega) {
      actualizado.fechaEntrega = new Date().toISOString();
    }

    await db.put('pedidosWhatsApp', { ...pedido, ...actualizado });

    await logAction('whatsapp', 'pedido_actualizado', {
      pedidoId,
      estadoAnterior: pedido.estado,
      estadoNuevo: nuevoEstado,
    });
  } catch (error) {
    console.error('Error actualizando pedido:', error);
    throw error;
  }
}

/**
 * Obtener estadísticas de WhatsApp
 */
export async function obtenerEstadisticasWhatsApp() {
  try {
    const db = await openDB();
    const pedidos = await db.getAll('pedidosWhatsApp');

    const total = pedidos.length;
    const pendientes = pedidos.filter(p => p.estado === 'pendiente').length;
    const confirmados = pedidos.filter(p => p.estado === 'confirmado').length;
    const entregados = pedidos.filter(p => p.estado === 'entregado').length;
    const cancelados = pedidos.filter(p => p.estado === 'cancelado').length;

    const montoTotal = pedidos
      .filter(p => p.estado === 'entregado')
      .reduce((sum, p) => sum + p.total, 0);

    const tasaConversion = total > 0 ? (entregados / total) * 100 : 0;

    return {
      total,
      pendientes,
      confirmados,
      entregados,
      cancelados,
      montoTotal,
      tasaConversion,
    };
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    return null;
  }
}
