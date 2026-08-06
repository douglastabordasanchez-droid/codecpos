/**
 * 🔗 SERVICIO DE INTEGRACIÓN POS
 * Conecta fidelización, promociones y apartados con el sistema de ventas
 */

import { Cliente, acumularPuntos, redimirPuntos, buscarCliente } from './fidelizacionService';
import { aplicarPromociones, registrarUsoPromocion, PromocionAplicada } from './promocionesService';
import { crearApartado } from './apartadosService';
import { toast } from 'sonner';

export interface ProductoCarrito {
  id: string;
  nombre: string;
  precio: number;
  cantidad: number;
  categoria?: string;
  marca?: string;
  pesable?: boolean;
  peso?: number;
}

export interface ResultadoFidelizacion {
  cliente: Cliente | null;
  puntosAcumulados: number;
  puntosRedimidos: number;
  descuentoPuntos: number;
}

export interface ResultadoPromocion {
  descuentoTotal: number;
  promocionesAplicadas: PromocionAplicada[];
  productosGratis: string[];
}

export interface CarritoEnriquecido {
  productos: ProductoCarrito[];
  subtotal: number;
  descuentoPromociones: number;
  descuentoPuntos: number;
  descuentoTotal: number;
  total: number;
  fidelizacion: ResultadoFidelizacion;
  promociones: ResultadoPromocion;
}

/**
 * Procesar carrito con todas las funcionalidades integradas
 */
export async function procesarCarrito(
  productos: ProductoCarrito[],
  clienteId?: string,
  puntosARedimir?: number
): Promise<CarritoEnriquecido> {
  try {
    // Calcular subtotal
    const subtotal = productos.reduce((sum, p) => {
      if (p.pesable && p.peso) {
        return sum + (p.precio * p.peso);
      }
      return sum + (p.precio * p.cantidad);
    }, 0);

    // Aplicar promociones
    const promociones = await aplicarPromociones({
      productos,
      subtotal,
      clienteId,
    });

    // Procesar fidelización
    let fidelizacion: ResultadoFidelizacion = {
      cliente: null,
      puntosAcumulados: 0,
      puntosRedimidos: 0,
      descuentoPuntos: 0,
    };

    if (clienteId) {
      const cliente = await buscarCliente(clienteId);
      if (cliente) {
        fidelizacion.cliente = cliente;

        // Redimir puntos si se solicitó
        if (puntosARedimir && puntosARedimir > 0) {
          try {
            const descuento = await redimirPuntos(clienteId, puntosARedimir);
            fidelizacion.puntosRedimidos = puntosARedimir;
            fidelizacion.descuentoPuntos = descuento;
          } catch (error) {
            console.error('Error redimiendo puntos:', error);
            toast.error('No se pudieron redimir los puntos');
          }
        }
      }
    }

    // Calcular descuentos totales
    const descuentoTotal = promociones.descuentoTotal + fidelizacion.descuentoPuntos;
    const total = Math.max(0, subtotal - descuentoTotal);

    return {
      productos,
      subtotal,
      descuentoPromociones: promociones.descuentoTotal,
      descuentoPuntos: fidelizacion.descuentoPuntos,
      descuentoTotal,
      total,
      fidelizacion,
      promociones,
    };
  } catch (error) {
    console.error('Error procesando carrito:', error);
    throw error;
  }
}

/**
 * Finalizar venta y acumular puntos
 */
export async function finalizarVenta(
  carrito: CarritoEnriquecido,
  metodoPago: string,
  ventaId?: string
): Promise<void> {
  try {
    // Acumular puntos si hay cliente
    if (carrito.fidelizacion.cliente) {
      const puntosGanados = await acumularPuntos(
        carrito.fidelizacion.cliente.id,
        carrito.total,
        ventaId
      );
      
      if (puntosGanados > 0) {
        toast.success(`🎁 Cliente ganó ${puntosGanados} puntos`, {
          description: `Nuevo saldo: ${carrito.fidelizacion.cliente.puntos + puntosGanados} puntos`,
        });
      }
    }

    // Registrar uso de promociones
    for (const promo of carrito.promociones.promocionesAplicadas) {
      await registrarUsoPromocion(promo.promocionId);
    }

  } catch (error) {
    console.error('Error finalizando venta:', error);
    throw error;
  }
}

/**
 * Crear apartado desde carrito
 */
export async function crearApartadoDesdeCarrito(datos: {
  clienteNombre: string;
  clienteTelefono: string;
  clienteDocumento?: string;
  clienteId?: string;
  productos: ProductoCarrito[];
  abonoInicial: number;
  metodoPago: string;
}): Promise<any> {
  try {
    const items = datos.productos.map(p => ({
      productoId: p.id,
      productoNombre: p.nombre,
      cantidad: p.cantidad,
      precioUnitario: p.precio,
      descuento: 0,
    }));

    const apartado = await crearApartado({
      clienteNombre: datos.clienteNombre,
      clienteTelefono: datos.clienteTelefono,
      clienteDocumento: datos.clienteDocumento,
      clienteId: datos.clienteId,
      productos: items,
      abonoInicial: datos.abonoInicial,
      metodoPago: datos.metodoPago,
    });

    toast.success(`Apartado ${apartado.numero} creado exitosamente`);
    return apartado;
  } catch (error) {
    console.error('Error creando apartado:', error);
    toast.error('Error creando apartado');
    throw error;
  }
}

/**
 * Validar si se puede apartar
 */
export function validarApartado(
  total: number,
  abonoInicial: number,
  porcentajeMinimo = 30
): { valido: boolean; mensaje: string } {
  const minimoRequerido = total * (porcentajeMinimo / 100);
  
  if (abonoInicial < minimoRequerido) {
    return {
      valido: false,
      mensaje: `El abono mínimo es $${minimoRequerido.toLocaleString('es-CO')} (${porcentajeMinimo}%)`,
    };
  }

  if (abonoInicial > total) {
    return {
      valido: false,
      mensaje: 'El abono no puede ser mayor al total',
    };
  }

  return {
    valido: true,
    mensaje: 'Abono válido',
  };
}

/**
 * Calcular puntos que ganará el cliente
 */
export function calcularPuntosEstimados(montoCompra: number, multiplicador = 1): number {
  // Configuración por defecto: 1 punto por cada $1
  return Math.floor(montoCompra * multiplicador);
}

/**
 * Formatear información de descuentos para mostrar
 */
export function formatearDescuentos(carrito: CarritoEnriquecido): string[] {
  const descuentos: string[] = [];

  // Promociones
  carrito.promociones.promocionesAplicadas.forEach(promo => {
    descuentos.push(
      `${promo.promocionNombre}: -$${promo.descuento.toLocaleString('es-CO')}`
    );
  });

  // Puntos
  if (carrito.descuentoPuntos > 0) {
    descuentos.push(
      `Puntos redimidos: -$${carrito.descuentoPuntos.toLocaleString('es-CO')}`
    );
  }

  return descuentos;
}

/**
 * Obtener resumen para mostrar al cliente
 */
export function obtenerResumenVenta(carrito: CarritoEnriquecido): {
  items: number;
  subtotal: string;
  descuentos: string[];
  descuentoTotal: string;
  total: string;
  puntosGanados: number;
  puntosRedimidos: number;
} {
  const items = carrito.productos.reduce((sum, p) => sum + p.cantidad, 0);
  const puntosGanados = calcularPuntosEstimados(carrito.total);

  return {
    items,
    subtotal: `$${carrito.subtotal.toLocaleString('es-CO')}`,
    descuentos: formatearDescuentos(carrito),
    descuentoTotal: `$${carrito.descuentoTotal.toLocaleString('es-CO')}`,
    total: `$${carrito.total.toLocaleString('es-CO')}`,
    puntosGanados,
    puntosRedimidos: carrito.fidelizacion.puntosRedimidos,
  };
}
