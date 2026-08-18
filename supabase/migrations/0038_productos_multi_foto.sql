-- Hasta 6 fotos por producto (antes solo `foto_url`, una sola). Se mantiene
-- `foto_url` como portada/miniatura (primera foto) para no romper ninguna
-- pantalla existente que ya la lee (grillas, tickets, PDF) — `fotos_urls`
-- es el array completo, nuevo, opcional.
alter table public.productos
  add column if not exists fotos_urls text[];
