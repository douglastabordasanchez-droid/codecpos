-- Módulo Veterinaria/Pet Shop — campos de producto para venta a granel con
-- báscula (bultos de alimento), y control de recetas/especie para
-- medicamentos y servicios médicos. `lote` ya existía (migración de
-- Papelería/Piñatería) y se reutiliza tal cual, sin duplicar la columna.

alter table public.productos add column if not exists tipo_producto text
  check (tipo_producto in ('fisico', 'servicio', 'granel'));
alter table public.productos add column if not exists es_bulto boolean not null default false;
alter table public.productos add column if not exists peso_bulto_kg numeric(10,3);
alter table public.productos add column if not exists precio_por_kilo numeric(12,2);
alter table public.productos add column if not exists rendimiento_raciones numeric(10,2);
alter table public.productos add column if not exists especie text
  check (especie in ('perro', 'gato', 'aves', 'generales'));
alter table public.productos add column if not exists requiere_receta boolean not null default false;

comment on column public.productos.tipo_producto is 'Veterinaria: fisico (normal) / servicio (baño, consulta, vacuna -- no descuenta stock por unidad) / granel (se vende por peso desde un bulto cerrado).';
comment on column public.productos.es_bulto is 'Este registro ES el bulto cerrado (ej. 25kg) del que se descuentan ventas a granel -- ver peso_bulto_kg.';
comment on column public.productos.peso_bulto_kg is 'Peso total del bulto cerrado, en kg.';
comment on column public.productos.precio_por_kilo is 'Precio de venta por kilo cuando se fracciona el bulto (el precio por gramo se deriva al vender).';
