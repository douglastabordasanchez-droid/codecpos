-- ============================================================================
-- FASE 3 (cierre) — Backfill: proyecta los clientes reales que ya existían
-- en clientes_pos (plan/duracion/estado legacy) hacia el nuevo modelo de
-- licencias/sucursales/instalaciones. No inventa precios ni fechas — usa
-- exactamente lo que ya existía. origen='MIGRACION_LEGACY' deja constancia
-- de que no es una venta nueva. Es 100% aditivo e idempotente (los `where
-- not exists` permiten re-ejecutar sin duplicar si algo se corta a mitad).
-- ============================================================================

insert into public.licencias (
  cliente_id, plan_id, modalidad, estado, precio_aplicado, vigente, origen,
  fecha_inicio, fecha_fin_periodo_actual, motivo
)
select
  c.id,
  p.id,
  case c.duracion
    when '1_MES' then 'MENSUAL' when '3_MESES' then 'TRIMESTRAL'
    when '1_ANO' then 'ANUAL' else 'VITALICIA' end,
  case c.estado
    when 'ACTIVA' then 'ACTIVA' when 'VENCIDA' then 'EXPIRADA'
    when 'SUSPENDIDA' then 'SUSPENDIDA' when 'PRUEBA' then 'TRIAL' else 'ACTIVA' end,
  null, -- no se inventa un precio retroactivo -- no se cobró nada bajo este modelo antes
  true,
  'MIGRACION_LEGACY',
  c.fecha_activacion,
  c.fecha_expiracion,
  'Backfill Fase 3: proyección 1:1 desde clientes_pos.plan/duracion/estado preexistente.'
from public.clientes_pos c
join public.planes p on p.codigo = c.plan
where not exists (select 1 from public.licencias l where l.cliente_id = c.id);

insert into public.historial_comercial (cliente_id, licencia_id, tipo_evento, datos_nuevos, motivo)
select c.id, l.id, 'MIGRACION_LEGACY',
  jsonb_build_object('plan_legacy', c.plan, 'duracion_legacy', c.duracion, 'estado_legacy', c.estado, 'modulos_activos', c.modulos_activos),
  'Alta inicial del motor comercial (Fase 3) a partir del estado ya existente del cliente.'
from public.clientes_pos c
join public.licencias l on l.cliente_id = c.id and l.origen = 'MIGRACION_LEGACY'
where not exists (
  select 1 from public.historial_comercial h where h.cliente_id = c.id and h.tipo_evento = 'MIGRACION_LEGACY'
);

insert into public.sucursales (cliente_id, nombre, es_principal, estado)
select c.id, c.nombre_negocio, true, 'ACTIVA'
from public.clientes_pos c
where not exists (select 1 from public.sucursales s where s.cliente_id = c.id);

insert into public.instalaciones (cliente_id, sucursal_id, machine_id, tipo, activada_en)
select c.id, s.id, c.machine_id, 'ELECTRON', c.fecha_activacion
from public.clientes_pos c
join public.sucursales s on s.cliente_id = c.id and s.es_principal = true
where c.machine_id is not null
  and not exists (select 1 from public.instalaciones i where i.cliente_id = c.id and i.machine_id = c.machine_id);
