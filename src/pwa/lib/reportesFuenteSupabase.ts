/**
 * Fuente de datos de Reportes para la web: lee Supabase y entrega las filas
 * con la forma que ya usa Electron, para que reportesService y los
 * exportadores PDF/Excel/tirilla (src/app/services) sirvan igual en las dos
 * plataformas — ver FuenteDatosReportes en reportesService.ts.
 *
 * Uso: `await fuente.preparar(inicio, fin)` y luego generar el reporte. Todo
 * menos las ventas se sirve desde memoria (el servicio lo pide síncrono).
 */
import { getSupabaseClient } from '../../app/lib/supabase/config';
import type { FuenteDatosReportes } from '../../app/services/reportesService';

type Cliente = NonNullable<ReturnType<typeof getSupabaseClient>>;

const PAGINA = 1000;

/** PostgREST corta en 1000 filas por petición: se pagina hasta agotar, o un
 * mes de ventas de un negocio movido saldría truncado sin ningún aviso. */
async function traerTodo<T>(armar: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await armar(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    const lote = (data as T[]) || [];
    filas.push(...lote);
    if (lote.length < PAGINA) return filas;
  }
}

/**
 * Instante → 'YYYY-MM-DDTHH:mm:ss' en hora LOCAL, sin zona. El servicio de
 * reportes agrupa por día con `fecha.split('T')[0]`; con la fecha UTC que
 * devuelve Supabase, toda venta hecha después de las 7 p.m. en Colombia
 * caería en el día siguiente.
 */
function aFechaLocal(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const inicioDelDia = (fecha: string) => new Date(`${fecha}T00:00:00`).toISOString();
const finDelDia = (fecha: string) => new Date(`${fecha}T23:59:59.999`).toISOString();
const enRango = (fechaLocal: string, inicio: string, fin: string) => {
  const dia = fechaLocal.split('T')[0];
  return dia >= inicio && dia <= fin;
};

export interface MetricasReportes {
  ventasHoy: number;
  gastosMes: number;
  alertasStock: number;
  ultimoCierre: string | null;
  totalCierresMes: number;
}

export class FuenteReportesSupabase implements FuenteDatosReportes {
  private productosCache: any[] | null = null;
  private categoriaPorProducto = new Map<string, string>();
  private gastosCache: any[] = [];
  private cierresCache: any[] = [];
  private devolucionesCache: any[] = [];

  constructor(private readonly clienteId: string) {}

  private get client(): Cliente {
    const client = getSupabaseClient();
    if (!client) throw new Error('nuestra base de datos no está configurada');
    return client;
  }

  /** Carga en memoria lo que el servicio pide de forma síncrona para ese rango. */
  async preparar(fechaInicio: string, fechaFin: string): Promise<void> {
    const desde = inicioDelDia(fechaInicio);
    const hasta = finDelDia(fechaFin);
    const c = this.client;

    const [, gastos, cierres, devoluciones] = await Promise.all([
      this.cargarProductos(),
      traerTodo<any>((a, b) => c.from('gastos')
        .select('id, fecha, descripcion, categoria, monto, medio_pago, registrado_por, registrado_por_nombre, notas')
        .eq('cliente_id', this.clienteId).gte('fecha', desde).lte('fecha', hasta)
        .order('fecha', { ascending: true }).range(a, b)),
      traerTodo<any>((a, b) => c.from('cierres_caja')
        .select('id, fecha_cierre, monto_apertura, monto_cierre, ventas_total, diferencia, detalle, empleado_id, cajero_nombre')
        .eq('cliente_id', this.clienteId).not('fecha_cierre', 'is', null).gte('fecha_cierre', desde).lte('fecha_cierre', hasta)
        .order('fecha_cierre', { ascending: true }).range(a, b)),
      traerTodo<any>((a, b) => c.from('devoluciones')
        .select('id, created_at, total_devolucion, metodo_pago, procesado_por_nombre, numero_factura')
        .eq('cliente_id', this.clienteId).eq('estado', 'completada').gte('created_at', desde).lte('created_at', hasta)
        .order('created_at', { ascending: true }).range(a, b)),
    ]);

    this.gastosCache = gastos.map((g) => ({
      id: g.id,
      fecha: aFechaLocal(g.fecha),
      monto: Number(g.monto) || 0,
      categoria: g.categoria || 'otros',
      descripcion: g.descripcion || '',
      metodoPago: g.medio_pago || 'efectivo',
      registradoPor: g.registrado_por_nombre || 'N/A',
      registradoPorId: g.registrado_por || undefined,
      notas: g.notas || undefined,
    }));

    this.cierresCache = cierres.map((ci) => {
      const d = (ci.detalle?.desglose || {}) as Record<string, number>;
      return {
        id: ci.id,
        fecha: aFechaLocal(ci.fecha_cierre),
        totalEfectivo: Number(d.efectivo) || 0,
        totalTarjeta: Number(d.tarjeta) || 0,
        totalTransferencia: Number(d.transferencia) || 0,
        totalNequi: Number(d.nequi) || 0,
        totalDaviplata: Number(d.daviplata) || 0,
        totalMixto: Number(d.mixto) || 0,
        totalVentas: Number(ci.ventas_total) || 0,
        diferencia: Number(ci.diferencia) || 0,
        cajero: ci.cajero_nombre || 'N/A',
        cajeroId: ci.empleado_id || undefined,
      };
    });

    this.devolucionesCache = devoluciones.map((d) => ({
      id: d.id,
      fecha: aFechaLocal(d.created_at),
      totalDevolucion: Number(d.total_devolucion) || 0,
      metodoPago: d.metodo_pago || undefined,
      procesadoPor: d.procesado_por_nombre || undefined,
      numeroFactura: d.numero_factura || undefined,
    }));
  }

  private async cargarProductos(forzar = false): Promise<any[]> {
    if (this.productosCache && !forzar) return this.productosCache;
    const c = this.client;
    const filas = await traerTodo<any>((a, b) => c.from('productos')
      .select('id, codigo_barras, nombre, categoria, precio_venta, costo, stock, stock_minimo, fecha_vencimiento')
      .eq('cliente_id', this.clienteId).eq('activo', true).order('nombre').range(a, b));

    this.categoriaPorProducto = new Map(filas.map((p) => [p.id, p.categoria || 'Sin categoría']));
    this.productosCache = filas.map((p) => ({
      id: p.id,
      codigo: p.codigo_barras || '',
      nombre: p.nombre,
      categoria: p.categoria || 'Sin categoría',
      precio: Number(p.precio_venta) || 0,
      stock: Number(p.stock) || 0,
      // Mismo umbral por defecto que usa Electron cuando el producto no define mínimo.
      minStock: p.stock_minimo != null ? Number(p.stock_minimo) : 5,
      costo: Number(p.costo) || 0,
      fechaVencimiento: p.fecha_vencimiento || undefined,
    }));
    return this.productosCache;
  }

  async ventas(fechaInicio: string, fechaFin: string): Promise<any[]> {
    const c = this.client;
    await this.cargarProductos();

    const ventas = await traerTodo<any>((a, b) => c.from('ventas')
      .select('id, numero, created_at, total, propina, metodo_pago, cajero_nombre, empleado_id')
      .eq('cliente_id', this.clienteId).eq('estado', 'completada')
      .gte('created_at', inicioDelDia(fechaInicio)).lte('created_at', finDelDia(fechaFin))
      .order('created_at', { ascending: true }).range(a, b));

    const itemsPorVenta = new Map<string, any[]>();
    const ids = ventas.map((v) => v.id);
    // De a 150 ids: la lista viaja en la URL y un `in` más largo la revienta.
    for (let i = 0; i < ids.length; i += 150) {
      const grupo = ids.slice(i, i + 150);
      const items = await traerTodo<any>((a, b) => c.from('venta_items')
        .select('venta_id, producto_id, nombre, cantidad, precio_unitario, subtotal')
        .in('venta_id', grupo).order('venta_id').range(a, b));
      for (const it of items) {
        const cantidad = Number(it.cantidad) || 0;
        const precio = Number(it.precio_unitario) || 0;
        const lista = itemsPorVenta.get(it.venta_id) || [];
        lista.push({
          id: it.producto_id || undefined,
          nombre: it.nombre || 'Producto',
          cantidad,
          precio,
          subtotal: Number(it.subtotal ?? cantidad * precio),
          categoria: this.categoriaPorProducto.get(it.producto_id) || 'Sin categoría',
        });
        itemsPorVenta.set(it.venta_id, lista);
      }
    }

    return ventas.map((v) => ({
      id: v.id,
      numeroFactura: v.numero ? String(v.numero) : String(v.id).slice(0, 8),
      fecha: aFechaLocal(v.created_at),
      total: Number(v.total) || 0,
      propina: Number(v.propina) || 0,
      items: itemsPorVenta.get(v.id) || [],
      metodoPago: v.metodo_pago || 'otro',
      cajero: v.cajero_nombre || 'N/A',
      cajeroId: v.empleado_id || undefined,
    }));
  }

  productos(): any[] { return this.productosCache || []; }
  // Recetas/ingredientes y mermas todavía no se sincronizan a la nube: solo existen en Electron.
  ingredientes(): any[] { return []; }
  mermas(): any[] { return []; }
  gastos(fechaInicio: string, fechaFin: string): any[] { return this.gastosCache.filter((g) => enRango(g.fecha, fechaInicio, fechaFin)); }
  cierres(fechaInicio: string, fechaFin: string): any[] { return this.cierresCache.filter((x) => enRango(x.fecha, fechaInicio, fechaFin)); }
  devoluciones(fechaInicio: string, fechaFin: string): any[] { return this.devolucionesCache.filter((d) => enRango(d.fecha, fechaInicio, fechaFin)); }

  /** Categorías reales del inventario, para el filtro del reporte de ventas. */
  async categorias(): Promise<Array<{ id: string; nombre: string; color: string }>> {
    const productos = await this.cargarProductos();
    const colores = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
    return [...new Set(productos.map((p) => p.categoria as string))].sort().map((nombre, i) => ({ id: nombre, nombre, color: colores[i % colores.length] }));
  }

  async cajeros(): Promise<Array<{ id: string; nombre: string }>> {
    const { data } = await this.client.from('empleados')
      .select('id, nombre_completo')
      .eq('cliente_id', this.clienteId).eq('activo', true).order('nombre_completo');
    return ((data as any[]) || []).map((e) => ({ id: e.id, nombre: e.nombre_completo || 'Sin nombre' }));
  }

  /** Los cuatro indicadores de la cabecera, con el mismo criterio que Electron. */
  async metricas(): Promise<MetricasReportes> {
    const c = this.client;
    const ahora = new Date();
    const hoy = aFechaLocal(ahora.toISOString()).split('T')[0];
    const inicioMes = `${hoy.slice(0, 8)}01`;

    const [productos, ventasHoy, gastosMes, cierresMes, ultimo] = await Promise.all([
      this.cargarProductos(true),
      traerTodo<any>((a, b) => c.from('ventas').select('total')
        .eq('cliente_id', this.clienteId).eq('estado', 'completada')
        .gte('created_at', inicioDelDia(hoy)).order('created_at').range(a, b)),
      traerTodo<any>((a, b) => c.from('gastos').select('monto')
        .eq('cliente_id', this.clienteId).gte('fecha', inicioDelDia(inicioMes)).order('fecha').range(a, b)),
      c.from('cierres_caja').select('id', { count: 'exact', head: true })
        .eq('cliente_id', this.clienteId).not('fecha_cierre', 'is', null).gte('fecha_cierre', inicioDelDia(inicioMes)),
      c.from('cierres_caja').select('fecha_cierre')
        .eq('cliente_id', this.clienteId).not('fecha_cierre', 'is', null)
        .order('fecha_cierre', { ascending: false }).limit(1).maybeSingle(),
    ]);

    return {
      ventasHoy: ventasHoy.reduce((s, v) => s + (Number(v.total) || 0), 0),
      gastosMes: gastosMes.reduce((s, g) => s + (Number(g.monto) || 0), 0),
      alertasStock: productos.filter((p) => p.stock <= p.minStock).length,
      ultimoCierre: (ultimo.data as { fecha_cierre: string } | null)?.fecha_cierre || null,
      totalCierresMes: cierresMes.count || 0,
    };
  }
}
