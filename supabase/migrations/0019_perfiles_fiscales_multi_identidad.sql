-- Rediseño: la identidad fiscal deja de ser 1:1 con el negocio (clientes_pos)
-- y pasa a ser una entidad propia (perfiles_fiscales), de la que un mismo
-- negocio puede tener VARIAS a lo largo del tiempo (persona natural → SAS),
-- con solo UNA activa a la vez. Cada factura queda ligada a un perfil y
-- guarda una COPIA INMUTABLE de los datos fiscales usados al emitirla —
-- si el perfil cambia o se crea uno nuevo después, las facturas ya
-- emitidas no se alteran.
--
-- Las tablas de 0017/0018 se crearon en esta misma sesión y siguen vacías
-- (la UI para llenarlas se está construyendo ahora mismo) — es seguro
-- reestructurarlas de raíz en vez de encadenar ALTERs sobre un diseño que
-- ya se identificó como insuficiente.

drop table if exists public.notas_debito_electronicas;
drop table if exists public.notas_credito_electronicas;
drop table if exists public.facturas_electronicas;
drop table if exists public.dian_certificados;
drop table if exists public.dian_config;

-- ============================================================
-- PERFILES_FISCALES — la identidad que factura. Un cliente_id (negocio)
-- puede tener varios en el tiempo; solo uno activo a la vez (constraint
-- parcial más abajo).
-- ============================================================
create table public.perfiles_fiscales (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,

  tipo_persona text not null check (tipo_persona in ('natural', 'juridica')),
  nit text,
  digito_verificacion text,
  nombre_o_razon_social text not null,
  nombre_comercial text,
  rut_referencia text,

  direccion_fiscal text,
  municipio_codigo text,
  departamento_codigo text,
  pais_codigo text not null default 'CO',

  responsabilidades_fiscales text[] not null default '{}'::text[],
  regimen_fiscal text,

  contacto_email text,
  contacto_telefono text,

  identificador_software text,
  ambiente text not null default 'habilitacion' check (ambiente in ('habilitacion', 'produccion')),

  -- Estados sugeridos por el usuario — más granulares que el diseño anterior.
  estado text not null default 'NOT_CONFIGURED' check (
    estado in ('NOT_CONFIGURED', 'CONFIGURING', 'TESTING', 'READY_FOR_PRODUCTION', 'ACTIVE', 'SUSPENDED', 'ERROR')
  ),
  -- Solo un perfil activo por negocio a la vez (índice parcial más abajo).
  activo boolean not null default false,

  pin_configurado boolean not null default false,
  entrega_whatsapp_habilitada boolean not null default false,
  entrega_email_habilitada boolean not null default false,
  entrega_email_remitente text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_perfiles_fiscales_cliente_id on public.perfiles_fiscales(cliente_id);
-- Un solo perfil activo por negocio — inserta/actualiza a través de
-- activar_perfil_fiscal() (RPC más abajo), que desactiva los demás en la
-- misma transacción antes de activar el elegido.
create unique index idx_perfiles_fiscales_un_activo_por_cliente
  on public.perfiles_fiscales(cliente_id) where (activo);

-- ============================================================
-- PERFILES_FISCALES_RESOLUCIONES — numeración DIAN, pertenece al perfil
-- (no al negocio) — un perfil puede tener varias resoluciones en su vida
-- (una vence, se solicita otra). El consecutivo se incrementa de forma
-- atómica vía RPC para que dos ventas simultáneas nunca choquen.
-- ============================================================
create table public.perfiles_fiscales_resoluciones (
  id uuid primary key default gen_random_uuid(),
  perfil_fiscal_id uuid not null references public.perfiles_fiscales(id) on delete cascade,
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,

  prefijo text not null,
  resolucion_numero text not null,
  resolucion_fecha date,
  rango_desde bigint not null,
  rango_hasta bigint not null,
  consecutivo_actual bigint not null default 0,
  vigencia_hasta date,
  estado text not null default 'activa' check (estado in ('activa', 'agotada', 'vencida')),

  created_at timestamptz not null default now(),
  constraint rango_valido check (rango_hasta >= rango_desde),
  constraint consecutivo_dentro_de_rango check (consecutivo_actual <= (rango_hasta - rango_desde + 1))
);
create index idx_resoluciones_perfil_fiscal_id on public.perfiles_fiscales_resoluciones(perfil_fiscal_id);
create index idx_resoluciones_cliente_id on public.perfiles_fiscales_resoluciones(cliente_id);

-- Incremento atómico del consecutivo — el UPDATE toma el row lock de
-- Postgres, así que llamadas concurrentes se serializan sin necesidad de
-- lógica adicional de bloqueo en la aplicación.
create or replace function public.siguiente_consecutivo_dian(p_resolucion_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
  v_consecutivo bigint;
  v_rango_desde bigint;
  v_rango_hasta bigint;
  v_estado text;
begin
  select cliente_id into v_cliente_id from public.empleados where id = auth.uid();
  if v_cliente_id is null then
    raise exception 'No autenticado';
  end if;

  update public.perfiles_fiscales_resoluciones
  set consecutivo_actual = consecutivo_actual + 1
  where id = p_resolucion_id and cliente_id = v_cliente_id
  returning consecutivo_actual, rango_desde, rango_hasta, estado
  into v_consecutivo, v_rango_desde, v_rango_hasta, v_estado;

  if v_consecutivo is null then
    raise exception 'Resolución no encontrada o no pertenece a este negocio';
  end if;
  if v_estado <> 'activa' then
    raise exception 'La resolución no está activa (estado: %)', v_estado;
  end if;
  if v_consecutivo > (v_rango_hasta - v_rango_desde + 1) then
    update public.perfiles_fiscales_resoluciones set estado = 'agotada' where id = p_resolucion_id;
    raise exception 'Se agotó el rango autorizado de esta resolución';
  end if;

  return v_rango_desde + v_consecutivo - 1;
end;
$$;
grant execute on function public.siguiente_consecutivo_dian(uuid) to authenticated;

-- Activa un perfil fiscal y desactiva cualquier otro del mismo negocio, en
-- una sola transacción (evita la ventana donde dos quedarían activos).
create or replace function public.activar_perfil_fiscal(p_perfil_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id_solicitante uuid;
  v_cliente_id_perfil uuid;
  v_rol text;
begin
  select cliente_id, rol into v_cliente_id_solicitante, v_rol from public.empleados where id = auth.uid();
  if v_cliente_id_solicitante is null or v_rol not in ('admin', 'super_usuario') then
    raise exception 'No tienes permiso para activar un perfil fiscal';
  end if;

  select cliente_id into v_cliente_id_perfil from public.perfiles_fiscales where id = p_perfil_id;
  if v_cliente_id_perfil is null or v_cliente_id_perfil <> v_cliente_id_solicitante then
    raise exception 'Ese perfil fiscal no pertenece a tu negocio';
  end if;

  update public.perfiles_fiscales set activo = false, updated_at = now()
  where cliente_id = v_cliente_id_solicitante and activo = true;

  update public.perfiles_fiscales set activo = true, updated_at = now()
  where id = p_perfil_id;
end;
$$;
grant execute on function public.activar_perfil_fiscal(uuid) to authenticated;

-- ============================================================
-- DIAN_CERTIFICADOS — pertenece al perfil fiscal, no al negocio. Solo
-- metadata; el .p12 y la llave privada viven cifrados en el equipo local.
-- ============================================================
create table public.dian_certificados (
  id uuid primary key default gen_random_uuid(),
  perfil_fiscal_id uuid not null references public.perfiles_fiscales(id) on delete cascade,
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
create index idx_dian_certificados_perfil_fiscal_id on public.dian_certificados(perfil_fiscal_id);
create index idx_dian_certificados_cliente_id on public.dian_certificados(cliente_id);

-- ============================================================
-- FACTURAS_ELECTRONICAS — snapshot inmutable de la identidad fiscal al
-- momento de emitir. issuer_* NUNCA se vuelve a leer de perfiles_fiscales
-- después de creada la factura.
-- ============================================================
create table public.facturas_electronicas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  perfil_fiscal_id uuid not null references public.perfiles_fiscales(id),
  resolucion_id uuid references public.perfiles_fiscales_resoluciones(id),

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

  -- Snapshot del EMISOR — copia congelada del perfil fiscal en el momento
  -- de emitir, para que la factura nunca cambie si el perfil cambia después.
  issuer_nit text,
  issuer_dv text,
  issuer_nombre_o_razon_social text,
  issuer_nombre_comercial text,
  issuer_direccion text,
  issuer_municipio_codigo text,
  issuer_departamento_codigo text,
  issuer_responsabilidades_fiscales text[],
  issuer_ambiente text,

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
create index idx_facturas_electronicas_cliente_id on public.facturas_electronicas(cliente_id);
create index idx_facturas_electronicas_perfil_fiscal_id on public.facturas_electronicas(perfil_fiscal_id);
create index idx_facturas_electronicas_estado on public.facturas_electronicas(estado);
create index idx_facturas_electronicas_venta_referencia on public.facturas_electronicas(venta_referencia);
create unique index idx_facturas_electronicas_numero_unico on public.facturas_electronicas(perfil_fiscal_id, prefijo, numero_factura);

create table public.notas_credito_electronicas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  perfil_fiscal_id uuid not null references public.perfiles_fiscales(id),
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
create index idx_notas_credito_cliente_id on public.notas_credito_electronicas(cliente_id);
create index idx_notas_credito_factura_id on public.notas_credito_electronicas(factura_id);

create table public.notas_debito_electronicas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  perfil_fiscal_id uuid not null references public.perfiles_fiscales(id),
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
create index idx_notas_debito_cliente_id on public.notas_debito_electronicas(cliente_id);
create index idx_notas_debito_factura_id on public.notas_debito_electronicas(factura_id);

-- ============================================================
-- RLS — mismo patrón de siempre: cliente_id = current_cliente_id()
-- ============================================================
alter table public.perfiles_fiscales enable row level security;
alter table public.perfiles_fiscales_resoluciones enable row level security;
alter table public.dian_certificados enable row level security;
alter table public.facturas_electronicas enable row level security;
alter table public.notas_credito_electronicas enable row level security;
alter table public.notas_debito_electronicas enable row level security;

create policy perfiles_fiscales_tenant on public.perfiles_fiscales
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

create policy perfiles_fiscales_resoluciones_tenant on public.perfiles_fiscales_resoluciones
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

create policy dian_certificados_tenant on public.dian_certificados
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

create policy facturas_electronicas_tenant on public.facturas_electronicas
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

create policy notas_credito_electronicas_tenant on public.notas_credito_electronicas
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

create policy notas_debito_electronicas_tenant on public.notas_debito_electronicas
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

alter publication supabase_realtime add table public.facturas_electronicas;
