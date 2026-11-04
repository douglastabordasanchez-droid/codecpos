-- 0138 · Mi contador: abonos de cartera, ingresos extra y facturas de compra.
--
-- Contrato: sección B10 del documento compartido con Codec Document
-- (pos-ingesta ya acepta estos tipos en producción).
--
-- · abono_cartera: un evento por abono (los abonos viven en el jsonb
--   cuentas_cartera.abonos). id_origen = id del abono; origen_padre = la
--   cuenta, para que contador-sync encuentre el abono sin recorrer todo.
--   Un abono que desaparece del arreglo se anula (o se cancela si no salió).
-- · ingreso_extra: al crearse; si se borra, anulación.
-- · factura_compra: XML de proveedor cargado en Recepción
--   (documentos_electronicos, dirección recibido, tipo factura).
--
-- Los disparadores nunca deben tumbar la sincronización del negocio: si algo
-- falla al encolar, se deja pasar el cambio igual.

alter table public.contador_eventos add column if not exists origen_padre text;

alter table public.contador_eventos drop constraint if exists contador_eventos_tipo_check;
alter table public.contador_eventos add constraint contador_eventos_tipo_check check (tipo in (
  'venta', 'factura_electronica', 'anulacion', 'gasto', 'devolucion', 'cierre_caja',
  'nota_credito', 'nota_debito', 'documento_soporte', 'nota_factura',
  'abono_cartera', 'ingreso_extra', 'factura_compra'
));

-- La regla de «de» se creó en 0131 sin nombre propio: se quitan todas las que la miran.
do $$
declare r record;
begin
  for r in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.contador_eventos'::regclass and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%(de %'
  loop
    execute format('alter table public.contador_eventos drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.contador_eventos add constraint contador_eventos_de_check
  check (de is null or de in ('venta', 'gasto', 'devolucion', 'abono_cartera', 'ingreso_extra'));

-- Anula (o cancela si nunca salió) un registro ya encolado.
create or replace function public.contador_retirar(p_cliente_id uuid, p_tipo text, p_id_origen text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_estado text;
begin
  select estado into v_estado from public.contador_eventos
  where cliente_id = p_cliente_id and tipo = p_tipo and id_origen = p_id_origen;
  if v_estado is null or v_estado = 'cancelado' then return; end if;
  if v_estado = 'pendiente' then
    update public.contador_eventos set estado = 'cancelado', motivo = 'Se eliminó antes de enviarse'
    where cliente_id = p_cliente_id and tipo = p_tipo and id_origen = p_id_origen;
  else
    perform public.contador_encolar(p_cliente_id, 'anulacion', p_id_origen, now(), interval '0', p_tipo);
  end if;
end;
$function$;
revoke all on function public.contador_retirar(uuid, text, text) from public, anon, authenticated;

-- Id estable de un abono: el suyo o, si no trae, cuenta:posición.
create or replace function public.contador_id_abono(p_cuenta uuid, p_abono jsonb, p_pos bigint)
returns text
language sql
immutable
as $function$
  select coalesce(nullif(p_abono->>'id', ''), p_cuenta::text || ':' || p_pos::text);
$function$;

-- Fecha de un abono sin reventar si viene mal escrita.
create or replace function public.contador_fecha_abono(p_abono jsonb)
returns timestamptz
language plpgsql
immutable
as $function$
begin
  return coalesce((p_abono->>'fecha')::timestamptz, now());
exception when others then
  return now();
end;
$function$;

-- ── Abonos de cartera ───────────────────────────────────────────────────
create or replace function public.contador_encolar_abonos()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cliente uuid := coalesce(new.cliente_id, old.cliente_id);
begin
  begin
    if not public.contador_conectado(v_cliente) then
      return coalesce(new, old);
    end if;

    -- Abonos nuevos.
    if tg_op <> 'DELETE' then
      insert into public.contador_eventos (cliente_id, tipo, id_origen, fecha_origen, origen_padre)
      select new.cliente_id, 'abono_cartera', public.contador_id_abono(new.id, e.valor, e.pos),
             public.contador_fecha_abono(e.valor), new.id::text
      from jsonb_array_elements(coalesce(new.abonos, '[]'::jsonb)) with ordinality as e(valor, pos)
      where coalesce((e.valor->>'monto')::numeric, 0) > 0
      on conflict (cliente_id, tipo, id_origen) do nothing;
    end if;

    -- Abonos que ya no están (borrados, o la cuenta entera se borró).
    if tg_op <> 'INSERT' then
      perform public.contador_retirar(old.cliente_id, 'abono_cartera', ids.id)
      from (
        select public.contador_id_abono(old.id, e.valor, e.pos) as id
        from jsonb_array_elements(coalesce(old.abonos, '[]'::jsonb)) with ordinality as e(valor, pos)
        except
        select public.contador_id_abono(new.id, e.valor, e.pos)
        from jsonb_array_elements(case when tg_op = 'DELETE' then '[]'::jsonb else coalesce(new.abonos, '[]'::jsonb) end)
             with ordinality as e(valor, pos)
      ) ids;
    end if;
  exception when others then
    raise warning 'contador_encolar_abonos: %', sqlerrm;
  end;
  return coalesce(new, old);
end;
$function$;
drop trigger if exists trg_contador_encolar_abonos on public.cuentas_cartera;
create trigger trg_contador_encolar_abonos
  after insert or update of abonos or delete on public.cuentas_cartera
  for each row execute function public.contador_encolar_abonos();

-- ── Ingresos extra ──────────────────────────────────────────────────────
create or replace function public.contador_encolar_ingreso_extra()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  begin
    if tg_op = 'INSERT' then
      if coalesce(new.monto, 0) > 0 then
        perform public.contador_encolar(new.cliente_id, 'ingreso_extra', new.id::text, new.fecha);
      end if;
    else
      perform public.contador_retirar(old.cliente_id, 'ingreso_extra', old.id::text);
    end if;
  exception when others then
    raise warning 'contador_encolar_ingreso_extra: %', sqlerrm;
  end;
  return coalesce(new, old);
end;
$function$;
drop trigger if exists trg_contador_encolar_ingreso_extra on public.ingresos_extra;
create trigger trg_contador_encolar_ingreso_extra
  after insert or delete on public.ingresos_extra
  for each row execute function public.contador_encolar_ingreso_extra();

-- ── Facturas de compra recibidas ────────────────────────────────────────
create or replace function public.contador_encolar_factura_compra()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  begin
    if new.direccion = 'recibido' and new.tipo = 'factura' and new.estado <> 'invalido'
       and new.cufe is not null and new.xml is not null then
      perform public.contador_encolar(new.cliente_id, 'factura_compra', new.id::text,
                                      coalesce(new.fecha_emision::timestamptz, new.created_at));
    end if;
  exception when others then
    raise warning 'contador_encolar_factura_compra: %', sqlerrm;
  end;
  return new;
end;
$function$;
drop trigger if exists trg_contador_encolar_factura_compra on public.documentos_electronicos;
create trigger trg_contador_encolar_factura_compra
  after insert or update of estado, direccion, tipo on public.documentos_electronicos
  for each row execute function public.contador_encolar_factura_compra();

-- ── Historial: lo que ya existía también viaja al conectar ──────────────
-- Se envuelve la función de 0131 en vez de reescribirla.
create or replace function public.contador_encolar_historial_fase3(p_cliente_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total integer;
begin
  insert into public.contador_eventos (cliente_id, tipo, id_origen, fecha_origen, origen_padre)
  select c.cliente_id, 'abono_cartera', public.contador_id_abono(c.id, e.valor, e.pos),
         public.contador_fecha_abono(e.valor), c.id::text
  from public.cuentas_cartera c,
       jsonb_array_elements(coalesce(c.abonos, '[]'::jsonb)) with ordinality as e(valor, pos)
  where c.cliente_id = p_cliente_id and coalesce((e.valor->>'monto')::numeric, 0) > 0
  on conflict (cliente_id, tipo, id_origen) do nothing;

  insert into public.contador_eventos (cliente_id, tipo, id_origen, fecha_origen)
  select i.cliente_id, 'ingreso_extra', i.id::text, i.fecha
  from public.ingresos_extra i where i.cliente_id = p_cliente_id and coalesce(i.monto, 0) > 0
  on conflict (cliente_id, tipo, id_origen) do nothing;

  insert into public.contador_eventos (cliente_id, tipo, id_origen, fecha_origen)
  select d.cliente_id, 'factura_compra', d.id::text, coalesce(d.fecha_emision::timestamptz, d.created_at)
  from public.documentos_electronicos d
  where d.cliente_id = p_cliente_id and d.direccion = 'recibido' and d.tipo = 'factura'
    and d.estado <> 'invalido' and d.cufe is not null and d.xml is not null
  on conflict (cliente_id, tipo, id_origen) do nothing;

  select count(*) into v_total from public.contador_eventos where cliente_id = p_cliente_id and estado = 'pendiente';
  return v_total;
end;
$function$;
revoke all on function public.contador_encolar_historial_fase3(uuid) from public, anon, authenticated;
