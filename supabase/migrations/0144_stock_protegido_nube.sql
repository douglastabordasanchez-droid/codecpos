-- Stock protegido en la nube (caso don Walter, MEGA CAN, 2026-11-12).
--
-- Con la multitienda en la nube el stock lo llevan las ventas, las
-- transferencias y los ajustes (todos por funciones de la base). Pero un
-- Electron viejo, un PC recién instalado o uno parado en otra sede seguía
-- pudiendo escribir la cantidad absoluta directo en la tabla (PATCH o upsert a
-- /productos) y pisaba lo que el negocio había cargado: el 9 nov a las 3:20 p. m.
-- un PC dejó 116 productos en 0 en 15 segundos.
--
-- 1) Para esos negocios, una escritura directa a /productos ya no cambia el
--    stock (el resto del producto sí se guarda). Las funciones (/rpc/...) y los
--    triggers de ventas siguen moviéndolo como siempre.
-- 2) ajustar_stock_producto: suma o resta en la sede indicada, con su
--    constancia en el kardex. La usan la web y Electron al editar un producto,
--    para que un formulario abierto un rato no borre las ventas de ese rato.

create or replace function public._proteger_stock_nube()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.stock is not distinct from old.stock then return new; end if;
  -- Solo las escrituras directas a la tabla por la API; las funciones llegan como /rpc/...
  if coalesce(current_setting('request.path', true), '') <> '/productos' then return new; end if;
  if not exists (select 1 from public.clientes_pos where id = new.cliente_id and coalesce(multitienda_nube, false)) then
    return new;
  end if;
  new.stock := old.stock;
  return new;
end;
$$;

drop trigger if exists trg_productos_proteger_stock_nube on public.productos;
create trigger trg_productos_proteger_stock_nube before update on public.productos
  for each row execute function public._proteger_stock_nube();

create or replace function public.ajustar_stock_producto(
  p_producto uuid,
  p_tienda text default 'tienda_principal',
  p_delta numeric default 0,
  p_referencia text default 'ajuste manual'
)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_cliente uuid := public.current_cliente_id();
  v_tienda text := coalesce(nullif(p_tienda, ''), 'tienda_principal');
begin
  if v_cliente is null then raise exception 'Inicia sesión para cambiar el inventario'; end if;
  perform 1 from public.productos where id = p_producto and cliente_id = v_cliente;
  if not found then raise exception 'Ese producto no es de este negocio'; end if;
  if coalesce(p_delta, 0) = 0 then return public._stock_sede(v_cliente, v_tienda, p_producto); end if;
  return public._mover_stock_sede(v_cliente, v_tienda, p_producto, p_delta, 'ajuste',
    coalesce(nullif(p_referencia, ''), 'ajuste manual'), public._usuario_actual_nombre());
end;
$$;
revoke all on function public.ajustar_stock_producto(uuid, text, numeric, text) from public, anon;
grant execute on function public.ajustar_stock_producto(uuid, text, numeric, text) to authenticated;
