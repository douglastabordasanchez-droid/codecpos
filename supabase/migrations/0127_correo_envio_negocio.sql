-- 0127 · Correo propio del negocio para enviar facturas al cliente.
--
-- Cada negocio conecta su propia cuenta (Gmail con contraseña de aplicación
-- u otro servidor SMTP) y las facturas salen desde allí: sin un proveedor de
-- correo pagado y con el cupo diario de su propia cuenta (Gmail: unos 500
-- al día). La contraseña queda cifrada con AES-256-GCM (llave DIAN_CERT_KEY,
-- igual que los certificados) y solo la lee la Edge Function correo-facturas.

create table if not exists public.correo_envio_negocio (
  cliente_id uuid primary key references public.clientes_pos(id) on delete cascade,
  proveedor text not null default 'gmail',
  servidor text not null,
  puerto integer not null default 465,
  usuario text not null,
  remitente_nombre text,
  clave_cifrada text not null,
  verificado_el timestamptz,
  enviados_hoy integer not null default 0,
  dia_conteo date,
  updated_at timestamptz not null default now()
);

-- Sin políticas: nadie la lee ni la escribe desde la app, solo la Edge
-- Function con la llave de servicio.
alter table public.correo_envio_negocio enable row level security;
