-- 0131 · "Mi contador" fase 2: Codec POS le manda a Codec Document también
-- gastos, devoluciones, cierres de caja, notas crédito y débito, documentos
-- soporte y anulaciones (de venta, gasto o devolución). Contrato:
-- docs/codec-pos-contador-fase-2.md del repo de Codec Document.
--
-- · El historial que se encola al conectar ya no empieza el 1 de enero:
--   va todo lo que hay en la nube.
-- · La anulación lleva «de» (venta | gasto | devolucion) y viaja después
--   del registro que anula (fecha_origen = momento de la anulación).

alter table public.contador_eventos drop constraint if exists contador_eventos_tipo_check;
alter table public.contador_eventos add constraint contador_eventos_tipo_check check (tipo in (
  'venta', 'factura_electronica', 'anulacion', 'gasto', 'devolucion', 'cierre_caja',
  'nota_credito', 'nota_debito', 'documento_soporte'
));
alter table public.contador_eventos add column if not exists de text
  check (de is null or de in ('venta', 'gasto', 'devolucion'));

-- ¿El negocio tiene un contador conectado?
create or replace function public.contador_conectado(p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (select 1 from public.contador_vinculos v where v.cliente_id = p_cliente_id and v.estado = 'activo');
$function$;
revoke all on function public.contador_conectado(uuid) from public, anon, authenticated;

create or replace function public.contador_encolar(
  p_cliente_id uuid, p_tipo text, p_id_origen text, p_fecha timestamptz,
  p_espera interval default interval '0', p_de text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.contador_conectado(p_cliente_id) then return; end if;
  insert into public.contador_eventos (cliente_id, tipo, id_origen, fecha_origen, proximo_intento_en, de)
  values (p_cliente_id, p_tipo, p_id_origen, coalesce(p_fecha, now()), now() + p_espera, p_de)
  on conflict (cliente_id, tipo, id_origen) do nothing;
end;
$function$;
revoke all on function public.contador_encolar(uuid, text, text, timestamptz, interval, text) from public, anon, authenticated;

-- ── Ventas: anulación cuando dejan de estar completadas ─────────────────
create or replace function public.contador_anular_venta()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.estado = 'completada' and new.estado is distinct from 'completada' then
    perform public.contador_encolar(new.cliente_id, 'anulacion', new.id::text, now(), interval '0', 'venta');
  end if;
  return new;
end;
$function$;
drop trigger if exists trg_contador_anular_venta on public.ventas;
create trigger trg_contador_anular_venta
  after update of estado on public.ventas
  for each row execute function public.contador_anular_venta();

-- ── Gastos ──────────────────────────────────────────────────────────────
create or replace function public.contador_encolar_gasto()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    -- Un momento de espera: la causación de una compra enlaza su documento al gasto justo después.
    perform public.contador_encolar(new.cliente_id, 'gasto', new.id::text, coalesce(new.fecha, new.created_at), interval '2 minutes');
    return new;
  end if;
  -- Borrado: solo se anula lo que ya se había encolado para el contador.
  if exists (select 1 from public.contador_eventos e where e.cliente_id = old.cliente_id and e.tipo = 'gasto' and e.id_origen = old.id::text) then
    if exists (select 1 from public.contador_eventos e where e.cliente_id = old.cliente_id and e.tipo = 'gasto'
               and e.id_origen = old.id::text and e.estado = 'pendiente') then
      -- Nunca salió: basta con no mandarlo.
      update public.contador_eventos set estado = 'cancelado', motivo = 'El gasto se eliminó antes de enviarse'
      where cliente_id = old.cliente_id and tipo = 'gasto' and id_origen = old.id::text;
    else
      perform public.contador_encolar(old.cliente_id, 'anulacion', old.id::text, now(), interval '0', 'gasto');
    end if;
  end if;
  return old;
end;
$function$;
drop trigger if exists trg_contador_encolar_gasto on public.gastos;
create trigger trg_contador_encolar_gasto
  after insert or delete on public.gastos
  for each row execute function public.contador_encolar_gasto();

-- ── Devoluciones (los ítems llegan después: se espera un momento) ───────
create or replace function public.contador_encolar_devolucion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.estado, 'completada') = 'completada' then
      perform public.contador_encolar(new.cliente_id, 'devolucion', new.id::text, new.created_at, interval '2 minutes');
    end if;
  elsif old.estado = 'completada' and new.estado is distinct from 'completada' then
    perform public.contador_encolar(new.cliente_id, 'anulacion', new.id::text, now(), interval '0', 'devolucion');
  end if;
  return new;
end;
$function$;
drop trigger if exists trg_contador_encolar_devolucion on public.devoluciones;
create trigger trg_contador_encolar_devolucion
  after insert or update of estado on public.devoluciones
  for each row execute function public.contador_encolar_devolucion();

-- ── Cierres de caja ─────────────────────────────────────────────────────
create or replace function public.contador_encolar_cierre()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.contador_encolar(new.cliente_id, 'cierre_caja', new.id::text, coalesce(new.fecha_cierre, new.created_at));
  return new;
end;
$function$;
drop trigger if exists trg_contador_encolar_cierre on public.cierres_caja;
create trigger trg_contador_encolar_cierre
  after insert on public.cierres_caja
  for each row execute function public.contador_encolar_cierre();

-- ── Notas crédito y débito (aceptadas, perfil en producción) ────────────
create or replace function public.contador_encolar_nota()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tipo text := case tg_table_name when 'notas_credito_electronicas' then 'nota_credito' else 'nota_debito' end;
begin
  if new.estado = 'accepted'
     and (tg_op = 'INSERT' or old.estado is distinct from 'accepted')
     and exists (select 1 from public.perfiles_fiscales p where p.id = new.perfil_fiscal_id and p.ambiente = 'produccion') then
    perform public.contador_encolar(new.cliente_id, v_tipo, new.id::text, coalesce(new.fecha_emision, new.created_at));
  end if;
  return new;
end;
$function$;
drop trigger if exists trg_contador_encolar_nota_credito on public.notas_credito_electronicas;
create trigger trg_contador_encolar_nota_credito
  after insert or update of estado on public.notas_credito_electronicas
  for each row execute function public.contador_encolar_nota();
drop trigger if exists trg_contador_encolar_nota_debito on public.notas_debito_electronicas;
create trigger trg_contador_encolar_nota_debito
  after insert or update of estado on public.notas_debito_electronicas
  for each row execute function public.contador_encolar_nota();

-- ── Documentos soporte (validados por la DIAN, con su XML) ──────────────
create or replace function public.contador_encolar_documento_soporte()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.tipo = 'documento_soporte' and new.validado_dian and new.xml is not null then
    perform public.contador_encolar(new.cliente_id, 'documento_soporte', new.id::text, coalesce(new.fecha_emision::timestamptz, new.created_at));
  end if;
  return new;
end;
$function$;
drop trigger if exists trg_contador_encolar_documento_soporte on public.documentos_electronicos;
create trigger trg_contador_encolar_documento_soporte
  after insert or update of validado_dian on public.documentos_electronicos
  for each row execute function public.contador_encolar_documento_soporte();

-- ── Historial completo al conectar ──────────────────────────────────────
-- Todo lo que hay en la nube, de todos los tipos. Solo lo llama
-- contador-sync con el service role, justo después de guardar el vínculo.
create or replace function public.contador_encolar_historial(p_cliente_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total integer;
begin
  insert into public.contador_eventos (cliente_id, tipo, id_origen, fecha_origen)
  select v.cliente_id, 'venta', v.id::text, v.created_at
  from public.ventas v where v.cliente_id = p_cliente_id and v.estado = 'completada'
  on conflict (cliente_id, tipo, id_origen) do nothing;

  insert into public.contador_eventos (cliente_id, tipo, id_origen, fecha_origen)
  select f.cliente_id, 'factura_electronica', f.id::text, coalesce(f.fecha_emision, f.created_at)
  from public.facturas_electronicas f
  where f.cliente_id = p_cliente_id and f.estado = 'accepted' and f.issuer_ambiente = 'produccion'
  on conflict (cliente_id, tipo, id_origen) do nothing;

  insert into public.contador_eventos (cliente_id, tipo, id_origen, fecha_origen)
  select g.cliente_id, 'gasto', g.id::text, coalesce(g.fecha, g.created_at)
  from public.gastos g where g.cliente_id = p_cliente_id
  on conflict (cliente_id, tipo, id_origen) do nothing;

  insert into public.contador_eventos (cliente_id, tipo, id_origen, fecha_origen)
  select d.cliente_id, 'devolucion', d.id::text, d.created_at
  from public.devoluciones d where d.cliente_id = p_cliente_id and coalesce(d.estado, 'completada') = 'completada'
  on conflict (cliente_id, tipo, id_origen) do nothing;

  insert into public.contador_eventos (cliente_id, tipo, id_origen, fecha_origen)
  select c.cliente_id, 'cierre_caja', c.id::text, coalesce(c.fecha_cierre, c.created_at)
  from public.cierres_caja c where c.cliente_id = p_cliente_id
  on conflict (cliente_id, tipo, id_origen) do nothing;

  insert into public.contador_eventos (cliente_id, tipo, id_origen, fecha_origen)
  select n.cliente_id, 'nota_credito', n.id::text, coalesce(n.fecha_emision, n.created_at)
  from public.notas_credito_electronicas n join public.perfiles_fiscales p on p.id = n.perfil_fiscal_id
  where n.cliente_id = p_cliente_id and n.estado = 'accepted' and p.ambiente = 'produccion'
  on conflict (cliente_id, tipo, id_origen) do nothing;

  insert into public.contador_eventos (cliente_id, tipo, id_origen, fecha_origen)
  select n.cliente_id, 'nota_debito', n.id::text, coalesce(n.fecha_emision, n.created_at)
  from public.notas_debito_electronicas n join public.perfiles_fiscales p on p.id = n.perfil_fiscal_id
  where n.cliente_id = p_cliente_id and n.estado = 'accepted' and p.ambiente = 'produccion'
  on conflict (cliente_id, tipo, id_origen) do nothing;

  insert into public.contador_eventos (cliente_id, tipo, id_origen, fecha_origen)
  select d.cliente_id, 'documento_soporte', d.id::text, coalesce(d.fecha_emision::timestamptz, d.created_at)
  from public.documentos_electronicos d
  where d.cliente_id = p_cliente_id and d.tipo = 'documento_soporte' and d.validado_dian and d.xml is not null
  on conflict (cliente_id, tipo, id_origen) do nothing;

  select count(*) into v_total from public.contador_eventos where cliente_id = p_cliente_id and estado = 'pendiente';
  return v_total;
end;
$function$;
revoke all on function public.contador_encolar_historial(uuid) from public, anon, authenticated;
