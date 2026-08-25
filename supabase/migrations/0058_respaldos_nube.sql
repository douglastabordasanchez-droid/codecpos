-- Respaldo automático a la nube (Supabase Storage), complemento del blindaje
-- local (backupManager.js en C:\CodecStudio\CODECPOS\backups\). A diferencia
-- de los buckets de fotos (productos-fotos, empleados-fotos,
-- artes-graficas-fotos), este bucket es PRIVADO: son datos completos del
-- negocio (productos, ventas, usuarios), no imágenes públicas.
--
-- Diseñado para el plan gratuito de Supabase (50GB): solo se guarda UN
-- respaldo por negocio a la vez (backupCloudService.ts borra el anterior
-- antes de subir uno nuevo, y borra el actual apenas el cliente lo descarga).

insert into storage.buckets (id, name, public)
values ('respaldos-nube', 'respaldos-nube', false)
on conflict (id) do nothing;

-- Cada objeto vive en la ruta "{cliente_id}/archivo" — la política exige que
-- el primer segmento de la ruta coincida con el negocio del usuario autenticado,
-- igual de estricto que el resto de tablas multi-tenant del proyecto.
drop policy if exists respaldos_nube_tenant_select on storage.objects;
create policy respaldos_nube_tenant_select on storage.objects
  for select using (bucket_id = 'respaldos-nube' and (storage.foldername(name))[1] = public.current_cliente_id()::text);

drop policy if exists respaldos_nube_tenant_insert on storage.objects;
create policy respaldos_nube_tenant_insert on storage.objects
  for insert with check (bucket_id = 'respaldos-nube' and (storage.foldername(name))[1] = public.current_cliente_id()::text);

drop policy if exists respaldos_nube_tenant_delete on storage.objects;
create policy respaldos_nube_tenant_delete on storage.objects
  for delete using (bucket_id = 'respaldos-nube' and (storage.foldername(name))[1] = public.current_cliente_id()::text);

-- Metadata de cada respaldo subido (para listar/descargar/borrar desde la UI).
create table if not exists public.respaldos_nube (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  storage_path text not null,
  nombre_archivo text not null,
  tamano_bytes bigint not null default 0,
  creado_en timestamptz not null default now()
);
create index if not exists idx_respaldos_nube_cliente on public.respaldos_nube(cliente_id);

alter table public.respaldos_nube enable row level security;

drop policy if exists respaldos_nube_tenant on public.respaldos_nube;
create policy respaldos_nube_tenant on public.respaldos_nube
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());
