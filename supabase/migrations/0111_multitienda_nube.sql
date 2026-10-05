-- Multitienda en la nube (pensado para negocios grandes: 20.000 referencias,
-- 15 sedes, bodega que surte a las tiendas).
--
-- Antes: el stock de las sedes vivía en UN computador (multitiendaService.ts,
-- localStorage) y cada caja subía su versión completa a tiendas_stock. Con
-- una caja por sede, las cajas se pisaban entre sí, y la web leía todo
-- tiendas_stock y productos de una vez (PostgREST corta en 1.000 filas).
--
-- Ahora, con multitienda_nube activado para el negocio:
--   - La nube es la verdad del stock por sede. Se mantiene el modelo de
--     siempre: la sede principal usa productos.stock y las demás tiendas_stock.
--   - Las transferencias se hacen en la nube, de una vez y sin choques
--     (enviar: sale de la sede origen y queda "en camino"; recibir: entra al
--     destino, con diferencias si llegó menos; cancelar: vuelve al origen).
--   - Kardex (movimientos_stock_sede) de transferencias y cargas.
--   - Una venta de Electron en una sede distinta de la principal descuenta
--     tiendas_stock en la misma transacción en que sube su detalle (trigger).
--     Las ventas de la web ya descuentan con descontar_stock_producto.
--   - Búsqueda de inventario por sede paginada en el servidor.
-- Negocios que no lo activan siguen exactamente igual.

create extension if not exists pg_trgm;

alter table public.clientes_pos
  add column if not exists multitienda_nube boolean not null default false,
  add column if not exists multitienda_nube_desde timestamptz;

-- Cantidades con decimales (venta por kilo o fracción) también por sede.
alter table public.tiendas_stock alter column cantidad type numeric(14,3) using cantidad::numeric;
alter table public.tiendas_stock alter column actualizado_en set default now();
create index if not exists idx_tiendas_stock_cliente_producto on public.tiendas_stock (cliente_id, producto_id);
create index if not exists idx_tiendas_stock_cliente_actualizado on public.tiendas_stock (cliente_id, tienda_id, actualizado_en);

-- Búsqueda rápida por nombre y código con miles de referencias.
create index if not exists idx_productos_nombre_trgm on public.productos using gin (nombre gin_trgm_ops);
create index if not exists idx_productos_cliente_codigo on public.productos (cliente_id, codigo_barras);

-- ── Transferencias y kardex ──────────────────────────────────────────────
create table if not exists public.transferencias_inventario (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  numero bigserial,
  tienda_origen_id text not null,
  tienda_origen_nombre text,
  tienda_destino_id text not null,
  tienda_destino_nombre text,
  estado text not null default 'en_camino' check (estado in ('en_camino', 'recibida', 'cancelada')),
  items jsonb not null,           -- [{producto_id, codigo, nombre, cantidad, cantidad_recibida}]
  total_unidades numeric(14,3) not null default 0,
  notas text,
  creado_por uuid,
  creado_por_nombre text,
  creado_en timestamptz not null default now(),
  recibido_por_nombre text,
  recibido_en timestamptz,
  con_diferencias boolean not null default false,
  cancelado_por_nombre text,
  cancelado_en timestamptz,
  motivo_cancelacion text
);
create index if not exists idx_transferencias_cliente_estado on public.transferencias_inventario (cliente_id, estado, creado_en desc);

create table if not exists public.movimientos_stock_sede (
  id bigserial primary key,
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  tienda_id text not null,
  producto_id uuid not null,
  cantidad numeric(14,3) not null,     -- positivo entra, negativo sale
  saldo numeric(14,3),
  tipo text not null,                  -- transferencia_salida, transferencia_entrada, transferencia_devuelta, carga, ajuste
  referencia text,
  usuario text,
  creado_en timestamptz not null default now()
);
create index if not exists idx_mov_stock_sede on public.movimientos_stock_sede (cliente_id, tienda_id, producto_id, creado_en desc);

alter table public.transferencias_inventario enable row level security;
alter table public.movimientos_stock_sede enable row level security;

drop policy if exists transferencias_select on public.transferencias_inventario;
create policy transferencias_select on public.transferencias_inventario for select to authenticated
  using (cliente_id = (select public.current_cliente_id()) and (
    (select public.current_empleado_es_admin())
    or tienda_origen_id = (select public.current_empleado_tienda_id())
    or tienda_destino_id = (select public.current_empleado_tienda_id())));

drop policy if exists movimientos_stock_sede_select on public.movimientos_stock_sede;
create policy movimientos_stock_sede_select on public.movimientos_stock_sede for select to authenticated
  using (cliente_id = (select public.current_cliente_id()) and (
    (select public.current_empleado_es_admin()) or tienda_id = (select public.current_empleado_tienda_id())));

-- Solo se escriben por las funciones de abajo.
revoke all on public.transferencias_inventario, public.movimientos_stock_sede from anon;
revoke insert, update, delete on public.transferencias_inventario, public.movimientos_stock_sede from authenticated;
grant select on public.transferencias_inventario, public.movimientos_stock_sede to authenticated;

-- ── Ayudantes ────────────────────────────────────────────────────────────
create or replace function public._usuario_actual_nombre()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nombre_completo from public.empleados where id = auth.uid()),
    (select 'Caja (programa de escritorio)' from public.sync_identidades where id = auth.uid()),
    'Sistema')
$$;

create or replace function public._es_sede_principal(p_tienda text)
returns boolean language sql immutable as $$
  select p_tienda is null or p_tienda = '' or p_tienda = 'tienda_principal'
$$;

create or replace function public._nombre_sede(p_cliente uuid, p_tienda text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select nombre from public.tiendas where cliente_id = p_cliente and local_id = p_tienda),
                  case when public._es_sede_principal(p_tienda) then 'Tienda Principal' else p_tienda end)
$$;

/** Suma (o resta) stock en una sede y deja constancia en el kardex. Devuelve el saldo. */
create or replace function public._mover_stock_sede(
  p_cliente uuid, p_tienda text, p_producto uuid, p_delta numeric, p_tipo text, p_referencia text, p_usuario text
) returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_saldo numeric;
begin
  if public._es_sede_principal(p_tienda) then
    update public.productos set stock = coalesce(stock, 0) + p_delta, updated_at = now()
    where id = p_producto and cliente_id = p_cliente
    returning stock into v_saldo;
    if not found then raise exception 'Producto % no existe en este negocio', p_producto; end if;
  else
    insert into public.tiendas_stock (cliente_id, tienda_id, tienda_nombre, producto_id, cantidad, actualizado_en)
    values (p_cliente, p_tienda, public._nombre_sede(p_cliente, p_tienda), p_producto, p_delta, now())
    on conflict (cliente_id, tienda_id, producto_id)
    do update set cantidad = public.tiendas_stock.cantidad + excluded.cantidad, actualizado_en = now()
    returning cantidad into v_saldo;
  end if;
  insert into public.movimientos_stock_sede (cliente_id, tienda_id, producto_id, cantidad, saldo, tipo, referencia, usuario)
  values (p_cliente, coalesce(nullif(p_tienda, ''), 'tienda_principal'), p_producto, p_delta, v_saldo, p_tipo, p_referencia, p_usuario);
  return v_saldo;
end;
$$;

create or replace function public._stock_sede(p_cliente uuid, p_tienda text, p_producto uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select case when public._es_sede_principal(p_tienda)
    then (select coalesce(stock, 0) from public.productos where id = p_producto and cliente_id = p_cliente)
    else coalesce((select cantidad from public.tiendas_stock where cliente_id = p_cliente and tienda_id = p_tienda and producto_id = p_producto), 0)
  end
$$;

revoke all on function public._mover_stock_sede(uuid, text, uuid, numeric, text, text, text) from public, anon, authenticated;

create or replace function public._puede_operar_sede(p_tienda text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_empleado_es_admin()
      or coalesce(public.current_empleado_tienda_id(), 'tienda_principal') = coalesce(nullif(p_tienda, ''), 'tienda_principal')
$$;

-- ── Configuración ────────────────────────────────────────────────────────
create or replace function public.obtener_config_multitienda()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('nube', coalesce(multitienda_nube, false), 'desde', multitienda_nube_desde)
  from public.clientes_pos where id = public.current_cliente_id()
$$;
grant execute on function public.obtener_config_multitienda() to authenticated;

create or replace function public.activar_multitienda_nube()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cliente uuid := public.current_cliente_id();
begin
  if v_cliente is null or not public.current_empleado_es_admin() then
    raise exception 'Solo el administrador puede activar la multitienda en la nube';
  end if;
  update public.clientes_pos
  set multitienda_nube = true, multitienda_nube_desde = coalesce(multitienda_nube_desde, now())
  where id = v_cliente;
  return public.obtener_config_multitienda();
end;
$$;
grant execute on function public.activar_multitienda_nube() to authenticated;

-- ── Inventario por sede (búsqueda paginada en el servidor) ───────────────
create or replace function public.buscar_inventario_sedes(
  p_busqueda text default null,
  p_tienda text default null,      -- si viene, ordena y filtra "bajo stock" por esa sede
  p_solo_bajo boolean default false,
  p_limite int default 50,
  p_offset int default 0
) returns table (
  producto_id uuid, codigo text, nombre text, categoria text, stock_minimo numeric,
  stocks jsonb, total numeric, total_filas bigint
) language plpgsql stable security definer set search_path = public as $$
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
$$;
grant execute on function public.buscar_inventario_sedes(text, text, boolean, int, int) to authenticated;

-- ── Transferencias ───────────────────────────────────────────────────────
create or replace function public.enviar_transferencia(
  p_origen text, p_destino text, p_items jsonb, p_notas text default null,
  p_llega_ya boolean default false, p_permitir_sin_stock boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cliente uuid := public.current_cliente_id();
  v_usuario text := public._usuario_actual_nombre();
  v_id uuid := gen_random_uuid();
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
  v_prod record;
  v_cant numeric;
  v_disp numeric;
  v_faltan text := '';
  v_total numeric := 0;
begin
  if v_cliente is null then raise exception 'Sin negocio en la sesión'; end if;
  if coalesce(p_origen, '') = coalesce(p_destino, '') then raise exception 'La sede de origen y la de destino deben ser distintas'; end if;
  if not public._puede_operar_sede(p_origen) then raise exception 'No tienes permiso para enviar mercancía desde esa sede'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'La transferencia no tiene productos'; end if;

  -- Bloquea las filas de stock en orden (evita choques entre dos transferencias a la vez).
  for v_item in select value from jsonb_array_elements(p_items) order by value ->> 'producto_id' loop
    v_cant := (v_item ->> 'cantidad')::numeric;
    if v_cant is null or v_cant <= 0 then continue; end if;
    select id, codigo_barras, nombre into v_prod from public.productos
    where id = (v_item ->> 'producto_id')::uuid and cliente_id = v_cliente for update;
    if not found then raise exception 'Un producto de la transferencia no existe'; end if;
    if not public._es_sede_principal(p_origen) then
      perform 1 from public.tiendas_stock where cliente_id = v_cliente and tienda_id = p_origen and producto_id = v_prod.id for update;
    end if;
    v_disp := public._stock_sede(v_cliente, p_origen, v_prod.id);
    if v_disp < v_cant and not p_permitir_sin_stock then
      v_faltan := v_faltan || format('%s (hay %s, se piden %s); ', v_prod.nombre, trim(to_char(v_disp, 'FM999999990.###')), trim(to_char(v_cant, 'FM999999990.###')));
      continue;
    end if;
    v_items := v_items || jsonb_build_object('producto_id', v_prod.id, 'codigo', v_prod.codigo_barras, 'nombre', v_prod.nombre, 'cantidad', v_cant);
    v_total := v_total + v_cant;
  end loop;

  if v_faltan <> '' then raise exception 'No hay suficiente en la sede de origen: %', v_faltan; end if;
  if jsonb_array_length(v_items) = 0 then raise exception 'La transferencia no tiene cantidades válidas'; end if;

  insert into public.transferencias_inventario (id, cliente_id, tienda_origen_id, tienda_origen_nombre, tienda_destino_id, tienda_destino_nombre,
    items, total_unidades, notas, creado_por, creado_por_nombre)
  values (v_id, v_cliente, coalesce(nullif(p_origen, ''), 'tienda_principal'), public._nombre_sede(v_cliente, p_origen),
    coalesce(nullif(p_destino, ''), 'tienda_principal'), public._nombre_sede(v_cliente, p_destino),
    v_items, v_total, nullif(trim(coalesce(p_notas, '')), ''), auth.uid(), v_usuario);

  for v_item in select value from jsonb_array_elements(v_items) loop
    perform public._mover_stock_sede(v_cliente, p_origen, (v_item ->> 'producto_id')::uuid, -(v_item ->> 'cantidad')::numeric,
      'transferencia_salida', v_id::text, v_usuario);
  end loop;

  if p_llega_ya then perform public.recibir_transferencia(v_id, null); end if;
  return v_id;
end;
$$;
grant execute on function public.enviar_transferencia(text, text, jsonb, text, boolean, boolean) to authenticated;

create or replace function public.recibir_transferencia(p_id uuid, p_cantidades jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cliente uuid := public.current_cliente_id();
  v_t public.transferencias_inventario;
  v_usuario text := public._usuario_actual_nombre();
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
  v_recibida numeric;
  v_dif boolean := false;
begin
  select * into v_t from public.transferencias_inventario where id = p_id and cliente_id = v_cliente for update;
  if not found then raise exception 'La transferencia no existe'; end if;
  if v_t.estado <> 'en_camino' then raise exception 'Esta transferencia ya fue %', case v_t.estado when 'recibida' then 'recibida' else 'cancelada' end; end if;
  if not public._puede_operar_sede(v_t.tienda_destino_id) then raise exception 'Solo la sede de destino puede recibir esta transferencia'; end if;

  for v_item in select value from jsonb_array_elements(v_t.items) loop
    v_recibida := coalesce((p_cantidades ->> (v_item ->> 'producto_id'))::numeric, (v_item ->> 'cantidad')::numeric);
    v_recibida := greatest(0, v_recibida);
    if v_recibida <> (v_item ->> 'cantidad')::numeric then v_dif := true; end if;
    if v_recibida > 0 then
      perform public._mover_stock_sede(v_cliente, v_t.tienda_destino_id, (v_item ->> 'producto_id')::uuid, v_recibida,
        'transferencia_entrada', p_id::text, v_usuario);
    end if;
    v_items := v_items || (v_item || jsonb_build_object('cantidad_recibida', v_recibida));
  end loop;

  update public.transferencias_inventario
  set estado = 'recibida', items = v_items, recibido_por_nombre = v_usuario, recibido_en = now(), con_diferencias = v_dif
  where id = p_id;
end;
$$;
grant execute on function public.recibir_transferencia(uuid, jsonb) to authenticated;

create or replace function public.cancelar_transferencia(p_id uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cliente uuid := public.current_cliente_id();
  v_t public.transferencias_inventario;
  v_usuario text := public._usuario_actual_nombre();
  v_item jsonb;
begin
  select * into v_t from public.transferencias_inventario where id = p_id and cliente_id = v_cliente for update;
  if not found then raise exception 'La transferencia no existe'; end if;
  if v_t.estado <> 'en_camino' then raise exception 'Solo se puede cancelar una transferencia en camino'; end if;
  if not public._puede_operar_sede(v_t.tienda_origen_id) then raise exception 'Solo la sede de origen puede cancelar esta transferencia'; end if;

  for v_item in select value from jsonb_array_elements(v_t.items) loop
    perform public._mover_stock_sede(v_cliente, v_t.tienda_origen_id, (v_item ->> 'producto_id')::uuid, (v_item ->> 'cantidad')::numeric,
      'transferencia_devuelta', p_id::text, v_usuario);
  end loop;
  update public.transferencias_inventario
  set estado = 'cancelada', cancelado_por_nombre = v_usuario, cancelado_en = now(), motivo_cancelacion = nullif(trim(coalesce(p_motivo, '')), '')
  where id = p_id;
end;
$$;
grant execute on function public.cancelar_transferencia(uuid, text) to authenticated;

-- ── Carga masiva de inventario de una sede (conteo físico, archivo de Oasis...) ─
create or replace function public.cargar_stock_sede(p_tienda text, p_items jsonb, p_modo text default 'fijar')
returns int language plpgsql security definer set search_path = public as $$
declare
  v_cliente uuid := public.current_cliente_id();
  v_usuario text := public._usuario_actual_nombre();
  v_item jsonb;
  v_prod uuid;
  v_nueva numeric;
  v_actual numeric;
  v_n int := 0;
begin
  if v_cliente is null or not public.current_empleado_es_admin() then raise exception 'Solo el administrador puede cargar inventario'; end if;
  if p_modo not in ('fijar', 'sumar') then raise exception 'Modo inválido'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_prod := (v_item ->> 'producto_id')::uuid;
    v_nueva := (v_item ->> 'cantidad')::numeric;
    if v_prod is null or v_nueva is null then continue; end if;
    perform 1 from public.productos where id = v_prod and cliente_id = v_cliente;
    if not found then continue; end if;
    v_actual := public._stock_sede(v_cliente, p_tienda, v_prod);
    if p_modo = 'fijar' then v_nueva := v_nueva - v_actual; end if;
    if v_nueva <> 0 then
      perform public._mover_stock_sede(v_cliente, p_tienda, v_prod, v_nueva, case p_modo when 'fijar' then 'ajuste' else 'carga' end, 'carga masiva', v_usuario);
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
grant execute on function public.cargar_stock_sede(text, jsonb, text) to authenticated;

-- ── Ventas de Electron en una sede: descuentan tiendas_stock al subir el detalle ─
create or replace function public._descontar_stock_venta_electron()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_venta record;
  v_nube boolean;
  v_desde timestamptz;
begin
  if new.producto_id is null or coalesce(new.cantidad, 0) <= 0 then return new; end if;
  select cliente_id, tienda_id, terminal_id, created_at, local_id into v_venta from public.ventas where id = new.venta_id;
  -- La web descuenta por su cuenta (descontar_stock_producto); la principal la sube la caja en productos.stock.
  if v_venta is null or v_venta.local_id is null or coalesce(v_venta.terminal_id, '') = 'PWA'
     or public._es_sede_principal(v_venta.tienda_id) then
    return new;
  end if;
  select multitienda_nube, multitienda_nube_desde into v_nube, v_desde from public.clientes_pos where id = v_venta.cliente_id;
  if not coalesce(v_nube, false) or v_venta.created_at < v_desde then return new; end if;

  insert into public.tiendas_stock (cliente_id, tienda_id, tienda_nombre, producto_id, cantidad, actualizado_en)
  values (v_venta.cliente_id, v_venta.tienda_id, public._nombre_sede(v_venta.cliente_id, v_venta.tienda_id), new.producto_id, -new.cantidad, now())
  on conflict (cliente_id, tienda_id, producto_id)
  do update set cantidad = public.tiendas_stock.cantidad - new.cantidad, actualizado_en = now();
  return new;
end;
$$;
drop trigger if exists descontar_stock_venta_electron on public.venta_items;
create trigger descontar_stock_venta_electron after insert on public.venta_items
  for each row execute function public._descontar_stock_venta_electron();

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transferencias_inventario') then
    alter publication supabase_realtime add table public.transferencias_inventario;
  end if;
exception when undefined_object then null;
end $$;
