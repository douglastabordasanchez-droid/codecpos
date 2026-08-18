-- Artes Gráficas: categoría (para agrupar en tarjetas) y foto de producto —
-- hasta ahora el catálogo era solo texto/precios, sin forma de organizar
-- por categoría ni de mostrar una imagen real del producto.
alter table public.artes_graficas_productos
  add column if not exists categoria text,
  add column if not exists foto_url text;
