-- 1. SEGURIDAD — cierra una escalada de privilegios.
--
-- La política empleados_update_self (0001) deja a cada empleado actualizar
-- SU fila, pero sin límite de columnas: un cajero podía cambiarse `rol` a
-- 'admin', darse `permisos`, marcarse `es_staff_codec` (acceso al panel de
-- desarrollador de TODOS los negocios) o moverse a otro `cliente_id`.
--
-- La app solo edita del propio usuario: nombre, teléfono, fecha de
-- nacimiento y foto (Mi perfil), el interruptor de Codec Verify y, desde
-- ahora, sus preferencias del menú. Esas son las únicas columnas que quedan
-- editables por el propio usuario. Lo administrativo (rol, permisos,
-- activar/desactivar, tienda) sigue pasando por las RPC security definer que
-- ya validan que quien llama sea admin del mismo negocio.
revoke update on public.empleados from authenticated, anon;
grant update (
  nombre_completo, telefono, fecha_nacimiento, foto_url,
  codec_verify_activo, codec_verify_actualizado_en, updated_at
) on public.empleados to authenticated;

-- 2. Preferencias del menú lateral por usuario (orden, ocultos y nombres
--    propios), para que el menú se vea igual en la web y en el celular.
alter table public.empleados
  add column if not exists preferencias_menu jsonb not null default '{}'::jsonb;
grant update (preferencias_menu) on public.empleados to authenticated;
