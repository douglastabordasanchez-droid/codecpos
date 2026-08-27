-- Agenda de turnos de estética/grooming (baños, corte, desparasitación) del
-- módulo Veterinaria y Mascotas. Registra al tutor y la mascota vinculados
-- al turno -- lo mínimo para que el cajero sepa a quién está atendiendo sin
-- reescribirlo cada vez.

create table if not exists public.citas_grooming (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  tutor_nombre text not null,
  tutor_telefono text,
  mascota_nombre text not null,
  especie text check (especie in ('perro', 'gato', 'aves', 'generales')),
  raza text,
  tipo_pelo text,
  observaciones text,
  servicio text not null,
  precio numeric(12,2) not null default 0,
  fecha_hora timestamptz not null,
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA')),
  venta_id uuid references public.ventas(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_citas_grooming_cliente on public.citas_grooming(cliente_id, fecha_hora);

alter table public.citas_grooming enable row level security;

create policy "citas_grooming tenant" on public.citas_grooming
  for all to authenticated
  using (cliente_id = public.current_cliente_id() or public.es_staff_actual())
  with check (cliente_id = public.current_cliente_id() or public.es_staff_actual());
