-- Endurecimiento de la 0099: Supabase concede permisos por defecto a `anon`
-- sobre toda tabla y función nuevas de `public`. RLS ya impedía que un
-- anónimo viera o causara nada (current_cliente_id() le da NULL), pero no
-- hay razón para que tenga el permiso: mismo criterio de las migraciones
-- 0050/0051.

revoke all on public.documentos_electronicos from anon;

revoke execute on function public.causar_documento_electronico(uuid, text, text, boolean, timestamptz, uuid, text, jsonb) from public, anon;
revoke execute on function public.revertir_causacion_documento(uuid) from public, anon;
grant execute on function public.causar_documento_electronico(uuid, text, text, boolean, timestamptz, uuid, text, jsonb) to authenticated;
grant execute on function public.revertir_causacion_documento(uuid) to authenticated;
