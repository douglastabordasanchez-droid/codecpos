-- Ficha clínica de mascotas para el módulo Veterinaria y Mascotas: perfil
-- permanente por mascota (no solo por visita, como pasaba con
-- citas_grooming, que pedía tutor/mascota desde cero cada vez), historial
-- de peso para seguimiento de evolución, y un historial clínico unificado
-- (vacunas, desparasitaciones, consultas, cirugías) con fecha de próximo
-- refuerzo para poder generar recordatorios. `citas_grooming` (0080) se
-- amplía con `tipo` y `mascota_id` para que la misma agenda sirva tanto
-- para turnos de estética como para citas médicas generales, sin duplicar
-- esa infraestructura.

create table if not exists public.mascotas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  propietario_nombre text not null,
  propietario_telefono text,
  -- Vínculo suave (no FK) al cliente de fidelización -- ese catálogo es
  -- offline-first (IndexedDB en Electron) y solo se refleja en la nube de
  -- forma asíncrona vía clientes_fidelizacion.local_id, así que no siempre
  -- existe todavía como fila real cuando se registra la mascota.
  propietario_local_id text,
  nombre text not null,
  especie text check (especie in ('perro', 'gato', 'aves', 'generales')),
  raza text,
  sexo text check (sexo in ('macho', 'hembra', 'desconocido')),
  fecha_nacimiento date,
  color text,
  peso_actual numeric(6,2),
  alergias text,
  notas text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_mascotas_cliente on public.mascotas(cliente_id, nombre);
create index if not exists idx_mascotas_propietario_local on public.mascotas(cliente_id, propietario_local_id);

alter table public.mascotas enable row level security;
create policy "mascotas tenant" on public.mascotas
  for all to authenticated
  using (cliente_id = public.current_cliente_id() or public.es_staff_actual())
  with check (cliente_id = public.current_cliente_id() or public.es_staff_actual());

-- Evolución de peso, para la gráfica de la ficha clínica.
create table if not exists public.mascota_peso (
  id uuid primary key default gen_random_uuid(),
  mascota_id uuid not null references public.mascotas(id) on delete cascade,
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  peso numeric(6,2) not null,
  fecha date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists idx_mascota_peso_mascota on public.mascota_peso(mascota_id, fecha);

alter table public.mascota_peso enable row level security;
create policy "mascota_peso tenant" on public.mascota_peso
  for all to authenticated
  using (cliente_id = public.current_cliente_id() or public.es_staff_actual())
  with check (cliente_id = public.current_cliente_id() or public.es_staff_actual());

-- Historial clínico unificado: vacunas, desparasitaciones, consultas y
-- cirugías en una sola línea de tiempo por mascota (así se ve en el
-- software veterinario real, en vez de separar vacunas de consultas).
-- `proxima_fecha` es lo que alimenta los recordatorios de vacuna/desparasitación.
create table if not exists public.mascota_eventos (
  id uuid primary key default gen_random_uuid(),
  mascota_id uuid not null references public.mascotas(id) on delete cascade,
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  tipo text not null check (tipo in ('vacuna', 'desparasitacion', 'consulta', 'cirugia', 'otro')),
  descripcion text not null,
  fecha date not null default current_date,
  proxima_fecha date,
  veterinario text,
  notas text,
  recordatorio_enviado boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_mascota_eventos_mascota on public.mascota_eventos(mascota_id, fecha desc);
create index if not exists idx_mascota_eventos_proxima on public.mascota_eventos(cliente_id, proxima_fecha) where proxima_fecha is not null;

alter table public.mascota_eventos enable row level security;
create policy "mascota_eventos tenant" on public.mascota_eventos
  for all to authenticated
  using (cliente_id = public.current_cliente_id() or public.es_staff_actual())
  with check (cliente_id = public.current_cliente_id() or public.es_staff_actual());

-- citas_grooming (0080) pasa a servir de agenda general: se le agrega tipo
-- y un vínculo opcional a una mascota con ficha clínica ya creada.
alter table public.citas_grooming add column if not exists tipo text not null default 'grooming'
  check (tipo in ('grooming', 'consulta', 'vacunacion', 'desparasitacion', 'cirugia', 'otro'));
alter table public.citas_grooming add column if not exists mascota_id uuid references public.mascotas(id) on delete set null;
comment on column public.citas_grooming.tipo is 'Tipo de turno: además de estética/grooming, ahora también consulta médica general, vacunación, cirugía, etc.';
comment on column public.citas_grooming.mascota_id is 'Vínculo opcional a una ficha clínica (public.mascotas) ya existente para ese tutor/mascota.';
