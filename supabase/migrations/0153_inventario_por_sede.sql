-- 0153 · Inventario por sede: cada sede de un negocio tiene su propio
-- catálogo de productos, salvo que el dueño active «Inventario universal»
-- (todas las sedes ven el mismo catálogo, como antes).
--
-- · productos.tienda_id: sede dueña del producto (null = Tienda Principal).
-- · clientes_pos.inventario_universal: false por defecto (independiente).
--   Se deja en true para los negocios que ya compartían catálogo entre sedes
--   (Papotas co, CODEC ADMIN CENTRAL) para no cambiarles nada sin avisar.
-- · MEGA CAN (don Walter): tienda de mascotas = principal, «Brasil y su
--   moda» = sede de ropa con su propio inventario. El pantalón creado en esa
--   sede pasa a ella.

alter table public.productos add column if not exists tienda_id text;
create index if not exists idx_productos_cliente_tienda on public.productos (cliente_id, tienda_id);
alter table public.clientes_pos add column if not exists inventario_universal boolean not null default false;

update public.clientes_pos set inventario_universal = true where nombre_negocio in ('Papotas co', 'CODEC ADMIN CENTRAL');

update public.productos set tienda_id = 'tid_1794589374404_mscwvn'
where id = 'cfca6c4d-e9df-496b-aa8b-e4e1359e3a3e';

create or replace function public.inventario_universal_de(p_cliente_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select inventario_universal from public.clientes_pos where id = p_cliente_id), false)
$$;
grant execute on function public.inventario_universal_de(uuid) to authenticated;

-- El dueño o un administrador lo cambian desde Configuración.
create or replace function public.fijar_inventario_universal(p_universal boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.current_empleado_es_admin() then raise exception 'Solo el administrador puede cambiar esto'; end if;
  update public.clientes_pos set inventario_universal = p_universal, updated_at = now() where id = public.current_cliente_id();
end;
$$;
grant execute on function public.fijar_inventario_universal(boolean) to authenticated;

CREATE OR REPLACE FUNCTION public.buscar_inventario_sedes(p_busqueda text DEFAULT NULL::text, p_tienda text DEFAULT NULL::text, p_solo_bajo boolean DEFAULT false, p_limite integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(producto_id uuid, codigo text, nombre text, categoria text, stock_minimo numeric, stocks jsonb, total numeric, total_filas bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cliente uuid := public.current_cliente_id();
  v_q text := nullif(trim(coalesce(p_busqueda, '')), '');
  v_admin boolean := public.current_empleado_es_admin();
  v_mi_sede text := coalesce(public.current_empleado_tienda_id(), 'tienda_principal');
begin
  if v_cliente is null then raise exception 'Sin negocio en la sesión'; end if;
  -- Sin filtro de "bajo stock" se pagina primero y solo se calcula el stock de esa página.
  if not coalesce(p_solo_bajo, false) then
    return query
    with pagina as (
      select p.id, p.codigo_barras, p.nombre, p.categoria, coalesce(p.stock_minimo, 0) as minimo, coalesce(p.stock, 0) as principal,
             count(*) over () as n
      from public.productos p
      where p.cliente_id = v_cliente and coalesce(p.activo, true)
        -- 0153: con inventario independiente, la sede elegida ve solo sus productos.
        and (p_tienda is null or public.inventario_universal_de(v_cliente) or coalesce(p.tienda_id, 'tienda_principal') = p_tienda)
        and (v_q is null or p.nombre ilike '%' || v_q || '%' or p.codigo_barras ilike v_q || '%')
      order by p.nombre
      limit greatest(1, least(p_limite, 200)) offset greatest(0, p_offset)
    ), con_stock as (
      select pg.*,
        jsonb_build_object('tienda_principal', pg.principal)
          || coalesce((select jsonb_object_agg(ts.tienda_id, ts.cantidad) from public.tiendas_stock ts
                       where ts.cliente_id = v_cliente and ts.producto_id = pg.id), '{}'::jsonb) as st
      from pagina pg
    ), visibles as (
      select c.*, case when v_admin then c.st else jsonb_build_object(v_mi_sede, coalesce((c.st ->> v_mi_sede)::numeric, 0)) end as st_vis
      from con_stock c
    )
    select v.id, v.codigo_barras, v.nombre, v.categoria, v.minimo, v.st_vis,
           (select coalesce(sum(value::numeric), 0) from jsonb_each_text(v.st_vis)), v.n
    from visibles v
    order by v.nombre;
    return;
  end if;

  return query
  with base as (
    select p.id, p.codigo_barras, p.nombre, p.categoria, coalesce(p.stock_minimo, 0) as minimo, coalesce(p.stock, 0) as principal
    from public.productos p
    where p.cliente_id = v_cliente and coalesce(p.activo, true)
        -- 0153: con inventario independiente, la sede elegida ve solo sus productos.
        and (p_tienda is null or public.inventario_universal_de(v_cliente) or coalesce(p.tienda_id, 'tienda_principal') = p_tienda)
      and (v_q is null or p.nombre ilike '%' || v_q || '%' or p.codigo_barras ilike v_q || '%')
  ), con_stock as (
    select b.*,
      jsonb_build_object('tienda_principal', b.principal)
        || coalesce((select jsonb_object_agg(ts.tienda_id, ts.cantidad) from public.tiendas_stock ts
                     where ts.cliente_id = v_cliente and ts.producto_id = b.id), '{}'::jsonb) as st
    from base b
  ), visibles as (
    select c.*,
      case when v_admin then c.st else jsonb_build_object(v_mi_sede, coalesce((c.st ->> v_mi_sede)::numeric, 0)) end as st_vis
    from con_stock c
  ), filtrados as (
    select v.*,
      (select coalesce(sum(value::numeric), 0) from jsonb_each_text(v.st_vis)) as suma,
      coalesce((v.st_vis ->> coalesce(p_tienda, v_mi_sede))::numeric, 0) as en_sede
    from visibles v
  )
  select f.id, f.codigo_barras, f.nombre, f.categoria, f.minimo, f.st_vis, f.suma, count(*) over ()
  from filtrados f
  where not p_solo_bajo or f.en_sede <= f.minimo
  order by case when p_solo_bajo then f.en_sede end asc nulls last, f.nombre
  limit greatest(1, least(p_limite, 200)) offset greatest(0, p_offset);
end;
$function$;
