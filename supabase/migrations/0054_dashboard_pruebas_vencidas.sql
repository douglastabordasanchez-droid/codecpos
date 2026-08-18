-- Fase 5, punto 22: admin_dashboard_resumen() ya contaba clientes en prueba
-- y cancelados, pero no distinguía "prueba vencida" (estado=VENCIDA, distinto
-- de CANCELADA) como indicador propio.
begin;

create or replace function public.admin_dashboard_resumen()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v jsonb;
begin
  if not public.es_staff_actual() then raise exception 'No autorizado'; end if;
  select jsonb_build_object(
    'clientes', jsonb_build_object(
      'total', (select count(*) from clientes_pos),
      'activos', (select count(*) from clientes_pos where estado = 'ACTIVA'),
      'en_prueba', (select count(*) from clientes_pos where estado = 'PRUEBA'),
      'en_prueba_vencida', (select count(*) from clientes_pos where estado = 'VENCIDA'),
      'cancelados', (select count(*) from clientes_pos where estado = 'CANCELADA'),
      'suspendidos', (select count(*) from clientes_pos where estado = 'SUSPENDIDA'),
      'vitalicios', (select count(*) from licencias where modalidad = 'VITALICIA' and vigente = true)
    ),
    'suscripciones', jsonb_build_object(
      'basico', (select count(*) from licencias l join planes p on p.id = l.plan_id where p.codigo = 'BASICO' and l.vigente = true),
      'premium', (select count(*) from licencias l join planes p on p.id = l.plan_id where p.codigo = 'PREMIUM' and l.vigente = true),
      'con_promocion_activa', (select count(*) from promociones_comerciales_clientes where estado = 'VIGENTE' and now() < fecha_fin_beneficio),
      'proximas_renovaciones_30d', (select count(*) from licencias where vigente = true and fecha_fin_periodo_actual between now() and now() + interval '30 days'),
      'cancelaciones_30d', (select count(*) from licencias where estado = 'CANCELADA' and fecha_cancelacion > now() - interval '30 days')
    ),
    'sucursales', jsonb_build_object(
      'total', (select count(*) from sucursales),
      'activas', (select count(*) from sucursales where estado = 'ACTIVA'),
      'adicionales_contratadas', (select coalesce(sum(cantidad), 0) from addons_cliente ac join addons a on a.id = ac.addon_id where a.codigo = 'SUCURSAL_ADICIONAL' and ac.estado = 'ACTIVO')
    ),
    'licencias', jsonb_build_object(
      'activas', (select count(*) from licencias where vigente = true and estado = 'ACTIVA'),
      'vencidas', (select count(*) from licencias where vigente = true and estado = 'EXPIRADA'),
      'suspendidas', (select count(*) from licencias where vigente = true and estado = 'SUSPENDIDA')
    ),
    'soporte', jsonb_build_object(
      'solicitudes_totales', (select count(*) from solicitudes_soporte),
      'pendientes', (select count(*) from solicitudes_soporte where estado = 'PENDIENTE'),
      'atendidas', (select count(*) from solicitudes_soporte where estado = 'ATENDIDA'),
      'clientes_con_soporte_activo', (select count(distinct cliente_id) from addons_cliente ac join addons a on a.id = ac.addon_id where a.categoria = 'SOPORTE' and ac.estado = 'ACTIVO')
    )
  ) into v;
  return v;
end;
$function$;

commit;
