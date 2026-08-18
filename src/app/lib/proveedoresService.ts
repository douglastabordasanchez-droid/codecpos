/**
 * 🏢 SERVICIO DE GESTIÓN DE PROVEEDORES
 * Sistema completo para gestionar proveedores, compras y pagos
 * Compatible con CODEC POS v2.0 - 100% localStorage
 */

// ==================== TIPOS Y INTERFACES ====================

export interface Proveedor {
  id: string;
  nombre: string;
  razonSocial?: string;
  nit: string;
  tipoDocumento: 'NIT' | 'CC' | 'CE' | 'Pasaporte';
  
  // Contacto
  contactoPrincipal: string;
  telefono: string;
  email: string;
  direccion: string;
  ciudad: string;
  pais: string;
  
  // Información comercial
  categoria: string; // Abarrotes, Bebidas, Aseo, etc.
  diasCredito: number;
  limiteCredito: number;
  descuentoHabitual: number; // % de descuento
  
  // Productos que suministra
  productosIds: string[];
  
  // Estado financiero
  saldoPendiente: number;
  totalComprado: number;
  totalPagado: number;
  
  // Calificación
  calificacion: number; // 1-5 estrellas
  tiempoEntregaPromedio: number; // días
  
  // Estado
  activo: boolean;
  bloqueado: boolean;
  motivoBloqueo?: string;
  
  // Preferencias
  metodoPagoPreferido: string;
  horarioAtencion?: string;
  diasEntrega?: string[];
  
  // Notas y observaciones
  notas?: string;
  
  // Estadísticas
  totalPedidos: number;
  ultimaCompra?: string;
  proximoPago?: string;
  
  // Metadata
  fechaRegistro: string;
  registradoPor: string;
  ultimaModificacion?: string;
}

export interface CompraProveedor {
  id: string;
  proveedorId: string;
  proveedorNombre: string;
  
  // Detalles de la compra
  fecha: string;
  fechaEntrega?: string;
  numeroFactura: string;
  numeroOrden?: string;
  
  // Productos
  productos: {
    productoId: string;
    productoNombre: string;
    cantidad: number;
    precioUnitario: number;
    descuento: number;
    subtotal: number;
  }[];
  
  // Totales
  subtotal: number;
  descuentoTotal: number;
  iva: number;
  total: number;
  
  // Pago
  metodoPago: string;
  estadoPago: 'pendiente' | 'parcial' | 'pagado';
  montoPagado: number;
  saldoPendiente: number;
  fechaVencimiento?: string;
  
  // Estado de entrega
  estadoEntrega: 'pendiente' | 'parcial' | 'completo' | 'cancelado';
  
  // Metadata
  registradoPor: string;
  notas?: string;
}

export interface PagoProveedor {
  id: string;
  proveedorId: string;
  proveedorNombre: string;
  compraId?: string;
  
  // Detalles del pago
  fecha: string;
  monto: number;
  metodoPago: string;
  referencia?: string;
  
  // Metadata
  registradoPor: string;
  notas?: string;
}

export interface EstadisticasProveedores {
  totalProveedores: number;
  proveedoresActivos: number;
  saldoTotalPendiente: number;
  comprasEsteMes: number;
  montoComprasEsteMes: number;
  proveedorMasComprado: {
    nombre: string;
    monto: number;
  } | null;
  proximosPagos: {
    proveedorNombre: string;
    monto: number;
    fecha: string;
  }[];
}

// ==================== ALMACENAMIENTO ====================

const STORAGE_KEYS = {
  PROVEEDORES: 'codec_pos_proveedores',
  COMPRAS: 'codec_pos_compras_proveedores',
  PAGOS: 'codec_pos_pagos_proveedores',
};

/**
 * ☁️ Espeja el catálogo de proveedores en la nube para que la PWA lo pueda
 * ver (antes vivía 100% en localStorage, invisible fuera de la caja) —
 * best-effort: si no hay internet o el negocio no está vinculado, no pasa
 * nada, el proveedor ya quedó guardado localmente como siempre.
 */
function publicarEnLaNube(proveedores: Proveedor[]): void {
  import('./supabase/promocionesProveedoresSyncService')
    .then(({ publicarProveedores }) => publicarProveedores(proveedores))
    .catch(() => {});
}

// ==================== FUNCIONES DE PROVEEDORES ====================

/**
 * Crear nuevo proveedor
 */
export async function crearProveedor(data: Partial<Proveedor>): Promise<Proveedor> {
  try {
    const proveedores = await listarProveedores();
    
    const nuevoProveedor: Proveedor = {
      id: `PROV-${Date.now()}`,
      nombre: data.nombre || '',
      razonSocial: data.razonSocial,
      nit: data.nit || '',
      tipoDocumento: data.tipoDocumento || 'NIT',
      contactoPrincipal: data.contactoPrincipal || '',
      telefono: data.telefono || '',
      email: data.email || '',
      direccion: data.direccion || '',
      ciudad: data.ciudad || '',
      pais: data.pais || 'Colombia',
      categoria: data.categoria || 'General',
      diasCredito: data.diasCredito || 0,
      limiteCredito: data.limiteCredito || 0,
      descuentoHabitual: data.descuentoHabitual || 0,
      productosIds: data.productosIds || [],
      saldoPendiente: 0,
      totalComprado: 0,
      totalPagado: 0,
      calificacion: data.calificacion || 5,
      tiempoEntregaPromedio: data.tiempoEntregaPromedio || 3,
      activo: data.activo !== undefined ? data.activo : true,
      bloqueado: false,
      metodoPagoPreferido: data.metodoPagoPreferido || 'Transferencia',
      horarioAtencion: data.horarioAtencion,
      diasEntrega: data.diasEntrega,
      notas: data.notas,
      totalPedidos: 0,
      fechaRegistro: new Date().toISOString(),
      registradoPor: 'admin',
    };
    
    proveedores.push(nuevoProveedor);
    localStorage.setItem(STORAGE_KEYS.PROVEEDORES, JSON.stringify(proveedores));
    publicarEnLaNube([nuevoProveedor]);

    return nuevoProveedor;
  } catch (error) {
    console.error('Error creando proveedor:', error);
    throw error;
  }
}

/**
 * Listar todos los proveedores
 */
export async function listarProveedores(soloActivos = false): Promise<Proveedor[]> {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.PROVEEDORES);
    let proveedores: Proveedor[] = data ? JSON.parse(data) : [];
    
    if (soloActivos) {
      proveedores = proveedores.filter(p => p.activo && !p.bloqueado);
    }
    
    return proveedores.sort((a, b) => a.nombre.localeCompare(b.nombre));
  } catch (error) {
    console.error('Error listando proveedores:', error);
    return [];
  }
}

/**
 * Obtener proveedor por ID
 */
export async function obtenerProveedor(id: string): Promise<Proveedor | null> {
  const proveedores = await listarProveedores();
  return proveedores.find(p => p.id === id) || null;
}

/**
 * Actualizar proveedor
 */
export async function actualizarProveedor(id: string, cambios: Partial<Proveedor>): Promise<Proveedor> {
  const proveedores = await listarProveedores();
  const index = proveedores.findIndex(p => p.id === id);
  
  if (index === -1) {
    throw new Error('Proveedor no encontrado');
  }
  
  proveedores[index] = {
    ...proveedores[index],
    ...cambios,
    ultimaModificacion: new Date().toISOString(),
  };
  
  localStorage.setItem(STORAGE_KEYS.PROVEEDORES, JSON.stringify(proveedores));
  publicarEnLaNube([proveedores[index]]);

  return proveedores[index];
}

/**
 * Eliminar proveedor
 */
export async function eliminarProveedor(id: string): Promise<void> {
  const proveedores = await listarProveedores();
  const filtrados = proveedores.filter(p => p.id !== id);
  
  localStorage.setItem(STORAGE_KEYS.PROVEEDORES, JSON.stringify(filtrados));
}

/**
 * Bloquear/Desbloquear proveedor
 */
export async function toggleBloqueoProveedor(id: string, motivo?: string): Promise<Proveedor> {
  const proveedor = await obtenerProveedor(id);
  
  if (!proveedor) {
    throw new Error('Proveedor no encontrado');
  }
  
  return await actualizarProveedor(id, {
    bloqueado: !proveedor.bloqueado,
    motivoBloqueo: !proveedor.bloqueado ? motivo : undefined,
  });
}

/**
 * Registrar compra a proveedor
 */
export async function registrarCompra(compra: Partial<CompraProveedor>): Promise<CompraProveedor> {
  const data = localStorage.getItem(STORAGE_KEYS.COMPRAS);
  const compras: CompraProveedor[] = data ? JSON.parse(data) : [];
  
  const nuevaCompra: CompraProveedor = {
    id: `COMP-${Date.now()}`,
    proveedorId: compra.proveedorId || '',
    proveedorNombre: compra.proveedorNombre || '',
    fecha: compra.fecha || new Date().toISOString(),
    fechaEntrega: compra.fechaEntrega,
    numeroFactura: compra.numeroFactura || '',
    numeroOrden: compra.numeroOrden,
    productos: compra.productos || [],
    subtotal: compra.subtotal || 0,
    descuentoTotal: compra.descuentoTotal || 0,
    iva: compra.iva || 0,
    total: compra.total || 0,
    metodoPago: compra.metodoPago || 'Crédito',
    estadoPago: compra.estadoPago || 'pendiente',
    montoPagado: compra.montoPagado || 0,
    saldoPendiente: compra.saldoPendiente || compra.total || 0,
    fechaVencimiento: compra.fechaVencimiento,
    estadoEntrega: compra.estadoEntrega || 'pendiente',
    registradoPor: 'admin',
    notas: compra.notas,
  };
  
  compras.push(nuevaCompra);
  localStorage.setItem(STORAGE_KEYS.COMPRAS, JSON.stringify(compras));

  // ── Actualizar stock de productos en inventario ──────────────────────────────
  try {
    const rawStock = localStorage.getItem('pos-productos');
    const stockProductos: any[] = rawStock ? JSON.parse(rawStock) : [];
    let stockModificado = false;

    for (const item of nuevaCompra.productos) {
      if (!item.productoId) continue;
      const idx = stockProductos.findIndex(p => p.id === item.productoId);
      if (idx >= 0) {
        stockProductos[idx].stock = (Number(stockProductos[idx].stock) || 0) + Number(item.cantidad);
        if (item.precioUnitario > 0) {
          stockProductos[idx].costo = item.precioUnitario;
        }
        stockModificado = true;
      }
    }

    if (stockModificado) {
      localStorage.setItem('pos-productos', JSON.stringify(stockProductos));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('inventario:actualizado'));
      }
    }
  } catch (err) {
    console.warn('[Proveedores] Error actualizando stock:', err);
  }

  // ── Registrar asiento contable en gastos ─────────────────────────────────────
  try {
    const rawGastos = localStorage.getItem('pos-gastos');
    const gastos: any[] = rawGastos ? JSON.parse(rawGastos) : [];
    const esCredito = nuevaCompra.estadoPago !== 'pagado';
    const montoGasto = esCredito ? nuevaCompra.montoPagado : nuevaCompra.total;

    if (montoGasto > 0) {
      gastos.push({
        id: `GASTO-${nuevaCompra.id}`,
        fecha: nuevaCompra.fecha,
        descripcion: `${esCredito ? '[Crédito] ' : ''}Compra a ${nuevaCompra.proveedorNombre} — Fac. ${nuevaCompra.numeroFactura}`,
        categoria: 'inventario',
        monto: montoGasto,
        metodoPago: esCredito
          ? 'credito_proveedor'
          : (nuevaCompra.metodoPago || 'efectivo').toLowerCase(),
        comprobante: nuevaCompra.numeroFactura,
        registradoPor: 'Sistema',
        notas: esCredito
          ? `Compra a crédito — Saldo pendiente: $${nuevaCompra.saldoPendiente.toLocaleString('es-CO')}`
          : undefined,
        proveedorId: nuevaCompra.proveedorId,
        compraId: nuevaCompra.id,
      });
      localStorage.setItem('pos-gastos', JSON.stringify(gastos));
    }
  } catch (err) {
    console.warn('[Proveedores] Error registrando gasto contable:', err);
  }

  // Actualizar estadísticas del proveedor
  const proveedor = await obtenerProveedor(nuevaCompra.proveedorId);
  if (proveedor) {
    await actualizarProveedor(proveedor.id, {
      totalComprado: proveedor.totalComprado + nuevaCompra.total,
      saldoPendiente: proveedor.saldoPendiente + nuevaCompra.saldoPendiente,
      totalPedidos: proveedor.totalPedidos + 1,
      ultimaCompra: nuevaCompra.fecha,
    });
  }
  
  return nuevaCompra;
}

/**
 * Registrar pago a proveedor
 */
export async function registrarPago(pago: Partial<PagoProveedor>): Promise<PagoProveedor> {
  const data = localStorage.getItem(STORAGE_KEYS.PAGOS);
  const pagos: PagoProveedor[] = data ? JSON.parse(data) : [];
  
  const nuevoPago: PagoProveedor = {
    id: `PAGO-${Date.now()}`,
    proveedorId: pago.proveedorId || '',
    proveedorNombre: pago.proveedorNombre || '',
    compraId: pago.compraId,
    fecha: pago.fecha || new Date().toISOString(),
    monto: pago.monto || 0,
    metodoPago: pago.metodoPago || 'Transferencia',
    referencia: pago.referencia,
    registradoPor: 'admin',
    notas: pago.notas,
  };
  
  pagos.push(nuevoPago);
  localStorage.setItem(STORAGE_KEYS.PAGOS, JSON.stringify(pagos));
  
  // Actualizar saldo del proveedor
  const proveedor = await obtenerProveedor(nuevoPago.proveedorId);
  if (proveedor) {
    await actualizarProveedor(proveedor.id, {
      totalPagado: proveedor.totalPagado + nuevoPago.monto,
      saldoPendiente: proveedor.saldoPendiente - nuevoPago.monto,
    });
  }
  
  return nuevoPago;
}

/**
 * Obtener estadísticas de proveedores
 */
export async function obtenerEstadisticas(): Promise<EstadisticasProveedores> {
  const proveedores = await listarProveedores();
  const dataCompras = localStorage.getItem(STORAGE_KEYS.COMPRAS);
  const compras: CompraProveedor[] = dataCompras ? JSON.parse(dataCompras) : [];
  
  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  
  const comprasEsteMes = compras.filter(c => new Date(c.fecha) >= inicioMes);
  const montoComprasEsteMes = comprasEsteMes.reduce((sum, c) => sum + c.total, 0);
  
  const saldoTotalPendiente = proveedores.reduce((sum, p) => sum + p.saldoPendiente, 0);
  
  // Proveedor más comprado
  const comprasPorProveedor = new Map<string, { nombre: string; monto: number }>();
  compras.forEach(c => {
    const actual = comprasPorProveedor.get(c.proveedorId) || { nombre: c.proveedorNombre, monto: 0 };
    actual.monto += c.total;
    comprasPorProveedor.set(c.proveedorId, actual);
  });
  
  let proveedorMasComprado = null;
  let maxMonto = 0;
  comprasPorProveedor.forEach(datos => {
    if (datos.monto > maxMonto) {
      maxMonto = datos.monto;
      proveedorMasComprado = datos;
    }
  });
  
  // Próximos pagos
  const proximosPagos = compras
    .filter(c => c.estadoPago !== 'pagado' && c.fechaVencimiento)
    .sort((a, b) => new Date(a.fechaVencimiento!).getTime() - new Date(b.fechaVencimiento!).getTime())
    .slice(0, 5)
    .map(c => ({
      proveedorNombre: c.proveedorNombre,
      monto: c.saldoPendiente,
      fecha: c.fechaVencimiento!,
    }));
  
  return {
    totalProveedores: proveedores.length,
    proveedoresActivos: proveedores.filter(p => p.activo && !p.bloqueado).length,
    saldoTotalPendiente,
    comprasEsteMes: comprasEsteMes.length,
    montoComprasEsteMes,
    proveedorMasComprado,
    proximosPagos,
  };
}

/**
 * Calificar proveedor
 */
export async function calificarProveedor(id: string, calificacion: number): Promise<Proveedor> {
  if (calificacion < 1 || calificacion > 5) {
    throw new Error('La calificación debe estar entre 1 y 5');
  }
  
  return await actualizarProveedor(id, { calificacion });
}

/**
 * Exportar proveedores
 */
export async function exportarProveedores(): Promise<string> {
  const proveedores = await listarProveedores();
  return JSON.stringify(proveedores, null, 2);
}

/**
 * Importar proveedores
 */
export async function importarProveedores(json: string): Promise<number> {
  try {
    const proveedores = JSON.parse(json);
    
    if (!Array.isArray(proveedores)) {
      throw new Error('Formato inválido');
    }
    
    localStorage.setItem(STORAGE_KEYS.PROVEEDORES, JSON.stringify(proveedores));
    
    return proveedores.length;
  } catch (error) {
    throw new Error('Formato de archivo inválido');
  }
}
