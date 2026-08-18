-- ============================================================================
-- FASE 4 — Soporte de base de datos para el Admin Web: roles de staff,
-- auditoría administrativa, solicitudes de soporte, dashboard.
--
-- Decisiones de diseño:
--  1. `empleados.nivel_staff` es un concepto NUEVO y distinto de
--     `empleados.rol` (que ya existe y significa el rol OPERATIVO de un
--     empleado dentro del negocio de un cliente: cajero/admin/técnico...).
--     nivel_staff solo aplica cuando es_staff_codec=true -- es el nivel de
--     acceso al Admin Web de Codec Studio.
--  2. `auditoria_admin` es deliberadamente una tabla DISTINTA de
--     `historial_comercial` (Fase 3): historial_comercial es visible al
--     propio cliente (RLS ya lo permite) y registra hechos del NEGOCIO
--     (cambios de plan, cancelaciones). auditoria_admin es interna de Codec
--     Studio, nunca visible al cliente, y registra acciones del STAFF
--     (quién hizo qué, cuándo, con qué resultado) -- mezclar ambas
--     rompería el límite de qué puede ver un cliente sobre sí mismo.
--  3. `solicitudes_soporte` es la "estructura correcta" pedida para el
--     punto 13 -- no es un sistema de tickets completo (eso queda para
--     cuando el usuario lo pida explícitamente).
-- ============================================================================

alter table public.empleados add column if not exists nivel_staff text
  check (nivel_staff in ('SUPER_ADMIN', 'SOPORTE', 'LECTURA'));
comment on column public.empleados.nivel_staff is 'Nivel de acceso DENTRO del Admin Web de Codec Studio. Solo aplica si es_staff_codec=true. No confundir con empleados.rol (rol operativo dentro del negocio del cliente).';

-- Backfill explícito: todo el staff actual conserva acceso total (mismo
-- comportamiento que tenía antes de que existiera este concepto).
update public.empleados set nivel_staff = 'SUPER_ADMIN' where es_staff_codec = true and nivel_staff is null;

create or replace function public.nivel_staff_actual()
returns text language sql stable security definer set search_path = public as $$
  select nivel_staff from public.empleados where id = auth.uid() and es_staff_codec = true
$$;

create or replace function public.es_super_admin_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.nivel_staff_actual() = 'SUPER_ADMIN'
$$;

-- LECTURA nunca puede escribir, sin importar el resto de la lógica de
-- autorización. SOPORTE y SUPER_ADMIN sí. Un nivel_staff null (staff futuro
-- sin clasificar todavía) se deja pasar -- mismo comportamiento fail-open
-- que ya tenía el sistema antes de que existieran los niveles.
create or replace function public.puedo_administrar_cliente(p_cliente_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null
    or (public.es_staff_actual() and public.nivel_staff_actual() is distinct from 'LECTURA')
    or public.empleado_es_admin_de(p_cliente_id)
$$;

-- ---- Auditoría administrativa ---------------------------------------------
create table public.auditoria_admin (
  id uuid primary key default gen_random_uuid(),
  actor uuid references public.empleados(id),
  accion text not null,
  cliente_id uuid references public.clientes_pos(id),
  ip inet,
  resultado text not null default 'EXITO' check (resultado in ('EXITO', 'ERROR', 'DENEGADO')),
  detalle jsonb,
  created_at timestamptz not null default now()
);
create index idx_auditoria_admin_cliente on public.auditoria_admin(cliente_id, created_at desc);
create index idx_auditoria_admin_actor on public.auditoria_admin(actor, created_at desc);
comment on table public.auditoria_admin is 'Bitácora de acciones del staff en el Admin Web. Nunca visible a clientes (a diferencia de historial_comercial).';

alter table public.auditoria_admin enable row level security;
create policy "auditoria solo staff lee" on public.auditoria_admin for select to authenticated using (public.es_staff_actual());
create policy "auditoria staff inserta" on public.auditoria_admin for insert to authenticated with check (public.es_staff_actual());

create or replace function public.registrar_auditoria(
  p_accion text, p_cliente_id uuid default null, p_resultado text default 'EXITO',
  p_detalle jsonb default null, p_ip inet default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.es_staff_actual() then
    raise exception 'Solo el staff de Codec Studio puede registrar auditoría';
  end if;
  insert into public.auditoria_admin (actor, accion, cliente_id, ip, resultado, detalle)
  values (auth.uid(), p_accion, p_cliente_id, p_ip, p_resultado, p_detalle)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.registrar_auditoria(text, uuid, text, jsonb, inet) to authenticated;

-- ---- Solicitudes de soporte (estructura mínima, no un sistema de tickets) -
create table public.solicitudes_soporte (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id),
  asunto text not null,
  descripcion text,
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'ATENDIDA')),
  atendida_por uuid references public.empleados(id),
  atendida_en timestamptz,
  created_at timestamptz not null default now()
);
create index idx_solicitudes_soporte_cliente on public.solicitudes_soporte(cliente_id);
create index idx_solicitudes_soporte_estado on public.solicitudes_soporte(estado);
comment on table public.solicitudes_soporte is 'Estructura base para soporte (punto 13, Fase 4). No es un sistema de tickets completo -- eso se construye cuando se pida explícitamente.';

alter table public.solicitudes_soporte enable row level security;
create policy "solicitudes lectura propia o staff" on public.solicitudes_soporte for select to authenticated
  using (cliente_id = public.current_cliente_id() or public.es_staff_actual());
create policy "solicitudes crea propio cliente o staff" on public.solicitudes_soporte for insert to authenticated
  with check (cliente_id = public.current_cliente_id() or public.es_staff_actual());
create policy "solicitudes actualiza staff" on public.solicitudes_soporte for update to authenticated
  using (public.es_staff_actual()) with check (public.es_staff_actual());

-- ---- Dashboard: un solo RPC con todos los KPIs pedidos ---------------------
create or replace function public.admin_dashboard_resumen()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.es_staff_actual() then raise exception 'No autorizado'; end if;
  select jsonb_build_object(
    'clientes', jsonb_build_object(
      'total', (select count(*) from clientes_pos),
      'activos', (select count(*) from clientes_pos where estado = 'ACTIVA'),
      'en_prueba', (select count(*) from clientes_pos where estado = 'PRUEBA'),
      'cancelados', (select count(*) from clientes_pos where estado = 'CANCELADA'),
      'suspendidos', (select count(*) from clientes_pos where estado = 'SUSPENDIDA'),
      'vitalicios', (select count(*) from licencias where modalidad = 'VITALICIA' and vigente = true)
    ),
    'suscripciones', jsonb_build_object(
      'basico', (select count(*) from licencias l join planes p on p.id = l.plan_id where p.codigo = 'BASICO' and l.vigente = true),
      'premium', (select count(*) from licencias l join planes p on p.id = l.plan_id where p.codigo = 'PREMIUM' and l.vigente = true),
      'con_promocion_activa', (select count(*) from promociones_comerciales_clientes where estado = 'VIGENTE' and now() < fecha_fin_beneficio),
      'proximas_renovaciones_30d', (select count(*) from licencias where vigente = true and fecha_fin_periodo_actual between now() and now() + interval '30 days'),
      'cancelaciones_30d', (select count(*) from licencias where estado = 'CANCELADA' and fecha_cancelacion > now() - interval '30 days')
    ),
    'sucursales', jsonb_build_object(
      'total', (select count(*) from sucursales),
      'activas', (select count(*) from sucursales where estado = 'ACTIVA'),
      'adicionales_contratadas', (select coalesce(sum(cantidad), 0) from addons_cliente ac join addons a on a.id = ac.addon_id where a.codigo = 'SUCURSAL_ADICIONAL' and ac.estado = 'ACTIVO')
    ),
    'licencias', jsonb_build_object(
      'activas', (select count(*) from licencias where vigente = true and estado = 'ACTIVA'),
      'vencidas', (select count(*) from licencias where vigente = true and estado = 'EXPIRADA'),
      'suspendidas', (select count(*) from licencias where vigente = true and estado = 'SUSPENDIDA')
    ),
    'soporte', jsonb_build_object(
      'solicitudes_totales', (select count(*) from solicitudes_soporte),
      'pendientes', (select count(*) from solicitudes_soporte where estado = 'PENDIENTE'),
      'atendidas', (select count(*) from solicitudes_soporte where estado = 'ATENDIDA'),
      'clientes_con_soporte_activo', (select count(distinct cliente_id) from addons_cliente ac join addons a on a.id = ac.addon_id where a.categoria = 'SOPORTE' and ac.estado = 'ACTIVO')
    )
  ) into v;
  return v;
end;
$$;
grant execute on function public.admin_dashboard_resumen() to authenticated;

-- ---- Detalle de cliente: un solo RPC con todo lo que pide el punto 5 ------
create or replace function public.admin_detalle_cliente(p_cliente_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.es_staff_actual() then raise exception 'No autorizado'; end if;
  select jsonb_build_object(
    'cliente', (select to_jsonb(c) from clientes_pos c where c.id = p_cliente_id),
    'licencia_vigente', (
      select jsonb_build_object(
        'plan_codigo', pl.codigo, 'modalidad', l.modalidad, 'estado', l.estado,
        'precio_aplicado', l.precio_aplicado, 'precio_efectivo', public.precio_efectivo_licencia(l.id),
        'fecha_inicio', l.fecha_inicio, 'fecha_fin_periodo_actual', l.fecha_fin_periodo_actual,
        'origen', l.origen
      )
      from licencias l join planes pl on pl.id = l.plan_id
      where l.cliente_id = p_cliente_id and l.vigente = true
    ),
    'sucursales', (select jsonb_build_object('total', count(*), 'limite', public.limite_sucursales_totales(p_cliente_id)) from sucursales where cliente_id = p_cliente_id and estado = 'ACTIVA'),
    'usuarios', (select jsonb_build_object('total', count(*), 'limite', public.limite_empleados_totales(p_cliente_id)) from empleados where cliente_id = p_cliente_id and activo),
    'app_movil', public.entitlement_habilitado(p_cliente_id, 'MOBILE_APP'),
    'addons_activos', (select coalesce(jsonb_agg(jsonb_build_object('codigo', a.codigo, 'nombre', a.nombre, 'cantidad', ac.cantidad, 'precio_aplicado', ac.precio_aplicado)), '[]'::jsonb) from addons_cliente ac join addons a on a.id = ac.addon_id where ac.cliente_id = p_cliente_id and ac.estado = 'ACTIVO'),
    'historial', (select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at desc), '[]'::jsonb) from historial_comercial h where h.cliente_id = p_cliente_id)
  ) into v;
  return v;
end;
$$;
grant execute on function public.admin_detalle_cliente(uuid) to authenticated;
