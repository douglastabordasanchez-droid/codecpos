-- Conexión remota de soporte con Electron (2026-11-22, caso Hojaldrados).
--
-- El equipo de Codec deja una orden en soporte_comandos y la caja de ese
-- negocio la toma (al abrir, cada minuto y por realtime), la ejecuta y
-- escribe el resultado. Así se diagnostica y se repara un PC ya instalado
-- sin compilar de nuevo ni entrar por TeamViewer.
--
-- Solo staff crea órdenes. La caja solo ve y actualiza las de su propio
-- negocio, nunca crea. Las acciones son una lista cerrada que la caja
-- conoce (src/app/lib/soporteRemoto.ts): no se ejecuta código arbitrario.

create table if not exists public.soporte_comandos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  machine_id text,                       -- null = la primera caja del negocio que la tome
  accion text not null check (accion in (
    'diagnostico', 'logs', 'subir_respaldo_actual', 'subir_respaldo_blindado',
    'restaurar_respaldo_nube', 'restaurar_respaldo_blindado', 'recargar'
  )),
  parametros jsonb not null default '{}'::jsonb,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'tomado', 'hecho', 'error')),
  resultado jsonb,
  tomado_por_machine text,
  creado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  tomado_en timestamptz,
  terminado_en timestamptz
);

create index if not exists soporte_comandos_pendientes
  on public.soporte_comandos (cliente_id, estado, created_at);

alter table public.soporte_comandos enable row level security;

drop policy if exists soporte_comandos_staff on public.soporte_comandos;
create policy soporte_comandos_staff on public.soporte_comandos
  for all to authenticated
  using (public.es_staff_actual())
  with check (public.es_staff_actual());

drop policy if exists soporte_comandos_caja_lee on public.soporte_comandos;
create policy soporte_comandos_caja_lee on public.soporte_comandos
  for select to authenticated
  using (cliente_id = public.current_cliente_id());

-- La caja solo cambia estado y resultado de las órdenes de su negocio.
drop policy if exists soporte_comandos_caja_responde on public.soporte_comandos;
create policy soporte_comandos_caja_responde on public.soporte_comandos
  for update to authenticated
  using (cliente_id = public.current_cliente_id() and estado in ('pendiente', 'tomado'))
  with check (cliente_id = public.current_cliente_id());

grant select, insert, update, delete on public.soporte_comandos to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'soporte_comandos'
  ) then
    alter publication supabase_realtime add table public.soporte_comandos;
  end if;
end $$;

-- Los respaldos que sube la caja por orden de soporte entran a respaldos_nube
-- SIN borrar los anteriores (la subida normal sí los reemplaza). Las
-- políticas actuales de respaldos-nube ya dejan a la caja subir y leer en la
-- carpeta <cliente_id>/ de su negocio, así que no hace falta tocarlas.
