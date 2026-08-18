-- ============================================================================
-- FASE 3 — MOTOR COMERCIAL: planes, precios, promociones_comerciales, licencias,
-- entitlements, sucursales, add-ons, historial.
--
-- Objetivo: una sola fuente de verdad para todo lo comercial (Landing,
-- Electron, Web, App móvil, Admin, Mercado Pago futuro). `clientes_pos`
-- sigue existiendo tal cual (nadie que ya la lee se rompe) pero pasa a ser
-- un CACHE sincronizado desde `licencias` — ver trigger
-- sincronizar_cliente_pos_desde_licencia() al final del archivo.
--
-- Decisiones de diseño importantes (documentadas también en el informe final):
--
--  1. VITALICIO se modela como MODALIDAD de pago (pago único), no como un
--     cuarto nivel de capacidades. Es coherente con cómo ya existía
--     `clientes_pos.duracion = 'VITALICIA'` en producción (los 4 clientes
--     reales hoy son PREMIUM/VITALICIA) y evita una migración disruptiva.
--     Nada impide crear después un plan `VITALICIO` distinto en `planes` si
--     el negocio decide que amerita otro set de capacidades.
--
--  2. Los precios TRIMESTRAL/ANUAL nunca se guardan — se calculan siempre
--     desde el precio MENSUAL vigente + el descuento configurado en
--     `configuracion_comercial`. Así nunca quedan hardcodeados en dos
--     lugares (función precio_modalidad()).
--
--  3. La promoción de lanzamiento tiene DOS ventanas de tiempo distintas,
--     ambas necesarias según la propia especificación comercial:
--       a) promociones_comerciales.fecha_inicio/fecha_fin = ventana en la que un
--          cliente NUEVO puede todavía adquirir el precio promocional.
--       b) promociones_comerciales_clientes.fecha_fin_beneficio = por cliente, los
--          primeros 6 meses de SU suscripción a ese precio; luego el precio
--          efectivo transiciona solo (sin cron, se calcula al leer) a
--          precio_modalidad() normal. Ver precio_efectivo_licencia().
--
--  4. Cancelar y volver nunca borra el historial de promociones_comerciales_clientes,
--     así que cliente_elegible_promocion() sigue devolviendo false para
--     siempre con ese cliente — sin necesitar una bandera is_promo suelta.
--
--  5. Los límites comerciales (sucursales, usuarios, módulos especializados)
--     se hacen cumplir en la base de datos, no solo en el frontend: RPCs
--     SECURITY DEFINER para las altas (crear_sucursal, registrar_licencia,
--     agregar_addon_cliente) y un trigger BEFORE INSERT en `empleados` que
--     no depende de que el frontend use ningún endpoint nuevo.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────
-- 1. CATÁLOGO DE PLANES
-- ────────────────────────────────────────────────────────────────────────
create table public.planes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  descripcion text,
  es_personalizable boolean not null default false,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.planes is 'Catálogo de productos comerciales (Básico, Premium, Enterprise). Vitalicio es una modalidad de pago, no un plan — ver cabecera del archivo.';

insert into public.planes (codigo, nombre, descripcion, es_personalizable, orden) values
  ('BASICO', 'Básico', 'Todo lo esencial para operar el negocio del día a día.', false, 1),
  ('PREMIUM', 'Premium', 'Para negocios que necesitan todo el poder de Codec POS.', false, 2),
  ('ENTERPRISE', 'Enterprise / Personalizado', 'Condiciones negociadas para clientes con necesidades fuera de Básico/Premium (más sucursales, más usuarios, soporte especial).', true, 3);

-- ────────────────────────────────────────────────────────────────────────
-- 2. CONFIGURACIÓN COMERCIAL (valores que hoy NO están definidos o que
--    deben poder cambiar desde administración sin tocar código)
-- ────────────────────────────────────────────────────────────────────────
create table public.configuracion_comercial (
  clave text primary key,
  valor jsonb not null,
  descripcion text,
  updated_at timestamptz not null default now()
);
comment on table public.configuracion_comercial is 'Parámetros comerciales editables desde Admin: descuentos, precios de addons pendientes de definir, duración de beneficios.';

insert into public.configuracion_comercial (clave, valor, descripcion) values
  ('descuento_trimestral', '0.10', 'Descuento aplicado sobre 3 mensualidades para la modalidad TRIMESTRAL.'),
  ('descuento_anual', '0.20', 'Descuento aplicado sobre 12 mensualidades para la modalidad ANUAL.'),
  ('duracion_promocion_beneficio_meses', '6', 'Meses que dura el precio promocional para un cliente individual desde que lo adquiere.'),
  ('promo_aplica_a_trimestral_anual', 'true', 'Si el precio promocional de Premium se usa como base al calcular trimestral/anual mientras el cliente esté dentro de su ventana de beneficio.'),
  ('precio_vitalicio_premium', 'null', 'Precio de referencia del Vitalicio (pago único) sobre Premium. null = todavía no definido comercialmente; configurar antes de ofrecerlo en checkout.'),
  ('precio_usuario_adicional', 'null', 'Precio por usuario adicional en planes con límite. null = todavía no definido — no inventar un valor, ver punto 14 de la especificación.');

-- ────────────────────────────────────────────────────────────────────────
-- 3. PRECIOS BASE (solo MENSUAL y UNICO se guardan; TRIMESTRAL/ANUAL se
--    calculan siempre — ver precio_modalidad())
-- ────────────────────────────────────────────────────────────────────────
create table public.precios (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.planes(id),
  modalidad text not null check (modalidad in ('MENSUAL', 'UNICO')),
  precio numeric(12,2) not null check (precio >= 0),
  moneda text not null default 'COP',
  vigente_desde timestamptz not null default now(),
  vigente_hasta timestamptz,
  created_at timestamptz not null default now(),
  check (vigente_hasta is null or vigente_hasta > vigente_desde)
);
create index idx_precios_plan_modalidad_vigencia on public.precios(plan_id, modalidad, vigente_desde desc);
comment on table public.precios is 'Precio normal (de lista) por plan y modalidad. TRIMESTRAL/ANUAL nunca se guardan aquí — se calculan en precio_modalidad().';

insert into public.precios (plan_id, modalidad, precio)
select id, 'MENSUAL', 29990 from public.planes where codigo = 'BASICO'
union all
select id, 'MENSUAL', 79990 from public.planes where codigo = 'PREMIUM';
-- Nota: no se inserta precio UNICO (vitalicio) todavía — ver
-- configuracion_comercial.precio_vitalicio_premium, pendiente de definir.

-- ────────────────────────────────────────────────────────────────────────
-- 4. PROMOCIONES (reglas) + PROMOCIONES_CLIENTES (historial de quién la
--    adquirió, por siempre — nunca se borra)
-- ────────────────────────────────────────────────────────────────────────
create table public.promociones_comerciales (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  plan_id uuid not null references public.planes(id),
  precio_promocional numeric(12,2) not null check (precio_promocional >= 0),
  fecha_inicio timestamptz not null,
  fecha_fin timestamptz not null,
  duracion_beneficio_meses int not null default 6,
  activa boolean not null default true,
  descripcion text,
  created_at timestamptz not null default now(),
  check (fecha_fin > fecha_inicio)
);
comment on table public.promociones_comerciales is 'Reglas de promoción. fecha_inicio/fecha_fin = ventana en la que un cliente NUEVO puede adquirirla. El beneficio por cliente vive en promociones_comerciales_clientes.';

insert into public.promociones_comerciales (codigo, plan_id, precio_promocional, fecha_inicio, fecha_fin, duracion_beneficio_meses, descripcion)
select 'LANZAMIENTO_PREMIUM_2026', id, 49990, now(), now() + interval '6 months', 6,
       'Premium a $49.990/mes durante los primeros 6 meses de lanzamiento (empresa). Cada cliente que la adquiere conserva ese precio durante sus primeros 6 meses como suscriptor.'
from public.planes where codigo = 'PREMIUM';

create table public.promociones_comerciales_clientes (
  id uuid primary key default gen_random_uuid(),
  promocion_id uuid not null references public.promociones_comerciales(id),
  cliente_id uuid not null references public.clientes_pos(id),
  licencia_id uuid, -- FK agregada después de crear `licencias` más abajo
  fecha_adquisicion timestamptz not null default now(),
  fecha_fin_beneficio timestamptz not null,
  estado text not null default 'VIGENTE' check (estado in ('VIGENTE', 'FINALIZADA', 'CANCELADA_ANTICIPADA')),
  fecha_cancelacion timestamptz,
  created_at timestamptz not null default now()
);
create index idx_promociones_clientes_cliente on public.promociones_comerciales_clientes(cliente_id);
comment on table public.promociones_comerciales_clientes is 'Historial NUNCA se borra: quién adquirió cada promoción. cliente_elegible_promocion() consulta existencia aquí (sin importar el estado) para impedir que alguien recupere el precio promocional al cancelar y volver.';

-- ────────────────────────────────────────────────────────────────────────
-- 5. ENTITLEMENTS (capacidades) — catálogo + matriz por plan + overrides
-- ────────────────────────────────────────────────────────────────────────
create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  tipo text not null check (tipo in ('BOOLEANO', 'LIMITE_NUMERICO')),
  descripcion text,
  created_at timestamptz not null default now()
);
comment on table public.entitlements is 'Catálogo de capacidades controlables por plan. tipo=BOOLEANO -> valor {"habilitado":bool}. tipo=LIMITE_NUMERICO -> valor {"limite":int|null} (null = ilimitado).';

insert into public.entitlements (codigo, nombre, tipo, descripcion) values
  ('SALES', 'Ventas', 'BOOLEANO', 'Módulo de ventas / punto de venta.'),
  ('INVENTORY', 'Inventario', 'BOOLEANO', 'Control de inventario.'),
  ('CLIENTS', 'Clientes', 'BOOLEANO', 'Gestión de clientes.'),
  ('SUPPLIERS', 'Proveedores', 'BOOLEANO', 'Gestión de proveedores.'),
  ('EXPENSES', 'Gastos', 'BOOLEANO', 'Registro de gastos.'),
  ('ACCOUNTING', 'Contabilidad', 'BOOLEANO', 'Módulo de contabilidad integrada.'),
  ('OFFLINE_MODE', 'Funcionamiento offline', 'BOOLEANO', 'Operar sin conexión a internet. La licencia no debe restringir esto salvo indicación explícita.'),
  ('MOBILE_APP', 'Aplicación móvil', 'BOOLEANO', 'Acceso a la app móvil (PWA) para operar, no solo consultar.'),
  ('MULTI_BRANCH', 'Multi-sucursal', 'BOOLEANO', 'Administrar más de una sucursal desde un solo login.'),
  ('CODEC_VERIFY', 'Codec Verify', 'BOOLEANO', 'Confirmación automática de pagos Nequi/Daviplata/Bancolombia.'),
  ('ELECTRONIC_INVOICING', 'Facturación electrónica DIAN', 'BOOLEANO', 'Emisión de factura electrónica ante la DIAN.'),
  ('ADVANCED_REPORTS', 'Reportes avanzados', 'BOOLEANO', 'Reportes más allá de los básicos.'),
  ('AUTO_BACKUP', 'Respaldo automático', 'BOOLEANO', 'Backup automático en la nube.'),
  ('MAX_SUCURSALES', 'Límite de sucursales', 'LIMITE_NUMERICO', 'Número máximo de sucursales activas incluidas en el plan (sin contar add-ons).'),
  ('MAX_USUARIOS', 'Límite de usuarios', 'LIMITE_NUMERICO', 'Número máximo de empleados activos incluidos en el plan (sin contar add-ons). null = ilimitado.'),
  ('MAX_MODULOS_ESPECIALIZADOS', 'Límite de módulos especializados', 'LIMITE_NUMERICO', 'Número máximo de módulos especializados (Taller/Artes Gráficas/Papelería) activables. null = sin límite.');

create table public.plan_entitlements (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.planes(id) on delete cascade,
  entitlement_id uuid not null references public.entitlements(id) on delete cascade,
  valor jsonb not null,
  unique (plan_id, entitlement_id)
);
comment on table public.plan_entitlements is 'Qué puede hacer cada plan. Esta es LA matriz comercial — un solo lugar, no condiciones dispersas por el código.';

-- BÁSICO
insert into public.plan_entitlements (plan_id, entitlement_id, valor)
select p.id, e.id, v.valor::jsonb
from public.planes p, public.entitlements e,
  (values
    ('SALES', '{"habilitado":true}'), ('INVENTORY', '{"habilitado":true}'), ('CLIENTS', '{"habilitado":true}'),
    ('SUPPLIERS', '{"habilitado":true}'), ('EXPENSES', '{"habilitado":true}'), ('ACCOUNTING', '{"habilitado":true}'),
    ('OFFLINE_MODE', '{"habilitado":true}'), ('MOBILE_APP', '{"habilitado":false}'), ('MULTI_BRANCH', '{"habilitado":false}'),
    ('CODEC_VERIFY', '{"habilitado":false}'), ('ELECTRONIC_INVOICING', '{"habilitado":false}'),
    ('ADVANCED_REPORTS', '{"habilitado":false}'), ('AUTO_BACKUP', '{"habilitado":false}'),
    ('MAX_SUCURSALES', '{"limite":1}'), ('MAX_USUARIOS', '{"limite":5}'), ('MAX_MODULOS_ESPECIALIZADOS', '{"limite":1}')
  ) as v(codigo, valor)
where p.codigo = 'BASICO' and e.codigo = v.codigo;

-- PREMIUM
insert into public.plan_entitlements (plan_id, entitlement_id, valor)
select p.id, e.id, v.valor::jsonb
from public.planes p, public.entitlements e,
  (values
    ('SALES', '{"habilitado":true}'), ('INVENTORY', '{"habilitado":true}'), ('CLIENTS', '{"habilitado":true}'),
    ('SUPPLIERS', '{"habilitado":true}'), ('EXPENSES', '{"habilitado":true}'), ('ACCOUNTING', '{"habilitado":true}'),
    ('OFFLINE_MODE', '{"habilitado":true}'), ('MOBILE_APP', '{"habilitado":true}'), ('MULTI_BRANCH', '{"habilitado":true}'),
    ('CODEC_VERIFY', '{"habilitado":true}'), ('ELECTRONIC_INVOICING', '{"habilitado":true}'),
    ('ADVANCED_REPORTS', '{"habilitado":true}'), ('AUTO_BACKUP', '{"habilitado":true}'),
    ('MAX_SUCURSALES', '{"limite":3}'), ('MAX_USUARIOS', '{"limite":null}'), ('MAX_MODULOS_ESPECIALIZADOS', '{"limite":null}')
  ) as v(codigo, valor)
where p.codigo = 'PREMIUM' and e.codigo = v.codigo;

-- ENTERPRISE: sin fila base — todo se resuelve por override por cliente
-- (entitlements_override_cliente). Si en el futuro se define un mínimo
-- común, se puede sembrar aquí sin tocar el resto del sistema.

create table public.entitlements_override_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  entitlement_id uuid not null references public.entitlements(id),
  valor jsonb not null,
  motivo text,
  created_by uuid references public.empleados(id),
  created_at timestamptz not null default now(),
  unique (cliente_id, entitlement_id)
);
comment on table public.entitlements_override_cliente is 'Excepciones por cliente: negociación Enterprise, o preservar acceso ya concedido antes de esta migración. Tiene prioridad sobre plan_entitlements — ver entitlement_valor().';

-- ────────────────────────────────────────────────────────────────────────
-- 6. MÓDULOS ESPECIALIZADOS (para contar contra MAX_MODULOS_ESPECIALIZADOS
--    sin duplicar la lista de módulos que ya vive en el código TS)
-- ────────────────────────────────────────────────────────────────────────
create table public.modulos_especializados_catalogo (
  codigo text primary key,
  nombre text not null,
  created_at timestamptz not null default now()
);
comment on table public.modulos_especializados_catalogo is 'Códigos de clientes_pos.modulos_activos que cuentan como "módulo especializado" para el límite comercial (1 en Básico, sin límite en Premium). No duplica el catálogo completo de módulos (eso sigue viviendo en ModuloPOS, src/app/lib/permissions.ts) — solo marca cuáles de esos códigos son especializados.';
insert into public.modulos_especializados_catalogo (codigo, nombre) values
  ('taller_reparaciones', 'Taller de Reparaciones'),
  ('artes_graficas', 'Artes Gráficas'),
  ('papeleria_pinateria', 'Papelería y Piñatería');

-- ────────────────────────────────────────────────────────────────────────
-- 7. ADD-ONS (sucursal adicional, usuario adicional, soporte técnico)
-- ────────────────────────────────────────────────────────────────────────
create table public.addons (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  categoria text not null check (categoria in ('SUCURSAL', 'USUARIO', 'SOPORTE', 'OTRO')),
  tipo text not null check (tipo in ('RECURRENTE_MENSUAL', 'RECURRENTE_ANUAL', 'UNICO')),
  precio numeric(12,2) check (precio >= 0), -- null = todavía no definido comercialmente
  activo boolean not null default true,
  descripcion text,
  created_at timestamptz not null default now()
);
comment on table public.addons is 'Productos/servicios adicionales al plan base (sucursal extra, usuario extra, soporte técnico). El soporte técnico se modela aquí también -- no como sistema paralelo, ver categoria=SOPORTE.';

insert into public.addons (codigo, nombre, categoria, tipo, precio, descripcion) values
  ('SUCURSAL_ADICIONAL', 'Sucursal adicional', 'SUCURSAL', 'RECURRENTE_MENSUAL', 12990, 'Cada unidad suma 1 sucursal permitida por encima del límite del plan.'),
  ('USUARIO_ADICIONAL', 'Usuario adicional', 'USUARIO', 'RECURRENTE_MENSUAL', null, 'Precio pendiente de definir — ver configuracion_comercial.precio_usuario_adicional. No inventar valor.'),
  ('SOPORTE_MENSUAL', 'Soporte técnico mensual', 'SOPORTE', 'RECURRENTE_MENSUAL', 19000, 'Soporte técnico independiente de la licencia. Especialmente relevante para clientes Vitalicio, que no incluyen soporte ilimitado gratuito.'),
  ('SOPORTE_ANUAL', 'Soporte técnico anual', 'SOPORTE', 'RECURRENTE_ANUAL', 119000, 'Equivalente anual del soporte técnico.');

create table public.addons_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id),
  licencia_id uuid, -- FK agregada después de crear `licencias`
  addon_id uuid not null references public.addons(id),
  cantidad int not null default 1 check (cantidad > 0),
  precio_aplicado numeric(12,2) not null,
  fecha_inicio timestamptz not null default now(),
  fecha_fin timestamptz,
  estado text not null default 'ACTIVO' check (estado in ('ACTIVO', 'CANCELADO')),
  created_at timestamptz not null default now()
);
create index idx_addons_cliente_cliente on public.addons_cliente(cliente_id, estado);
comment on table public.addons_cliente is 'Add-ons contratados por cliente, con historial (fecha_fin/estado=CANCELADO en vez de borrar la fila).';

-- ────────────────────────────────────────────────────────────────────────
-- 8. SUCURSALES (branches bajo UNA licencia) — distinto de
--    tiendas_vinculadas (visibilidad de solo lectura ENTRE licencias
--    independientes, migración 0045). Distinto también de `instalaciones`
--    (concepto técnico, punto 11 de la especificación).
-- ────────────────────────────────────────────────────────────────────────
create table public.sucursales (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id),
  nombre text not null,
  direccion text,
  es_principal boolean not null default false,
  estado text not null default 'ACTIVA' check (estado in ('ACTIVA', 'INACTIVA')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_sucursales_cliente on public.sucursales(cliente_id, estado);
comment on table public.sucursales is 'Sucursales/locales de UN cliente bajo su misma licencia. No confundir con tiendas_vinculadas (instalaciones independientes de un mismo dueño, migración 0045) ni con `instalaciones` (equipos/terminales técnicos).';

create table public.instalaciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id),
  sucursal_id uuid references public.sucursales(id),
  machine_id text,
  tipo text not null default 'ELECTRON' check (tipo in ('ELECTRON', 'PWA')),
  estado text not null default 'ACTIVA' check (estado in ('ACTIVA', 'INACTIVA')),
  activada_en timestamptz not null default now(),
  ultima_conexion timestamptz,
  created_at timestamptz not null default now()
);
create index idx_instalaciones_cliente on public.instalaciones(cliente_id);
comment on table public.instalaciones is 'Equipos/terminales técnicos activados para un cliente. Concepto separado de sucursal a propósito (punto 11): hoy 1 sucursal principal puede tener varias instalaciones (varias cajas).';

-- ────────────────────────────────────────────────────────────────────────
-- 9. LICENCIAS — el registro comercial central. Varias filas por cliente
--    en el tiempo (una por cada período comercial distinto); solo una
--    puede estar vigente=true a la vez (índice único parcial abajo).
-- ────────────────────────────────────────────────────────────────────────
create table public.licencias (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id),
  plan_id uuid not null references public.planes(id),
  modalidad text not null check (modalidad in ('MENSUAL', 'TRIMESTRAL', 'ANUAL', 'VITALICIA')),
  estado text not null check (estado in ('TRIAL', 'ACTIVA', 'PENDIENTE_PAGO', 'CANCELADA', 'EXPIRADA', 'SUSPENDIDA')),
  precio_aplicado numeric(12,2), -- snapshot al crear la licencia; para el precio vigente HOY usar precio_efectivo_licencia()
  promocion_cliente_id uuid references public.promociones_comerciales_clientes(id),
  vigente boolean not null default true,
  renovacion_automatica boolean not null default true,
  origen text not null default 'MANUAL_STAFF' check (origen in ('MANUAL_STAFF', 'TRIAL_SIGNUP', 'MERCADOPAGO', 'MIGRACION_LEGACY')),
  fecha_inicio timestamptz not null default now(),
  fecha_fin_periodo_actual timestamptz,
  fecha_expiracion timestamptz,
  fecha_cancelacion timestamptz,
  fecha_fin_vigencia timestamptz,
  motivo_fin text,
  motivo text,
  created_by uuid references public.empleados(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index idx_licencias_una_vigente_por_cliente on public.licencias(cliente_id) where vigente = true;
create index idx_licencias_cliente on public.licencias(cliente_id, created_at desc);
comment on table public.licencias is 'Fuente de verdad comercial. clientes_pos.plan/duracion/estado se sincronizan automáticamente desde la fila vigente=true (trigger sincronizar_cliente_pos_desde_licencia).';

alter table public.promociones_comerciales_clientes add constraint fk_promociones_clientes_licencia foreign key (licencia_id) references public.licencias(id);
alter table public.addons_cliente add constraint fk_addons_cliente_licencia foreign key (licencia_id) references public.licencias(id);

-- ────────────────────────────────────────────────────────────────────────
-- 10. HISTORIAL COMERCIAL (bitácora genérica — una sola tabla, no una por
--     tipo de evento, para no duplicar lógica)
-- ────────────────────────────────────────────────────────────────────────
create table public.historial_comercial (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id),
  licencia_id uuid references public.licencias(id),
  tipo_evento text not null check (tipo_evento in (
    'CREACION_LICENCIA', 'CAMBIO_PLAN', 'CAMBIO_MODALIDAD', 'UPGRADE', 'DOWNGRADE',
    'CANCELACION', 'REACTIVACION', 'PROMOCION_APLICADA', 'CAMBIO_PRECIO',
    'CAMBIO_SUCURSAL', 'CAMBIO_USUARIO', 'ACTIVACION', 'SUSPENSION',
    'ADDON_AGREGADO', 'ADDON_CANCELADO', 'MIGRACION_LEGACY'
  )),
  datos_anteriores jsonb,
  datos_nuevos jsonb,
  motivo text,
  actor uuid references public.empleados(id),
  created_at timestamptz not null default now()
);
create index idx_historial_comercial_cliente on public.historial_comercial(cliente_id, created_at desc);
comment on table public.historial_comercial is 'Bitácora append-only de todo cambio comercial. Una sola tabla genérica en vez de una tabla de historial por concepto.';

-- ============================================================================
-- FUNCIONES
-- ============================================================================

-- ---- Autorización -----------------------------------------------------
create or replace function public.es_staff_actual()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.empleados e where e.id = auth.uid() and e.es_staff_codec = true)
$$;

create or replace function public.empleado_es_admin_de(p_cliente_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.empleados e
    where e.id = auth.uid() and e.cliente_id = p_cliente_id and e.rol in ('admin', 'super_usuario') and e.activo
  )
$$;

create or replace function public.puedo_administrar_cliente(p_cliente_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  -- auth.uid() is null cuando la llamada viene del backend con service_role
  -- (webhooks, jobs internos) -- ese contexto siempre está autorizado.
  select auth.uid() is null or public.es_staff_actual() or public.empleado_es_admin_de(p_cliente_id)
$$;

-- ---- Configuración ------------------------------------------------------
create or replace function public.configuracion_valor_numeric(p_clave text)
returns numeric language sql stable security definer set search_path = public as $$
  select nullif(valor::text, 'null')::numeric from public.configuracion_comercial where clave = p_clave
$$;

create or replace function public.configuracion_valor_bool(p_clave text)
returns boolean language sql stable security definer set search_path = public as $$
  select (valor::text)::boolean from public.configuracion_comercial where clave = p_clave
$$;

-- ---- Promociones ----------------------------------------------------------
create or replace function public.promocion_vigente_para_nuevo(p_plan_codigo text)
returns public.promociones_comerciales language sql stable security definer set search_path = public as $$
  select pr.* from public.promociones_comerciales pr
  join public.planes p on p.id = pr.plan_id
  where p.codigo = p_plan_codigo and pr.activa
    and now() between pr.fecha_inicio and pr.fecha_fin
  order by pr.fecha_inicio desc limit 1
$$;

create or replace function public.cliente_promocion_vigente(p_cliente_id uuid)
returns public.promociones_comerciales_clientes language sql stable security definer set search_path = public as $$
  select pc.* from public.promociones_comerciales_clientes pc
  where pc.cliente_id = p_cliente_id and pc.estado = 'VIGENTE' and now() < pc.fecha_fin_beneficio
  order by pc.fecha_adquisicion desc limit 1
$$;

create or replace function public.cliente_elegible_promocion(p_cliente_id uuid, p_promocion_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  -- Sin importar el estado: si alguna vez existió una fila, ya no es elegible.
  -- Esto es lo que impide recuperar el precio promocional al cancelar y volver.
  select not exists (
    select 1 from public.promociones_comerciales_clientes
    where cliente_id = p_cliente_id and promocion_id = p_promocion_id
  )
$$;

-- ---- Precios --------------------------------------------------------------
create or replace function public.precio_base_mensual(p_plan_codigo text, p_cliente_id uuid default null)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_promo_cliente public.promociones_comerciales_clientes;
  v_promo_nueva public.promociones_comerciales;
begin
  if p_cliente_id is not null then
    v_promo_cliente := public.cliente_promocion_vigente(p_cliente_id);
    if v_promo_cliente.id is not null then
      return (select precio_promocional from public.promociones_comerciales where id = v_promo_cliente.promocion_id);
    end if;
  else
    v_promo_nueva := public.promocion_vigente_para_nuevo(p_plan_codigo);
    if v_promo_nueva.id is not null then
      return v_promo_nueva.precio_promocional;
    end if;
  end if;

  return (
    select precio from public.precios pr
    join public.planes p on p.id = pr.plan_id
    where p.codigo = p_plan_codigo and pr.modalidad = 'MENSUAL'
      and now() >= pr.vigente_desde and (pr.vigente_hasta is null or now() < pr.vigente_hasta)
    order by pr.vigente_desde desc limit 1
  );
end;
$$;
comment on function public.precio_base_mensual is 'Precio mensual "de hoy" para un plan: si hay cliente y tiene promo vigente dentro de sus 6 meses de beneficio, usa ese precio; si no hay cliente (uso público/landing) y hay promo de lanzamiento abierta, la usa como precio publicitado; si no, el precio normal de precios.';

create or replace function public.aplicar_modalidad_a_base(p_base numeric, p_modalidad text)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_descuento numeric;
begin
  if p_base is null then return null; end if;
  if p_modalidad = 'MENSUAL' then
    return p_base;
  elsif p_modalidad = 'TRIMESTRAL' then
    v_descuento := coalesce(public.configuracion_valor_numeric('descuento_trimestral'), 0);
    return round(p_base * 3 * (1 - v_descuento), 0);
  elsif p_modalidad = 'ANUAL' then
    v_descuento := coalesce(public.configuracion_valor_numeric('descuento_anual'), 0);
    return round(p_base * 12 * (1 - v_descuento), 0);
  else
    raise exception 'Modalidad desconocida: %', p_modalidad;
  end if;
end;
$$;
comment on function public.aplicar_modalidad_a_base is 'Única fórmula de descuento trimestral/anual del sistema. La usan precio_modalidad() (lectura normal) y registrar_licencia() (compra con promoción nueva) para no duplicar el cálculo -- ver comentario en registrar_licencia sobre por qué necesita esta función aparte.';

create or replace function public.precio_modalidad(p_plan_codigo text, p_modalidad text, p_cliente_id uuid default null)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_base numeric;
begin
  if p_modalidad = 'VITALICIA' then
    return (
      select precio from public.precios pr join public.planes p on p.id = pr.plan_id
      where p.codigo = p_plan_codigo and pr.modalidad = 'UNICO'
        and now() >= pr.vigente_desde and (pr.vigente_hasta is null or now() < pr.vigente_hasta)
      order by pr.vigente_desde desc limit 1
    ); -- null si todavía no está configurado -- no se inventa un valor.
  end if;

  v_base := public.precio_base_mensual(p_plan_codigo, p_cliente_id);
  return public.aplicar_modalidad_a_base(v_base, p_modalidad);
end;
$$;
comment on function public.precio_modalidad is 'Única fuente de cálculo de precio por plan+modalidad. Trimestral/anual siempre se derivan del mensual vigente -- nunca hardcodeados.';

create or replace function public.precio_efectivo_licencia(p_licencia_id uuid)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_lic public.licencias;
  v_plan_codigo text;
begin
  select * into v_lic from public.licencias where id = p_licencia_id;
  if v_lic.id is null then return null; end if;
  select codigo into v_plan_codigo from public.planes where id = v_lic.plan_id;
  return public.precio_modalidad(v_plan_codigo, v_lic.modalidad, v_lic.cliente_id);
end;
$$;
comment on function public.precio_efectivo_licencia is 'Precio que corresponde cobrar HOY (a diferencia de licencias.precio_aplicado, que es el snapshot histórico al momento de crear la licencia). Aquí es donde la transición 49.990 -> 79.990 ocurre automáticamente, sin cron: en cuanto pasan los 6 meses de beneficio, cliente_promocion_vigente() deja de encontrar una fila vigente y esta función cae al precio normal.';

-- Catálogo público (para Landing / futuro registro / Admin) -----------------
create or replace function public.plan_catalogo_publico()
returns table (
  plan_codigo text, plan_nombre text,
  precio_mensual numeric, precio_trimestral numeric, precio_anual numeric,
  promocion_activa boolean, precio_promocional_mensual numeric
) language sql stable security definer set search_path = public as $$
  select
    p.codigo, p.nombre,
    public.precio_modalidad(p.codigo, 'MENSUAL'),
    public.precio_modalidad(p.codigo, 'TRIMESTRAL'),
    public.precio_modalidad(p.codigo, 'ANUAL'),
    (public.promocion_vigente_para_nuevo(p.codigo)).id is not null,
    (public.promocion_vigente_para_nuevo(p.codigo)).precio_promocional
  from public.planes p where p.activo and not p.es_personalizable order by p.orden
$$;
grant execute on function public.plan_catalogo_publico() to anon, authenticated;

-- ---- Entitlements -----------------------------------------------------
create or replace function public.entitlement_valor(p_cliente_id uuid, p_codigo text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_valor jsonb;
  v_plan_id uuid;
begin
  select eo.valor into v_valor
  from public.entitlements_override_cliente eo
  join public.entitlements e on e.id = eo.entitlement_id
  where eo.cliente_id = p_cliente_id and e.codigo = p_codigo;
  if v_valor is not null then return v_valor; end if;

  select plan_id into v_plan_id from public.licencias where cliente_id = p_cliente_id and vigente = true;
  if v_plan_id is null then return null; end if;

  select pe.valor into v_valor
  from public.plan_entitlements pe
  join public.entitlements e on e.id = pe.entitlement_id
  where pe.plan_id = v_plan_id and e.codigo = p_codigo;
  return v_valor;
end;
$$;
comment on function public.entitlement_valor is 'Resuelve override de cliente > matriz del plan vigente. Retorna null si no hay licencia vigente o el entitlement no está definido para ese plan.';

create or replace function public.entitlement_habilitado(p_cliente_id uuid, p_codigo text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((public.entitlement_valor(p_cliente_id, p_codigo)->>'habilitado')::boolean, false)
$$;

create or replace function public.entitlement_limite(p_cliente_id uuid, p_codigo text)
returns numeric language sql stable security definer set search_path = public as $$
  select (public.entitlement_valor(p_cliente_id, p_codigo)->>'limite')::numeric
$$;
comment on function public.entitlement_limite is 'null puede significar dos cosas legítimas: "sin límite" (plan Premium) o "sin licencia vigente todavía" -- ver limite_*_totales() para cómo se resuelve cada caso concreto.';

-- ---- Conteos ------------------------------------------------------------
create or replace function public.contar_sucursales_activas(p_cliente_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.sucursales where cliente_id = p_cliente_id and estado = 'ACTIVA'
$$;

create or replace function public.contar_empleados_activos(p_cliente_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.empleados where cliente_id = p_cliente_id and activo
$$;

create or replace function public.contar_modulos_especializados_activos(p_cliente_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.modulos_especializados_catalogo mec
  where mec.codigo = any(coalesce((select modulos_activos from public.clientes_pos where id = p_cliente_id), array[]::text[]))
$$;

create or replace function public.limite_sucursales_totales(p_cliente_id uuid)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_base numeric;
  v_addons int;
begin
  v_base := public.entitlement_limite(p_cliente_id, 'MAX_SUCURSALES');
  if v_base is null and public.entitlement_valor(p_cliente_id, 'MAX_SUCURSALES') is not null then
    return null; -- explícitamente ilimitado en el plan
  end if;
  select coalesce(sum(cantidad), 0) into v_addons
  from public.addons_cliente ac join public.addons a on a.id = ac.addon_id
  where ac.cliente_id = p_cliente_id and ac.estado = 'ACTIVO' and a.codigo = 'SUCURSAL_ADICIONAL';
  return coalesce(v_base, 0) + v_addons;
end;
$$;

create or replace function public.limite_empleados_totales(p_cliente_id uuid)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_base numeric;
  v_tiene_licencia boolean;
  v_addons int;
begin
  select exists(select 1 from public.licencias where cliente_id = p_cliente_id and vigente = true) into v_tiene_licencia;
  if not v_tiene_licencia then
    return null; -- sin licencia asignada todavía: no bloquear (ver nota en el informe final)
  end if;
  v_base := public.entitlement_limite(p_cliente_id, 'MAX_USUARIOS');
  if v_base is null then
    return null; -- Premium: ilimitado
  end if;
  select coalesce(sum(cantidad), 0) into v_addons
  from public.addons_cliente ac join public.addons a on a.id = ac.addon_id
  where ac.cliente_id = p_cliente_id and ac.estado = 'ACTIVO' and a.codigo = 'USUARIO_ADICIONAL';
  return v_base + v_addons;
end;
$$;

-- ============================================================================
-- ENFORCEMENT: triggers y RPCs SECURITY DEFINER (punto 19 -- no confiar en
-- el frontend). Toda escritura en sucursales/licencias/addons_cliente pasa
-- por estas funciones; las tablas no tienen policy de INSERT directo para
-- `authenticated` (ver sección RLS).
-- ============================================================================

create or replace function public.validar_limite_empleados()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_limite numeric;
  v_actuales int;
begin
  v_limite := public.limite_empleados_totales(NEW.cliente_id);
  if v_limite is not null then
    v_actuales := public.contar_empleados_activos(NEW.cliente_id);
    if v_actuales >= v_limite then
      raise exception 'Límite de usuarios alcanzado (%/%) para este plan. Contrata un usuario adicional o actualiza a Premium.', v_actuales, v_limite;
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_validar_limite_empleados
  before insert on public.empleados
  for each row execute function public.validar_limite_empleados();

create or replace function public.sincronizar_cliente_pos_desde_licencia()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_plan_codigo text;
  v_duracion text;
  v_estado_legacy text;
  v_mobile boolean;
begin
  -- Sincroniza cuando esta fila SE VUELVE la vigente (alta/upgrade/reactivación)
  -- o cuando DEJA de serlo sin ser reemplazada en la misma transacción por otra
  -- (cancelación, expiración, suspensión) -- en ese segundo caso ya no hay
  -- ninguna fila vigente=true, así que esta es la única fuente de verdad que
  -- queda para proyectar sobre clientes_pos. Una edición puramente histórica
  -- (OLD y NEW ambas vigente=false) no debe tocar clientes_pos.
  if not NEW.vigente and not (TG_OP = 'UPDATE' and OLD.vigente = true) then
    return NEW;
  end if;
  select codigo into v_plan_codigo from public.planes where id = NEW.plan_id;

  v_duracion := case NEW.modalidad
    when 'MENSUAL' then '1_MES' when 'TRIMESTRAL' then '3_MESES'
    when 'ANUAL' then '1_ANO' when 'VITALICIA' then 'VITALICIA' end;

  v_estado_legacy := case NEW.estado
    when 'TRIAL' then 'PRUEBA' when 'ACTIVA' then 'ACTIVA' when 'SUSPENDIDA' then 'SUSPENDIDA'
    when 'EXPIRADA' then 'VENCIDA' when 'CANCELADA' then 'CANCELADA' when 'PENDIENTE_PAGO' then 'PENDIENTE_PAGO'
    else NEW.estado end;

  v_mobile := coalesce((public.entitlement_valor(NEW.cliente_id, 'MOBILE_APP')->>'habilitado')::boolean, true);

  update public.clientes_pos set
    plan = coalesce(v_plan_codigo, plan),
    duracion = coalesce(v_duracion, duracion),
    estado = coalesce(v_estado_legacy, estado),
    fecha_activacion = NEW.fecha_inicio,
    fecha_expiracion = NEW.fecha_fin_periodo_actual,
    app_movil_habilitada = v_mobile,
    updated_at = now()
  where id = NEW.cliente_id;

  return NEW;
end;
$$;
comment on function public.sincronizar_cliente_pos_desde_licencia is 'Proyecta la licencia vigente sobre clientes_pos para que Electron/PWA existentes (que leen esa tabla directamente) sigan funcionando sin cambios. clientes_pos.estado gana dos valores nuevos (CANCELADA, PENDIENTE_PAGO) -- ver riesgo en el informe final.';

alter table public.clientes_pos drop constraint if exists clientes_pos_estado_check;
alter table public.clientes_pos add constraint clientes_pos_estado_check
  check (estado in ('ACTIVA', 'VENCIDA', 'SUSPENDIDA', 'PRUEBA', 'CANCELADA', 'PENDIENTE_PAGO'));

create trigger trg_sincronizar_cliente_pos
  after insert or update on public.licencias
  for each row execute function public.sincronizar_cliente_pos_desde_licencia();

-- ---- RPC: ciclo de vida de licencias ------------------------------------
create or replace function public.registrar_licencia(
  p_cliente_id uuid, p_plan_codigo text, p_modalidad text,
  p_promocion_codigo text default null, p_origen text default 'MANUAL_STAFF',
  p_motivo text default null, p_estado text default 'ACTIVA'
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_plan_id uuid;
  v_promocion public.promociones_comerciales;
  v_promo_cliente_id uuid;
  v_precio numeric;
  v_licencia_anterior public.licencias;
  v_nueva_id uuid;
  v_periodo interval;
  v_tipo_evento text;
begin
  if not public.puedo_administrar_cliente(p_cliente_id) then
    raise exception 'No autorizado para modificar la licencia de este cliente';
  end if;

  select id into v_plan_id from public.planes where codigo = p_plan_codigo and activo;
  if v_plan_id is null then raise exception 'Plan desconocido o inactivo: %', p_plan_codigo; end if;

  select * into v_licencia_anterior from public.licencias where cliente_id = p_cliente_id and vigente = true;

  -- Promoción, si se pide una explícitamente
  if p_promocion_codigo is not null then
    select * into v_promocion from public.promociones_comerciales where codigo = p_promocion_codigo and activa;
    if v_promocion.id is null then
      raise exception 'Promoción desconocida o inactiva: %', p_promocion_codigo;
    end if;
    if not public.cliente_elegible_promocion(p_cliente_id, v_promocion.id) then
      raise exception 'Este cliente ya adquirió esta promoción anteriormente (o la canceló) -- no es elegible de nuevo.';
    end if;
    if now() > v_promocion.fecha_fin then
      raise exception 'La ventana de esta promoción ya cerró.';
    end if;
  end if;

  -- OJO: si esta es una promoción NUEVA (v_promocion.id no es null), el
  -- beneficio en promociones_comerciales_clientes todavía no existe -- se
  -- inserta más abajo, después de crear la licencia. precio_modalidad()
  -- consulta ese historial para decidir el precio, así que en este caso no
  -- lo encontraría todavía y calcularía el precio normal por error. Por eso
  -- aquí se aplica el precio promocional directamente sobre la modalidad;
  -- fuera de este caso (sin promoción nueva), se usa precio_modalidad() que
  -- sí resuelve correctamente promociones ya vigentes de compras anteriores.
  if v_promocion.id is not null then
    v_precio := public.aplicar_modalidad_a_base(v_promocion.precio_promocional, p_modalidad);
  else
    v_precio := public.precio_modalidad(p_plan_codigo, p_modalidad, p_cliente_id);
  end if;

  -- Cierra la licencia anterior (si existe) sin borrar historial
  if v_licencia_anterior.id is not null then
    update public.licencias set vigente = false, fecha_fin_vigencia = now(),
      motivo_fin = coalesce(motivo_fin, 'Reemplazada por nueva licencia'), updated_at = now()
    where id = v_licencia_anterior.id;
    v_tipo_evento := case when v_licencia_anterior.plan_id != v_plan_id then 'CAMBIO_PLAN' else 'CAMBIO_MODALIDAD' end;
  elsif exists (select 1 from public.licencias where cliente_id = p_cliente_id) then
    -- No hay licencia vigente ahora mismo, pero sí hubo alguna antes (p.ej. CANCELADA) -> es una reactivación real.
    v_tipo_evento := 'REACTIVACION';
  else
    v_tipo_evento := 'CREACION_LICENCIA';
  end if;

  v_periodo := case p_modalidad when 'MENSUAL' then interval '1 month' when 'TRIMESTRAL' then interval '3 months'
                                  when 'ANUAL' then interval '1 year' else null end;

  insert into public.licencias (
    cliente_id, plan_id, modalidad, estado, precio_aplicado, vigente, origen,
    fecha_inicio, fecha_fin_periodo_actual, motivo, created_by
  ) values (
    p_cliente_id, v_plan_id, p_modalidad, p_estado,
    v_precio, true, p_origen, now(), case when v_periodo is not null then now() + v_periodo else null end,
    p_motivo, auth.uid()
  ) returning id into v_nueva_id;

  if v_promocion.id is not null then
    insert into public.promociones_comerciales_clientes (promocion_id, cliente_id, licencia_id, fecha_fin_beneficio)
    values (
      v_promocion.id, p_cliente_id, v_nueva_id,
      now() + make_interval(months => v_promocion.duracion_beneficio_meses)
    ) returning id into v_promo_cliente_id;
    update public.licencias set promocion_cliente_id = v_promo_cliente_id where id = v_nueva_id;
  end if;

  insert into public.historial_comercial (cliente_id, licencia_id, tipo_evento, datos_anteriores, datos_nuevos, motivo, actor)
  values (
    p_cliente_id, v_nueva_id, v_tipo_evento,
    case when v_licencia_anterior.id is not null then to_jsonb(v_licencia_anterior) else null end,
    jsonb_build_object('plan', p_plan_codigo, 'modalidad', p_modalidad, 'precio_aplicado', v_precio, 'promocion', p_promocion_codigo),
    p_motivo, auth.uid()
  );

  return v_nueva_id;
end;
$$;
grant execute on function public.registrar_licencia(uuid, text, text, text, text, text, text) to authenticated, service_role;

create or replace function public.cancelar_licencia(p_licencia_id uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_lic public.licencias;
begin
  select * into v_lic from public.licencias where id = p_licencia_id;
  if v_lic.id is null then raise exception 'Licencia no encontrada'; end if;
  if not public.puedo_administrar_cliente(v_lic.cliente_id) then
    raise exception 'No autorizado para cancelar esta licencia';
  end if;

  update public.licencias set
    vigente = false, estado = 'CANCELADA', fecha_cancelacion = now(),
    fecha_fin_vigencia = now(), motivo_fin = p_motivo, updated_at = now()
  where id = p_licencia_id;

  -- Deja constancia de que este cliente tuvo (y perdió) el beneficio, sin borrar historial.
  update public.promociones_comerciales_clientes set estado = 'CANCELADA_ANTICIPADA', fecha_cancelacion = now()
  where licencia_id = p_licencia_id and estado = 'VIGENTE';

  insert into public.historial_comercial (cliente_id, licencia_id, tipo_evento, datos_anteriores, motivo, actor)
  values (v_lic.cliente_id, p_licencia_id, 'CANCELACION', to_jsonb(v_lic), p_motivo, auth.uid());
end;
$$;
grant execute on function public.cancelar_licencia(uuid, text) to authenticated, service_role;

create or replace function public.activar_licencia_vitalicia(p_cliente_id uuid, p_plan_codigo text default 'PREMIUM', p_motivo text default null)
returns uuid language sql security definer set search_path = public as $$
  select public.registrar_licencia(p_cliente_id, p_plan_codigo, 'VITALICIA', null, 'MANUAL_STAFF', p_motivo, 'ACTIVA')
$$;
grant execute on function public.activar_licencia_vitalicia(uuid, text, text) to authenticated, service_role;

-- ---- RPC: sucursales ------------------------------------------------------
create or replace function public.crear_sucursal(p_cliente_id uuid, p_nombre text, p_direccion text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_limite numeric;
  v_actuales int;
  v_id uuid;
begin
  if not public.puedo_administrar_cliente(p_cliente_id) then
    raise exception 'No autorizado para crear sucursales en este cliente';
  end if;
  v_limite := public.limite_sucursales_totales(p_cliente_id);
  v_actuales := public.contar_sucursales_activas(p_cliente_id);
  if v_limite is not null and v_actuales >= v_limite then
    raise exception 'Límite de sucursales alcanzado (%/%). Contrata una sucursal adicional o actualiza el plan.', v_actuales, v_limite;
  end if;

  insert into public.sucursales (cliente_id, nombre, direccion, es_principal)
  values (p_cliente_id, p_nombre, p_direccion, v_actuales = 0)
  returning id into v_id;

  insert into public.historial_comercial (cliente_id, tipo_evento, datos_nuevos, actor)
  values (p_cliente_id, 'CAMBIO_SUCURSAL', jsonb_build_object('accion', 'creada', 'sucursal_id', v_id, 'nombre', p_nombre), auth.uid());

  return v_id;
end;
$$;
grant execute on function public.crear_sucursal(uuid, text, text) to authenticated, service_role;

-- ---- RPC: add-ons -----------------------------------------------------
create or replace function public.agregar_addon_cliente(p_cliente_id uuid, p_addon_codigo text, p_cantidad int default 1)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_addon public.addons;
  v_licencia_id uuid;
  v_id uuid;
begin
  if not public.puedo_administrar_cliente(p_cliente_id) then
    raise exception 'No autorizado para agregar add-ons a este cliente';
  end if;
  select * into v_addon from public.addons where codigo = p_addon_codigo and activo;
  if v_addon.id is null then raise exception 'Add-on desconocido o inactivo: %', p_addon_codigo; end if;
  if v_addon.precio is null then
    raise exception 'El add-on % todavía no tiene precio configurado en administración.', p_addon_codigo;
  end if;

  select id into v_licencia_id from public.licencias where cliente_id = p_cliente_id and vigente = true;

  insert into public.addons_cliente (cliente_id, licencia_id, addon_id, cantidad, precio_aplicado)
  values (p_cliente_id, v_licencia_id, v_addon.id, p_cantidad, v_addon.precio * p_cantidad)
  returning id into v_id;

  insert into public.historial_comercial (cliente_id, licencia_id, tipo_evento, datos_nuevos, actor)
  values (p_cliente_id, v_licencia_id, 'ADDON_AGREGADO', jsonb_build_object('addon', p_addon_codigo, 'cantidad', p_cantidad), auth.uid());

  return v_id;
end;
$$;
grant execute on function public.agregar_addon_cliente(uuid, text, int) to authenticated, service_role;

create or replace function public.cancelar_addon_cliente(p_addon_cliente_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ac public.addons_cliente;
begin
  select * into v_ac from public.addons_cliente where id = p_addon_cliente_id;
  if v_ac.id is null then raise exception 'Add-on de cliente no encontrado'; end if;
  if not public.puedo_administrar_cliente(v_ac.cliente_id) then
    raise exception 'No autorizado';
  end if;
  update public.addons_cliente set estado = 'CANCELADO', fecha_fin = now() where id = p_addon_cliente_id;
  insert into public.historial_comercial (cliente_id, licencia_id, tipo_evento, datos_anteriores, actor)
  values (v_ac.cliente_id, v_ac.licencia_id, 'ADDON_CANCELADO', to_jsonb(v_ac), auth.uid());
end;
$$;
grant execute on function public.cancelar_addon_cliente(uuid) to authenticated, service_role;

-- ---- Blindaje: funciones internas que reciben un cliente_id ARBITRARIO ----
-- Postgres otorga EXECUTE a PUBLIC por defecto en toda función nueva. Las de
-- arriba devuelven datos de negocio (entitlements, precios, conteos) de
-- CUALQUIER cliente que se les pase, sin validar que quien llama sea dueño de
-- ese cliente_id -- si se dejan abiertas, cualquier usuario autenticado podría
-- consultar los límites/promociones_comerciales de otro cliente. Se revoca el acceso
-- público; siguen funcionando igual para el resto de funciones SECURITY
-- DEFINER de este archivo (postgres, su dueño, no queda sujeto al revoke) y
-- para servicios internos (service_role). El frontend debe usar
-- mis_entitlements()/mi_licencia_vigente() más abajo, que solo pueden
-- devolver los datos del propio cliente autenticado.
revoke execute on function public.entitlement_valor(uuid, text) from public;
revoke execute on function public.entitlement_habilitado(uuid, text) from public;
revoke execute on function public.entitlement_limite(uuid, text) from public;
revoke execute on function public.contar_sucursales_activas(uuid) from public;
revoke execute on function public.contar_empleados_activos(uuid) from public;
revoke execute on function public.contar_modulos_especializados_activos(uuid) from public;
revoke execute on function public.limite_sucursales_totales(uuid) from public;
revoke execute on function public.limite_empleados_totales(uuid) from public;
revoke execute on function public.cliente_promocion_vigente(uuid) from public;
revoke execute on function public.cliente_elegible_promocion(uuid, uuid) from public;
revoke execute on function public.precio_efectivo_licencia(uuid) from public;
revoke execute on function public.precio_base_mensual(text, uuid) from public;
revoke execute on function public.precio_modalidad(text, text, uuid) from public;
grant execute on function public.entitlement_valor(uuid, text) to service_role;
grant execute on function public.entitlement_habilitado(uuid, text) to service_role;
grant execute on function public.entitlement_limite(uuid, text) to service_role;
grant execute on function public.contar_sucursales_activas(uuid) to service_role;
grant execute on function public.contar_empleados_activos(uuid) to service_role;
grant execute on function public.contar_modulos_especializados_activos(uuid) to service_role;
grant execute on function public.limite_sucursales_totales(uuid) to service_role;
grant execute on function public.limite_empleados_totales(uuid) to service_role;
grant execute on function public.cliente_promocion_vigente(uuid) to service_role;
grant execute on function public.cliente_elegible_promocion(uuid, uuid) to service_role;
grant execute on function public.precio_efectivo_licencia(uuid) to service_role;
grant execute on function public.precio_base_mensual(text, uuid) to service_role;
grant execute on function public.precio_modalidad(text, text, uuid) to service_role;

-- ---- API segura para frontend: solo los datos del propio cliente ----------
create or replace function public.mis_entitlements()
returns table (codigo text, tipo text, valor jsonb)
language sql stable security definer set search_path = public as $$
  select e.codigo, e.tipo, public.entitlement_valor(public.current_cliente_id(), e.codigo)
  from public.entitlements e
  where public.current_cliente_id() is not null
$$;
grant execute on function public.mis_entitlements() to authenticated;

create or replace function public.mi_licencia_vigente()
returns table (
  plan_codigo text, modalidad text, estado text,
  precio_aplicado numeric, precio_efectivo numeric,
  fecha_inicio timestamptz, fecha_fin_periodo_actual timestamptz,
  en_promocion boolean, fecha_fin_beneficio_promocion timestamptz
) language sql stable security definer set search_path = public as $$
  select
    p.codigo, l.modalidad, l.estado, l.precio_aplicado, public.precio_efectivo_licencia(l.id),
    l.fecha_inicio, l.fecha_fin_periodo_actual,
    (public.cliente_promocion_vigente(public.current_cliente_id())).id is not null,
    (public.cliente_promocion_vigente(public.current_cliente_id())).fecha_fin_beneficio
  from public.licencias l join public.planes p on p.id = l.plan_id
  where l.cliente_id = public.current_cliente_id() and l.vigente = true
$$;
grant execute on function public.mi_licencia_vigente() to authenticated;

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.planes enable row level security;
alter table public.configuracion_comercial enable row level security;
alter table public.precios enable row level security;
alter table public.promociones_comerciales enable row level security;
alter table public.promociones_comerciales_clientes enable row level security;
alter table public.entitlements enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.entitlements_override_cliente enable row level security;
alter table public.modulos_especializados_catalogo enable row level security;
alter table public.addons enable row level security;
alter table public.addons_cliente enable row level security;
alter table public.sucursales enable row level security;
alter table public.instalaciones enable row level security;
alter table public.licencias enable row level security;
alter table public.historial_comercial enable row level security;

-- Catálogo público (lectura abierta -- landing, futuro registro; escritura solo staff)
create policy "catalogo publico lectura" on public.planes for select to anon, authenticated using (true);
create policy "catalogo publico escritura staff" on public.planes for all to authenticated using (public.es_staff_actual()) with check (public.es_staff_actual());

create policy "config comercial lectura" on public.configuracion_comercial for select to anon, authenticated using (true);
create policy "config comercial escritura staff" on public.configuracion_comercial for all to authenticated using (public.es_staff_actual()) with check (public.es_staff_actual());

create policy "precios lectura" on public.precios for select to anon, authenticated using (true);
create policy "precios escritura staff" on public.precios for all to authenticated using (public.es_staff_actual()) with check (public.es_staff_actual());

create policy "promociones_comerciales lectura" on public.promociones_comerciales for select to anon, authenticated using (true);
create policy "promociones_comerciales escritura staff" on public.promociones_comerciales for all to authenticated using (public.es_staff_actual()) with check (public.es_staff_actual());

create policy "entitlements lectura" on public.entitlements for select to anon, authenticated using (true);
create policy "entitlements escritura staff" on public.entitlements for all to authenticated using (public.es_staff_actual()) with check (public.es_staff_actual());

create policy "plan_entitlements lectura" on public.plan_entitlements for select to anon, authenticated using (true);
create policy "plan_entitlements escritura staff" on public.plan_entitlements for all to authenticated using (public.es_staff_actual()) with check (public.es_staff_actual());

create policy "modulos especializados lectura" on public.modulos_especializados_catalogo for select to anon, authenticated using (true);
create policy "modulos especializados escritura staff" on public.modulos_especializados_catalogo for all to authenticated using (public.es_staff_actual()) with check (public.es_staff_actual());

create policy "addons lectura" on public.addons for select to anon, authenticated using (true);
create policy "addons escritura staff" on public.addons for all to authenticated using (public.es_staff_actual()) with check (public.es_staff_actual());

-- Datos por cliente: el propio cliente ve lo suyo (solo lectura); todo
-- escribe por RPC o por staff directamente.
create policy "promociones_comerciales_clientes lectura propia" on public.promociones_comerciales_clientes for select to authenticated
  using (cliente_id = public.current_cliente_id() or public.es_staff_actual());
create policy "promociones_comerciales_clientes escritura staff" on public.promociones_comerciales_clientes for all to authenticated
  using (public.es_staff_actual()) with check (public.es_staff_actual());

create policy "entitlements_override lectura propia" on public.entitlements_override_cliente for select to authenticated
  using (cliente_id = public.current_cliente_id() or public.es_staff_actual());
create policy "entitlements_override escritura staff" on public.entitlements_override_cliente for all to authenticated
  using (public.es_staff_actual()) with check (public.es_staff_actual());

create policy "addons_cliente lectura propia" on public.addons_cliente for select to authenticated
  using (cliente_id = public.current_cliente_id() or public.es_staff_actual());
create policy "addons_cliente escritura staff" on public.addons_cliente for all to authenticated
  using (public.es_staff_actual()) with check (public.es_staff_actual());

create policy "sucursales lectura propia" on public.sucursales for select to authenticated
  using (cliente_id = public.current_cliente_id() or public.es_staff_actual());
create policy "sucursales escritura staff" on public.sucursales for all to authenticated
  using (public.es_staff_actual()) with check (public.es_staff_actual());
-- Nota: la creación normal de sucursales pasa por crear_sucursal() (SECURITY
-- DEFINER, valida límite y permisos internamente) -- no hay policy de INSERT
-- para `authenticated` a propósito, así un cliente no puede insertar una
-- fila saltándose el límite aunque manipule la petición.

create policy "instalaciones lectura propia" on public.instalaciones for select to authenticated
  using (cliente_id = public.current_cliente_id() or public.es_staff_actual());
create policy "instalaciones escritura staff" on public.instalaciones for all to authenticated
  using (public.es_staff_actual()) with check (public.es_staff_actual());

create policy "licencias lectura propia" on public.licencias for select to authenticated
  using (cliente_id = public.current_cliente_id() or public.es_staff_actual());
create policy "licencias escritura staff" on public.licencias for all to authenticated
  using (public.es_staff_actual()) with check (public.es_staff_actual());
-- Igual que sucursales: la creación/cambio normal pasa por registrar_licencia()
-- / cancelar_licencia() (SECURITY DEFINER); no hay INSERT/UPDATE directo para
-- `authenticated` fuera de esas funciones.

create policy "historial_comercial lectura propia" on public.historial_comercial for select to authenticated
  using (cliente_id = public.current_cliente_id() or public.es_staff_actual());
create policy "historial_comercial escritura staff" on public.historial_comercial for all to authenticated
  using (public.es_staff_actual()) with check (public.es_staff_actual());
