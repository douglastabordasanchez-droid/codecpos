-- Mantiene la prueba administrada desde la App y el motor comercial sincronizados.
-- La licencia comercial es la fuente de verdad.

create table if not exists public.avisos_licencia (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  licencia_id uuid not null references public.licencias(id) on delete cascade,
  tipo text not null check (tipo in ('RENOVACION_PROXIMA')),
  programado_para timestamptz not null,
  enviado_en timestamptz,
  created_at timestamptz not null default now(),
  unique (licencia_id, tipo)
);

alter table public.avisos_licencia enable row level security;
drop policy if exists "avisos licencia staff" on public.avisos_licencia;
create policy "avisos licencia staff" on public.avisos_licencia
  for all to authenticated
  using (public.es_staff_actual())
  with check (public.es_staff_actual());

create or replace function public.activar_prueba_admin(p_cliente_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_plan_id uuid;
  v_anterior public.licencias;
  v_nueva_id uuid;
  v_inicio timestamptz := now();
  v_fin timestamptz := v_inicio + interval '14 days';
begin
  if not public.es_staff_actual() then
    raise exception 'No autorizado para activar pruebas';
  end if;

  select id into v_plan_id from public.planes where codigo = 'PREMIUM' and activo;
  if v_plan_id is null then raise exception 'Plan Premium no disponible'; end if;
  select * into v_anterior from public.licencias where cliente_id = p_cliente_id and vigente = true;

  if v_anterior.id is not null then
    update public.licencias set vigente = false, fecha_fin_vigencia = v_inicio,
      motivo_fin = 'Reemplazada por prueba gratuita de 14 días', updated_at = v_inicio
    where id = v_anterior.id;
  end if;

  insert into public.licencias (
    cliente_id, plan_id, modalidad, estado, precio_aplicado, vigente, origen,
    fecha_inicio, fecha_fin_periodo_actual, fecha_expiracion, motivo, created_by
  ) values (
    p_cliente_id, v_plan_id, 'MENSUAL', 'TRIAL', 0, true, 'MANUAL_STAFF',
    v_inicio, v_fin, v_fin, 'Prueba gratuita de 14 días activada por staff', auth.uid()
  ) returning id into v_nueva_id;

  insert into public.avisos_licencia (cliente_id, licencia_id, tipo, programado_para)
  values (p_cliente_id, v_nueva_id, 'RENOVACION_PROXIMA', v_fin - interval '2 days');

  insert into public.historial_comercial (cliente_id, licencia_id, tipo_evento, datos_anteriores, datos_nuevos, motivo, actor)
  values (
    p_cliente_id, v_nueva_id, 'ACTIVACION',
    case when v_anterior.id is not null then to_jsonb(v_anterior) else null end,
    jsonb_build_object('estado', 'TRIAL', 'dias', 14, 'fecha_inicio', v_inicio, 'fecha_fin', v_fin),
    'Prueba gratuita de 14 días activada desde Panel Desarrollador', auth.uid()
  );

  return v_nueva_id;
end;
$function$;

grant execute on function public.activar_prueba_admin(uuid) to authenticated;

create or replace function public.generar_avisos_licencia()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count integer;
begin
  insert into public.avisos_licencia (cliente_id, licencia_id, tipo, programado_para)
  select l.cliente_id, l.id, 'RENOVACION_PROXIMA', l.fecha_fin_periodo_actual - interval '2 days'
  from public.licencias l
  where l.vigente and l.fecha_fin_periodo_actual is not null
    and l.fecha_fin_periodo_actual between now() + interval '1 day' and now() + interval '2 days'
  on conflict (licencia_id, tipo) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.generar_avisos_licencia() from public, anon, authenticated;

select cron.schedule(
  'avisos-renovacion-licencias',
  '0 * * * *',
  $$select public.generar_avisos_licencia();$$
)
where not exists (select 1 from cron.job where jobname = 'avisos-renovacion-licencias');
