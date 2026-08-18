/**
 * CODEC POS v2.0 — Artes Gráficas
 *
 * A diferencia de Taller/Panadería (nacieron locales, necesitaron sincronía
 * con anti-eco), este módulo es nativo de la nube desde el día uno: Electron
 * y la PWA leen/escriben la MISMA fila en Supabase, sin copia local ni cola
 * offline — ver migración 0033 para el porqué. Esto significa que el módulo
 * requiere internet en Electron, a diferencia del resto del sistema.
 *
 * Cada función recibe `clienteId` explícito en vez de resolverlo internamente:
 * Electron lo obtiene de `getLinkedClienteId()` (localStorage, solo existe en
 * esta instalación) y la PWA de `empleado.cliente_id` (la sesión de Supabase
 * Auth) — son dos fuentes distintas y este archivo no debe asumir cuál está
 * disponible, para poder compartirse tal cual entre las dos plataformas.
 */
import { getSupabaseClient } from './config';

export type EscalaCantidad = 10 | 20 | 30 | 40 | 50 | 100 | 1000;
export const ESCALAS_CANTIDAD: EscalaCantidad[] = [10, 20, 30, 40, 50, 100, 1000];

export interface ArtesGraficasProducto {
  id: string;
  cliente_id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  foto_url: string | null;
  unidad: 'cm' | 'unidad';
  precio_marcado_10: number;
  precio_marcado_20: number;
  precio_marcado_30: number;
  precio_marcado_40: number;
  precio_marcado_50: number;
  precio_marcado_100: number;
  precio_marcado_1000: number;
  precio_sin_marcar_10: number;
  precio_sin_marcar_20: number;
  precio_sin_marcar_30: number;
  precio_sin_marcar_40: number;
  precio_sin_marcar_50: number;
  precio_sin_marcar_100: number;
  precio_sin_marcar_1000: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export type ArtesGraficasProductoInput = Omit<ArtesGraficasProducto, 'id' | 'cliente_id' | 'created_at' | 'updated_at'>;

export interface ItemOrdenArtesGraficas {
  producto_id: string;
  producto_nombre: string;
  marcado: boolean;
  cantidad: number;
  unidad: 'cm' | 'unidad';
  precio_unitario: number;
  subtotal: number;
}

export type TipoPagoArtesGraficas = 'abono' | 'no_abono' | 'retiro' | 'precio_personalizado';
export type EstadoOrdenArtesGraficas = 'pendiente' | 'abonado' | 'pagado' | 'retirado' | 'cancelado';

export interface OrdenArtesGraficas {
  id: string;
  cliente_id: string;
  numero_orden: string;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  items: ItemOrdenArtesGraficas[];
  subtotal: number;
  total: number;
  abono: number;
  saldo_pendiente: number;
  tipo_pago: TipoPagoArtesGraficas;
  estado: EstadoOrdenArtesGraficas;
  metodo_pago: string | null;
  link_pago_url: string | null;
  creado_por: string | null;
  fecha_creacion: string;
  fecha_retiro: string | null;
  updated_at: string;
}

/**
 * Escoge el precio por escala: cantidades intermedias pagan la tarifa del
 * tramo en el que caen (25 unidades → tarifa de 20, no de 10). Regla de
 * negocio razonable para precios por volumen — si el negocio maneja otra
 * lógica de tramos, este es el único lugar que hay que tocar.
 */
export function calcularPrecioUnitario(producto: ArtesGraficasProducto, cantidad: number, marcado: boolean): number {
  const prefijo = marcado ? 'precio_marcado_' : 'precio_sin_marcar_';
  let escala: EscalaCantidad = 10;
  for (const e of ESCALAS_CANTIDAD) {
    if (cantidad >= e) escala = e;
  }
  return Number(producto[`${prefijo}${escala}` as keyof ArtesGraficasProducto]) || 0;
}

// ── Productos ────────────────────────────────────────────────────────────────

export async function listarProductosArtesGraficas(clienteId: string, soloActivos = true): Promise<ArtesGraficasProducto[]> {
  const client = getSupabaseClient();
  if (!client || !clienteId) return [];
  let query = client.from('artes_graficas_productos').select('*').eq('cliente_id', clienteId).order('nombre');
  if (soloActivos) query = query.eq('activo', true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as ArtesGraficasProducto[]) || [];
}

export async function guardarProductoArtesGraficas(
  clienteId: string,
  input: ArtesGraficasProductoInput,
  id?: string
): Promise<ArtesGraficasProducto> {
  const client = getSupabaseClient()!;
  const payload = { ...input, cliente_id: clienteId, updated_at: new Date().toISOString() };
  const query = id
    ? client.from('artes_graficas_productos').update(payload).eq('id', id).select().single()
    : client.from('artes_graficas_productos').insert(payload).select().single();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as ArtesGraficasProducto;
}

export async function eliminarProductoArtesGraficas(id: string): Promise<void> {
  const client = getSupabaseClient()!;
  const { error } = await client.from('artes_graficas_productos').update({ activo: false }).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Encabezados de la plantilla — coinciden 1:1 con las columnas de la tabla,
 * así que `sheet_to_json` (que usa la fila de encabezado como llaves) se
 * puede volcar casi sin traducción. `xlsx` se importa dinámico: es una
 * dependencia pesada que solo debe pagar quien realmente descarga o sube
 * un archivo, no cualquiera que abra el catálogo.
 */
const CAMPOS_PRECIO_PLANTILLA = [
  'precio_marcado_10', 'precio_marcado_20', 'precio_marcado_30', 'precio_marcado_40',
  'precio_marcado_50', 'precio_marcado_100', 'precio_marcado_1000',
  'precio_sin_marcar_10', 'precio_sin_marcar_20', 'precio_sin_marcar_30', 'precio_sin_marcar_40',
  'precio_sin_marcar_50', 'precio_sin_marcar_100', 'precio_sin_marcar_1000',
] as const;

export async function descargarPlantillaExcelArtesGraficas(): Promise<void> {
  const XLSX = await import('xlsx');
  const filaEjemplo: Record<string, string | number> = {
    nombre: 'Tarjeta de presentación', descripcion: 'Opalina 300g, tiro', categoria: 'Papelería', unidad: 'unidad',
    precio_marcado_10: 3500, precio_marcado_20: 3200, precio_marcado_30: 3000, precio_marcado_40: 2800,
    precio_marcado_50: 2600, precio_marcado_100: 2200, precio_marcado_1000: 1500,
    precio_sin_marcar_10: 2500, precio_sin_marcar_20: 2300, precio_sin_marcar_30: 2100, precio_sin_marcar_40: 2000,
    precio_sin_marcar_50: 1900, precio_sin_marcar_100: 1600, precio_sin_marcar_1000: 1100,
  };
  const ws = XLSX.utils.json_to_sheet([filaEjemplo]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Artes Gráficas');
  XLSX.writeFile(wb, 'plantilla_artes_graficas.xlsx');
}

export interface ResultadoImportacionArtesGraficas {
  creados: number;
  actualizados: number;
  errores: string[];
}

/**
 * Sube el inventario completo desde un .xlsx: si ya existe un producto con
 * el mismo nombre (comparación sin distinguir mayúsculas) lo actualiza, si
 * no, lo crea. No hay código de barras en este catálogo — el nombre es la
 * única clave natural disponible, igual que ya hace la plantilla de
 * Panadería con sus ingredientes.
 */
export async function importarProductosDesdeExcelArtesGraficas(
  clienteId: string,
  file: File
): Promise<ResultadoImportacionArtesGraficas> {
  const XLSX = await import('xlsx');
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(ws) as Array<Record<string, unknown>>;

  const resultado: ResultadoImportacionArtesGraficas = { creados: 0, actualizados: 0, errores: [] };
  if (!Array.isArray(filas) || filas.length === 0) {
    resultado.errores.push('El archivo está vacío');
    return resultado;
  }

  const existentes = await listarProductosArtesGraficas(clienteId, false);
  const porNombre = new Map(existentes.map((p) => [p.nombre.trim().toLowerCase(), p]));

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const nombre = String(fila.nombre || '').trim();
    if (!nombre) { resultado.errores.push(`Fila ${i + 2}: sin nombre, se omitió`); continue; }

    const unidadCruda = String(fila.unidad || 'cm').trim().toLowerCase();
    const input: ArtesGraficasProductoInput = {
      nombre,
      descripcion: fila.descripcion ? String(fila.descripcion).trim() : null,
      categoria: fila.categoria ? String(fila.categoria).trim() : null,
      unidad: unidadCruda === 'unidad' ? 'unidad' : 'cm',
      activo: true,
      precio_marcado_10: 0, precio_marcado_20: 0, precio_marcado_30: 0, precio_marcado_40: 0,
      precio_marcado_50: 0, precio_marcado_100: 0, precio_marcado_1000: 0,
      precio_sin_marcar_10: 0, precio_sin_marcar_20: 0, precio_sin_marcar_30: 0, precio_sin_marcar_40: 0,
      precio_sin_marcar_50: 0, precio_sin_marcar_100: 0, precio_sin_marcar_1000: 0,
    };
    for (const campo of CAMPOS_PRECIO_PLANTILLA) {
      (input as unknown as Record<string, number>)[campo] = Number(fila[campo]) || 0;
    }

    try {
      const existente = porNombre.get(nombre.toLowerCase());
      await guardarProductoArtesGraficas(clienteId, input, existente?.id);
      if (existente) resultado.actualizados++; else resultado.creados++;
    } catch (e) {
      resultado.errores.push(`Fila ${i + 2} (${nombre}): ${e instanceof Error ? e.message : 'error desconocido'}`);
    }
  }

  return resultado;
}

export function suscribirProductosArtesGraficas(clienteId: string, onCambio: () => void): () => void {
  const client = getSupabaseClient();
  if (!client || !clienteId) return () => {};
  const canal = client
    .channel(`ag-productos-${clienteId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'artes_graficas_productos', filter: `cliente_id=eq.${clienteId}` }, onCambio)
    .subscribe();
  return () => { client.removeChannel(canal); };
}

// ── Órdenes (factura dinámica) ──────────────────────────────────────────────

export async function listarOrdenesArtesGraficas(clienteId: string): Promise<OrdenArtesGraficas[]> {
  const client = getSupabaseClient();
  if (!client || !clienteId) return [];
  const { data, error } = await client
    .from('artes_graficas_ordenes')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('fecha_creacion', { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  return (data as OrdenArtesGraficas[]) || [];
}

async function siguienteNumeroOrden(clienteId: string): Promise<string> {
  const client = getSupabaseClient()!;
  const { count } = await client
    .from('artes_graficas_ordenes')
    .select('id', { count: 'exact', head: true })
    .eq('cliente_id', clienteId);
  return `AG-${String((count || 0) + 1).padStart(5, '0')}`;
}

export interface NuevaOrdenArtesGraficasInput {
  clienteNombre: string;
  clienteTelefono?: string;
  items: ItemOrdenArtesGraficas[];
  tipoPago: TipoPagoArtesGraficas;
  totalPersonalizado?: number;
  abono?: number;
  metodoPago?: string;
  creadoPor: string;
}

export async function crearOrdenArtesGraficas(clienteId: string, input: NuevaOrdenArtesGraficasInput): Promise<OrdenArtesGraficas> {
  const client = getSupabaseClient()!;

  const subtotal = input.items.reduce((s, it) => s + it.subtotal, 0);
  const total = input.tipoPago === 'precio_personalizado' && input.totalPersonalizado !== undefined
    ? input.totalPersonalizado
    : subtotal;

  let abono = 0;
  let estado: EstadoOrdenArtesGraficas = 'pendiente';
  if (input.tipoPago === 'retiro') {
    abono = total;
    estado = 'pagado';
  } else if (input.tipoPago === 'abono') {
    abono = Math.min(input.abono || 0, total);
    estado = abono > 0 ? 'abonado' : 'pendiente';
  } else if (input.tipoPago === 'no_abono') {
    abono = 0;
    estado = 'pendiente';
  } else {
    // precio_personalizado: puede venir con o sin abono explícito
    abono = Math.min(input.abono || 0, total);
    estado = abono >= total && total > 0 ? 'pagado' : abono > 0 ? 'abonado' : 'pendiente';
  }

  const payload = {
    cliente_id: clienteId,
    numero_orden: await siguienteNumeroOrden(clienteId),
    cliente_nombre: input.clienteNombre.trim() || null,
    cliente_telefono: input.clienteTelefono?.trim() || null,
    items: input.items,
    subtotal,
    total,
    abono,
    saldo_pendiente: Math.max(0, total - abono),
    tipo_pago: input.tipoPago,
    estado,
    metodo_pago: input.metodoPago || null,
    creado_por: input.creadoPor,
  };

  const { data, error } = await client.from('artes_graficas_ordenes').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data as OrdenArtesGraficas;
}

/** Registra el pago del saldo restante — el cliente recoge el producto. */
export async function registrarPagoFinalOrdenArtesGraficas(
  orden: OrdenArtesGraficas,
  monto: number,
  metodoPago: string
): Promise<OrdenArtesGraficas> {
  const client = getSupabaseClient()!;
  const nuevoAbono = orden.abono + monto;
  const saldo = Math.max(0, orden.total - nuevoAbono);
  const payload = {
    abono: nuevoAbono,
    saldo_pendiente: saldo,
    estado: (saldo <= 0 ? 'retirado' : 'abonado') as EstadoOrdenArtesGraficas,
    metodo_pago: metodoPago,
    fecha_retiro: saldo <= 0 ? new Date().toISOString() : orden.fecha_retiro,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await client.from('artes_graficas_ordenes').update(payload).eq('id', orden.id).select().single();
  if (error) throw new Error(error.message);
  return data as OrdenArtesGraficas;
}

/** Marca la orden como entregada sin mover dinero (ya estaba pagada al 100%). */
export async function marcarRetiradaOrdenArtesGraficas(orden: OrdenArtesGraficas): Promise<OrdenArtesGraficas> {
  const client = getSupabaseClient()!;
  const { data, error } = await client
    .from('artes_graficas_ordenes')
    .update({ estado: 'retirado', fecha_retiro: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', orden.id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as OrdenArtesGraficas;
}

export async function cancelarOrdenArtesGraficas(orden: OrdenArtesGraficas): Promise<void> {
  const client = getSupabaseClient()!;
  const { error } = await client
    .from('artes_graficas_ordenes')
    .update({ estado: 'cancelado', updated_at: new Date().toISOString() })
    .eq('id', orden.id);
  if (error) throw new Error(error.message);
}

export function suscribirOrdenesArtesGraficas(clienteId: string, onCambio: () => void): () => void {
  const client = getSupabaseClient();
  if (!client || !clienteId) return () => {};
  const canal = client
    .channel(`ag-ordenes-${clienteId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'artes_graficas_ordenes', filter: `cliente_id=eq.${clienteId}` }, onCambio)
    .subscribe();
  return () => { client.removeChannel(canal); };
}
