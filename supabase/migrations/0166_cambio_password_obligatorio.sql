-- Contraseña genérica puesta por Codec: obligar a cambiarla al entrar.
--
-- Cuando staff fija una contraseña (Restablecer contraseña, Fijar
-- credenciales de licencia, crear empleado o crear cliente desde el panel),
-- la cuenta queda marcada en auth.users.raw_app_meta_data con
-- debe_cambiar_password = true. La web y el celular revisan esa marca al
-- entrar y no dejan seguir hasta poner una contraseña propia.
--
-- La marca la pone un trigger y no cada función por separado: así cubre
-- todos los caminos de staff (los de hoy y los que se agreguen) sin
-- reescribir esas funciones. Solo marca cuando quien cambia la clave es
-- staff y la cuenta no es la suya; la API de servicio (sin auth.uid) y el
-- propio usuario cambiando su clave no marcan nada.
--
-- La cuenta del dueño por usuario de licencia (owner+<id>@codecpos.internal,
-- la de Alli23 y similares) queda POR FUERA: esa clave también arma la
-- identidad de sincronización de Electron, y cambiarla desde la web deja la
-- caja sin subir datos (caso TecnoStark, 2026-11-18). Esa se sigue cambiando
-- solo desde el panel de Codec.

create or replace function public._marcar_password_generica()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
begin
  if new.email ~ '^owner\+.*@codecpos\.internal$' then
    return new;
  end if;
  if auth.uid() is not null
     and auth.uid() <> new.id
     and public.es_staff_actual()
     and (tg_op = 'INSERT' or new.encrypted_password is distinct from old.encrypted_password)
  then
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('debe_cambiar_password', true);
  elsif tg_op = 'UPDATE' and new.encrypted_password is distinct from old.encrypted_password then
    -- La cambió el propio usuario (o la recuperó por correo): ya no es genérica.
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb) - 'debe_cambiar_password';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_marcar_password_generica on auth.users;
create trigger trg_marcar_password_generica
  before insert or update of encrypted_password on auth.users
  for each row execute function public._marcar_password_generica();

-- ¿La cuenta con sesión tiene que cambiar la contraseña?
create or replace function public.mi_cambio_password_pendiente()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select coalesce((u.raw_app_meta_data ->> 'debe_cambiar_password')::boolean, false)
  from auth.users u
  where u.id = auth.uid();
$$;

revoke all on function public.mi_cambio_password_pendiente() from public, anon;
grant execute on function public.mi_cambio_password_pendiente() to authenticated;

-- Cambia la contraseña de la cuenta con sesión y quita la marca.
-- Con la marca puesta no pide la actual (es la genérica que acaba de usar
-- para entrar); sin la marca, la actual es obligatoria.
-- La clave de licencia del dueño (owner+<id>@codecpos.internal) no se cambia
-- por aquí (ver arriba).
create or replace function public.cambiar_mi_password(p_actual text, p_nueva text)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions'
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_hash text;
  v_pendiente boolean;
begin
  if v_uid is null then
    raise exception 'Inicia sesión primero';
  end if;
  if p_nueva is null or length(p_nueva) < 6 then
    raise exception 'La contraseña nueva debe tener al menos 6 caracteres';
  end if;

  select email, encrypted_password,
         coalesce((raw_app_meta_data ->> 'debe_cambiar_password')::boolean, false)
    into v_email, v_hash, v_pendiente
  from auth.users where id = v_uid;

  if v_email ~ '^owner\+.*@codecpos\.internal$' then
    raise exception 'Esta es la clave de licencia del negocio (la misma de la caja). Para cambiarla escríbele a Codec Studio.';
  end if;

  if not v_pendiente then
    if p_actual is null or v_hash is null or v_hash <> crypt(p_actual, v_hash) then
      raise exception 'La contraseña actual no es correcta';
    end if;
  end if;
  if v_hash is not null and v_hash = crypt(p_nueva, v_hash) then
    raise exception 'La contraseña nueva debe ser distinta a la anterior';
  end if;

  update auth.users
  set encrypted_password = crypt(p_nueva, gen_salt('bf')),
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'debe_cambiar_password',
      updated_at = now()
  where id = v_uid;

end;
$$;

revoke all on function public.cambiar_mi_password(text, text) from public, anon;
grant execute on function public.cambiar_mi_password(text, text) to authenticated;
