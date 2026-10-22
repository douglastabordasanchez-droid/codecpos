-- 0123 · Base de clientes para facturación electrónica y retenciones.
--
-- Hasta ahora el cliente de una factura se recordaba en cada equipo
-- (localStorage) o se sacaba de la última factura que se le hizo. Esta tabla
-- es la base de clientes del negocio: la cargan en Facturación (a mano o con
-- Excel) y la usan igual Electron, la web y el celular al facturar.
--
-- Cada cliente puede ser agente de retención: si lo es, y el negocio activó
-- la retención en su perfil fiscal, la factura lleva la retención en la
-- fuente y el ReteICA que ese cliente le va a practicar.

create table if not exists public.clientes_facturacion (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  -- 13 cédula, 31 NIT, 22 cédula de extranjería, 41 pasaporte, 12 tarjeta de identidad.
  tipo_documento text not null default '13',
  -- Sin puntos ni dígito de verificación: así se busca igual "900.123.456-7" y "900123456".
  numero_documento text not null,
  digito_verificacion text,
  nombre text not null,
  email text,
  telefono text,
  direccion text,
  ciudad text,
  agente_retencion_fuente boolean not null default false,
  agente_retencion_ica boolean not null default false,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, numero_documento)
);

create index if not exists idx_clientes_facturacion_cliente on public.clientes_facturacion (cliente_id, nombre);

alter table public.clientes_facturacion enable row level security;

drop policy if exists clientes_facturacion_tenant on public.clientes_facturacion;
create policy clientes_facturacion_tenant on public.clientes_facturacion
  for all
  using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

-- Retenciones que le practican al negocio sus clientes agentes de retención.
-- Las tarifas dependen de la actividad del negocio, por eso son del perfil.
alter table public.perfiles_fiscales
  add column if not exists retefuente_activa boolean not null default false,
  add column if not exists retefuente_porcentaje numeric(6,3) not null default 2.5,
  add column if not exists retefuente_base_minima numeric(14,2) not null default 0,
  add column if not exists reteica_activa boolean not null default false,
  -- ReteICA se expresa por mil (Bogotá comercio al por menor: 11,04 por mil).
  add column if not exists reteica_tarifa_por_mil numeric(7,3) not null default 0,
  add column if not exists reteica_base_minima numeric(14,2) not null default 0,
  -- Código CIIU de la actividad principal, para el pie de la factura.
  add column if not exists actividad_economica text;
