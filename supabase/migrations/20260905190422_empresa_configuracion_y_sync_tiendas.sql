-- Perfil operativo compartido por todas las instalaciones autorizadas de un negocio.
-- Los secretos de integraciones no se almacenan aquí: permanecen locales.
create table if not exists public.empresa_configuraciones (
  cliente_id uuid primary key references public.clientes_pos(id) on delete cascade,
  datos jsonb not null default '{}'::jsonb,
  logo_path text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.empresa_configuraciones enable row level security;
revoke all on public.empresa_configuraciones from anon, authenticated;
grant select, insert, update on public.empresa_configuraciones to authenticated;
drop policy if exists empresa_configuraciones_select_tenant on public.empresa_configuraciones;
create policy empresa_configuraciones_select_tenant on public.empresa_configuraciones for select to authenticated using (cliente_id = (select public.current_cliente_id()));
drop policy if exists empresa_configuraciones_insert_tenant on public.empresa_configuraciones;
create policy empresa_configuraciones_insert_tenant on public.empresa_configuraciones for insert to authenticated with check (cliente_id = (select public.current_cliente_id()));
drop policy if exists empresa_configuraciones_update_tenant on public.empresa_configuraciones;
create policy empresa_configuraciones_update_tenant on public.empresa_configuraciones for update to authenticated using (cliente_id = (select public.current_cliente_id())) with check (cliente_id = (select public.current_cliente_id()));

alter table public.tiendas add column if not exists tipo text not null default 'tienda' check (tipo in ('tienda', 'bodega'));
alter table public.tiendas enable row level security;
revoke all on public.tiendas from anon, authenticated;
grant select, insert, update on public.tiendas to authenticated;
drop policy if exists tiendas_tenant on public.tiendas;
drop policy if exists tiendas_select_tenant on public.tiendas;
drop policy if exists tiendas_insert_tenant on public.tiendas;
drop policy if exists tiendas_update_tenant on public.tiendas;
create policy tiendas_select_tenant on public.tiendas for select to authenticated using (cliente_id = (select public.current_cliente_id()));
create policy tiendas_insert_tenant on public.tiendas for insert to authenticated with check (cliente_id = (select public.current_cliente_id()));
create policy tiendas_update_tenant on public.tiendas for update to authenticated using (cliente_id = (select public.current_cliente_id())) with check (cliente_id = (select public.current_cliente_id()));

insert into storage.buckets (id, name, public) values ('empresa-logos', 'empresa-logos', false) on conflict (id) do update set public = false;
drop policy if exists empresa_logos_select_tenant on storage.objects;
drop policy if exists empresa_logos_insert_tenant on storage.objects;
drop policy if exists empresa_logos_update_tenant on storage.objects;
create policy empresa_logos_select_tenant on storage.objects for select to authenticated using (bucket_id = 'empresa-logos' and (storage.foldername(name))[1] = (select public.current_cliente_id())::text);
create policy empresa_logos_insert_tenant on storage.objects for insert to authenticated with check (bucket_id = 'empresa-logos' and (storage.foldername(name))[1] = (select public.current_cliente_id())::text);
create policy empresa_logos_update_tenant on storage.objects for update to authenticated using (bucket_id = 'empresa-logos' and (storage.foldername(name))[1] = (select public.current_cliente_id())::text) with check (bucket_id = 'empresa-logos' and (storage.foldername(name))[1] = (select public.current_cliente_id())::text);
