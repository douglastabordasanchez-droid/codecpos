-- El botón "Menú" del menú inferior de la app móvil se reemplaza por acceso
-- directo a "Nuevo producto" — el menú lateral completo sigue disponible
-- desde el ícono de hamburguesa en la barra superior (TopBar.tsx), así que
-- no se pierde ningún acceso, solo se libera un slot para algo de uso más
-- frecuente en el día a día.
--
-- El default en código (menuInferiorCatalogo.ts) ya cambió, pero los
-- negocios que ya existían tienen `menu_inferior` fijado explícitamente en
-- la base de datos (JSON), así que no heredan el nuevo default solos —
-- este backfill reemplaza 'menu' por 'nuevo_producto' donde aparezca en el
-- lado derecho de la configuración ya guardada.
update public.clientes_pos
set menu_inferior = jsonb_set(
  menu_inferior,
  '{derecha}',
  (
    select jsonb_agg(case when elem = '"menu"'::jsonb then '"nuevo_producto"'::jsonb else elem end)
    from jsonb_array_elements(menu_inferior->'derecha') elem
  )
)
where menu_inferior is not null
  and menu_inferior ? 'derecha'
  and menu_inferior->'derecha' @> '["menu"]'::jsonb;
