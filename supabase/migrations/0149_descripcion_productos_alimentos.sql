-- Descripción (ingredientes) de cada producto de Alimentos y Bebidas: la
-- carta del negocio la trae ("Papas a la francesa, salchicha, queso...") y se
-- importa desde Excel. Opcional; los productos existentes quedan sin ella.
alter table public.panaderia_productos add column if not exists descripcion text;
