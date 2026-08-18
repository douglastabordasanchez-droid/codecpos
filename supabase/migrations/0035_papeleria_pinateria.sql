-- Papelería y Piñatería (Fiestas, Dulcería y Juguetería): NO es un catálogo
-- aparte como Artes Gráficas — es una EXTENSIÓN del inventario general
-- (`productos`), igual que ya existe `tipoInventario` para Panadería. Un
-- producto de este rubro es un producto más: mismo stock, mismo checkout,
-- misma sincronización ya probada (push/pull con hash + Realtime, ver
-- syncService.ts). Solo trae metadatos propios del sector para filtrar en
-- caja y para la carga masiva por plantillas.
alter table public.productos
  add column if not exists categoria_especifica text,
  add column if not exists tematica text,
  add column if not exists calibre_globo text,
  add column if not exists color_acabado text,
  add column if not exists marca text,
  add column if not exists es_dulceria boolean not null default false,
  add column if not exists permitir_fraccion boolean not null default false,
  add column if not exists componentes_combo jsonb,
  add column if not exists es_papeleria_pinateria boolean not null default false,
  add column if not exists unidades_por_bolsa integer,
  add column if not exists venta_por_unidad boolean not null default true,
  add column if not exists lote text;

-- Filtro rápido en caja: "todo lo de este módulo" y "por temática" son las
-- dos consultas más frecuentes que va a hacer un cajero en pleno mostrador.
create index if not exists idx_productos_papeleria_pinateria
  on public.productos(cliente_id, es_papeleria_pinateria) where es_papeleria_pinateria = true;
create index if not exists idx_productos_tematica
  on public.productos(cliente_id, tematica) where tematica is not null;
