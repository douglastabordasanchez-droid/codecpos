-- 0169 · Aviso de pago pendiente con mensaje propio.
--
-- El staff puede mandar a un negocio un aviso con su propio texto (por ejemplo
-- «Tienes un saldo pendiente de $70.000…»). Sale como alerta en vivo en la
-- caja, la web y el celular, por el mismo canal de los avisos de vencimiento.
-- Las cajas que aún no leen `mensaje` muestran el texto general de renovación.

alter table public.avisos_licencia add column if not exists mensaje text;

alter table public.avisos_licencia drop constraint if exists avisos_licencia_tipo_check;
alter table public.avisos_licencia add constraint avisos_licencia_tipo_check
  check (tipo in ('RENOVACION_PROXIMA', 'VENCE_EN_2_DIAS', 'VENCE_EN_1_DIA', 'PAGO_PENDIENTE_HOY'));
