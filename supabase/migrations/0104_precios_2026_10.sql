-- Precios vigentes desde el 2026-10-02 (los mismos de la página):
--   Básico  $49.990/mes   ·  anual $549.890 (12 meses por el precio de 11)
--   Premium $79.990/mes   ·  anual $879.890 (12 meses por el precio de 11)
-- Se apaga la promoción de lanzamiento del Premium ($49.990): no la tenía
-- ningún cliente, así que no le cambia el precio a nadie. Trimestral y
-- vitalicio dejan de ofrecerse al público (la función de pago en línea solo
-- acepta MENSUAL y ANUAL); el panel de administración los conserva para
-- licencias especiales hechas a mano.

-- Meses de regalo al pagar el año.
insert into public.configuracion_comercial (clave, valor)
values ('meses_gratis_anual', to_jsonb(1))
on conflict (clave) do update set valor = excluded.valor;

-- Anual = mensual × (12 − meses de regalo), exacto y sin redondear: así el
-- cobro coincide peso a peso con lo publicado ($549.890 y $879.890).
create or replace function public.aplicar_modalidad_a_base(p_base numeric, p_modalidad text)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_descuento numeric;
  v_meses_gratis numeric;
  v_bruto numeric;
begin
  if p_base is null then return null; end if;
  if p_modalidad = 'MENSUAL' then
    return p_base;
  elsif p_modalidad = 'ANUAL' then
    v_meses_gratis := least(greatest(coalesce(public.configuracion_valor_numeric('meses_gratis_anual'), 0), 0), 11);
    return p_base * (12 - v_meses_gratis);
  elsif p_modalidad = 'TRIMESTRAL' then
    v_descuento := coalesce(public.configuracion_valor_numeric('descuento_trimestral'), 0);
    v_bruto := p_base * 3 * (1 - v_descuento);
    -- Redondea hacia arriba al siguiente millar y le resta 1 (termina en 999).
    return ceil(v_bruto / 1000) * 1000 - 1;
  else
    raise exception 'Modalidad desconocida: %', p_modalidad;
  end if;
end;
$$;

-- Precio mensual: se cierra el anterior y se abre el nuevo (queda el historial).
do $$
declare
  v_plan uuid;
  v_nuevo record;
begin
  for v_nuevo in select * from (values ('BASICO', 49990::numeric), ('PREMIUM', 79990::numeric)) as t(codigo, precio) loop
    select id into v_plan from public.planes where codigo = v_nuevo.codigo;
    if v_plan is null then continue; end if;
    if exists (
      select 1 from public.precios
      where plan_id = v_plan and modalidad = 'MENSUAL' and vigente_hasta is null and precio = v_nuevo.precio
    ) then
      continue; -- ya está en ese valor
    end if;
    update public.precios set vigente_hasta = now()
    where plan_id = v_plan and modalidad = 'MENSUAL' and vigente_hasta is null;
    insert into public.precios (plan_id, modalidad, precio, vigente_desde)
    values (v_plan, 'MENSUAL', v_nuevo.precio, now());
  end loop;
end $$;

-- Fin de la promoción de lanzamiento para clientes nuevos.
update public.promociones_comerciales set activa = false where codigo = 'LANZAMIENTO_PREMIUM_2026';
