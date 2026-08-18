-- Codec Verify: `registrar_pago_automatico` ahora acepta el TEXTO CRUDO del
-- SMS/notificación bancaria en `p_monto` (así es como lo envía hoy la macro
-- de MacroDroid ya configurada por el negocio) y extrae el monto dentro del
-- propio SQL, en vez de exigir que llegue ya separado como numeric. Sigue
-- funcionando también si algún puente ya envía solo el número (ej. el
-- Apps Script de Gmail, que hoy extrae el valor en JS antes de enviarlo) —
-- la misma expresión regular hace match en ambos casos.
--
-- Además agrega `numero_factura_local`: permite que el POS "reclame"
-- atómicamente una notificación (UPDATE condicionado a
-- `numero_factura_local is null`) para saber con certeza a qué venta
-- corresponde un pago cuando hay varias ventas esperando confirmación al
-- mismo tiempo. No se reutiliza `venta_id` (FK a public.ventas) porque esa
-- tabla es el esquema operativo legado — las ventas reales del POS viven en
-- IndexedDB local con ids tipo "FAC000123", no uuid.

alter table public.notificaciones_pago
  add column if not exists numero_factura_local text;

create index if not exists idx_notificaciones_pago_reclamo
  on public.notificaciones_pago(cliente_id, estado, numero_factura_local);

drop function if exists public.registrar_pago_automatico(text, numeric, text, text);
-- Defensivo: por si en algún ambiente se llegó a crear a mano una variante
-- de 3 parámetros (p_entidad con default, sin p_referencia) que insertaba
-- en columnas inexistentes (token/texto_original/procesado) — se elimina
-- para que no quede una segunda función ambigua junto a la de 4 parámetros.
drop function if exists public.registrar_pago_automatico(text, text, text);

create or replace function public.registrar_pago_automatico(
  p_token text,
  p_monto text,
  p_entidad text,
  p_referencia text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
  v_monto_texto text;
  v_monto numeric;
begin
  select id into v_cliente_id from public.clientes_pos where webhook_token = p_token;
  if v_cliente_id is null then
    raise exception 'Token de automatización inválido';
  end if;

  -- Primero intenta con símbolo de pesos ("$45.000", "$ 45,000.00" — igual
  -- que el patrón /\$\s?([\d.,]+)/ que ya usa el puente de Apps Script).
  v_monto_texto := substring(coalesce(p_monto, '') from '\$\s?([0-9][0-9.,]*)');
  if v_monto_texto is null then
    -- Sin "$" (algunos SMS bancarios no lo incluyen): toma la primera racha
    -- de al menos 4 dígitos/separadores como último recurso.
    v_monto_texto := substring(coalesce(p_monto, '') from '([0-9][0-9.,]{3,})');
  end if;
  if v_monto_texto is null then
    raise exception 'No se pudo extraer el monto del texto recibido: %', p_monto;
  end if;

  v_monto := replace(replace(v_monto_texto, '.', ''), ',', '')::numeric;
  if v_monto is null or v_monto <= 0 then
    raise exception 'Monto inválido extraído: %', v_monto_texto;
  end if;

  insert into public.notificaciones_pago (cliente_id, monto, entidad, referencia, origen, estado)
  values (v_cliente_id, v_monto, coalesce(p_entidad, 'otro'), coalesce(p_referencia, left(p_monto, 300)), 'automatizacion', 'confirmado');
end;
$$;
grant execute on function public.registrar_pago_automatico(text, text, text, text) to anon;
