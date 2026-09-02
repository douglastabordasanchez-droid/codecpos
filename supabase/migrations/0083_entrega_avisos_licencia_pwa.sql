-- Entrega avisos de renovación al negocio mediante la PWA.
-- El cliente solo puede leer y marcar como atendidos sus propios avisos.

 drop policy if exists "avisos licencia staff" on public.avisos_licencia;
 create policy "avisos licencia negocio o staff" on public.avisos_licencia
   for all to authenticated
   using (cliente_id = public.current_cliente_id() or public.es_staff_actual())
   with check (cliente_id = public.current_cliente_id() or public.es_staff_actual());

 alter publication supabase_realtime add table public.avisos_licencia;
