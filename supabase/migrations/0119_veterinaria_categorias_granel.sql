-- 0119 · Categorías de Alimentos a Granel (Veterinaria) en la nube.
--
-- Electron las guarda en el equipo (localStorage `codecpos_veterinaria_granel_cats`).
-- La web y el celular no tienen ese equipo, así que las guardan aquí, con su
-- color e ícono. El producto queda ligado por nombre (productos.categoria),
-- que es lo que Electron ya sube a la nube.

create table if not exists public.veterinaria_categorias_granel (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  nombre text not null,
  icono text not null default 'general',
  color text not null default '#10b981',
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, nombre)
);
create index if not exists idx_vet_cat_granel_cliente on public.veterinaria_categorias_granel(cliente_id, orden);

alter table public.veterinaria_categorias_granel enable row level security;
drop policy if exists "veterinaria_categorias_granel tenant" on public.veterinaria_categorias_granel;
create policy "veterinaria_categorias_granel tenant" on public.veterinaria_categorias_granel
  for all to authenticated
  using (cliente_id = public.current_cliente_id() or public.es_staff_actual())
  with check (cliente_id = public.current_cliente_id() or public.es_staff_actual());
