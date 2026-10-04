-- "Mi negocio" conectado entre Electron y la web/celular.
--
-- · El tipo de negocio queda siempre como código (minimercado, ropa,
--   restaurante...). El registro de prueba gratis guardaba el nombre visible
--   ("Juguetería", "Papelería"); se normaliza aquí y en adelante.
-- · Talla y color de los productos viajan a la nube (modo ropa en la web),
--   igual que ya viajaban marca, calibre o color de acabado.
-- · actualizar_mi_negocio: lo usa la web para guardar todo de una vez; Electron
--   sigue usando sus funciones de siempre y además lee de vuelta estos datos.

alter table public.productos add column if not exists talla text;
alter table public.productos add column if not exists color text;

create or replace function public.normalizar_tipo_negocio(p_valor text)
returns text
language sql
immutable
as $$
  select case lower(translate(btrim(coalesce(p_valor, '')), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
    when '' then null
    when 'minimercado / tienda de barrio' then 'minimercado'
    when 'minimercado' then 'minimercado'
    when 'tienda de barrio' then 'minimercado'
    when 'tienda de ropa' then 'ropa'
    when 'ropa' then 'ropa'
    when 'drogueria / farmacia' then 'drogueria'
    when 'drogueria' then 'drogueria'
    when 'farmacia' then 'drogueria'
    when 'ferreteria' then 'ferreteria'
    when 'papeleria' then 'papeleria'
    when 'panaderia / pasteleria' then 'panaderia'
    when 'panaderia' then 'panaderia'
    when 'carniceria' then 'carniceria'
    when 'restaurante / comidas rapidas' then 'restaurante'
    when 'restaurante' then 'restaurante'
    when 'licoreria' then 'licores'
    when 'licores' then 'licores'
    when 'tienda de tecnologia' then 'tecnologia'
    when 'tecnologia' then 'tecnologia'
    when 'productos de belleza' then 'belleza'
    when 'belleza' then 'belleza'
    when 'veterinaria / mascotas' then 'veterinaria'
    when 'veterinaria' then 'veterinaria'
    when 'jugueteria' then 'jugueteria'
    when 'articulos deportivos' then 'deportes'
    when 'deportes' then 'deportes'
    when 'libreria' then 'libreria'
    else lower(btrim(p_valor))
  end
$$;

update public.clientes_pos
set tipo_negocio = public.normalizar_tipo_negocio(tipo_negocio)
where tipo_negocio is not null and tipo_negocio is distinct from public.normalizar_tipo_negocio(tipo_negocio);

-- Electron sigue llamando actualizar_tipo_negocio: también normaliza.
create or replace function public.actualizar_tipo_negocio(p_tipo_negocio text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cliente_id uuid;
begin
  v_cliente_id := public.current_cliente_id();
  if v_cliente_id is null or not public.empleado_es_admin_de(v_cliente_id) then
    raise exception 'No autorizado para modificar el tipo de negocio';
  end if;
  if p_tipo_negocio is null or length(trim(p_tipo_negocio)) = 0 then
    raise exception 'El tipo de negocio no puede estar vacío';
  end if;
  update public.clientes_pos set tipo_negocio = public.normalizar_tipo_negocio(p_tipo_negocio), updated_at = now()
  where id = v_cliente_id;
end;
$function$;

-- Guardar "Mi negocio" desde la web/celular (solo administradores del negocio).
create or replace function public.actualizar_mi_negocio(
  p_tipo_negocio text,
  p_nombre_negocio text,
  p_propina_activa boolean,
  p_porcentaje_propina numeric,
  p_permitir_modificar_precio boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cliente_id uuid := public.current_cliente_id();
begin
  if v_cliente_id is null or not public.empleado_es_admin_de(v_cliente_id) then
    raise exception 'Solo un administrador puede configurar el negocio';
  end if;
  if coalesce(btrim(p_tipo_negocio), '') = '' then
    raise exception 'Elige el tipo de negocio';
  end if;
  if coalesce(btrim(p_nombre_negocio), '') = '' then
    raise exception 'Escribe el nombre del negocio';
  end if;
  if p_porcentaje_propina is null or p_porcentaje_propina < 0 or p_porcentaje_propina > 100 then
    raise exception 'El porcentaje de propina debe estar entre 0 y 100';
  end if;
  update public.clientes_pos set
    tipo_negocio = public.normalizar_tipo_negocio(p_tipo_negocio),
    nombre_negocio = left(btrim(p_nombre_negocio), 120),
    propina_activa = coalesce(p_propina_activa, false),
    porcentaje_propina_predeterminado = p_porcentaje_propina,
    permitir_modificar_precio = coalesce(p_permitir_modificar_precio, false),
    updated_at = now()
  where id = v_cliente_id;
end;
$function$;

revoke all on function public.actualizar_mi_negocio(text, text, boolean, numeric, boolean) from public, anon;
grant execute on function public.actualizar_mi_negocio(text, text, boolean, numeric, boolean) to authenticated;
