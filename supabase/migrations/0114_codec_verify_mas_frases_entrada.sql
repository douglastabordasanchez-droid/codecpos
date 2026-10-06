-- Codec Verify: más formas en que los bancos avisan que ENTRÓ dinero ("te mandaron",
-- "se acreditó", "nuevo ingreso", "entró dinero"...), y el aviso de Nequi
-- "Tu plata llegó con éxito, la plata ya está en el Nequi destino" (dinero que el
-- negocio ENVIÓ) como salida. "bono de" ahora es palabra completa: "abono de $15.000"
-- se descartaba como si fuera una promoción. La misma lista vive en ClasificadorAviso.kt.

create or replace function public.clasificar_aviso_pago(p_texto text, out clasificacion text, out motivo text)
language plpgsql
immutable
set search_path = public
as $$
declare
  t text;
  m text;
begin
  -- Minúsculas y sin tildes: "envió", "Envio" y "ENVÍO" se leen igual.
  t := lower(translate(coalesce(p_texto, ''), 'ÁÉÍÓÚÜÑáéíóúüñ¡¿', 'AEIOUUNaeiouun  '));
  t := regexp_replace(t, '\s+', ' ', 'g');

  -- a) Evidencia de que el dinero SALIÓ (o el movimiento falló): gana siempre.
  m := substring(t from '(enviaste|has enviado|le enviaste|transferiste|has transferido|transferencia enviada|transferencia realizada|transferencia exitosa a|pagaste|pasaste|has pagado|has realizado un pago|realizaste|hiciste (un|una) (pago|compra|transferencia|envio|retiro)|pago realizado|pago exitoso|pago aprobado|tu pago|recibimos tu|compraste|compra (en|aprobada|rechazada|por|exitosa|realizada)|retiraste|retiro (en|de|por|exitoso)|sacaste|se debito|debitamos|debito (de|por|en|automatico)|te cobramos|cobro (de|por)|cuota de manejo|salio de tu|salida de dinero|recarga (exitosa|de)|recargaste|fondos insuficientes|saldo insuficiente|rechazad[ao]|declinad[ao]|no procesad[ao]|no fue posible|no se pudo|fallid[ao]|envio exitoso|tu plata llego|ya esta en el nequi destino|nequi destino|llego a su destino)');
  if m is not null then
    clasificacion := 'enviado';
    motivo := 'dice "' || m || '"';
    return;
  end if;

  -- b) Avisos que no son un movimiento de dinero aunque usen "recibiste" o "te enviaron".
  m := substring(t from '(solicitud|te pidi|te esta pidiendo|pidiendo plata|cobrarte|codigo de (seguridad|verificacion|acceso)|tu codigo|clave dinamica|contrasena|token|inicio de sesion|iniciaste sesion|ingresaste|nuevo dispositivo|alerta de seguridad|promo|descuento|cashback|puntos|\ybono de|gana |sorteo|credito aprobado|prestamo|monedas|gemas|diamantes|millas|cupon|recompensa)');
  if m is not null then
    clasificacion := 'otro';
    motivo := 'no es un pago, dice "' || m || '"';
    return;
  end if;

  -- c) Evidencia de que el dinero ENTRÓ.
  m := substring(t from '(recibiste|has recibido|te enviaron|te envio|te transfirieron|te transfirio|te llego|te llegaron|te pasaron|te paso|te consignaron|te consigno|te abonaron|te abono|te depositaron|te deposito|te pagaron|te pago|pago recibido|dinero recibido|plata recibida|transferencia recibida|abono recibido|abono a tu|abonamos|consignacion (exitosa|recibida)|entrada de dinero|ingreso de dinero|tu (cuenta|nequi|daviplata|llave) recibio|te mandaron|te mando|te giraron|te giro|te acreditaron|se acredito|se acreditaron|acreditamos|nuevo ingreso|tienes un ingreso|ingreso a tu|entro dinero|entro plata|te entro|transferencia entrante|envio recibido|deposito recibido|giro recibido)');
  if m is not null then
    clasificacion := 'recibido';
    motivo := 'dice "' || m || '"';
    return;
  end if;

  clasificacion := 'otro';
  motivo := 'no dice que entró dinero';
end;
$$;
grant execute on function public.clasificar_aviso_pago(text) to anon, authenticated;
