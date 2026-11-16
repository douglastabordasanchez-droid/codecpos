-- 0151 · Panel de Codec Studio: ver las sedes reales de los negocios (tabla
-- tiendas) con su estado de cobro (0150) para marcarlas pagadas.
create or replace function public.admin_listar_sedes()
returns table (
  cliente_id uuid, nombre_negocio text, local_id text, nombre text, es_principal boolean,
  activo boolean, cobro_estado text, prueba_hasta timestamptz, dias_restantes int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.empleados where id = auth.uid() and coalesce(es_staff_codec, false)) then
    raise exception 'No autorizado';
  end if;
  return query
  select t.cliente_id, cp.nombre_negocio, t.local_id, t.nombre, t.es_principal, t.activo,
    case when t.cobro_estado = 'prueba' and t.prueba_hasta <= now() then 'vencida' else t.cobro_estado end,
    t.prueba_hasta,
    case when t.cobro_estado = 'prueba' then greatest(ceil(extract(epoch from (t.prueba_hasta - now())) / 86400)::int, 0) end
  from public.tiendas t join public.clientes_pos cp on cp.id = t.cliente_id
  order by (t.cobro_estado = 'prueba') desc, cp.nombre_negocio, t.es_principal desc, t.nombre;
end;
$$;
grant execute on function public.admin_listar_sedes() to authenticated;
