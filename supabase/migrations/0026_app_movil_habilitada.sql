-- Gate de pago para la app móvil (PWA) por cliente.
--
-- Hoy CUALQUIER empleado con credenciales válidas puede entrar a la PWA sin
-- ningún control de pago — este flag permite al staff de Codec Studio
-- decidir, por negocio, si la app móvil está activada.
--
-- Default TRUE a propósito: hay negocios reales ya usando la PWA hoy sin
-- este control (no hay forma de distinguir automáticamente "ya paga por
-- esto" de "nunca debió tener acceso"). Partir en FALSE los habría
-- desconectado de golpe. El staff puede desactivar manualmente, desde el
-- Panel Desarrollador, los negocios que no correspondan.
alter table public.clientes_pos
  add column if not exists app_movil_habilitada boolean not null default true;
