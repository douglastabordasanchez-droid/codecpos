/**
 * CODEC POS v2.0 — Servicio de Contabilidad
 * Capa de datos del módulo de Contabilidad: ingresos extra, categorías
 * dinámicas y acceso unificado a los gastos ya registrados en el sistema.
 *
 * Los GASTOS se leen/escriben en la MISMA clave de localStorage que usa
 * GastosPage.tsx ('pos-gastos') con la MISMA forma de dato — así el cierre
 * de caja, el Dashboard y Reportes (que ya leen esa clave) ven exactamente
 * los mismos gastos sin importar si se registraron desde Gastos o desde
 * Contabilidad. Los INGRESOS EXTRA son un concepto nuevo, en su propia
 * clave, ya que no existía antes en el sistema.
 */

import { onIngresoExtraRegistrado, onGastoRegistrado } from './integracionesService';
import { cajaDiariaService } from './cajaDiariaService';

/** ☁️ Espeja el ingreso extra en la nube para que la PWA lo pueda ver — best-effort. */
function publicarIngresoEnLaNube(ingreso: IngresoExtra): void {
  import('./supabase/fidelizacionContabilidadSyncService')
    .then(({ publicarIngresosExtra }) => publicarIngresosExtra([ingreso]))
    .catch(() => {});
}

// ── Log de auditoría (protección contra fraude en ediciones/eliminaciones) ──
// Se escribe en el archivo físico C:/CodecStudio/CODECPOS/logs/ a través del
// canal IPC que ya existe (`electron/fileLogger.js`, expuesto en preload como
// `window.electron.logs.write`) — no es un registro que el propio usuario
// pueda borrar o editar desde la app, por diseño.
function registrarAuditoria(mensaje: string, meta?: Record<string, unknown>): void {
  try {
    const electron = (window as any).electron;
    electron?.logs?.write?.('WARN', mensaje, meta).catch(() => {});
  } catch { /* si no hay canal IPC disponible (fuera de Electron), no bloquea la acción */ }
}

const fmtAuditoria = (v: number) => `$${Math.round(Number(v) || 0).toLocaleString('es-CO')}`;

// ── Tipos ────────────────────────────────────────────────────────────────────

export type TipoMovimiento = 'ingreso' | 'gasto';
export type MedioPagoContable = 'efectivo' | 'nequi' | 'daviplata' | 'transferencia' | 'tarjeta' | 'tarjeta_banco';
// Caja Menor = efectivo/fondos del turno de caja del cajero (afecta el arqueo
// físico del cierre de caja). Caja Mayor = dinero externo (banco, cuentas del
// dueño) que NO debe descontarse del conteo físico del cajero.
export type OrigenFondos = 'caja_menor' | 'caja_mayor';

export interface CategoriaContable {
  id: string;
  nombre: string;
  tipo: TipoMovimiento | 'ambos';
  color: string;
  predeterminada?: boolean; // categorías base — no se pueden eliminar, solo ocultar
}

export interface IngresoExtra {
  id: string;
  fecha: string; // ISO
  concepto: string;
  categoria: string; // id de CategoriaContable
  monto: number;
  metodoPago: MedioPagoContable;
  origenFondos: OrigenFondos;
  registradoPor: string;
  registradoPorId?: string;
  comprobante?: string;
  notas?: string;
}

// Misma forma que `Gasto` en GastosPage.tsx — se mantiene compatible a propósito.
export interface GastoContable {
  id: string;
  fecha: string;
  descripcion: string;
  concepto: string;
  categoria: string;
  categoriaConcepto?: string;
  monto: number;
  metodoPago: string;
  medio_pago?: string;
  medioPagoEgreso?: MedioPagoContable;
  // Ausente en gastos creados antes de esta función o desde GastosPage.tsx —
  // siempre se debe tratar como 'caja_menor' por defecto (comportamiento
  // histórico: todo gasto restaba del arqueo del cajero).
  origenFondos?: OrigenFondos;
  comprobante?: string;
  registradoPor: string;
  registradoPorId?: string;
  sesionCajaId?: string;
  notas?: string;
}

// Vista unificada para la tabla de movimientos del módulo.
export interface MovimientoContable {
  id: string;
  tipo: TipoMovimiento;
  fecha: string;
  concepto: string;
  descripcion?: string;
  categoria: string;
  monto: number; // siempre positivo; el signo lo decide `tipo` al mostrar
  metodoPago: string;
  origenFondos: OrigenFondos;
  registradoPor: string;
  registradoPorId?: string;
  notas?: string;
  origen: IngresoExtra | GastoContable;
}

export interface FiltroMovimientos {
  desde?: string; // YYYY-MM-DD
  hasta?: string; // YYYY-MM-DD
  tipo?: TipoMovimiento | 'todos';
  categoria?: string;
  metodoPago?: string;
  usuario?: string;
  texto?: string;
  origenFondos?: OrigenFondos | 'todos';
}

const LS_INGRESOS = 'codecpos_ingresos_extra';
const LS_CATEGORIAS = 'codecpos_categorias_contables';
const LS_GASTOS = 'pos-gastos';

const getFechaLocalISO = (date: Date = new Date()) => {
  const tzOffsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffsetMs).toISOString().split('T')[0];
};

// ── Categorías dinámicas ───────────────────────────────────────────────────

const CATEGORIAS_INGRESO_DEFAULT: CategoriaContable[] = [
  { id: 'venta_activo', nombre: 'Venta de Activos', tipo: 'ingreso', color: '#10b981', predeterminada: true },
  { id: 'prestamo_recibido', nombre: 'Préstamo Recibido', tipo: 'ingreso', color: '#3b82f6', predeterminada: true },
  { id: 'aporte_socio', nombre: 'Aporte de Socio/Capital', tipo: 'ingreso', color: '#8b5cf6', predeterminada: true },
  { id: 'ingreso_otro', nombre: 'Otro Ingreso', tipo: 'ingreso', color: '#14b8a6', predeterminada: true },
];

// Reflejan (en id y nombre) las categorías fijas de GastosPage.tsx para que
// un gasto creado en Gastos y visto desde Contabilidad muestre el mismo
// nombre — no se pueden borrar porque GastosPage sigue dependiendo de ellas.
const CATEGORIAS_GASTO_BASE: CategoriaContable[] = [
  { id: 'servicios_publicos', nombre: 'Servicios Públicos (Agua, Luz, Internet)', tipo: 'gasto', color: '#3b82f6', predeterminada: true },
  { id: 'arriendo', nombre: 'Arriendo / Alquiler de Local', tipo: 'gasto', color: '#8b5cf6', predeterminada: true },
  { id: 'aseo_limpieza', nombre: 'Aseo y Limpieza', tipo: 'gasto', color: '#06b6d4', predeterminada: true },
  { id: 'implementos', nombre: 'Implementos de Aseo y Cafetería', tipo: 'gasto', color: '#f59e0b', predeterminada: true },
  { id: 'comida_alimentacion', nombre: 'Alimentación', tipo: 'gasto', color: '#10b981', predeterminada: true },
  { id: 'inventario', nombre: 'Pago a Proveedores / Mercancía', tipo: 'gasto', color: '#22c55e', predeterminada: true },
  { id: 'nomina', nombre: 'Nómina / Pago a Empleados', tipo: 'gasto', color: '#a855f7', predeterminada: true },
  { id: 'transporte', nombre: 'Transporte', tipo: 'gasto', color: '#14b8a6', predeterminada: true },
  { id: 'internet_telefono', nombre: 'Internet/Teléfono', tipo: 'gasto', color: '#6366f1', predeterminada: true },
  { id: 'seguridad', nombre: 'Seguridad', tipo: 'gasto', color: '#dc2626', predeterminada: true },
  { id: 'mantenimiento', nombre: 'Mantenimiento / Reparaciones', tipo: 'gasto', color: '#ea580c', predeterminada: true },
  { id: 'impuestos', nombre: 'Impuestos', tipo: 'gasto', color: '#ef4444', predeterminada: true },
  { id: 'marketing', nombre: 'Marketing', tipo: 'gasto', color: '#ec4899', predeterminada: true },
  { id: 'papeleria', nombre: 'Papelería y Utensilios de Oficina', tipo: 'gasto', color: '#64748b', predeterminada: true },
  { id: 'otros', nombre: 'Otro (Especificar)', tipo: 'gasto', color: '#78716c', predeterminada: true },
];

function leerCategoriasPersonalizadas(): CategoriaContable[] {
  try {
    const raw = localStorage.getItem(LS_CATEGORIAS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function guardarCategoriasPersonalizadas(categorias: CategoriaContable[]) {
  try {
    localStorage.setItem(LS_CATEGORIAS, JSON.stringify(categorias));
    window.dispatchEvent(new CustomEvent('codecpos:categorias-contables-cambio'));
  } catch { /* storage lleno o no disponible */ }
}

export function obtenerCategorias(): CategoriaContable[] {
  return [...CATEGORIAS_INGRESO_DEFAULT, ...CATEGORIAS_GASTO_BASE, ...leerCategoriasPersonalizadas()];
}

export function obtenerCategoriasPorTipo(tipo: TipoMovimiento): CategoriaContable[] {
  return obtenerCategorias().filter((c) => c.tipo === tipo || c.tipo === 'ambos');
}

export function crearCategoria(nombre: string, tipo: TipoMovimiento | 'ambos', color: string): CategoriaContable {
  const nueva: CategoriaContable = {
    id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    nombre: nombre.trim(),
    tipo,
    color,
  };
  const actuales = leerCategoriasPersonalizadas();
  guardarCategoriasPersonalizadas([...actuales, nueva]);
  return nueva;
}

export function actualizarCategoria(id: string, cambios: Partial<Pick<CategoriaContable, 'nombre' | 'color' | 'tipo'>>): void {
  const actuales = leerCategoriasPersonalizadas();
  const idx = actuales.findIndex((c) => c.id === id);
  if (idx === -1) return; // las predeterminadas no son editables
  actuales[idx] = { ...actuales[idx], ...cambios };
  guardarCategoriasPersonalizadas(actuales);
}

export function eliminarCategoria(id: string): boolean {
  const actuales = leerCategoriasPersonalizadas();
  const filtradas = actuales.filter((c) => c.id !== id);
  if (filtradas.length === actuales.length) return false; // no existe o es predeterminada
  guardarCategoriasPersonalizadas(filtradas);
  return true;
}

export function nombreCategoria(id: string): string {
  return obtenerCategorias().find((c) => c.id === id)?.nombre || id;
}

export function colorCategoria(id: string): string {
  return obtenerCategorias().find((c) => c.id === id)?.color || '#94a3b8';
}

// ── Ingresos extra ───────────────────────────────────────────────────────────

function leerIngresos(): IngresoExtra[] {
  try {
    const raw = localStorage.getItem(LS_INGRESOS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function guardarIngresos(ingresos: IngresoExtra[]) {
  try {
    localStorage.setItem(LS_INGRESOS, JSON.stringify(ingresos));
  } catch { /* storage lleno */ }
}

export function obtenerIngresosExtra(): IngresoExtra[] {
  return leerIngresos();
}

export function guardarIngresoExtra(datos: Omit<IngresoExtra, 'id' | 'fecha'> & { fecha?: string; id?: string }): IngresoExtra {
  const ingresos = leerIngresos();
  const anterior = datos.id ? ingresos.find((i) => i.id === datos.id) : undefined;
  const ingreso: IngresoExtra = {
    id: datos.id || `ING-${Date.now()}`,
    fecha: datos.fecha || new Date().toISOString(),
    concepto: datos.concepto,
    categoria: datos.categoria,
    monto: datos.monto,
    metodoPago: datos.metodoPago,
    origenFondos: datos.origenFondos || 'caja_menor',
    registradoPor: datos.registradoPor,
    registradoPorId: datos.registradoPorId,
    comprobante: datos.comprobante,
    notas: datos.notas,
  };

  const idx = ingresos.findIndex((i) => i.id === ingreso.id);
  if (idx >= 0) ingresos[idx] = ingreso;
  else ingresos.unshift(ingreso);

  guardarIngresos(ingresos);
  publicarIngresoEnLaNube(ingreso);

  if (anterior && anterior.monto !== ingreso.monto) {
    registrarAuditoria(
      `EL USUARIO ${ingreso.registradoPor} MODIFICÓ EL INGRESO ID ${ingreso.id}. VALOR ANTERIOR: ${fmtAuditoria(anterior.monto)}, VALOR NUEVO: ${fmtAuditoria(ingreso.monto)}`,
      { tipo: 'ingreso', id: ingreso.id, usuario: ingreso.registradoPor, valorAnterior: anterior.monto, valorNuevo: ingreso.monto }
    );
  } else if (anterior) {
    registrarAuditoria(
      `EL USUARIO ${ingreso.registradoPor} MODIFICÓ EL INGRESO ID ${ingreso.id} (sin cambio de monto: ${fmtAuditoria(ingreso.monto)})`,
      { tipo: 'ingreso', id: ingreso.id, usuario: ingreso.registradoPor }
    );
  }

  onIngresoExtraRegistrado({
    monto: ingreso.monto,
    categoria: ingreso.categoria,
    concepto: ingreso.concepto,
    metodoPago: ingreso.metodoPago,
    registradoPor: ingreso.registradoPor,
    timestamp: ingreso.fecha,
  }).catch(() => {});

  return ingreso;
}

export function eliminarIngresoExtra(id: string, usuario: string): void {
  const ingresos = leerIngresos();
  const eliminado = ingresos.find((i) => i.id === id);
  guardarIngresos(ingresos.filter((i) => i.id !== id));

  if (eliminado) {
    registrarAuditoria(
      `EL USUARIO ${usuario} ELIMINÓ EL INGRESO ID ${id}. VALOR: ${fmtAuditoria(eliminado.monto)}, CONCEPTO: ${eliminado.concepto}`,
      { tipo: 'ingreso', id, usuario, valorEliminado: eliminado.monto, concepto: eliminado.concepto }
    );
  }
}

// ── Gastos (misma fuente que GastosPage.tsx) ─────────────────────────────────

function leerGastos(): GastoContable[] {
  try {
    const raw = localStorage.getItem(LS_GASTOS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function guardarGastosStorage(gastos: GastoContable[]) {
  try {
    localStorage.setItem(LS_GASTOS, JSON.stringify(gastos));
  } catch { /* storage lleno */ }
}

export function obtenerGastos(): GastoContable[] {
  return leerGastos();
}

const normalizarMedioPagoEgreso = (metodoPago: string): MedioPagoContable => {
  const metodo = String(metodoPago || '').toLowerCase();
  if (metodo === 'efectivo') return 'efectivo';
  if (metodo === 'nequi') return 'nequi';
  if (metodo === 'daviplata') return 'daviplata';
  if (metodo === 'tarjeta' || metodo === 'cheque' || metodo === 'tarjeta_banco') return 'tarjeta';
  return 'transferencia';
};

/**
 * Crea un gasto. Si es de Caja Menor exige sesión de caja activa — misma
 * regla de negocio que GastosPage.tsx (debe quedar ligado a un turno para
 * que el cierre de caja lo pueda descontar correctamente). Un gasto de Caja
 * Mayor no toca el turno del cajero, así que no requiere sesión abierta.
 */
export function crearGasto(
  datos: { descripcion: string; concepto: string; categoria: string; monto: number; metodoPago: string; notas?: string; origenFondos?: OrigenFondos },
  usuario: { id?: string; nombre: string }
): { ok: true; gasto: GastoContable } | { ok: false; error: string } {
  const origenFondos = datos.origenFondos || 'caja_menor';
  const sesionActiva = cajaDiariaService.getSesionActiva(usuario.id, getFechaLocalISO());
  if (origenFondos === 'caja_menor' && !sesionActiva) {
    return { ok: false, error: 'No hay sesión de caja abierta para registrar el egreso' };
  }

  const medioPago = normalizarMedioPagoEgreso(datos.metodoPago);
  const gasto: GastoContable = {
    id: `GASTO-${Date.now()}`,
    fecha: new Date().toISOString(),
    descripcion: datos.descripcion,
    concepto: datos.concepto,
    categoria: datos.categoria,
    categoriaConcepto: nombreCategoria(datos.categoria),
    monto: datos.monto,
    metodoPago: medioPago,
    medio_pago: String(datos.metodoPago).toUpperCase(),
    medioPagoEgreso: medioPago,
    origenFondos,
    registradoPor: usuario.nombre,
    registradoPorId: usuario.id,
    sesionCajaId: origenFondos === 'caja_menor' ? sesionActiva?.id : undefined,
    notas: datos.notas,
  };

  guardarGastosStorage([gasto, ...leerGastos()]);

  onGastoRegistrado({
    monto: gasto.monto,
    categoria: gasto.categoria,
    categoriaConcepto: gasto.categoriaConcepto,
    descripcion: gasto.descripcion,
    metodoPago: gasto.metodoPago,
    medioPagoEgreso: gasto.medioPagoEgreso,
    origenFondos: gasto.origenFondos,
    sesionCajaId: gasto.sesionCajaId,
    registradoPor: gasto.registradoPor,
    timestamp: gasto.fecha,
  }).catch(() => {});

  return { ok: true, gasto };
}

export function actualizarGasto(
  id: string,
  cambios: Partial<Pick<GastoContable, 'descripcion' | 'concepto' | 'categoria' | 'monto' | 'metodoPago' | 'notas' | 'origenFondos'>>,
  usuario: string
): void {
  const gastos = leerGastos();
  const idx = gastos.findIndex((g) => g.id === id);
  if (idx === -1) return;

  const actual = gastos[idx];

  if (typeof cambios.monto === 'number' && cambios.monto !== actual.monto) {
    registrarAuditoria(
      `EL USUARIO ${usuario} MODIFICÓ EL GASTO ID ${id}. VALOR ANTERIOR: ${fmtAuditoria(actual.monto)}, VALOR NUEVO: ${fmtAuditoria(cambios.monto)}`,
      { tipo: 'gasto', id, usuario, valorAnterior: actual.monto, valorNuevo: cambios.monto }
    );
  } else {
    registrarAuditoria(
      `EL USUARIO ${usuario} MODIFICÓ EL GASTO ID ${id} (sin cambio de monto: ${fmtAuditoria(actual.monto)})`,
      { tipo: 'gasto', id, usuario }
    );
  }
  const medioPago = cambios.metodoPago ? normalizarMedioPagoEgreso(cambios.metodoPago) : actual.medioPagoEgreso;
  gastos[idx] = {
    ...actual,
    ...cambios,
    categoriaConcepto: cambios.categoria ? nombreCategoria(cambios.categoria) : actual.categoriaConcepto,
    metodoPago: medioPago || actual.metodoPago,
    medio_pago: cambios.metodoPago ? String(cambios.metodoPago).toUpperCase() : actual.medio_pago,
    medioPagoEgreso: medioPago,
  };
  guardarGastosStorage(gastos);
}

export function eliminarGasto(id: string, usuario: string): void {
  const gastos = leerGastos();
  const eliminado = gastos.find((g) => g.id === id);
  guardarGastosStorage(gastos.filter((g) => g.id !== id));

  if (eliminado) {
    registrarAuditoria(
      `EL USUARIO ${usuario} ELIMINÓ EL GASTO ID ${id}. VALOR: ${fmtAuditoria(eliminado.monto)}, CONCEPTO: ${eliminado.concepto || eliminado.descripcion}`,
      { tipo: 'gasto', id, usuario, valorEliminado: eliminado.monto, concepto: eliminado.concepto || eliminado.descripcion }
    );
  }
}

// ── Vista unificada de movimientos ───────────────────────────────────────────

function ingresoToMovimiento(i: IngresoExtra): MovimientoContable {
  return {
    id: i.id,
    tipo: 'ingreso',
    fecha: i.fecha,
    concepto: i.concepto,
    categoria: i.categoria,
    monto: i.monto,
    metodoPago: i.metodoPago,
    origenFondos: i.origenFondos || 'caja_menor',
    registradoPor: i.registradoPor,
    registradoPorId: i.registradoPorId,
    notas: i.notas,
    origen: i,
  };
}

function gastoToMovimiento(g: GastoContable): MovimientoContable {
  return {
    id: g.id,
    tipo: 'gasto',
    fecha: g.fecha,
    concepto: g.concepto || g.categoriaConcepto || g.descripcion,
    descripcion: g.descripcion,
    categoria: g.categoria,
    monto: g.monto,
    metodoPago: g.medioPagoEgreso || g.metodoPago,
    origenFondos: g.origenFondos || 'caja_menor',
    registradoPor: g.registradoPor,
    registradoPorId: g.registradoPorId,
    notas: g.notas,
    origen: g,
  };
}

export function obtenerMovimientos(filtro: FiltroMovimientos = {}): MovimientoContable[] {
  let movimientos: MovimientoContable[] = [
    ...leerIngresos().map(ingresoToMovimiento),
    ...leerGastos().map(gastoToMovimiento),
  ];

  if (filtro.desde) {
    movimientos = movimientos.filter((m) => m.fecha.split('T')[0] >= filtro.desde!);
  }
  if (filtro.hasta) {
    movimientos = movimientos.filter((m) => m.fecha.split('T')[0] <= filtro.hasta!);
  }
  if (filtro.tipo && filtro.tipo !== 'todos') {
    movimientos = movimientos.filter((m) => m.tipo === filtro.tipo);
  }
  if (filtro.categoria) {
    movimientos = movimientos.filter((m) => m.categoria === filtro.categoria);
  }
  if (filtro.metodoPago) {
    movimientos = movimientos.filter((m) => String(m.metodoPago).toLowerCase() === filtro.metodoPago!.toLowerCase());
  }
  if (filtro.origenFondos && filtro.origenFondos !== 'todos') {
    movimientos = movimientos.filter((m) => m.origenFondos === filtro.origenFondos);
  }
  if (filtro.usuario) {
    movimientos = movimientos.filter((m) => m.registradoPor === filtro.usuario);
  }
  if (filtro.texto) {
    const q = filtro.texto.trim().toLowerCase();
    movimientos = movimientos.filter((m) =>
      m.concepto.toLowerCase().includes(q) ||
      (m.descripcion || '').toLowerCase().includes(q) ||
      m.registradoPor.toLowerCase().includes(q) ||
      nombreCategoria(m.categoria).toLowerCase().includes(q)
    );
  }

  return movimientos.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
}

export function usuariosDistintos(movimientos: MovimientoContable[]): string[] {
  return Array.from(new Set(movimientos.map((m) => m.registradoPor).filter(Boolean))).sort();
}

// ── Presupuestos por categoría (control de gasto mensual) ────────────────────

export interface PresupuestoCategoria {
  categoriaId: string;
  limiteMensual: number;
}

export interface ProgresoPresupuesto {
  categoriaId: string;
  categoriaNombre: string;
  color: string;
  limiteMensual: number;
  gastadoMes: number;
  porcentaje: number; // 0-100+
  estado: 'ok' | 'alerta' | 'excedido';
}

const LS_PRESUPUESTOS = 'codecpos_presupuestos_categorias';

function leerPresupuestos(): PresupuestoCategoria[] {
  try {
    const raw = localStorage.getItem(LS_PRESUPUESTOS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function guardarPresupuestosStorage(presupuestos: PresupuestoCategoria[]) {
  try {
    localStorage.setItem(LS_PRESUPUESTOS, JSON.stringify(presupuestos));
    window.dispatchEvent(new CustomEvent('codecpos:presupuestos-cambio'));
  } catch { /* storage lleno */ }
}

export function obtenerPresupuestos(): PresupuestoCategoria[] {
  return leerPresupuestos();
}

export function guardarPresupuesto(categoriaId: string, limiteMensual: number): void {
  const actuales = leerPresupuestos();
  const idx = actuales.findIndex((p) => p.categoriaId === categoriaId);
  if (limiteMensual <= 0) {
    // 0 o negativo = quitar el límite de esa categoría
    guardarPresupuestosStorage(actuales.filter((p) => p.categoriaId !== categoriaId));
    return;
  }
  if (idx >= 0) actuales[idx] = { categoriaId, limiteMensual };
  else actuales.push({ categoriaId, limiteMensual });
  guardarPresupuestosStorage(actuales);
}

/**
 * Calcula, para cada categoría con presupuesto definido, cuánto se ha
 * gastado en el MES CALENDARIO ACTUAL (independiente del período que el
 * administrador tenga seleccionado en la pantalla) — el presupuesto siempre
 * se mide mes a mes, como un límite real de gasto mensual.
 */
export function calcularProgresoPresupuestos(): ProgresoPresupuesto[] {
  const presupuestos = leerPresupuestos();
  if (presupuestos.length === 0) return [];

  const hoy = new Date();
  const inicioMes = getFechaLocalISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const finMes = getFechaLocalISO(hoy);

  const gastosMes = leerGastos().filter((g) => {
    const fecha = g.fecha.split('T')[0];
    return fecha >= inicioMes && fecha <= finMes;
  });

  return presupuestos.map((p) => {
    const gastadoMes = gastosMes
      .filter((g) => g.categoria === p.categoriaId)
      .reduce((s, g) => s + (Number(g.monto) || 0), 0);
    const porcentaje = p.limiteMensual > 0 ? (gastadoMes / p.limiteMensual) * 100 : 0;
    const estado: ProgresoPresupuesto['estado'] = porcentaje >= 100 ? 'excedido' : porcentaje >= 80 ? 'alerta' : 'ok';

    return {
      categoriaId: p.categoriaId,
      categoriaNombre: nombreCategoria(p.categoriaId),
      color: colorCategoria(p.categoriaId),
      limiteMensual: p.limiteMensual,
      gastadoMes,
      porcentaje,
      estado,
    };
  }).sort((a, b) => b.porcentaje - a.porcentaje);
}

// ── Gastos recurrentes (arriendo, nómina, servicios...) con recordatorio ────
// El dueño del negocio suele olvidar registrar los gastos fijos de cada mes.
// Este catálogo describe QUÉ se paga y QUÉ DÍA vence; el recordatorio se
// calcula comparando contra los gastos YA registrados este mes calendario
// (por categoría — no exige texto idéntico, para tolerar variaciones menores
// en el concepto que el usuario escriba cada vez).

export interface GastoRecurrente {
  id: string;
  concepto: string;
  categoria: string;
  monto: number;
  diaDelMes: number; // 1-28, día en que normalmente vence/se paga
  origenFondos: OrigenFondos;
  activo: boolean;
}

export interface RecordatorioGastoRecurrente extends GastoRecurrente {
  yaRegistradoEsteMes: boolean;
  vencido: boolean; // hoy ya pasó (o llegó a) el día de vencimiento y no se ha registrado
}

const LS_GASTOS_RECURRENTES = 'codecpos_gastos_recurrentes';

function leerGastosRecurrentes(): GastoRecurrente[] {
  try {
    const raw = localStorage.getItem(LS_GASTOS_RECURRENTES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function guardarGastosRecurrentesStorage(lista: GastoRecurrente[]) {
  try {
    localStorage.setItem(LS_GASTOS_RECURRENTES, JSON.stringify(lista));
    window.dispatchEvent(new CustomEvent('codecpos:gastos-recurrentes-cambio'));
  } catch { /* storage lleno */ }
}

export function obtenerGastosRecurrentes(): GastoRecurrente[] {
  return leerGastosRecurrentes();
}

export function guardarGastoRecurrente(datos: Omit<GastoRecurrente, 'id'> & { id?: string }): void {
  const actuales = leerGastosRecurrentes();
  if (datos.id) {
    const idx = actuales.findIndex((g) => g.id === datos.id);
    if (idx >= 0) { actuales[idx] = { ...actuales[idx], ...datos, id: datos.id }; guardarGastosRecurrentesStorage(actuales); return; }
  }
  actuales.push({ ...datos, id: `gr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` });
  guardarGastosRecurrentesStorage(actuales);
}

export function eliminarGastoRecurrente(id: string): void {
  guardarGastosRecurrentesStorage(leerGastosRecurrentes().filter((g) => g.id !== id));
}

/**
 * Devuelve los gastos recurrentes cuyo día de vencimiento ya llegó este mes
 * calendario y que todavía no tienen un gasto registrado en esa misma
 * categoría dentro del mes — es decir, lo que el dueño se está olvidando
 * pagar/registrar.
 */
export function calcularRecordatoriosPendientes(): RecordatorioGastoRecurrente[] {
  const recurrentes = leerGastosRecurrentes().filter((g) => g.activo);
  if (recurrentes.length === 0) return [];

  const hoy = new Date();
  const diaHoy = hoy.getDate();
  const inicioMes = getFechaLocalISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const finMes = getFechaLocalISO(hoy);

  const gastosMes = leerGastos().filter((g) => {
    const fecha = g.fecha.split('T')[0];
    return fecha >= inicioMes && fecha <= finMes;
  });

  return recurrentes
    .map((g) => {
      const yaRegistradoEsteMes = gastosMes.some((gm) => gm.categoria === g.categoria && Math.abs((Number(gm.monto) || 0) - g.monto) < Math.max(g.monto * 0.15, 1));
      return {
        ...g,
        yaRegistradoEsteMes,
        vencido: !yaRegistradoEsteMes && diaHoy >= g.diaDelMes,
      };
    })
    .filter((r) => r.vencido)
    .sort((a, b) => a.diaDelMes - b.diaDelMes);
}
