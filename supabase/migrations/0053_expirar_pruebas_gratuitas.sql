-- Fase 5, punto 4/5/9: cuando vence una prueba de 14 días, el backend (no el
-- frontend) decide el cambio de estado -- corre por pg_cron cada hora.
-- PRUEBA -> VENCIDA (clientes_pos) / TRIAL -> EXPIRADA (licencias), sin
-- borrar ningún dato del cliente, dejando registro en historial_comercial
-- para que el cliente pueda ver planes/suscribirse/contactar soporte
-- después (Admin Web ya puede filtrar por estos estados).

begin;

alter table public.historial_comercial drop constraint historial_comercial_tipo_evento_check;
alter table public.historial_comercial add constraint historial_comercial_tipo_evento_check
  check (tipo_evento = any (array[
    'CREACION_LICENCIA','CAMBIO_PLAN','CAMBIO_MODALIDAD','UPGRADE','DOWNGRADE','CANCELACION',
    'REACTIVACION','PROMOCION_APLICADA','CAMBIO_PRECIO','CAMBIO_SUCURSAL','CAMBIO_USUARIO',
    'ACTIVACION','SUSPENSION','ADDON_AGREGADO','ADDON_CANCELADO','MIGRACION_LEGACY','PRUEBA_VENCIDA'
  ]));

create or replace function public.expirar_pruebas_vencidas()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_afectados int := 0;
  v_lic record;
begin
  for v_lic in
    select l.id, l.cliente_id
    from public.licencias l
    where l.estado = 'TRIAL' and l.vigente = true and l.fecha_fin_periodo_actual < now()
  loop
    update public.licencias set estado = 'EXPIRADA', updated_at = now() where id = v_lic.id;

    update public.clientes_pos set
      estado = 'VENCIDA', en_prueba = false, dias_prueba_restantes = 0, updated_at = now()
    where id = v_lic.cliente_id;

    insert into public.historial_comercial (cliente_id, licencia_id, tipo_evento, motivo)
    values (v_lic.cliente_id, v_lic.id, 'PRUEBA_VENCIDA', 'Prueba gratuita de 14 días vencida automáticamente');

    v_afectados := v_afectados + 1;
  end loop;
  return v_afectados;
end;
$function$;

revoke all on function public.expirar_pruebas_vencidas() from public, anon, authenticated;

select cron.schedule(
  'expirar-pruebas-gratuitas',
  '0 * * * *',
  $$select public.expirar_pruebas_vencidas();$$
);

commit;
