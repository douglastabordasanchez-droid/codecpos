-- Número de las ventas hechas en la web y el celular (W000123).
--
-- Antes la web tomaba «el número más alto del negocio + 1» con una consulta
-- y luego insertaba: dos celulares vendiendo en el mismo instante leían el
-- mismo máximo y repetían número. Aquí el siguiente número sale de un
-- contador por negocio que se incrementa en una sola sentencia (el bloqueo
-- de fila de Postgres ordena a los que llegan a la vez), así que no se
-- repite.
--
-- Las cajas de escritorio no usan esto: numeran localmente con la letra de
-- su caja (FEA000123), ver src/app/lib/numeracionCaja.ts.

begin;

create table if not exists public.venta_web_contadores (
  cliente_id uuid primary key references public.clientes_pos(id) on delete cascade,
  ultimo integer not null
);

alter table public.venta_web_contadores enable row level security;
-- Sin políticas: solo se toca a través de la función de abajo.

create or replace function public.siguiente_numero_venta_web(p_cliente_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_numero integer;
begin
  if p_cliente_id is null or p_cliente_id is distinct from public.current_cliente_id() then
    raise exception 'No autorizado para numerar ventas de este negocio';
  end if;

  -- La primera vez arranca después de la última venta web que ya exista.
  insert into public.venta_web_contadores as c (cliente_id, ultimo)
  values (
    p_cliente_id,
    coalesce((select max(v.numero) from public.ventas v where v.cliente_id = p_cliente_id and v.terminal_id = 'PWA'), 0) + 1
  )
  on conflict (cliente_id) do update set ultimo = c.ultimo + 1
  returning ultimo into v_numero;

  return v_numero;
end;
$function$;

revoke all on function public.siguiente_numero_venta_web(uuid) from public, anon;
grant execute on function public.siguiente_numero_venta_web(uuid) to authenticated;

commit;
