-- Multitienda en la nube: con ella activada la caja de la sede principal ya no
-- sube la cantidad absoluta de stock (pisaría transferencias hechas desde la
-- web mientras tanto). Su venta descuenta productos.stock en la nube al subir
-- el detalle, igual que las demás sedes descuentan tiendas_stock (0111).
-- Las ventas de la web siguen descontando con descontar_stock_producto.

create or replace function public._descontar_stock_venta_electron()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_venta record;
  v_nube boolean;
  v_desde timestamptz;
begin
  if new.producto_id is null or coalesce(new.cantidad, 0) <= 0 then return new; end if;
  select cliente_id, tienda_id, terminal_id, created_at, local_id into v_venta from public.ventas where id = new.venta_id;
  if v_venta is null or v_venta.local_id is null or coalesce(v_venta.terminal_id, '') = 'PWA' then return new; end if;
  select multitienda_nube, multitienda_nube_desde into v_nube, v_desde from public.clientes_pos where id = v_venta.cliente_id;
  if not coalesce(v_nube, false) or v_venta.created_at < v_desde then return new; end if;

  if public._es_sede_principal(v_venta.tienda_id) then
    update public.productos set stock = coalesce(stock, 0) - new.cantidad, updated_at = now()
    where id = new.producto_id and cliente_id = v_venta.cliente_id;
  else
    insert into public.tiendas_stock (cliente_id, tienda_id, tienda_nombre, producto_id, cantidad, actualizado_en)
    values (v_venta.cliente_id, v_venta.tienda_id, public._nombre_sede(v_venta.cliente_id, v_venta.tienda_id), new.producto_id, -new.cantidad, now())
    on conflict (cliente_id, tienda_id, producto_id)
    do update set cantidad = public.tiendas_stock.cantidad - new.cantidad, actualizado_en = now();
  end if;
  return new;
end;
$$;
