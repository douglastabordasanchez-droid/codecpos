-- Los clientes que ya existían antes de este módulo tienen `modulos_activos`
-- como un array explícito (fijado por Panel Desarrollador), así que un
-- módulo nuevo en el catálogo NO se les concede automáticamente aunque su
-- plan sea PREMIUM — hay que agregarlo a la licencia de cada uno que ya
-- tenga el array fijado. Los que todavía tengan `modulos_activos is null`
-- ya lo ven solo (fallback por plan en useModulosActivos.ts / permissions.ts),
-- así que este backfill solo toca a quien de verdad lo necesita.
update public.clientes_pos
set modulos_activos = array_append(modulos_activos, 'artes_graficas')
where modulos_activos is not null
  and not ('artes_graficas' = any(modulos_activos));
