/**
 * IVA del negocio para la web/celular y Facturar de nuevo. Es la misma configuración de Electron
 * (Configuración › IVA), guardada en empresa_configuraciones.datos, así que
 * lo que se cambie en un lado vale en el otro. Sin configurar = IVA apagado,
 * igual que en Electron.
 */
import { getSupabaseClient } from '../supabase/config';
import { lineaConIvaIncluido } from './ivaIncluido';
import type { ItemFacturaDian } from './types';

export interface ConfigIva {
  habilitado: boolean;
  porcentaje: number;
  /** true: el precio del producto ya trae el IVA; false: se suma encima. */
  incluidoEnPrecio: boolean;
  /** true: todos los productos llevan el IVA aunque digan 0 %. */
  todosLosProductos: boolean;
}

export const CONFIG_IVA_APAGADO: ConfigIva = { habilitado: false, porcentaje: 19, incluidoEnPrecio: true, todosLosProductos: false };

export function configIvaDesdeDatos(datos: Record<string, unknown> | null | undefined): ConfigIva {
  const d = datos || {};
  const pct = Number(d.porcentajeIVA);
  return {
    habilitado: d.ivaHabilitado === true,
    porcentaje: Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : 19,
    incluidoEnPrecio: d.ivaIncluidoEnPrecio === true,
    todosLosProductos: d.ivaTodosLosProductos === true,
  };
}

export async function leerConfigIva(clienteId: string): Promise<ConfigIva> {
  const { data, error } = await getSupabaseClient()!
    .from('empresa_configuraciones')
    .select('datos')
    .eq('cliente_id', clienteId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return configIvaDesdeDatos((data as { datos?: Record<string, unknown> } | null)?.datos);
}

export async function guardarConfigIva(c: ConfigIva) {
  const { error } = await getSupabaseClient()!.rpc('actualizar_config_iva', {
    p_habilitado: c.habilitado,
    p_porcentaje: c.porcentaje,
    p_incluido: c.incluidoEnPrecio,
    p_todos: c.todosLosProductos,
  });
  if (error) throw new Error(error.message);
}

/** Tarifa de IVA con la que se vende un producto (0 si no lleva IVA). */
export function tarifaIvaProducto(c: ConfigIva, ivaDelProducto: number | null | undefined): number {
  if (!c.habilitado) return 0;
  if (c.todosLosProductos) return c.porcentaje;
  return Math.max(0, Number(ivaDelProducto) || 0);
}

/** Lo que paga el cliente por unidad: si el IVA se suma encima, se agrega aquí. */
export function precioDeVentaConIva(c: ConfigIva, precio: number, tarifa: number): number {
  if (c.incluidoEnPrecio || tarifa <= 0) return precio;
  return Math.round(precio * (1 + tarifa / 100));
}

const tarifaIvaDeLinea = (item: ItemFacturaDian) => item.impuestos?.find((t) => t.codigo === '01')?.porcentaje || 0;

/**
 * Líneas de una factura ya cobrada, con el IVA que pide la configuración de
 * hoy (Facturar de nuevo una factura que salió sin IVA). Lo que pagó el
 * cliente no cambia: el IVA se despeja de adentro, como en el cobro. Una
 * línea con otro impuesto (INC) o que ya tiene la tarifa correcta queda igual.
 */
export function itemsConIvaConfigurado(items: ItemFacturaDian[], c: ConfigIva): ItemFacturaDian[] {
  if (!c.habilitado || !c.todosLosProductos) return items;
  return items.map((item) => {
    const impuestos = item.impuestos || [];
    if (impuestos.some((t) => t.codigo !== '01') || tarifaIvaDeLinea(item) === c.porcentaje) return item;
    const cobrado = item.subtotal + impuestos.reduce((s, t) => s + (Number(t.valor) || 0), 0);
    const linea = { codigo: item.codigo, descripcion: item.descripcion, cantidad: item.cantidad };
    return {
      ...lineaConIvaIncluido(linea, item.cantidad > 0 ? cobrado / item.cantidad : cobrado, c.porcentaje),
      ...(item.unidadMedida ? { unidadMedida: item.unidadMedida } : {}),
    };
  });
}

/** Productos del negocio con IVA 0 % en su ficha. */
export async function contarProductosSinIva(): Promise<number> {
  const { data, error } = await getSupabaseClient()!.rpc('contar_productos_sin_iva');
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

/** Escribe la tarifa en la ficha de los productos sin IVA (migración 0129). Devuelve cuántos cambió. */
export async function aplicarIvaATodosLosProductos(porcentaje: number): Promise<number> {
  const { data, error } = await getSupabaseClient()!.rpc('aplicar_iva_a_productos', { p_porcentaje: porcentaje, p_solo_sin_iva: true });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}
