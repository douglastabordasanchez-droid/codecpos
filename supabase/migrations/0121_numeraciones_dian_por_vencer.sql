-- 0121 · Numeraciones DIAN por vencer, para el panel de Codec Studio.
--
-- Una resolución de numeración vence en su fecha aunque le queden números
-- (Distribuciones BM: DBM vence el 15 nov 2026). La renueva el contribuyente
-- en el MUISCA, pero si nadie se acuerda la DIAN empieza a rechazar sus
-- facturas. El negocio ve su propio aviso en la app; esto le da al staff la
-- lista de todos los negocios en producción con una numeración activa que
-- vence en los próximos días (o que ya venció sin reemplazo).

create or replace function public.numeraciones_dian_por_vencer(p_dias integer default 15)
returns table (
  cliente_id uuid,
  nombre_negocio text,
  prefijo text,
  resolucion_numero text,
  vigencia_hasta date,
  dias_restantes integer,
  numeros_restantes bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.es_staff_actual() then
    raise exception 'No autorizado';
  end if;

  return query
  select r.cliente_id, c.nombre_negocio, r.prefijo, r.resolucion_numero, r.vigencia_hasta,
         (r.vigencia_hasta - (now() at time zone 'America/Bogota')::date)::integer,
         (r.rango_hasta - r.rango_desde + 1) - r.consecutivo_actual
  from public.perfiles_fiscales_resoluciones r
  join public.perfiles_fiscales p on p.id = r.perfil_fiscal_id
  join public.clientes_pos c on c.id = r.cliente_id
  where r.estado = 'activa'
    and p.activo
    and p.ambiente = 'produccion'
    and r.vigencia_hasta is not null
    and r.vigencia_hasta <= (now() at time zone 'America/Bogota')::date + greatest(coalesce(p_dias, 15), 0)
  order by r.vigencia_hasta;
end;
$function$;

revoke all on function public.numeraciones_dian_por_vencer(integer) from public, anon;
grant execute on function public.numeraciones_dian_por_vencer(integer) to authenticated;
