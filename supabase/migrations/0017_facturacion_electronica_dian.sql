-- Módulo de Facturación Electrónica DIAN (habilitación propia) — independiente
-- del stub de proveedor externo que ya existe en ConfiguracionPage.tsx (ese
-- se deja intacto). Sigue el MISMO patrón RLS multi-tenant que el resto del
-- esquema operativo (0001_operational_schema.sql): cliente_id + current_cliente_id().
--
-- Nota de diseño: `venta_referencia` es TEXT libre, no una FK estricta a
-- ventas.id (uuid). Las ventas de Electron (la ruta principal de facturación)
-- viven en IndexedDB local con un id tipo "FAC000123", no en la tabla
-- `ventas` de Supabase — solo las ventas de la PWA móvil tienen fila real
-- ahí. Forzar una FK habría roto la facturación offline-first de Electron.

-- ============================================================
-- DIAN_CONFIG — 1 fila por negocio, datos fiscales + estado de habilitación
-- ============================================================
create table if not exists public.dian_config (
  cliente_id uuid primary key references public.clientes_pos(id) on delete cascade,
  nit text,
  digito_verificacion text,
  razon_social text,
  nombre_comercial text,
  direccion text,
  municipio_codigo text,
  departamento_codigo text,
  responsabilidades_fiscales text[] default '{}'::text[],
  regimen_fiscal text,
  prefijo_factura text,
  resolucion_numero text,
  resolucion_fecha date,
  rango_autorizado_desde bigint,
  rango_autorizado_hasta bigint,
  rango_vigencia_hasta date,
  identificador_software text,
  -- El PIN nunca se guarda en claro — llega cifrado con safeStorage desde
  -- Electron (ver src/main/dianSecrets.ts) y se guarda tal cual (ciphertext).
  pin_cifrado text,
  ambiente text not null default 'habilitacion' check (ambiente in ('habilitacion', 'produccion')),
  estado_habilitacion text not null default 'no_configurada' check (
    estado_habilitacion in ('no_configurada', 'en_configuracion', 'pruebas', 'habilitada', 'produccion', 'error_configuracion', 'certificado_vencido')
  ),
  activa boolean not null default false,
  entrega_whatsapp_habilitada boolean not null default false,
  entrega_email_habilitada boolean not null default false,
  entrega_email_remitente text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- DIAN_CERTIFICADOS — solo METADATA. El .p12 y su llave privada nunca
-- salen del equipo del cliente (cifrados con safeStorage, en disco local).
-- ============================================================
create table if not exists public.dian_certificados (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  nombre_archivo text not null,
  huella_sha256 text not null,
  emisor text,
  sujeto text,
  fecha_emision date,
  fecha_vencimiento date not null,
  estado text not null default 'activo' check (estado in ('activo', 'vencido', 'revocado')),
  created_at timestamptz not null default now()
);
create index if not exists idx_dian_certificados_cliente_id on public.dian_certificados(cliente_id);

-- ============================================================
-- FACTURAS_ELECTRONICAS
-- ============================================================
create table if not exists public.facturas_electronicas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  venta_referencia text not null,
  numero_factura text not null,
  prefijo text,
  cufe text,
  xml text,
  representacion_grafica_url text,
  estado text not null default 'draft' check (
    estado in ('draft', 'pending', 'signing', 'sent', 'accepted', 'rejected', 'error', 'contingency', 'cancelled')
  ),
  respuesta_dian jsonb,
  motivo_rechazo text,
  intentos_transmision integer not null default 0,
  contingencia boolean not null default false,
  cliente_nit text,
  cliente_nombre text,
  cliente_email text,
  cliente_telefono text,
  subtotal numeric(14,2),
  total_impuestos numeric(14,2),
  total numeric(14,2) not null,
  fecha_emision timestamptz not null default now(),
  fecha_validacion timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_facturas_electronicas_cliente_id on public.facturas_electronicas(cliente_id);
create index if not exists idx_facturas_electronicas_estado on public.facturas_electronicas(estado);
create index if not exists idx_facturas_electronicas_venta_referencia on public.facturas_electronicas(venta_referencia);
create unique index if not exists idx_facturas_electronicas_numero_unico on public.facturas_electronicas(cliente_id, prefijo, numero_factura);

-- ============================================================
-- NOTAS_CREDITO_ELECTRONICAS / NOTAS_DEBITO_ELECTRONICAS
-- ============================================================
create table if not exists public.notas_credito_electronicas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  factura_id uuid not null references public.facturas_electronicas(id) on delete cascade,
  numero_nota text not null,
  cude text,
  xml text,
  motivo text not null,
  estado text not null default 'draft' check (
    estado in ('draft', 'pending', 'signing', 'sent', 'accepted', 'rejected', 'error', 'contingency', 'cancelled')
  ),
  respuesta_dian jsonb,
  total numeric(14,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_notas_credito_cliente_id on public.notas_credito_electronicas(cliente_id);
create index if not exists idx_notas_credito_factura_id on public.notas_credito_electronicas(factura_id);

create table if not exists public.notas_debito_electronicas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  factura_id uuid not null references public.facturas_electronicas(id) on delete cascade,
  numero_nota text not null,
  cude text,
  xml text,
  motivo text not null,
  estado text not null default 'draft' check (
    estado in ('draft', 'pending', 'signing', 'sent', 'accepted', 'rejected', 'error', 'contingency', 'cancelled')
  ),
  respuesta_dian jsonb,
  total numeric(14,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_notas_debito_cliente_id on public.notas_debito_electronicas(cliente_id);
create index if not exists idx_notas_debito_factura_id on public.notas_debito_electronicas(factura_id);

-- ============================================================
-- RLS — mismo patrón que el resto del esquema (0001_operational_schema.sql)
-- ============================================================
alter table public.dian_config enable row level security;
alter table public.dian_certificados enable row level security;
alter table public.facturas_electronicas enable row level security;
alter table public.notas_credito_electronicas enable row level security;
alter table public.notas_debito_electronicas enable row level security;

drop policy if exists dian_config_tenant on public.dian_config;
create policy dian_config_tenant on public.dian_config
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

drop policy if exists dian_certificados_tenant on public.dian_certificados;
create policy dian_certificados_tenant on public.dian_certificados
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

drop policy if exists facturas_electronicas_tenant on public.facturas_electronicas;
create policy facturas_electronicas_tenant on public.facturas_electronicas
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

drop policy if exists notas_credito_electronicas_tenant on public.notas_credito_electronicas;
create policy notas_credito_electronicas_tenant on public.notas_credito_electronicas
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

drop policy if exists notas_debito_electronicas_tenant on public.notas_debito_electronicas;
create policy notas_debito_electronicas_tenant on public.notas_debito_electronicas
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

alter publication supabase_realtime add table public.facturas_electronicas;
