-- Bucket de fotos de producto para Artes Gráficas — mismo patrón que
-- productos-fotos y empleados-fotos.
insert into storage.buckets (id, name, public)
values ('artes-graficas-fotos', 'artes-graficas-fotos', true)
on conflict (id) do nothing;

drop policy if exists artes_graficas_fotos_public_read on storage.objects;
create policy artes_graficas_fotos_public_read on storage.objects
  for select using (bucket_id = 'artes-graficas-fotos');

drop policy if exists artes_graficas_fotos_auth_write on storage.objects;
create policy artes_graficas_fotos_auth_write on storage.objects
  for insert with check (bucket_id = 'artes-graficas-fotos' and auth.role() = 'authenticated');

drop policy if exists artes_graficas_fotos_auth_update on storage.objects;
create policy artes_graficas_fotos_auth_update on storage.objects
  for update using (bucket_id = 'artes-graficas-fotos' and auth.role() = 'authenticated');
