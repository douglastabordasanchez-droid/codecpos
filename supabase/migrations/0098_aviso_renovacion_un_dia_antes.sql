-- El aviso de renovación (Electron + PWA, `avisos_licencia`) se generaba a
-- 2 días del vencimiento (`generar_avisos_licencia`, migración 0082). El
-- dueño de un negocio real (Papotas co) pidió que le llegue "el día antes"
-- -- se recorta la ventana a 1 día. No toca `activar_prueba_admin` (aviso al
-- ACTIVAR una prueba nueva, sigue a 2 días como siempre); esto solo cambia el
-- barrido periódico que cubre TODAS las licencias vigentes por vencer
-- (pagas y de prueba).

begin;

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
  select l.cliente_id, l.id, 'RENOVACION_PROXIMA', l.fecha_fin_periodo_actual - interval '1 day'
  from public.licencias l
  where l.vigente and l.fecha_fin_periodo_actual is not null
    and l.fecha_fin_periodo_actual between now() and now() + interval '1 day'
  on conflict (licencia_id, tipo) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

commit;
