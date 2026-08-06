-- Fase C (PWA Punto de Venta móvil): descuento de stock atómico. Sin esto,
-- un "leer stock actual, restar, escribir" desde el cliente puede perder
-- ventas concurrentes (dos celulares vendiendo el mismo producto a la vez).
-- No es security definer a propósito — corre con los privilegios de quien
-- llama, así que sigue respetando la RLS existente de productos
-- (cliente_id = current_cliente_id()); un empleado no puede descontar stock
-- de un negocio que no es el suyo.
create or replace function public.descontar_stock_producto(p_producto_id uuid, p_cantidad numeric)
returns void
language sql
as $$
  update public.productos
  set stock = greatest(stock - p_cantidad, 0), updated_at = now()
  where id = p_producto_id;
$$;

grant execute on function public.descontar_stock_producto(uuid, numeric) to authenticated;
