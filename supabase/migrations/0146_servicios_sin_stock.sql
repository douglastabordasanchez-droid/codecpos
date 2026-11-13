-- 0146 · Los servicios no llevan inventario.
--
-- Un producto con tipo_producto = 'servicio' (baño, consulta, instalación)
-- se factura aunque no haya stock y la venta no le descuenta nada. Antes el
-- trigger de las ventas de Electron le restaba stock igual (MEGA CAN: «Baño
-- perro» en -4) y descontar_stock_producto, que usa la web, también.

create or replace function public._es_servicio(p_producto uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select tipo_producto = 'servicio' from public.productos where id = p_producto), false);
$$;
revoke all on function public._es_servicio(uuid) from public, anon;
grant execute on function public._es_servicio(uuid) to authenticated;

create or replace function public._descontar_stock_venta_electron()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_venta record;
  v_nube boolean;
  v_desde timestamptz;
begin
  if new.producto_id is null or coalesce(new.cantidad, 0) <= 0 then return new; end if;
  if public._es_servicio(new.producto_id) then return new; end if;
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
$function$;

create or replace function public.descontar_stock_producto(p_producto_id uuid, p_cantidad numeric, p_tienda_id text default null::text)
returns void
language plpgsql
set search_path to 'public'
as $function$
begin
  if public._es_servicio(p_producto_id) then return; end if;
  if p_tienda_id is null or p_tienda_id = 'tienda_principal' then
    update public.productos
    set stock = greatest(stock - p_cantidad, 0), updated_at = now()
    where id = p_producto_id;
  else
    insert into public.tiendas_stock (cliente_id, tienda_id, producto_id, cantidad)
    values (public.current_cliente_id(), p_tienda_id, p_producto_id, 0)
    on conflict (cliente_id, tienda_id, producto_id) do nothing;

    update public.tiendas_stock
    set cantidad = greatest(cantidad - p_cantidad, 0), actualizado_en = now()
    where cliente_id = public.current_cliente_id()
      and tienda_id = p_tienda_id
      and producto_id = p_producto_id;
  end if;
end;
$function$;
