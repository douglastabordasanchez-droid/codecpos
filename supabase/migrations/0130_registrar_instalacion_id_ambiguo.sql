-- 0130 · Las cajas nuevas no se registraban: «column reference "id" is ambiguous».
--
-- registrar_instalacion devuelve una tabla con la columna id, y el insert
-- terminaba en «returning id»: en PL/pgSQL eso choca con la variable de
-- salida y la función fallaba SIEMPRE para una caja nueva (desde agosto
-- ninguna caja se registró). Sin registro, la caja no recibe su número
-- (codigo_caja) ni su letra (FEA000123): todas numeraban FE000001… y sus
-- ventas se pisaban en la nube por (cliente_id, local_id) (Distribuciones BM,
-- FE000012 y FE000013 repetidas, 2026-10-23).
--
-- Además, las cajas ya registradas sin número (codigo_caja nulo) lo reciben
-- la próxima vez que se conecten.

create or replace function public.registrar_instalacion(
  p_machine_id text,
  p_tipo text,
  p_version text default null,
  p_sucursal_id uuid default null
)
returns table(id uuid, codigo_caja integer, prefijo text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cliente_id uuid;
  v_codigo_corto text;
  v_id uuid;
  v_codigo_caja int;
begin
  v_cliente_id := public.current_cliente_id();
  if v_cliente_id is null then
    raise exception 'No autorizado';
  end if;
  if p_tipo not in ('ELECTRON', 'PWA') then
    raise exception 'Tipo de instalación desconocido: %', p_tipo;
  end if;

  -- Serializa la asignación del número de caja por negocio: sin este lock,
  -- dos cajas registrándose en el mismo instante leerían el mismo max()+1.
  perform pg_advisory_xact_lock(hashtext(v_cliente_id::text));

  select i.id, i.codigo_caja into v_id, v_codigo_caja
  from public.instalaciones i
  where i.cliente_id = v_cliente_id and i.machine_id = p_machine_id and i.tipo = p_tipo;

  if v_id is not null and v_codigo_caja is null then
    select coalesce(max(i.codigo_caja), 0) + 1 into v_codigo_caja
    from public.instalaciones i where i.cliente_id = v_cliente_id;
  end if;

  if v_id is not null then
    update public.instalaciones i set
      version = coalesce(p_version, i.version),
      sucursal_id = coalesce(p_sucursal_id, i.sucursal_id),
      estado = 'ACTIVA',
      ultima_conexion = now(),
      codigo_caja = v_codigo_caja
    where i.id = v_id;
  else
    select coalesce(max(i.codigo_caja), 0) + 1 into v_codigo_caja
    from public.instalaciones i where i.cliente_id = v_cliente_id;

    insert into public.instalaciones as i (cliente_id, sucursal_id, machine_id, tipo, version, estado, activada_en, ultima_conexion, codigo_caja)
    values (v_cliente_id, p_sucursal_id, p_machine_id, p_tipo, p_version, 'ACTIVA', now(), now(), v_codigo_caja)
    returning i.id into v_id;
  end if;

  select c.codigo_corto into v_codigo_corto from public.clientes_pos c where c.id = v_cliente_id;

  return query select v_id, v_codigo_caja, (v_codigo_corto || lpad(v_codigo_caja::text, 2, '0'));
end;
$function$;

revoke all on function public.registrar_instalacion(text, text, text, uuid) from public, anon;
grant execute on function public.registrar_instalacion(text, text, text, uuid) to authenticated;
