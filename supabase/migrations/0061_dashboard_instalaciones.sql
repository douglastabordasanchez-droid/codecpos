-- Métricas globales de instalaciones en el dashboard del Admin Web: hasta
-- ahora `admin_dashboard_resumen()` no exponía nada de la tabla
-- `instalaciones` (Electron, y desde ahora PWA/App Android -- ver
-- src/pwa/lib/registrarInstalacion.ts). Bloque puramente aditivo, mismo
-- patrón que el resto de la función.
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
    ),
    'instalaciones', jsonb_build_object(
      'total', (select count(*) from instalaciones),
      'electron', (select count(*) from instalaciones where tipo = 'ELECTRON'),
      'pwa', (select count(*) from instalaciones where tipo = 'PWA'),
      'activas_7d', (select count(*) from instalaciones where ultima_conexion > now() - interval '7 days'),
      'clientes_con_instalacion', (select count(distinct cliente_id) from instalaciones),
      'nuevas_30d', (select count(*) from instalaciones where activada_en > now() - interval '30 days')
    )
  ) into v;
  return v;
end;
$function$;

commit;
