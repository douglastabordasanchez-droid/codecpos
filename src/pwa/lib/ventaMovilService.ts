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
}

export async function crearVentaMovil(
  clienteId: string,
  empleadoId: string,
  cajeroNombre: string,
  items: ItemCarritoMovil[],
  metodoPago: string
): Promise<{ ok: boolean; error?: string; numero?: number }> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase no configurado' };
  if (items.length === 0) return { ok: false, error: 'El carrito está vacío' };

  const total = items.reduce((acc, it) => acc + it.cantidad * it.precio, 0);

  const { data: ultimaVenta } = await client
    .from('ventas')
    .select('numero')
    .eq('cliente_id', clienteId)
    .order('numero', { ascending: false })
    .limit(1)
    .maybeSingle();
  const numero = ((ultimaVenta as { numero: number | null } | null)?.numero || 0) + 1;

  const { data: ventaRow, error: e1 } = await client
    .from('ventas')
    .insert({
      cliente_id: clienteId,
      terminal_id: 'PWA',
      empleado_id: empleadoId,
      numero,
      cajero_nombre: cajeroNombre,
      total,
      metodo_pago: metodoPago,
      estado: 'completada',
    })
    .select('id')
    .single();

  if (e1) return { ok: false, error: e1.message };

  const itemsPayload = items.map((it) => ({
    venta_id: ventaRow.id,
    producto_id: it.productoId,
    nombre: it.nombre,
    cantidad: it.cantidad,
    precio_unitario: it.precio,
    subtotal: it.cantidad * it.precio,
  }));

  const { error: e2 } = await client.from('venta_items').insert(itemsPayload);
  if (e2) return { ok: false, error: e2.message };

  await Promise.all(
    items.map((it) =>
      client.rpc('descontar_stock_producto', { p_producto_id: it.productoId, p_cantidad: it.cantidad }).then(
        ({ error }) => {
          if (error) console.error(`Error descontando stock de ${it.nombre}:`, error.message);
        }
      )
    )
  );

  return { ok: true, numero };
}
