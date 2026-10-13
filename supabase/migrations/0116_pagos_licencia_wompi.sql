-- Pago de licencias también con Wompi (Nequi, PSE, tarjeta, Bancolombia), al
-- lado de Mercado Pago. La cuenta de Wompi es la misma de Codec Flow y su URL
-- de eventos ya apunta allá, así que Codec POS no usa webhook: la función
-- verificar-pago-wompi consulta la transacción en Wompi (con la llave privada,
-- en el servidor) y activa la licencia. La referencia que ve Wompi es
-- 'cpos_' || external_reference, para que Codec Flow la reconozca y la ignore.

begin;

alter table public.pagos_licencia
  add column if not exists proveedor text not null default 'MERCADOPAGO',
  add column if not exists wompi_transaction_id text unique;

alter table public.pagos_licencia drop constraint if exists pagos_licencia_proveedor_check;
alter table public.pagos_licencia add constraint pagos_licencia_proveedor_check
  check (proveedor in ('MERCADOPAGO', 'WOMPI'));

comment on column public.pagos_licencia.proveedor is 'Pasarela del intento: MERCADOPAGO (webhook) o WOMPI (verificar-pago-wompi).';
comment on column public.pagos_licencia.respuesta_mp is 'Última respuesta de la pasarela (Mercado Pago o Wompi) usada para decidir el estado.';

alter table public.licencias drop constraint if exists licencias_origen_check;
alter table public.licencias add constraint licencias_origen_check
  check (origen in ('MANUAL_STAFF', 'TRIAL_SIGNUP', 'MERCADOPAGO', 'WOMPI', 'MIGRACION_LEGACY'));

-- Solo una verificación puede pasar el intento a APROBADO y activar la
-- licencia, aunque el cliente refresque o Electron y la web consulten a la vez.
create or replace function public.tomar_pago_licencia_aprobado(p_pago_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  with t as (
    update public.pagos_licencia
       set estado = 'APROBADO', procesado_en = now()
     where id = p_pago_id and estado in ('PENDIENTE', 'EN_PROCESO')
    returning 1
  )
  select exists (select 1 from t);
$$;

revoke all on function public.tomar_pago_licencia_aprobado(uuid) from public, anon, authenticated;
grant execute on function public.tomar_pago_licencia_aprobado(uuid) to service_role;

commit;
