/**
 * Datos del módulo Veterinaria y Mascotas en la web y el celular: productos
 * (bultos a granel, medicamentos) y categorías de granel, en Supabase.
 * La ficha clínica y la agenda usan los mismos servicios que Electron
 * (mascotasService.ts y citasGroomingService.ts) pasándoles el negocio.
 *
 * Un bulto a granel es un producto con tipo_producto = 'granel': su precio de
 * venta es el precio por kilo y su stock son kilos, igual que en Electron
 * (VeterinariaPage.tsx), así Electron lo vende por peso cuando lo baja.
 */
import { getSupabaseClient } from '../../app/lib/supabase/config';

export interface ProductoVetWeb {
  id: string;
  nombre: string;
  categoria: string | null;
  precio_venta: number;
  costo: number;
  stock: number;
  tipo_producto: string | null;
  especie: string | null;
  requiere_receta: boolean | null;
  lote: string | null;
  fecha_vencimiento: string | null;
  peso_bulto_kg: number | null;
  precio_por_kilo: number | null;
  rendimiento_raciones: number | null;
}

export interface CategoriaGranelWeb {
  id: string;
  nombre: string;
  icono: string;
  color: string;
  /** false = existe en productos (creada en Electron) pero no tiene fila propia todavía. */
  guardada: boolean;
}

/** Las mismas que Electron pone por defecto. */
export const CATEGORIAS_GRANEL_INICIALES = [
  { nombre: 'Concentrado Perros', icono: 'perro', color: '#10b981' },
  { nombre: 'Concentrado Gatos', icono: 'gato', color: '#0ea5e9' },
  { nombre: 'Otros Animales', icono: 'general', color: '#8b5cf6' },
];

const SELECT_PRODUCTO = 'id, nombre, categoria, precio_venta, costo, stock, tipo_producto, especie, requiere_receta, lote, fecha_vencimiento, peso_bulto_kg, precio_por_kilo, rendimiento_raciones';

function cliente() {
  const c = getSupabaseClient();
  if (!c) throw new Error('nuestra base de datos no está configurada');
  return c;
}

export async function listarProductosVet(clienteId: string): Promise<ProductoVetWeb[]> {
  const { data, error } = await cliente()
    .from('productos')
    .select(SELECT_PRODUCTO)
    .eq('cliente_id', clienteId)
    .eq('activo', true)
    .order('nombre');
  if (error) throw new Error(error.message);
  return (data || []).map((p: any) => ({
    ...p,
    precio_venta: Number(p.precio_venta) || 0,
    costo: Number(p.costo) || 0,
    stock: Number(p.stock) || 0,
  }));
}

/** Mismo criterio que Electron para la pestaña Farmacia. */
export function esProductoFarmacia(p: ProductoVetWeb): boolean {
  if (p.tipo_producto === 'granel' || p.tipo_producto === 'servicio') return false;
  return !!p.requiere_receta || (p.categoria || '').toLowerCase().includes('medicamento') || p.tipo_producto === 'fisico';
}

// ── Categorías de granel ───────────────────────────────────────────────────

export async function listarCategoriasGranel(clienteId: string, productos: ProductoVetWeb[]): Promise<CategoriaGranelWeb[]> {
  const c = cliente();
  let { data, error } = await c
    .from('veterinaria_categorias_granel')
    .select('id, nombre, icono, color')
    .eq('cliente_id', clienteId)
    .order('orden')
    .order('created_at');
  if (error) throw new Error(error.message);

  // Primera vez: las mismas tres de Electron.
  if ((data || []).length === 0) {
    const ins = await c.from('veterinaria_categorias_granel')
      .insert(CATEGORIAS_GRANEL_INICIALES.map((cat, i) => ({ ...cat, cliente_id: clienteId, orden: i })))
      .select('id, nombre, icono, color');
    if (!ins.error) data = ins.data;
    else {
      // Otra pantalla las creó al mismo tiempo: se leen de nuevo.
      const otra = await c.from('veterinaria_categorias_granel').select('id, nombre, icono, color').eq('cliente_id', clienteId).order('orden');
      data = otra.data || [];
    }
  }

  const guardadas: CategoriaGranelWeb[] = (data || []).map((r: any) => ({ ...r, guardada: true }));
  const nombres = new Set(guardadas.map((g) => g.nombre.toLowerCase()));
  // Categorías que Electron les puso a sus bultos y que aquí aún no existen.
  const deElectron = [...new Set(productos.filter((p) => p.tipo_producto === 'granel' && p.categoria).map((p) => p.categoria as string))]
    .filter((n) => !nombres.has(n.toLowerCase()))
    .map((nombre) => ({ id: `nombre:${nombre}`, nombre, icono: 'general', color: '#64748b', guardada: false }));
  return [...guardadas, ...deElectron];
}

export async function guardarCategoriaGranel(
  clienteId: string,
  categoria: { id?: string; nombreAnterior?: string; nombre: string; icono: string; color: string; guardada?: boolean },
): Promise<void> {
  const c = cliente();
  const nombre = categoria.nombre.trim();
  if (categoria.id && categoria.guardada) {
    const { error } = await c.from('veterinaria_categorias_granel')
      .update({ nombre, icono: categoria.icono, color: categoria.color, updated_at: new Date().toISOString() })
      .eq('id', categoria.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await c.from('veterinaria_categorias_granel')
      .insert({ cliente_id: clienteId, nombre, icono: categoria.icono, color: categoria.color, orden: 99 });
    if (error) throw new Error(error.message.includes('duplicate') ? 'Ya existe una categoría con ese nombre' : error.message);
  }
  // Renombrar: los bultos de esa categoría pasan al nombre nuevo.
  if (categoria.nombreAnterior && categoria.nombreAnterior !== nombre) {
    await c.from('productos').update({ categoria: nombre })
      .eq('cliente_id', clienteId).eq('tipo_producto', 'granel').eq('categoria', categoria.nombreAnterior);
  }
}

export async function eliminarCategoriaGranel(id: string): Promise<void> {
  const { error } = await cliente().from('veterinaria_categorias_granel').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Bultos a granel ────────────────────────────────────────────────────────

export interface DatosBulto {
  nombre: string;
  categoria: string | null;
  especie: string;
  costo: number;
  precioPorKilo: number;
  pesoBultoKg: number | null;
  rendimientoRaciones: number | null;
  stockKg: number;
  fechaVencimiento: string | null;
  lote: string | null;
}

export async function guardarBulto(clienteId: string, empleadoId: string, datos: DatosBulto, id?: string): Promise<void> {
  const payload = {
    cliente_id: clienteId,
    nombre: datos.nombre.trim(),
    categoria: datos.categoria || 'Alimentos a Granel',
    especie: datos.especie,
    costo: datos.costo,
    precio_venta: datos.precioPorKilo,
    precio_por_kilo: datos.precioPorKilo,
    peso_bulto_kg: datos.pesoBultoKg,
    rendimiento_raciones: datos.rendimientoRaciones,
    stock: Math.max(0, datos.stockKg),
    fecha_vencimiento: datos.fechaVencimiento,
    lote: datos.lote,
    unidad: 'kg',
    tipo_producto: 'granel',
    es_bulto: true,
    permitir_fraccion: true,
    requiere_receta: false,
    updated_by: empleadoId,
  };
  const c = cliente();
  const { error } = id
    ? await c.from('productos').update(payload).eq('id', id)
    : await c.from('productos').insert(payload);
  if (error) throw new Error(error.message);
}

/** Igual que Electron: el producto se desactiva (no se borra), así las ventas viejas lo siguen mostrando. */
export async function eliminarProductoVet(id: string): Promise<void> {
  const { error } = await cliente().from('productos').update({ activo: false }).eq('id', id);
  if (error) throw new Error(error.message);
}
