-- 0124 · El consecutivo DIAN también se puede pedir desde Electron.
--
-- siguiente_consecutivo_dian buscaba el negocio solo en empleados (los
-- usuarios de la web). Electron entra con la identidad de sincronización del
-- equipo (sync_identidades), así que la función respondía «No autenticado»
-- y ninguna factura electrónica salía desde el computador (Distribuciones BM,
-- 2026-10-22: FE000001 a FE000003 sin factura, DBM sin avanzar). Ahora usa
-- current_cliente_id(), que reconoce las dos identidades, igual que las
-- políticas de las tablas de facturación.

create or replace function public.siguiente_consecutivo_dian(p_resolucion_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
  v_consecutivo bigint;
  v_rango_desde bigint;
  v_rango_hasta bigint;
  v_estado text;
begin
  v_cliente_id := public.current_cliente_id();
  if v_cliente_id is null then
    raise exception 'No autenticado';
  end if;

  update public.perfiles_fiscales_resoluciones
  set consecutivo_actual = consecutivo_actual + 1
  where id = p_resolucion_id and cliente_id = v_cliente_id
  returning consecutivo_actual, rango_desde, rango_hasta, estado
  into v_consecutivo, v_rango_desde, v_rango_hasta, v_estado;

  if v_consecutivo is null then
    raise exception 'Resolución no encontrada o no pertenece a este negocio';
  end if;
  if v_estado <> 'activa' then
    raise exception 'La resolución no está activa (estado: %)', v_estado;
  end if;
  if v_consecutivo > (v_rango_hasta - v_rango_desde + 1) then
    update public.perfiles_fiscales_resoluciones set estado = 'agotada' where id = p_resolucion_id;
    raise exception 'Se agotó el rango autorizado de esta resolución';
  end if;

  return v_rango_desde + v_consecutivo - 1;
end;
$$;

grant execute on function public.siguiente_consecutivo_dian(uuid) to authenticated;
