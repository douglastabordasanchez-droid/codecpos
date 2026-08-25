-- Ajuste de registrar_pago_automatico para notificaciones REALES de Bancolombia
-- (probadas contra capturas de pantalla del celular del negocio, 2026-08-19).
--
-- Bugs encontrados con texto real de Bancolombia:
--
--   1) Bancolombia formatea el monto en estilo US ("$41,000.00", "$50.00":
--      coma = separador de miles, PUNTO = decimal) — al revés de lo que
--      0044 asumía (es-CO: punto=miles, coma=decimal). La rama "sin coma
--      decimal" de 0044 borraba el punto Y la coma por igual, así que
--      "$41,000.00" quedaba en 4100000 (100x más) y "$50.00" quedaba en
--      5000 (100x más). Fix: se agrega una tercera rama que detecta
--      terminación en PUNTO + 2 dígitos como decimal US y solo borra la
--      coma, dejando el punto como separador decimal.
--
--   2) La ventana de 40 caracteres para "palabra clave -> monto" (paso 1)
--      es insuficiente cuando el nombre del remitente es largo, ej.
--      "recibiste una transferencia de KAREN DAYANA BENAVIDES GUZMAN por
--      $41,000.00" tiene 57 caracteres entre "recibiste" y "$" — se amplía
--      a 80.
--
--   3) Blindaje nuevo: Bancolombia manda notificaciones de transferencias
--      SALIENTES con el mismo remitente/formato que las entrantes, ej.
--      "MICHAEL, transferiste $40.000 a la llave ... SARMIENTO". Si algún
--      día el filtro de MacroDroid deja pasar una de estas (o alguien arma
--      una macro genérica "Contiene: Bancolombia" sin filtrar por
--      "recibiste"), NO debe registrarse como pago recibido. Se agrega un
--      rechazo explícito cuando el texto trae un verbo de envío propio
--      (transferiste/enviaste/pagaste/retiraste/compraste) antes de
--      intentar extraer ningún monto.
--
-- No cambia la firma de la función ni el contrato con el cliente — solo
-- lógica interna. No requiere ningún cambio ni recompilación de la app,
-- solo pegar este archivo en el SQL Editor de Supabase.

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
  v_texto text;
  v_monto_texto text;
  v_monto numeric;
begin
  select id into v_cliente_id from public.clientes_pos where webhook_token = p_token;
  if v_cliente_id is null then
    raise exception 'Token de automatización inválido';
  end if;

  v_texto := coalesce(p_monto, '');

  -- Blindaje: nunca registrar como pago recibido una notificación de
  -- transacción SALIENTE (el negocio enviando/pagando/retirando dinero).
  if v_texto ~* '\y(transferiste|enviaste|pagaste|retiraste|compraste)\y' then
    raise exception 'Notificación de transacción saliente, no se registra como pago recibido: %', v_texto;
  end if;

  -- 1) Prioridad: número que venga justo después de una palabra clave de
  --    dinero entrante — evita confundir el monto real con un saldo u otra
  --    cifra que aparezca antes en el mismo texto. Ventana ampliada a 80
  --    caracteres (nombres largos de remitente empujaban el "$" fuera de
  --    los 40 originales). El "$" sigue siendo opcional (Nequi no siempre
  --    lo incluye).
  v_monto_texto := substring(
    v_texto from
    '(?i)(?:recib\w*|enviaron|envi[oó]|transfirieron|pagaron|deposit\w*)\D{0,80}\$?\s?([0-9][0-9.,]*)'
  );

  -- 2) Si no hubo esa combinación, cualquier "$<número>" del texto.
  if v_monto_texto is null then
    v_monto_texto := substring(v_texto from '\$\s?([0-9][0-9.,]*)');
  end if;

  -- 3) Último recurso, sin símbolo de pesos: primera racha de al menos 4
  --    dígitos/separadores.
  if v_monto_texto is null then
    v_monto_texto := substring(v_texto from '([0-9][0-9.,]{3,})');
  end if;

  if v_monto_texto is null then
    raise exception 'No se pudo extraer el monto del texto recibido: %', p_monto;
  end if;

  -- Tres formatos posibles de separador decimal:
  --   a) es-CO con centavos: "45.000,50" -> coma decimal, punto miles.
  --   b) US/Bancolombia con centavos: "41,000.00" o "50.00" -> punto
  --      decimal, coma miles.
  --   c) Sin centavos explícitos: "320.000" o "41,000" -> punto y coma son
  --      ambos separador de miles (se descartan los dos).
  if v_monto_texto ~ ',\d{2}$' then
    v_monto := replace(replace(v_monto_texto, '.', ''), ',', '.')::numeric;
  elsif v_monto_texto ~ '\.\d{2}$' then
    v_monto := replace(v_monto_texto, ',', '')::numeric;
  else
    v_monto := replace(replace(v_monto_texto, '.', ''), ',', '')::numeric;
  end if;

  if v_monto is null or v_monto <= 0 then
    raise exception 'Monto inválido extraído: %', v_monto_texto;
  end if;

  insert into public.notificaciones_pago (cliente_id, monto, entidad, referencia, origen, estado)
  values (v_cliente_id, v_monto, coalesce(p_entidad, 'otro'), coalesce(p_referencia, left(p_monto, 300)), 'automatizacion', 'confirmado');
end;
$$;
grant execute on function public.registrar_pago_automatico(text, text, text, text) to anon;
