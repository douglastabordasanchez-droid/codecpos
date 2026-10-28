-- 0135 · Nota del administrador para el contador en cada factura electrónica.
--
-- El administrador escribe (o cambia) en Facturación › Facturas de venta una
-- nota interna para su contador: el cliente final no la ve y no va en el XML
-- de la DIAN. Si el negocio tiene "Mi contador" conectado, la nota viaja a
-- Codec Document como el evento 'nota_factura' (contador-sync) y el contador
-- la ve en el detalle de la factura. Cada cambio la vuelve a mandar.

alter table public.facturas_electronicas
  add column if not exists nota_contador text,
  add column if not exists nota_contador_actualizada_en timestamptz;

alter table public.contador_eventos drop constraint if exists contador_eventos_tipo_check;
alter table public.contador_eventos add constraint contador_eventos_tipo_check check (tipo in (
  'venta', 'factura_electronica', 'anulacion', 'gasto', 'devolucion', 'cierre_caja',
  'nota_credito', 'nota_debito', 'documento_soporte', 'nota_factura'
));

-- Se encola cuando cambia la nota de una factura ya aprobada en producción
-- (y cuando se aprueba una factura que ya traía nota). Si el evento ya
-- existía (la nota se editó), vuelve a quedar pendiente para mandar la
-- versión nueva; la fecha va un instante después de la factura para que
-- Codec Document reciba primero la factura.
create or replace function public.contador_encolar_nota_factura()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.estado = 'accepted'
     and coalesce(new.issuer_ambiente, '') = 'produccion'
     and (
       -- la nota cambió (también si la borraron: el contador ve que ya no hay nota)
       (tg_op = 'UPDATE' and coalesce(new.nota_contador, '') is distinct from coalesce(old.nota_contador, ''))
       -- o la factura recién se aprueba y ya traía nota
       or (coalesce(new.nota_contador, '') <> '' and (tg_op = 'INSERT' or old.estado is distinct from 'accepted'))
     )
     and public.contador_conectado(new.cliente_id) then
    insert into public.contador_eventos (cliente_id, tipo, id_origen, fecha_origen)
    values (new.cliente_id, 'nota_factura', new.id::text,
            greatest(coalesce(new.fecha_emision, new.created_at) + interval '1 second', coalesce(new.nota_contador_actualizada_en, now())))
    on conflict (cliente_id, tipo, id_origen) do update
      set estado = 'pendiente', intentos = 0, motivo = null, proximo_intento_en = now(), enviado_en = null;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_contador_encolar_nota_factura on public.facturas_electronicas;
create trigger trg_contador_encolar_nota_factura
  after insert or update of nota_contador, estado on public.facturas_electronicas
  for each row execute function public.contador_encolar_nota_factura();
