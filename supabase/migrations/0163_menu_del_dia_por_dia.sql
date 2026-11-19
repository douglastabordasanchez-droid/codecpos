-- 0163: almuerzo del día guardado por día de la semana.
--
-- Cada publicación queda también como «el menú de ese día de la semana»
-- ({"1": {fecha, precio, grupos, adicionales}, …}, 0 = domingo). Así el lunes
-- siguiente el editor ya viene con el del lunes pasado y solo se cambia lo nuevo.
alter table public.menu_del_dia add column if not exists por_dia jsonb not null default '{}'::jsonb;

-- El menú que ya está publicado queda como el de su día de la semana.
update public.menu_del_dia m
set por_dia = jsonb_build_object(
  extract(dow from m.fecha)::int::text,
  jsonb_build_object(
    'fecha', m.fecha,
    'precio', coalesce((select p.precio from public.panaderia_productos p where p.cliente_id = m.cliente_id and p.local_id = 'almuerzo-del-dia'), 0),
    'grupos', m.grupos,
    'adicionales', m.adicionales
  )
)
where m.por_dia = '{}'::jsonb and jsonb_array_length(m.grupos) > 0;
