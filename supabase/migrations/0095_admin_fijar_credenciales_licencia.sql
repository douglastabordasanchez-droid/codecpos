-- 🐛 FIX raíz: un cliente que se registró por "Probar 14 días gratis"
-- (crear_cuenta_prueba, migración 0052) o fue creado por staff
-- (admin_crear_cliente_base, migración 0091) NUNCA queda con fila en
-- `usuarios_clientes` -- esa tabla legacy solo la usan cuentas muy antiguas.
-- Sin fila ahí, `resolver_login_licencia` (migración 0014) jamás puede
-- resolver un "usuario" corto (no-correo) a su cliente_id, así que ese
-- cliente NUNCA puede iniciar sesión con nada que no sea exactamente su
-- correo de registro -- y si por confusión usa un "usuario" corto (como
-- haría cualquier negocio acostumbrado a un login tipo POS clásico), queda
-- bloqueado en Electron y en la PWA sin ningún camino de recuperación,
-- porque tampoco existe ninguna función para escribir en `usuarios_clientes`
-- después de la creación del cliente.
--
-- Esta función le da a staff (Panel Desarrollador) un botón único para fijar
-- (o corregir) el usuario/contraseña de licencia de un cliente, y en el
-- mismo paso sincroniza la cuenta sintética de Supabase Auth del dueño
-- (mismo mecanismo que provisionar_dueno_pwa, migración 0014) para que
-- Electron, la PWA y el usuario/contraseña de licencia queden SIEMPRE
-- alineados entre sí -- resuelve tanto la reparación puntual de un cliente
-- bloqueado como el caso general de cualquier cliente futuro con el mismo
-- problema.
create or replace function public.admin_fijar_credenciales_licencia(
  p_cliente_id uuid,
  p_username text,
  p_password text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions'
as $$
declare
  v_nombre_negocio text;
  v_username text := trim(p_username);
begin
  if not public.es_staff_actual() then
    raise exception 'No autorizado';
  end if;
  if public.nivel_staff_actual() = 'LECTURA' then
    raise exception 'Tu nivel de acceso es de solo lectura';
  end if;
  if v_username is null or length(v_username) < 3 then
    raise exception 'El usuario debe tener al menos 3 caracteres';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'La contraseña debe tener al menos 6 caracteres';
  end if;

  select nombre_negocio into v_nombre_negocio
  from public.clientes_pos where id = p_cliente_id;
  if v_nombre_negocio is null then
    raise exception 'Cliente no encontrado';
  end if;

  -- Un solo usuario de licencia por cliente -- reemplaza cualquier fila
  -- previa (username antiguo, típicamente huérfano de una instalación que
  -- nunca llegó a usarse) en vez de acumular filas obsoletas.
  delete from public.usuarios_clientes where cliente_id = p_cliente_id;
  insert into public.usuarios_clientes (cliente_id, username, "contraseña", rol, activo)
  values (p_cliente_id, v_username, p_password, 'super_usuario', true);

  -- Sincroniza (o crea si nunca existió) la cuenta sintética del dueño en
  -- Supabase Auth, para que la MISMA credencial sirva también en la PWA.
  perform public.provisionar_dueno_pwa(p_cliente_id, v_username, p_password, v_nombre_negocio);

  perform public.registrar_auditoria(
    'FIJAR_CREDENCIALES_LICENCIA', p_cliente_id, 'EXITO',
    jsonb_build_object('username', v_username)
  );
end;
$$;

revoke all on function public.admin_fijar_credenciales_licencia(uuid, text, text) from public, anon;
grant execute on function public.admin_fijar_credenciales_licencia(uuid, text, text) to authenticated;
