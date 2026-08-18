-- Mismo backfill que 0034 hizo para artes_graficas: los negocios que ya
-- existían tienen `modulos_activos` fijado explícitamente, así que un
-- módulo nuevo en el catálogo no se les concede solo. Se agrega a la
-- licencia de todos los que ya tengan el array fijado — el dueño (Codec
-- Studio) sigue teniendo control total para apagarlo por cliente desde
-- Panel Desarrollador > Clientes cuando ese negocio no lo necesite.
update public.clientes_pos
set modulos_activos = array_append(modulos_activos, 'papeleria_pinateria')
where modulos_activos is not null
  and not ('papeleria_pinateria' = any(modulos_activos));
