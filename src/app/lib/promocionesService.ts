/**
 * 🎁 SERVICIO DE PROMOCIONES Y DESCUENTOS AUTOMÁTICOS
 * Sistema completo de gestión de promociones, descuentos y combos
 * Compatible con CODEC POS v2.0 - 100% localStorage
 */

// ==================== TIPOS Y INTERFACES ====================

export interface Promocion {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: 'porcentaje' | 'monto_fijo' | '2x1' | '3x2' | 'combo' | 'regalo_producto';

  // Código escaneable (EAN-8 generado automáticamente)
  codigoPromo?: string;
  codigoBarras?: string;

  // Artículos del combo (cuando tipo === 'combo')
  comboItems?: { productoId: string; productoNombre: string; cantidad: number }[];

  // Configuración del descuento
  valorDescuento?: number; // % o monto en pesos
  productoRegaloId?: string;
  productoRegaloNombre?: string;

  // Condiciones de aplicación
  aplicaA: 'todos' | 'categorias' | 'productos' | 'cliente_especifico';
  categorias?: string[];
  productos?: string[]; // IDs de productos
  clienteId?: string;
  
  // Requisitos
  montoMinimo?: number;
  cantidadMinima?: number;
  diasSemana?: number[]; // 0=Domingo, 1=Lunes, etc.
  horaInicio?: string; // "09:00"
  horaFin?: string; // "18:00"
  
  // Vigencia
  fechaInicio: string;
  fechaFin: string;
  activa: boolean;
  
  // Límites
  usosMaximos?: number;
  usosActuales: number;
  descuentoMaximoPorVenta?: number;
  
  // Prioridad (mayor número = mayor prioridad)
  prioridad: number;
  
  // Combinable con otras promociones
  acumulable: boolean;
  
  // Estadísticas
  ventasGeneradas: number;
  descuentoTotalOtorgado: number;
  
  // Metadata
  fechaCreacion: string;
  creadoPor: string;
  ultimaModificacion?: string;
}

export interface Combo {
  id: string;
  nombre: string;
  descripcion: string;
  imagen?: string;

  // Código escaneable (EAN-8 generado automáticamente)
  codigoPromo?: string;
  codigoBarras?: string;

  // Productos del combo
  productos: {
    productoId: string;
    productoNombre: string;
    cantidad: number;
    precioIndividual: number;
  }[];
  
  // Precios
  precioNormal: number;
  precioCombo: number;
  ahorro: number;
  porcentajeDescuento: number;
  
  // Vigencia
  fechaInicio: string;
  fechaFin: string;
  activo: boolean;
  
  // Estadísticas
  vendidos: number;
  ingresoGenerado: number;
  
  // Metadata
  fechaCreacion: string;
}

export interface AplicacionPromocion {
  promocionId: string;
  promocionNombre: string;
  descuentoAplicado: number;
  ventaId: string;
  fecha: string;
}

export interface EstadisticasPromociones {
  totalPromociones: number;
  promocionesActivas: number;
  combosActivos: number;
  totalDescuentosOtorgados: number;
  descuentosHoy: number;
  descuentosSemana: number;
  promocionMasUsada: {
    nombre: string;
    usos: number;
  } | null;
  ahorroPromedioPorVenta: number;
}

// ==================== ALMACENAMIENTO ====================

const STORAGE_KEYS = {
  PROMOCIONES: 'codec_pos_promociones',
  COMBOS: 'codec_pos_combos',
  APLICACIONES: 'codec_pos_aplicaciones_promociones',
};

/** ☁️ Espeja promociones/combos en la nube para que la PWA los pueda ver — best-effort, ver proveedoresService.ts. */
function publicarPromocionesEnLaNube(promociones: Promocion[]): void {
  import('./supabase/promocionesProveedoresSyncService')
    .then(({ publicarPromociones }) => publicarPromociones(promociones))
    .catch(() => {});
}
function publicarCombosEnLaNube(combos: Combo[]): void {
  import('./supabase/promocionesProveedoresSyncService')
    .then(({ publicarCombos }) => publicarCombos(combos))
    .catch(() => {});
}

// ==================== HELPERS INTERNOS ====================

/** Genera un código de barras EAN-8 único para promociones/combos */
function generarCodigoBarrasPromo(): string {
  // Prefijo 25 = códigos internos/promocionales (no colisiona con EAN-13 de productos)
  const aleatorio = Math.floor(Math.random() * 99999).toString().padStart(5, '0');
  const base = '25' + aleatorio; // 7 dígitos
  let suma = 0;
  for (let i = 0; i < 7; i++) {
    suma += parseInt(base[i]) * (i % 2 === 0 ? 3 : 1);
  }
  const check = (10 - (suma % 10)) % 10;
  return base + check;
}

// ==================== FUNCIONES DE GESTIÓN ====================

/**
 * Crear nueva promoción
 */
export async function crearPromocion(data: Partial<Promocion>): Promise<Promocion> {
  try {
    const promociones = await listarPromociones();
    
    const codigoBarras = data.codigoBarras || generarCodigoBarrasPromo();

    const nuevaPromocion: Promocion = {
      id: `PROMO-${Date.now()}`,
      nombre: data.nombre || '',
      descripcion: data.descripcion || '',
      tipo: data.tipo || 'porcentaje',
      codigoPromo: codigoBarras,
      codigoBarras,
      comboItems: data.comboItems || [],
      valorDescuento: data.valorDescuento,
      productoRegaloId: data.productoRegaloId,
      productoRegaloNombre: data.productoRegaloNombre,
      aplicaA: data.aplicaA || 'todos',
      categorias: data.categorias || [],
      productos: data.productos || [],
      clienteId: data.clienteId,
      montoMinimo: data.montoMinimo,
      cantidadMinima: data.cantidadMinima,
      diasSemana: data.diasSemana,
      horaInicio: data.horaInicio,
      horaFin: data.horaFin,
      fechaInicio: data.fechaInicio || new Date().toISOString(),
      fechaFin: data.fechaFin || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      activa: data.activa !== undefined ? data.activa : true,
      usosMaximos: data.usosMaximos,
      usosActuales: 0,
      descuentoMaximoPorVenta: data.descuentoMaximoPorVenta,
      prioridad: data.prioridad || 1,
      acumulable: data.acumulable || false,
      ventasGeneradas: 0,
      descuentoTotalOtorgado: 0,
      fechaCreacion: new Date().toISOString(),
      creadoPor: 'admin',
    };
    
    promociones.push(nuevaPromocion);
    localStorage.setItem(STORAGE_KEYS.PROMOCIONES, JSON.stringify(promociones));
    publicarPromocionesEnLaNube([nuevaPromocion]);

    return nuevaPromocion;
  } catch (error) {
    console.error('Error creando promoción:', error);
    throw error;
  }
}

/**
 * Crear nuevo combo
 */
export async function crearCombo(data: Partial<Combo>): Promise<Combo> {
  const combos = await listarCombos();
  
  const precioNormal = (data.productos || []).reduce(
    (sum, p) => sum + (p.precioIndividual * p.cantidad),
    0
  );
  const precioCombo = data.precioCombo || 0;
  const ahorro = precioNormal - precioCombo;
  const porcentajeDescuento = precioNormal > 0 ? (ahorro / precioNormal) * 100 : 0;
  
  const codigoBarrasCombo = data.codigoBarras || generarCodigoBarrasPromo();

  const nuevoCombo: Combo = {
    id: `COMBO-${Date.now()}`,
    nombre: data.nombre || '',
    descripcion: data.descripcion || '',
    imagen: data.imagen,
    codigoPromo: codigoBarrasCombo,
    codigoBarras: codigoBarrasCombo,
    productos: data.productos || [],
    precioNormal,
    precioCombo,
    ahorro,
    porcentajeDescuento,
    fechaInicio: data.fechaInicio || new Date().toISOString(),
    fechaFin: data.fechaFin || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    activo: data.activo !== undefined ? data.activo : true,
    vendidos: 0,
    ingresoGenerado: 0,
    fechaCreacion: new Date().toISOString(),
  };
  
  combos.push(nuevoCombo);
  localStorage.setItem(STORAGE_KEYS.COMBOS, JSON.stringify(combos));
  publicarCombosEnLaNube([nuevoCombo]);

  return nuevoCombo;
}

/**
 * Listar todas las promociones
 */
export async function listarPromociones(soloActivas = false): Promise<Promocion[]> {
  const data = localStorage.getItem(STORAGE_KEYS.PROMOCIONES);
  let promociones: Promocion[] = data ? JSON.parse(data) : [];
  
  if (soloActivas) {
    const ahora = new Date();
    promociones = promociones.filter(p => {
      if (!p.activa) return false;
      
      const inicio = new Date(p.fechaInicio);
      const fin = new Date(p.fechaFin);
      
      return ahora >= inicio && ahora <= fin;
    });
  }
  
  return promociones.sort((a, b) => b.prioridad - a.prioridad);
}

/**
 * Listar todos los combos
 */
export async function listarCombos(soloActivos = false): Promise<Combo[]> {
  const data = localStorage.getItem(STORAGE_KEYS.COMBOS);
  let combos: Combo[] = data ? JSON.parse(data) : [];
  
  if (soloActivos) {
    const ahora = new Date();
    combos = combos.filter(c => {
      if (!c.activo) return false;
      
      const inicio = new Date(c.fechaInicio);
      const fin = new Date(c.fechaFin);
      
      return ahora >= inicio && ahora <= fin;
    });
  }
  
  return combos;
}

/**
 * Obtener promoción por ID
 */
export async function obtenerPromocion(id: string): Promise<Promocion | null> {
  const promociones = await listarPromociones();
  return promociones.find(p => p.id === id) || null;
}

/**
 * Actualizar promoción
 */
export async function actualizarPromocion(id: string, cambios: Partial<Promocion>): Promise<Promocion> {
  const promociones = await listarPromociones();
  const index = promociones.findIndex(p => p.id === id);
  
  if (index === -1) {
    throw new Error('Promoción no encontrada');
  }
  
  promociones[index] = {
    ...promociones[index],
    ...cambios,
    ultimaModificacion: new Date().toISOString(),
  };
  
  localStorage.setItem(STORAGE_KEYS.PROMOCIONES, JSON.stringify(promociones));
  publicarPromocionesEnLaNube([promociones[index]]);

  return promociones[index];
}

/**
 * Eliminar promoción
 */
export async function eliminarPromocion(id: string): Promise<void> {
  const promociones = await listarPromociones();
  const filtradas = promociones.filter(p => p.id !== id);
  
  localStorage.setItem(STORAGE_KEYS.PROMOCIONES, JSON.stringify(filtradas));
}

/**
 * Activar/desactivar promoción
 */
export async function togglePromocion(id: string): Promise<Promocion> {
  const promocion = await obtenerPromocion(id);
  
  if (!promocion) {
    throw new Error('Promoción no encontrada');
  }
  
  return await actualizarPromocion(id, { activa: !promocion.activa });
}

/**
 * Duplicar promoción
 */
export async function duplicarPromocion(id: string): Promise<Promocion> {
  const promocion = await obtenerPromocion(id);
  
  if (!promocion) {
    throw new Error('Promoción no encontrada');
  }
  
  const { id: _, fechaCreacion, ultimaModificacion, usosActuales, ventasGeneradas, descuentoTotalOtorgado, ...datos } = promocion;
  
  return await crearPromocion({
    ...datos,
    nombre: `${datos.nombre} (Copia)`,
    activa: false,
  });
}

/**
 * Registrar aplicación de promoción
 */
export async function registrarAplicacion(aplicacion: AplicacionPromocion): Promise<void> {
  const data = localStorage.getItem(STORAGE_KEYS.APLICACIONES);
  const aplicaciones: AplicacionPromocion[] = data ? JSON.parse(data) : [];
  
  aplicaciones.push(aplicacion);
  localStorage.setItem(STORAGE_KEYS.APLICACIONES, JSON.stringify(aplicaciones));
  
  // Actualizar estadísticas de la promoción
  const promocion = await obtenerPromocion(aplicacion.promocionId);
  if (promocion) {
    await actualizarPromocion(aplicacion.promocionId, {
      usosActuales: promocion.usosActuales + 1,
      ventasGeneradas: promocion.ventasGeneradas + 1,
      descuentoTotalOtorgado: promocion.descuentoTotalOtorgado + aplicacion.descuentoAplicado,
    });
  }
}

/**
 * Obtener estadísticas de promociones
 */
export async function obtenerEstadisticas(): Promise<EstadisticasPromociones> {
  const promociones = await listarPromociones();
  const combos = await listarCombos();
  const data = localStorage.getItem(STORAGE_KEYS.APLICACIONES);
  const aplicaciones: AplicacionPromocion[] = data ? JSON.parse(data) : [];
  
  const ahora = new Date();
  const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const inicioSemana = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  const descuentosHoy = aplicaciones
    .filter(a => new Date(a.fecha) >= inicioHoy)
    .reduce((sum, a) => sum + a.descuentoAplicado, 0);
  
  const descuentosSemana = aplicaciones
    .filter(a => new Date(a.fecha) >= inicioSemana)
    .reduce((sum, a) => sum + a.descuentoAplicado, 0);
  
  const totalDescuentos = promociones.reduce((sum, p) => sum + p.descuentoTotalOtorgado, 0);
  
  // Promoción más usada
  const usosPorPromocion = new Map<string, { nombre: string; usos: number }>();
  aplicaciones.forEach(a => {
    const actual = usosPorPromocion.get(a.promocionId) || { nombre: a.promocionNombre, usos: 0 };
    actual.usos++;
    usosPorPromocion.set(a.promocionId, actual);
  });
  
  let promocionMasUsada = null;
  let maxUsos = 0;
  usosPorPromocion.forEach(datos => {
    if (datos.usos > maxUsos) {
      maxUsos = datos.usos;
      promocionMasUsada = datos;
    }
  });
  
  const ahorroPromedio = aplicaciones.length > 0
    ? aplicaciones.reduce((sum, a) => sum + a.descuentoAplicado, 0) / aplicaciones.length
    : 0;
  
  return {
    totalPromociones: promociones.length,
    promocionesActivas: promociones.filter(p => p.activa).length,
    combosActivos: combos.filter(c => c.activo).length,
    totalDescuentosOtorgados: totalDescuentos,
    descuentosHoy,
    descuentosSemana,
    promocionMasUsada,
    ahorroPromedioPorVenta: ahorroPromedio,
  };
}

/**
 * Limpiar promociones vencidas
 */
export async function limpiarPromocionesVencidas(): Promise<number> {
  const promociones = await listarPromociones();
  const ahora = new Date();
  
  const promocionesActivas = promociones.filter(p => {
    const fin = new Date(p.fechaFin);
    return fin >= ahora;
  });
  
  const eliminadas = promociones.length - promocionesActivas.length;
  
  localStorage.setItem(STORAGE_KEYS.PROMOCIONES, JSON.stringify(promocionesActivas));
  
  return eliminadas;
}

/**
 * Exportar promociones
 */
export async function exportarPromociones(): Promise<string> {
  const promociones = await listarPromociones();
  const combos = await listarCombos();
  
  return JSON.stringify({ promociones, combos }, null, 2);
}

/**
 * Importar promociones
 */
export async function importarPromociones(json: string): Promise<{ promociones: number; combos: number }> {
  try {
    const data = JSON.parse(json);

    if (data.promociones) {
      localStorage.setItem(STORAGE_KEYS.PROMOCIONES, JSON.stringify(data.promociones));
    }

    if (data.combos) {
      localStorage.setItem(STORAGE_KEYS.COMBOS, JSON.stringify(data.combos));
    }

    return {
      promociones: data.promociones?.length || 0,
      combos: data.combos?.length || 0,
    };
  } catch (error) {
    throw new Error('Formato de archivo inválido');
  }
}

/**
 * Buscar promoción o combo activo por su código de barras — para el escáner del POS
 */
export async function buscarPorCodigoBarras(
  codigo: string
): Promise<{ tipo: 'promocion' | 'combo'; data: Promocion | Combo } | null> {
  const promociones = await listarPromociones(true);
  const promo = promociones.find(
    p => p.codigoBarras === codigo || p.codigoPromo === codigo
  );
  if (promo) return { tipo: 'promocion', data: promo };

  const combos = await listarCombos(true);
  const combo = combos.find(
    c => c.codigoBarras === codigo || c.codigoPromo === codigo
  );
  if (combo) return { tipo: 'combo', data: combo };

  return null;
}