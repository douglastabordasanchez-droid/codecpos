-- Fase 5: flujo de registro público -> cuenta + empresa + administrador +
-- licencia de prueba de 14 días, en una sola transacción, sin intervención
-- manual del staff. Sigue el mismo patrón ya usado por provisionar_empleado
-- (migración 0006): inserta directamente en auth.users/auth.identities con
-- el password ya cifrado y el correo auto-confirmado, para que el visitante
-- pueda iniciar sesión inmediatamente después, sin flujo de verificación de
-- correo (igual que el registro de empleados que ya existe en producción).
--
-- Antiabuso (punto 34, caso 12): el correo ya es único a nivel de
-- auth.users; además se lleva un registro histórico permanente (no se borra
-- aunque el cliente cancele) de correo+teléfono que ya usaron una prueba,
-- exactamente el mismo patrón que cliente_elegible_promocion usa para que
-- cancelar y volver a registrarse no reinicie beneficios.

begin;

create table if not exists public.trial_uso_historico (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  telefono text not null,
  cliente_id uuid not null references public.clientes_pos(id),
  created_at timestamptz not null default now()
);
create unique index if not exists idx_trial_uso_historico_email on public.trial_uso_historico (lower(email));
create unique index if not exists idx_trial_uso_historico_telefono on public.trial_uso_historico (telefono);

alter table public.trial_uso_historico enable row level security;
create policy "trial_uso_historico solo staff" on public.trial_uso_historico
  for select to authenticated
  using (public.es_staff_actual());

revoke all on public.trial_uso_historico from anon, authenticated;
grant select on public.trial_uso_historico to authenticated;

create or replace function public.crear_cuenta_prueba(
  p_nombre_completo text,
  p_nombre_negocio text,
  p_email text,
  p_telefono text,
  p_password text
)
returns table(cliente_id uuid, licencia_id uuid)
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions'
as $function$
declare
  v_email text := lower(trim(p_email));
  v_telefono text := trim(p_telefono);
  v_nombre_negocio text := trim(p_nombre_negocio);
  v_nombre_completo text := trim(p_nombre_completo);
  v_user_id uuid;
  v_cliente_id uuid;
  v_plan_id uuid;
  v_licencia_id uuid;
begin
  if v_nombre_completo is null or length(v_nombre_completo) < 2 then
    raise exception 'Ingresa tu nombre completo';
  end if;
  if v_nombre_negocio is null or length(v_nombre_negocio) < 2 then
    raise exception 'Ingresa el nombre de tu negocio';
  end if;
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Ingresa un correo válido';
  end if;
  if v_telefono is null or length(v_telefono) < 7 then
    raise exception 'Ingresa un teléfono válido';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'La contraseña debe tener al menos 6 caracteres';
  end if;

  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'Ya existe una cuenta con ese correo -- inicia sesión en su lugar.';
  end if;
  if exists (select 1 from public.trial_uso_historico where lower(email) = v_email or telefono = v_telefono) then
    raise exception 'Ya se usó una prueba gratuita con este correo o teléfono. Si necesitas más tiempo, escríbenos a soporte.';
  end if;

  select id into v_plan_id from public.planes where codigo = 'PREMIUM' and activo;
  if v_plan_id is null then
    raise exception 'No se pudo preparar el plan de prueba -- contacta soporte';
  end if;

  v_user_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    v_email, crypt(p_password, gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('tipo_registro', 'NUEVO_NEGOCIO'),
    now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    v_user_id::text, v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  insert into public.clientes_pos (
    nombre_negocio, contacto, telefono, email, plan, duracion, estado,
    en_prueba, dias_prueba_restantes, fecha_activacion
  ) values (
    v_nombre_negocio, v_nombre_completo, v_telefono, v_email, 'PREMIUM', '1_MES', 'PRUEBA',
    true, 14, now()
  ) returning id into v_cliente_id;

  insert into public.empleados (id, cliente_id, nombre_completo, telefono, rol, es_staff_codec, activo)
  values (v_user_id, v_cliente_id, v_nombre_completo, v_telefono, 'admin', false, true);

  insert into public.licencias (
    cliente_id, plan_id, modalidad, estado, precio_aplicado, vigente, origen,
    fecha_inicio, fecha_fin_periodo_actual, motivo, created_by
  ) values (
    v_cliente_id, v_plan_id, 'MENSUAL', 'TRIAL', 0, true, 'TRIAL_SIGNUP',
    now(), now() + interval '14 days', 'Prueba gratuita de 14 días -- registro público', v_user_id
  ) returning id into v_licencia_id;

  insert into public.historial_comercial (cliente_id, licencia_id, tipo_evento, datos_nuevos, motivo, actor)
  values (
    v_cliente_id, v_licencia_id, 'CREACION_LICENCIA',
    jsonb_build_object('plan', 'PREMIUM', 'estado', 'TRIAL', 'origen', 'TRIAL_SIGNUP'),
    'Registro público (Probar 14 días gratis)', v_user_id
  );

  insert into public.trial_uso_historico (email, telefono, cliente_id) values (v_email, v_telefono, v_cliente_id);

  return query select v_cliente_id, v_licencia_id;
end;
$function$;

revoke all on function public.crear_cuenta_prueba(text, text, text, text, text) from public, authenticated;
grant execute on function public.crear_cuenta_prueba(text, text, text, text, text) to anon;

commit;
