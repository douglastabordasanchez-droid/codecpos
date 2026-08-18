-- Codec Verify: hasta ahora el interruptor "activar en este celular" vivía
-- SOLO en el localStorage del navegador del teléfono — Electron no tenía
-- forma de saber si el dueño (o algún empleado) ya lo había activado desde
-- su celular. Se agrega el estado a `empleados` (mismo dueño de la sesión
-- que enciende el interruptor) para que la pantalla de Electron pueda
-- mostrar "sí, Juan ya lo activó en su celular hace 3 min".
alter table public.empleados
  add column if not exists codec_verify_activo boolean not null default false,
  add column if not exists codec_verify_actualizado_en timestamptz;
