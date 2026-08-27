-- El panel Admin Web (UsuariosPage.tsx) mostraba nombre/rol/estado de cada
-- empleado pero nunca el correo (usuario de acceso) -- staff no tenía forma
-- de saber CUÁL es el usuario de login sin ir a buscarlo en otro lado.
-- `auth.users` nunca se expone directo vía RLS/PostgREST (correcto, es
-- schema interno) -- este RPC es el único punto autorizado para leer el
-- email desde el panel de soporte, gateado igual que el resto (es_staff_actual).

create or replace function public.admin_listar_usuarios()
returns table (
  id uuid,
  nombre_completo text,
  email text,
  rol text,
  activo boolean,
  es_staff_codec boolean,
  cliente_id uuid,
  nombre_negocio text,
  plan text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.nombre_completo,
    u.email,
    e.rol,
    e.activo,
    e.es_staff_codec,
    c.id as cliente_id,
    c.nombre_negocio,
    c.plan
  from public.empleados e
  join auth.users u on u.id = e.id
  left join public.clientes_pos c on c.id = e.cliente_id
  where public.es_staff_actual()
  order by e.nombre_completo;
$$;

revoke all on function public.admin_listar_usuarios() from public, anon;
grant execute on function public.admin_listar_usuarios() to authenticated;
