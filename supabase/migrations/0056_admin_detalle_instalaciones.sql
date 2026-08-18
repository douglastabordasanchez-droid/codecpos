-- Fase 5 ampliada, punto 33: el Admin debe poder ver, para cada cliente,
-- si descargó Electron, qué versión usa y cuándo se conectó por última
-- vez -- ahora que `instalaciones` sí se llena de verdad (migración 0055).
begin;

create or replace function public.admin_detalle_cliente(p_cliente_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v jsonb;
begin
  if not public.es_staff_actual() then raise exception 'No autorizado'; end if;
  select jsonb_build_object(
    'cliente', (select to_jsonb(c) from clientes_pos c where c.id = p_cliente_id),
    'licencia_vigente', (
      select jsonb_build_object(
        'plan_codigo', pl.codigo, 'modalidad', l.modalidad, 'estado', l.estado,
        'precio_aplicado', l.precio_aplicado, 'precio_efectivo', public.precio_efectivo_licencia(l.id),
        'fecha_inicio', l.fecha_inicio, 'fecha_fin_periodo_actual', l.fecha_fin_periodo_actual,
        'origen', l.origen
      )
      from licencias l join planes pl on pl.id = l.plan_id
      where l.cliente_id = p_cliente_id and l.vigente = true
    ),
    'sucursales', (select jsonb_build_object('total', count(*), 'limite', public.limite_sucursales_totales(p_cliente_id)) from sucursales where cliente_id = p_cliente_id and estado = 'ACTIVA'),
    'usuarios', (select jsonb_build_object('total', count(*), 'limite', public.limite_empleados_totales(p_cliente_id)) from empleados where cliente_id = p_cliente_id and activo),
    'app_movil', public.entitlement_habilitado(p_cliente_id, 'MOBILE_APP'),
    'addons_activos', (select coalesce(jsonb_agg(jsonb_build_object('codigo', a.codigo, 'nombre', a.nombre, 'cantidad', ac.cantidad, 'precio_aplicado', ac.precio_aplicado)), '[]'::jsonb) from addons_cliente ac join addons a on a.id = ac.addon_id where ac.cliente_id = p_cliente_id and ac.estado = 'ACTIVO'),
    'instalaciones', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'tipo', i.tipo, 'version', i.version, 'estado', i.estado,
        'activada_en', i.activada_en, 'ultima_conexion', i.ultima_conexion
      ) order by i.ultima_conexion desc nulls last), '[]'::jsonb)
      from instalaciones i where i.cliente_id = p_cliente_id
    ),
    'historial', (select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at desc), '[]'::jsonb) from historial_comercial h where h.cliente_id = p_cliente_id)
  ) into v;
  return v;
end;
$function$;

commit;
