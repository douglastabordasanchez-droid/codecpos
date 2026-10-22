-- 0125 · Numeración de notas crédito y débito activa desde el principio.
--
-- Las notas no llevan resolución de la DIAN: el facturador elige prefijo y
-- consecutivo. Por eso no tiene sentido pedírsela al negocio: todo perfil
-- fiscal queda con NC (notas crédito) y ND (notas débito) desde el 1, ya
-- activas. Se crean para los perfiles que existen y, con el disparador, para
-- cada perfil nuevo.

create or replace function public.crear_numeracion_notas(p_perfil_fiscal_id uuid, p_cliente_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles_fiscales_resoluciones
    (perfil_fiscal_id, cliente_id, tipo_documento, prefijo, resolucion_numero, resolucion_fecha, rango_desde, rango_hasta)
  select p_perfil_fiscal_id, p_cliente_id, t.tipo, t.prefijo, 'Sin resolución (notas)', (now() at time zone 'America/Bogota')::date, 1, 999999999
  from (values ('nota_credito', 'NC'), ('nota_debito', 'ND')) as t(tipo, prefijo)
  where not exists (
    select 1 from public.perfiles_fiscales_resoluciones r
    where r.perfil_fiscal_id = p_perfil_fiscal_id and r.tipo_documento = t.tipo and r.estado = 'activa'
  );
end;
$$;

create or replace function public.tg_perfil_fiscal_numeracion_notas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.crear_numeracion_notas(new.id, new.cliente_id);
  return new;
end;
$$;

drop trigger if exists perfil_fiscal_numeracion_notas on public.perfiles_fiscales;
create trigger perfil_fiscal_numeracion_notas
  after insert on public.perfiles_fiscales
  for each row execute function public.tg_perfil_fiscal_numeracion_notas();

-- Perfiles que ya existen.
select public.crear_numeracion_notas(p.id, p.cliente_id) from public.perfiles_fiscales p;
