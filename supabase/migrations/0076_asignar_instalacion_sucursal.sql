-- Permite que el DUEÑO de un negocio (no solo staff Codec Studio) asigne una
-- instalación física (una caja/computador, `instalaciones`) a una de sus
-- sucursales (`sucursales`, ya existente desde 0047 pero sin ningún RPC de
-- escritura para el cliente -- la policy "instalaciones escritura staff" es
-- solo para staff). Sin esto, un dueño con varias sucursales no podía
-- nombrar "cuál caja es cuál tienda" desde la PWA, solo Codec Studio podía
-- tocar esa tabla.
--
-- Reusa exactamente el mismo patrón de autorización que crear_sucursal()
-- (puedo_administrar_cliente) -- un empleado admin del negocio puede
-- llamarlo desde su propio celular, sin necesitar a Codec Studio.

create or replace function public.asignar_instalacion_a_sucursal(
  p_instalacion_id uuid,
  p_sucursal_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
  v_sucursal_cliente_id uuid;
begin
  select cliente_id into v_cliente_id from public.instalaciones where id = p_instalacion_id;
  if v_cliente_id is null then
    raise exception 'Instalación no encontrada';
  end if;

  if not public.puedo_administrar_cliente(v_cliente_id) then
    raise exception 'No autorizado para administrar las instalaciones de este negocio';
  end if;

  if p_sucursal_id is not null then
    select cliente_id into v_sucursal_cliente_id from public.sucursales where id = p_sucursal_id;
    if v_sucursal_cliente_id is null or v_sucursal_cliente_id <> v_cliente_id then
      raise exception 'La sucursal no pertenece a este negocio';
    end if;
  end if;

  update public.instalaciones set sucursal_id = p_sucursal_id where id = p_instalacion_id;
end;
$$;

grant execute on function public.asignar_instalacion_a_sucursal(uuid, uuid) to authenticated;
