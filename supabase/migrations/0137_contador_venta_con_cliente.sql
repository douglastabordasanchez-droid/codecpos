-- 0137 · Mi contador: la venta viaja otra vez cuando su factura queda aceptada.
--
-- Codec Document pide el cliente de la factura dentro del evento `venta`
-- (cliente_nit, cliente_nombre, cliente_tipo_documento) para contabilizarla
-- el mismo día con su tercero. Pero la venta se encola 2 minutos después de
-- nacer y la factura muchas veces se acepta después (Electron sin internet,
-- DIAN lenta), así que la venta ya había salido sin CUFE ni cliente.
--
-- Ahora, al aceptarse la factura en producción, además de encolar su XML se
-- devuelve a pendiente el evento de la venta. Reenviar no duplica en Codec
-- Document: el mismo id_origen corrige el registro.

create or replace function public.contador_encolar_factura()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_venta_id uuid;
begin
  if new.estado = 'accepted'
     and coalesce(new.issuer_ambiente, '') = 'produccion'
     and (tg_op = 'INSERT' or old.estado is distinct from 'accepted')
     and exists (select 1 from public.contador_vinculos v where v.cliente_id = new.cliente_id and v.estado = 'activo') then
    insert into public.contador_eventos (cliente_id, tipo, id_origen, fecha_origen)
    values (new.cliente_id, 'factura_electronica', new.id::text, coalesce(new.fecha_emision, new.created_at))
    on conflict (cliente_id, tipo, id_origen) do nothing;

    -- La factura apunta a su venta por el número de caja (FE000017) o, si se
    -- vendió en la web, por el id de la venta.
    select ve.id into v_venta_id
    from public.ventas ve
    where ve.cliente_id = new.cliente_id
      and (ve.local_id = new.venta_referencia or ve.id::text = new.venta_referencia)
    limit 1;

    if v_venta_id is not null then
      update public.contador_eventos
      set estado = 'pendiente', intentos = 0, motivo = null, proximo_intento_en = now()
      where cliente_id = new.cliente_id and tipo = 'venta' and id_origen = v_venta_id::text
        and estado in ('enviado', 'duplicado', 'rechazado');
    end if;
  end if;
  return new;
end;
$function$;
