-- 0142 · Retención de 5 meses en la nube.
--
-- Se conserva el mes actual y los 5 anteriores completos: en diciembre se
-- borra lo anterior al 1 de julio. Solo ventas, gastos, cierres y devoluciones.
-- Las facturas electrónicas, notas y documentos de compra duran 12 meses; la
-- caja avisa cada 6 meses que se descarguen o guarden en una carpeta.
-- Usuarios, contraseñas, productos, clientes y cartera no se tocan. Esta
-- migración NO borra nada por sí sola: el trabajo programado está aparte, en
-- 0143.
--
-- Se quedan aunque sean viejos:
--   · la última venta de cada caja (la numeración web sale del número mayor);
--   · ventas con factura electrónica (hasta que la factura cumpla su año),
--     cartera abierta o devolución;
--   · facturas sin respuesta final de la DIAN o con cartera abierta;
--   · ventas con cobro o cita enlazados (la llave impediría borrarlas);
--   · lo que el contador aún no ha recibido;
--   · gastos enlazados a una compra electrónica y cierres sin terminar.

create or replace function public._retencion_corte()
returns timestamptz
language sql
stable
as $$
  select (date_trunc('month', now() at time zone 'America/Bogota') - interval '5 months') at time zone 'America/Bogota'
$$;

create or replace function public._retencion_ventas(p_corte timestamptz, p_limite integer)
returns setof uuid
language sql
stable
set search_path to 'public'
as $$
  select v.id
  from public.ventas v
  where v.created_at < p_corte
    and exists (select 1 from public.ventas n where n.cliente_id = v.cliente_id
                and n.terminal_id is not distinct from v.terminal_id and n.numero > v.numero)
    and not exists (select 1 from public.facturas_electronicas f where f.cliente_id = v.cliente_id
                    and f.venta_referencia in (v.id::text, v.local_id))
    and not exists (select 1 from public.cuentas_cartera c where c.cliente_id = v.cliente_id
                    and c.venta_local_id = v.local_id and (c.estado <> 'pagada' or coalesce(c.saldo, 0) > 0))
    and not exists (select 1 from public.devoluciones d where d.venta_id = v.id)
    and not exists (select 1 from public.notificaciones_pago np where np.venta_id = v.id)
    and not exists (select 1 from public.citas_grooming cg where cg.venta_id = v.id)
    and not exists (select 1 from public.contador_eventos e where e.cliente_id = v.cliente_id
                    and e.id_origen = v.id::text and e.estado = 'pendiente')
  order by v.created_at
  limit p_limite
$$;

create or replace function public._retencion_gastos(p_corte timestamptz, p_limite integer)
returns setof uuid
language sql
stable
set search_path to 'public'
as $$
  select g.id
  from public.gastos g
  where coalesce(g.fecha, g.created_at) < p_corte
    and not exists (select 1 from public.documentos_electronicos d where d.gasto_id = g.id)
    and not exists (select 1 from public.contador_eventos e where e.cliente_id = g.cliente_id
                    and e.id_origen = g.id::text and e.estado = 'pendiente')
  order by coalesce(g.fecha, g.created_at)
  limit p_limite
$$;

create or replace function public._retencion_cierres(p_corte timestamptz, p_limite integer)
returns setof uuid
language sql
stable
set search_path to 'public'
as $$
  select c.id
  from public.cierres_caja c
  where c.fecha_cierre is not null and c.fecha_cierre < p_corte
    and not exists (select 1 from public.contador_eventos e where e.cliente_id = c.cliente_id
                    and e.id_origen = c.id::text and e.estado = 'pendiente')
  order by c.fecha_cierre
  limit p_limite
$$;

create or replace function public._retencion_devoluciones(p_corte timestamptz, p_limite integer)
returns setof uuid
language sql
stable
set search_path to 'public'
as $$
  select d.id
  from public.devoluciones d
  where d.created_at < p_corte
    and not exists (select 1 from public.contador_eventos e where e.cliente_id = d.cliente_id
                    and e.id_origen = d.id::text and e.estado = 'pendiente')
  order by d.created_at
  limit p_limite
$$;

create or replace function public._retencion_corte_dian()
returns timestamptz
language sql
stable
as $$
  select (date_trunc('month', now() at time zone 'America/Bogota') - interval '12 months') at time zone 'America/Bogota'
$$;

create or replace function public._retencion_facturas(p_corte timestamptz, p_limite integer)
returns setof uuid
language sql
stable
set search_path to 'public'
as $$
  select f.id
  from public.facturas_electronicas f
  where f.fecha_emision < p_corte
    and f.estado in ('accepted', 'rejected')
    -- Las notas se van con su factura: ninguna puede ser reciente ni estar en trámite.
    and not exists (select 1 from public.notas_credito_electronicas n where n.factura_id = f.id
                    and (n.fecha_emision >= p_corte or n.estado not in ('accepted', 'rejected')))
    and not exists (select 1 from public.notas_debito_electronicas n where n.factura_id = f.id
                    and (n.fecha_emision >= p_corte or n.estado not in ('accepted', 'rejected')))
    and not exists (select 1 from public.ventas v
                    join public.cuentas_cartera c on c.cliente_id = v.cliente_id and c.venta_local_id = v.local_id
                    where v.cliente_id = f.cliente_id and f.venta_referencia in (v.id::text, v.local_id)
                      and (c.estado <> 'pagada' or coalesce(c.saldo, 0) > 0))
    and not exists (select 1 from public.contador_eventos e where e.cliente_id = f.cliente_id
                    and e.id_origen = f.id::text and e.estado = 'pendiente')
  order by f.fecha_emision
  limit p_limite
$$;

create or replace function public._retencion_documentos(p_corte timestamptz, p_limite integer)
returns setof uuid
language sql
stable
set search_path to 'public'
as $$
  select d.id
  from public.documentos_electronicos d
  where d.fecha_emision < (p_corte at time zone 'America/Bogota')::date
    and not exists (select 1 from public.contador_eventos e where e.cliente_id = d.cliente_id
                    and e.id_origen = d.id::text and e.estado = 'pendiente')
  order by d.fecha_emision
  limit p_limite
$$;

-- La limpieza no es una anulación: no se le avisa al contador.
create or replace function public.contador_encolar_gasto()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' and current_setting('codec.retencion', true) = '1' then
    return old;
  end if;
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

-- Por defecto solo simula. Borra por lotes para no cargar la base.
create or replace function public.ejecutar_retencion_nube(p_simular boolean default true, p_lote integer default 2000)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_corte timestamptz := public._retencion_corte();
  v_corte_dian timestamptz := public._retencion_corte_dian();
  v_resultado jsonb;
begin
  if p_simular then
    return jsonb_build_object(
      'simulacion', true,
      'corte', v_corte,
      'corte_facturas', v_corte_dian,
      'facturas', (select count(*) from public._retencion_facturas(v_corte_dian, 2147483647)),
      'documentos', (select count(*) from public._retencion_documentos(v_corte_dian, 2147483647)),
      'devoluciones', (select count(*) from public._retencion_devoluciones(v_corte, 2147483647)),
      'ventas', (select count(*) from public._retencion_ventas(v_corte, 2147483647)),
      'gastos', (select count(*) from public._retencion_gastos(v_corte, 2147483647)),
      'cierres', (select count(*) from public._retencion_cierres(v_corte, 2147483647))
    );
  end if;

  if not pg_try_advisory_xact_lock(hashtext('ejecutar_retencion_nube')) then
    return jsonb_build_object('omitida', 'ya hay una limpieza en curso');
  end if;
  perform set_config('codec.retencion', '1', true);

  create temp table _retencion_borrados (cliente_id uuid, tabla text) on commit drop;

  with b as (delete from public.facturas_electronicas where id in (select public._retencion_facturas(v_corte_dian, p_lote)) returning cliente_id)
  insert into _retencion_borrados select cliente_id, 'facturas' from b;
  with b as (delete from public.documentos_electronicos where id in (select public._retencion_documentos(v_corte_dian, p_lote)) returning cliente_id)
  insert into _retencion_borrados select cliente_id, 'documentos' from b;

  -- Primero las devoluciones: una venta con devolución no se puede borrar antes.
  with b as (delete from public.devoluciones where id in (select public._retencion_devoluciones(v_corte, p_lote)) returning cliente_id)
  insert into _retencion_borrados select cliente_id, 'devoluciones' from b;
  with b as (delete from public.ventas where id in (select public._retencion_ventas(v_corte, p_lote)) returning cliente_id)
  insert into _retencion_borrados select cliente_id, 'ventas' from b;
  with b as (delete from public.gastos where id in (select public._retencion_gastos(v_corte, p_lote)) returning cliente_id)
  insert into _retencion_borrados select cliente_id, 'gastos' from b;
  with b as (delete from public.cierres_caja where id in (select public._retencion_cierres(v_corte, p_lote)) returning cliente_id)
  insert into _retencion_borrados select cliente_id, 'cierres' from b;

  insert into public.bitacora_retencion_datos (cliente_id, tipo, fecha_limpieza, terminal, usuario, detalle)
  select cliente_id, 'limpieza', now(), 'nube', 'Sistema',
         jsonb_build_object('borradosAnterioresA', v_corte) || jsonb_object_agg(tabla, n)
  from (select cliente_id, tabla, count(*) n from _retencion_borrados group by 1, 2) t
  group by cliente_id;

  select jsonb_build_object('corte', v_corte, 'borrados', coalesce(jsonb_object_agg(tabla, n), '{}'::jsonb))
  into v_resultado
  from (select tabla, count(*) n from _retencion_borrados group by 1) t;
  return v_resultado;
end;
$function$;

revoke all on function public.ejecutar_retencion_nube(boolean, integer) from public, anon, authenticated;

-- Productos que nadie ha vendido en todo el periodo. Solo los lista: borrarlos
-- lo decide el dueño en la caja.
create or replace function public.productos_sin_movimiento()
returns table (id uuid, local_id text, nombre text, codigo_barras text, stock numeric, precio_venta numeric, creado timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id, p.local_id, p.nombre, p.codigo_barras, p.stock::numeric, p.precio_venta::numeric, p.created_at
  from public.productos p
  where p.cliente_id = public.current_cliente_id()
    and p.activo
    and p.created_at < public._retencion_corte()
    and not exists (
      select 1
      from public.venta_items i
      join public.ventas v on v.id = i.venta_id
      where v.cliente_id = p.cliente_id
        and v.created_at >= public._retencion_corte()
        and (i.producto_id = p.id or lower(btrim(i.nombre)) = lower(btrim(p.nombre)))
    )
  order by p.nombre
  limit 500
$$;

revoke all on function public.productos_sin_movimiento() from public, anon;
grant execute on function public.productos_sin_movimiento() to authenticated;
