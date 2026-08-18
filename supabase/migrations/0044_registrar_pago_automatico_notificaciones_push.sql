-- Codec Verify: el negocio cambió MacroDroid de "SMS Received" a "Notification"
-- (Nequi, Daviplata, Bancolombia) para evitar el retraso de los SMS bancarios.
-- El texto crudo de una notificación push suele traer más contexto que un SMS
-- bancario clásico (nombre del remitente, número de cuenta enmascarado, y en
-- algunos bancos hasta el saldo disponible en el mismo mensaje) — eso rompía
-- dos supuestos que la versión anterior de `registrar_pago_automatico` daba
-- por sentados:
--
--   1) Que el PRIMER "$<número>" del texto siempre es el monto recibido.
--      Falso en notificaciones que muestran el saldo antes que el monto
--      (ej. "Tu saldo es $320.000. Recibiste $45.000..." — la versión vieja
--      extraía 320.000, el saldo, no el pago real).
--   2) Que nunca hay coma decimal, solo punto de miles — así que la versión
--      vieja hacía `replace(x,'.','')` y `replace(x,',','')` sobre el mismo
--      texto sin distinguir, lo que corrompe un monto con centavos tipo
--      "45.000,50" (formato es-CO: punto=miles, coma=decimal) convirtiéndolo
--      en 4.500.050 en vez de 45.000,50.
--
-- Fix, en dos partes:
--   a) Antes de aceptar el primer "$<número>" que aparezca en el texto, se
--      intenta primero encontrar uno que esté precedido (a menos de 40
--      caracteres) por una palabra clave de "dinero entrante" (recibiste,
--      recibió, te enviaron, envió, transfirieron, pagaron, depositaron).
--      Si esa combinación existe, se usa ese monto — así un saldo mostrado
--      antes en el mismo texto ya no puede ganarle al monto real. Si no
--      existe esa combinación (formatos más viejos/simples), se cae al
--      comportamiento anterior: el primer "$<número>" del texto completo.
--   b) Antes de limpiar separadores, se detecta si el texto capturado termina
--      en coma+2 dígitos (ej. "45.000,50") — si es así, el punto se trata
--      como separador de miles y la coma como decimal; si no, ambos se tratan
--      como separadores de miles (comportamiento anterior, sigue intacto
--      para el caso normal sin centavos).
--
-- No cambia la firma de la función ni el contrato con el cliente (Tasker/
-- MacroDroid/Apps Script siguen enviando el mismo payload) — solo la lógica
-- interna de extracción. Ver también CodecVerifyConexionPage.tsx, tarjeta
-- "Por notificación push" (más rápida que SMS, mismo webhook/token).
--
-- Corrección (mismo día, probado contra una notificación real de Nequi):
-- la notificación de "Envío" de Nequi NO trae símbolo "$" — el texto real es
-- del estilo "CINDY NINO te envió 50, ¡lo mejor!" (monto pegado justo después
-- del verbo, sin "$" y a veces con muy pocos dígitos). La primera versión de
-- este fix seguía exigiendo "$" en el tramo con palabra clave, así que ese
-- caso real caía hasta el último recurso (racha de 4+ dígitos sueltos) y
-- fallaba porque "50" no llega a 4 caracteres. Además tenía una errata:
-- `env[oó]` (le faltaba la "i" de "envió"/"envio", así que ni con "$" habría
-- hecho match). Fix: el símbolo "$" ahora es opcional en el tramo con
-- palabra clave — sigue anclado a la palabra ("recib…", "envió", "enviaron",
-- "transfirieron", "pagaron", "depositaron") para no confundirse con un
-- saldo u otra cifra, pero ya no depende de que el monto lleve peso ($).

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

  -- 1) Prioridad: número que venga justo después de una palabra clave de
  --    dinero entrante — evita confundir el monto real con un saldo u otra
  --    cifra que aparezca antes en el mismo texto de la notificación. El "$"
  --    es OPCIONAL aquí a propósito (ver nota arriba: Nequi no siempre lo
  --    incluye) — lo que ancla el match es la palabra clave, no el símbolo.
  v_monto_texto := substring(
    coalesce(p_monto, '') from
    '(?i)(?:recib\w*|enviaron|envi[oó]|transfirieron|pagaron|deposit\w*)\D{0,40}\$?\s?([0-9][0-9.,]*)'
  );

  -- 2) Si no hubo esa combinación, cualquier "$<número>" del texto (igual que
  --    la versión anterior — cubre "$45.000", "$ 45.000", etc.).
  if v_monto_texto is null then
    v_monto_texto := substring(coalesce(p_monto, '') from '\$\s?([0-9][0-9.,]*)');
  end if;

  -- 3) Último recurso, sin símbolo de pesos: primera racha de al menos 4
  --    dígitos/separadores (algunos SMS bancarios no incluyen "$").
  if v_monto_texto is null then
    v_monto_texto := substring(coalesce(p_monto, '') from '([0-9][0-9.,]{3,})');
  end if;

  if v_monto_texto is null then
    raise exception 'No se pudo extraer el monto del texto recibido: %', p_monto;
  end if;

  -- Formato es-CO: si termina en coma + exactamente 2 dígitos, es decimal
  -- ("45.000,50" → 45000.50); si no, coma y punto son ambos separador de
  -- miles ("45.000" o el caso raro "45,000" → 45000).
  if v_monto_texto ~ ',\d{2}$' then
    v_monto := replace(replace(v_monto_texto, '.', ''), ',', '.')::numeric;
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
