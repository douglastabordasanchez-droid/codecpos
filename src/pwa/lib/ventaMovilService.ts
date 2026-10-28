/**
 * Fase C: Punto de Venta móvil. La venta queda completa en Supabase
 * (ventas + venta_items + descuento de stock), visible de inmediato en el
 * Panel Admin (Fase 6) y en reportes. Deliberadamente NO se intenta bajarla
 * de vuelta al IndexedDB de Electron en esta pasada — el número de venta
 * local de Electron es único por instalación (constraint de IndexedDB) y lo
 * genera un contador independiente; coordinar ambos contadores sin
 * colisiones es un problema aparte que merece su propio diseño, no una
 * adición apurada. Ver memoria de proyecto para el detalle.
 */
import { getSupabaseClient } from '../../app/lib/supabase/config';

export interface ItemCarritoMovil {
  productoId: string;
  nombre: string;
  cantidad: number;
  precio: number;
  /** Precio de catálogo al momento de agregar al carrito -- referencia para
   *  calcular el descuento si "permitirModificarPrecio" está activo y `precio`
   *  termina siendo distinto (editado manualmente). Si no se edita, es igual a `precio`. */
  precioOriginal?: number;
  /** 'kg' = producto a granel pesado: `cantidad` son kilos (con decimales). */
  unidad?: 'kg';
  /** Veterinaria: área para el cierre por áreas (granel, peluqueria, consultas…; ver ventasPorArea.ts). */
  area?: string;
  /** Veterinaria: servicio del inventario (baño, consulta) que no descuenta stock. */
  sinInventario?: boolean;
}

/** Servicios (baño, consulta, honorarios) no son productos del inventario:
 * llevan un id propio que no es un uuid y no descuentan stock. */
const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const esProductoInventario = (productoId: string) => ES_UUID.test(productoId);

/** Mismo shape que `PagoMixtoDetalle` de Electron (electronStore.ts) — así el historial se ve igual en las dos plataformas. */
export interface MetodosMultiplesMovil {
  efectivo?: number;
  tarjeta?: number;
  nequi?: number;
  daviplata?: number;
  transferencia?: number;
  rappi?: number;
}

export async function crearVentaMovil(
  clienteId: string,
  empleadoId: string,
  cajeroNombre: string,
  items: ItemCarritoMovil[],
  metodoPago: string,
  metodosMultiples?: MetodosMultiplesMovil,
  propina: number = 0,
  porcentajePropinaSugerido: number = 0,
  propinaModificada: boolean = false,
  /** Sucursal asignada al empleado que vende (empleado.tienda_id) — descuenta
   *  el stock de ESA sucursal (tiendas_stock) en vez de Tienda Principal.
   *  undefined/null/'tienda_principal' => comportamiento de siempre. */
  tiendaId?: string | null,
): Promise<{ ok: boolean; error?: string; numero?: number; ventaId?: string }> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'nuestra base de datos no está configurada' };
  if (items.length === 0) return { ok: false, error: 'El carrito está vacío' };

  const totalProductos = items.reduce((acc, it) => acc + it.cantidad * it.precio, 0);
  const propinaValida = Math.max(0, Number(propina) || 0);
  const total = totalProductos + propinaValida;
  const descuento = items.reduce((acc, it) => acc + Math.max(0, (it.precioOriginal ?? it.precio) - it.precio) * it.cantidad, 0);

  // Contador del servidor: dos celulares vendiendo a la vez nunca reciben el
  // mismo número (migración 0117). Si la función aún no existe, se cae al
  // cálculo anterior para no frenar la venta.
  const { data: numeroServidor, error: errorNumero } = await client.rpc('siguiente_numero_venta_web', { p_cliente_id: clienteId });
  let numero = typeof numeroServidor === 'number' ? numeroServidor : 0;
  if (errorNumero || !numero) {
    const { data: ultimaVenta } = await client
      .from('ventas')
      .select('numero')
      .eq('cliente_id', clienteId)
      .eq('terminal_id', 'PWA')
      .order('numero', { ascending: false })
      .limit(1)
      .maybeSingle();
    numero = ((ultimaVenta as { numero: number | null } | null)?.numero || 0) + 1;
  }

  const { data: ventaRow, error: e1 } = await client
    .from('ventas')
    .insert({
      cliente_id: clienteId,
      terminal_id: 'PWA',
      empleado_id: empleadoId,
      numero,
      cajero_nombre: cajeroNombre,
      total,
      descuento,
      propina: propinaValida,
      porcentaje_propina_sugerido: Math.max(0, Number(porcentajePropinaSugerido) || 0),
      propina_modificada: propinaModificada,
      metodo_pago: metodoPago,
      metodos_multiples: metodoPago === 'mixto' ? (metodosMultiples || null) : null,
      estado: 'completada',
      tienda_id: tiendaId && tiendaId !== 'tienda_principal' ? tiendaId : null,
    })
    .select('id')
    .single();

  if (e1) return { ok: false, error: e1.message };

  const itemsPayload = items.map((it) => ({
    venta_id: ventaRow.id,
    producto_id: esProductoInventario(it.productoId) ? it.productoId : null,
    nombre: it.nombre,
    cantidad: it.cantidad,
    precio_unitario: it.precio,
    precio_original: it.precioOriginal ?? it.precio,
    subtotal: it.cantidad * it.precio,
    // Solo las ventas de Veterinaria llevan área; las demás no cambian.
    ...(it.area ? { area: it.area } : {}),
  }));

  let { error: e2 } = await client.from('venta_items').insert(itemsPayload);
  // La nube aún sin la columna `area` (migración 0134): se guarda sin ella y
  // el cierre deduce el área del producto y del nombre.
  if (e2 && /area/i.test(e2.message) && itemsPayload.some((it) => 'area' in it)) {
    ({ error: e2 } = await client.from('venta_items').insert(itemsPayload.map(({ area: _area, ...resto }: any) => resto)));
  }
  if (e2) return { ok: false, error: e2.message };

  await Promise.all(
    items.filter((it) => esProductoInventario(it.productoId) && !it.sinInventario).map((it) =>
      client.rpc('descontar_stock_producto', {
        p_producto_id: it.productoId,
        p_cantidad: it.cantidad,
        p_tienda_id: tiendaId || null,
      }).then(
        ({ error }) => {
          if (error) console.error(`Error descontando stock de ${it.nombre}:`, error.message);
        }
      )
    )
  );

  return { ok: true, numero, ventaId: ventaRow.id };
}
