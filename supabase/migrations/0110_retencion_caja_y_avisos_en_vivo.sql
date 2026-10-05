-- Caja (Electron) más liviana: guarda en el computador solo el último mes de
-- ventas, gastos, cierres y devoluciones (en la nube sigue todo), y la
-- sincronización deja de revisar 21 cosas cada 30 segundos.
--
-- 1) Bitácora de avisos de limpieza: cada aviso que la caja le muestra al
--    cliente ("el día X se borrará del computador lo anterior a Y"), cada
--    descarga y cada limpieza queda aquí con la hora del SERVIDOR, para poder
--    demostrar cuándo y cuántas veces se le avisó. Nadie la puede editar ni
--    borrar desde las apps: solo agregar y consultar.
-- 2) Avisos en vivo (Realtime) de las tablas que la caja ahora escucha en vez
--    de preguntar cada 30 segundos.

create table if not exists public.bitacora_retencion_datos (
  id bigserial primary key,
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  registrado_en timestamptz not null default now(),   -- hora del servidor (la prueba)
  hora_equipo timestamptz,                              -- hora que tenía el computador
  tipo text not null check (tipo in ('aviso', 'descarga', 'limpieza', 'carpeta_autorizada', 'carpeta_retirada', 'error')),
  fecha_limpieza timestamptz,                           -- cuándo se borra (o se borró)
  terminal text,
  usuario text,
  detalle jsonb not null default '{}'::jsonb
);
create index if not exists bitacora_retencion_datos_cliente_idx on public.bitacora_retencion_datos (cliente_id, registrado_en desc);

alter table public.bitacora_retencion_datos enable row level security;

drop policy if exists bitacora_retencion_select on public.bitacora_retencion_datos;
create policy bitacora_retencion_select on public.bitacora_retencion_datos
  for select to authenticated using (cliente_id = public.current_cliente_id());

drop policy if exists bitacora_retencion_insert on public.bitacora_retencion_datos;
create policy bitacora_retencion_insert on public.bitacora_retencion_datos
  for insert to authenticated with check (cliente_id = public.current_cliente_id());

revoke all on public.bitacora_retencion_datos from anon;
revoke update, delete on public.bitacora_retencion_datos from authenticated;
grant select, insert on public.bitacora_retencion_datos to authenticated;
grant usage, select on sequence public.bitacora_retencion_datos_id_seq to authenticated;

-- La hora del registro siempre es la del servidor, aunque la caja mande otra.
create or replace function public._bitacora_retencion_hora_servidor()
returns trigger
language plpgsql
as $$
begin
  new.registrado_en := now();
  return new;
end;
$$;
drop trigger if exists bitacora_retencion_hora_servidor on public.bitacora_retencion_datos;
create trigger bitacora_retencion_hora_servidor
  before insert on public.bitacora_retencion_datos
  for each row execute function public._bitacora_retencion_hora_servidor();

do $$
declare
  t text;
begin
  foreach t in array array['cierres_caja', 'cuentas_cartera', 'clientes_fidelizacion', 'empresa_configuraciones', 'bitacora_retencion_datos'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
exception when undefined_object then null;
end $$;
