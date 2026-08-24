-- Códigos de descuento: el staff los crea/edita desde el Admin Web con el
-- porcentaje que quiera, y se aplican al momento de pagar con Mercado Pago
-- (crear-pago-licencia valida el código y calcula el precio con descuento
-- SIEMPRE en el servidor -- igual que el precio base, nunca se confía en un
-- porcentaje que mande el frontend).
begin;

create table public.codigos_descuento (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  porcentaje numeric(5,2) not null check (porcentaje > 0 and porcentaje <= 100),
  activo boolean not null default true,
  descripcion text,
  fecha_expiracion timestamptz,
  usos_maximos int check (usos_maximos is null or usos_maximos > 0),
  usos_actuales int not null default 0,
  created_by uuid references public.empleados(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.codigos_descuento is 'Códigos de descuento porcentual para el checkout de Mercado Pago. El staff los administra desde el Admin Web -- validar_codigo_descuento() es la única forma de consultarlos desde fuera (nunca se expone la tabla completa a clientes).';

alter table public.codigos_descuento enable row level security;

create policy codigos_descuento_staff_all on public.codigos_descuento
  for all to authenticated
  using (public.es_staff_actual())
  with check (public.es_staff_actual());

-- ---- Validación (la usa crear-pago-licencia, con service_role) -----------
create or replace function public.validar_codigo_descuento(p_codigo text)
returns table(valido boolean, porcentaje numeric, mensaje text, codigo_id uuid)
language plpgsql stable security definer set search_path = public as $function$
declare
  v_fila public.codigos_descuento;
begin
  select * into v_fila from public.codigos_descuento
  where upper(codigo) = upper(trim(p_codigo));

  if v_fila.id is null then
    return query select false, null::numeric, 'Código no encontrado', null::uuid;
    return;
  end if;
  if not v_fila.activo then
    return query select false, null::numeric, 'Código inactivo', null::uuid;
    return;
  end if;
  if v_fila.fecha_expiracion is not null and now() > v_fila.fecha_expiracion then
    return query select false, null::numeric, 'Código vencido', null::uuid;
    return;
  end if;
  if v_fila.usos_maximos is not null and v_fila.usos_actuales >= v_fila.usos_maximos then
    return query select false, null::numeric, 'Código agotado', null::uuid;
    return;
  end if;

  return query select true, v_fila.porcentaje, 'Código válido', v_fila.id;
end;
$function$;
grant execute on function public.validar_codigo_descuento(text) to authenticated;

-- Incrementa el contador de usos -- se llama SOLO desde el webhook, una vez
-- por pago aprobado (mismo guard de idempotencia que activa la licencia).
create or replace function public.registrar_uso_codigo_descuento(p_codigo_id uuid)
returns void
language sql security definer set search_path = public as $$
  update public.codigos_descuento set usos_actuales = usos_actuales + 1, updated_at = now()
  where id = p_codigo_id;
$$;
revoke all on function public.registrar_uso_codigo_descuento(uuid) from public, anon, authenticated;

-- ---- Administración (Admin Web) -------------------------------------------
create or replace function public.admin_crear_codigo_descuento(
  p_codigo text,
  p_porcentaje numeric,
  p_descripcion text default null,
  p_fecha_expiracion timestamptz default null,
  p_usos_maximos int default null
)
returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  v_codigo text := upper(trim(p_codigo));
  v_id uuid;
begin
  if not public.es_staff_actual() then raise exception 'No autorizado'; end if;
  if v_codigo is null or length(v_codigo) < 3 then raise exception 'El código debe tener al menos 3 caracteres'; end if;
  if p_porcentaje is null or p_porcentaje <= 0 or p_porcentaje > 100 then raise exception 'El porcentaje debe estar entre 1 y 100'; end if;

  insert into public.codigos_descuento (codigo, porcentaje, descripcion, fecha_expiracion, usos_maximos, created_by)
  values (v_codigo, p_porcentaje, nullif(trim(p_descripcion), ''), p_fecha_expiracion, p_usos_maximos, auth.uid())
  returning id into v_id;

  perform public.registrar_auditoria('CREAR_CODIGO_DESCUENTO', null, 'EXITO', jsonb_build_object('codigo', v_codigo, 'porcentaje', p_porcentaje));
  return v_id;
end;
$function$;
grant execute on function public.admin_crear_codigo_descuento(text, numeric, text, timestamptz, int) to authenticated;

create or replace function public.admin_actualizar_codigo_descuento(
  p_id uuid,
  p_activo boolean default null,
  p_porcentaje numeric default null,
  p_fecha_expiracion timestamptz default null,
  p_usos_maximos int default null,
  p_descripcion text default null
)
returns void
language plpgsql security definer set search_path = public as $function$
begin
  if not public.es_staff_actual() then raise exception 'No autorizado'; end if;
  if p_porcentaje is not null and (p_porcentaje <= 0 or p_porcentaje > 100) then raise exception 'El porcentaje debe estar entre 1 y 100'; end if;

  update public.codigos_descuento set
    activo = coalesce(p_activo, activo),
    porcentaje = coalesce(p_porcentaje, porcentaje),
    fecha_expiracion = coalesce(p_fecha_expiracion, fecha_expiracion),
    usos_maximos = coalesce(p_usos_maximos, usos_maximos),
    descripcion = coalesce(nullif(trim(p_descripcion), ''), descripcion),
    updated_at = now()
  where id = p_id;

  perform public.registrar_auditoria('ACTUALIZAR_CODIGO_DESCUENTO', null, 'EXITO', jsonb_build_object('id', p_id));
end;
$function$;
grant execute on function public.admin_actualizar_codigo_descuento(uuid, boolean, numeric, timestamptz, int, text) to authenticated;

-- ---- pagos_licencia: registrar qué código se usó, si alguno --------------
alter table public.pagos_licencia add column if not exists codigo_descuento text;
alter table public.pagos_licencia add column if not exists descuento_porcentaje numeric(5,2);
alter table public.pagos_licencia add column if not exists monto_original numeric(12,2);

commit;
