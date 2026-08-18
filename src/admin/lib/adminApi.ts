/**
 * Capa de datos del Admin Web. Todo pasa por el motor comercial construido
 * en la Fase 3 (Supabase) -- ninguna función aquí inventa datos ni calcula
 * nada que ya resuelva el backend (precios, límites, entitlements). Las
 * tablas nuevas (`sucursales`, `licencias`, `addons_cliente`, etc.) tienen
 * RLS que permite SELECT completo solo a `es_staff_actual()`, así que estas
 * consultas directas son seguras -- el propio backend las filtra si algún
 * día se llaman con una sesión que no sea de staff.
 */
import { getSupabaseClient } from '../../app/lib/supabase/config';

function cliente() {
  const c = getSupabaseClient();
  if (!c) throw new Error('Supabase no está configurado');
  return c;
}

// ---- Dashboard --------------------------------------------------------
export async function obtenerDashboardResumen() {
  const { data, error } = await cliente().rpc('admin_dashboard_resumen');
  if (error) throw new Error(error.message);
  return data as {
    clientes: { total: number; activos: number; en_prueba: number; en_prueba_vencida: number; cancelados: number; suspendidos: number; vitalicios: number };
    suscripciones: { basico: number; premium: number; con_promocion_activa: number; proximas_renovaciones_30d: number; cancelaciones_30d: number };
    sucursales: { total: number; activas: number; adicionales_contratadas: number };
    licencias: { activas: number; vencidas: number; suspendidas: number };
    soporte: { solicitudes_totales: number; pendientes: number; atendidas: number; clientes_con_soporte_activo: number };
  };
}

// ---- Clientes -----------------------------------------------------------
export async function listarClientes() {
  const { data, error } = await cliente()
    .from('clientes_pos')
    .select(
      'id, nombre_negocio, email, plan, duracion, estado, en_prueba, dias_prueba_restantes, fecha_activacion, fecha_expiracion, created_at, ' +
      'licencias!licencias_cliente_id_fkey(estado, fecha_inicio, fecha_fin_periodo_actual, vigente)'
    )
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  // Solo interesa la licencia vigente de cada cliente -- `licencias` es 1:N
  // (historial completo), no 1:1, así que Supabase la devuelve como array.
  return (data ?? []).map((c: any) => ({
    ...c,
    licencia_vigente: (c.licencias ?? []).find((l: any) => l.vigente) ?? null,
  }));
}

export async function obtenerDetalleCliente(clienteId: string) {
  const { data, error } = await cliente().rpc('admin_detalle_cliente', { p_cliente_id: clienteId });
  if (error) throw new Error(error.message);
  return data as {
    cliente: Record<string, any>;
    licencia_vigente: Record<string, any> | null;
    sucursales: { total: number; limite: number | null };
    usuarios: { total: number; limite: number | null };
    app_movil: boolean;
    addons_activos: { codigo: string; nombre: string; cantidad: number; precio_aplicado: number }[];
    historial: Record<string, any>[];
  };
}

// ---- Planes y precios -----------------------------------------------------
export async function listarPlanesConPrecios() {
  const { data, error } = await cliente().rpc('plan_catalogo_publico');
  if (error) throw new Error(error.message);
  return data as {
    plan_codigo: string; plan_nombre: string; precio_mensual: number | null;
    precio_trimestral: number | null; precio_anual: number | null;
    promocion_activa: boolean; precio_promocional_mensual: number | null;
  }[];
}

// ---- Promociones ------------------------------------------------------
export async function listarPromociones() {
  const { data, error } = await cliente()
    .from('promociones_comerciales')
    .select('id, codigo, precio_promocional, fecha_inicio, fecha_fin, duracion_beneficio_meses, activa, descripcion, planes(codigo, nombre)')
    .order('fecha_inicio', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function cambiarActivaPromocion(promocionId: string, activa: boolean) {
  const { error } = await cliente().from('promociones_comerciales').update({ activa }).eq('id', promocionId);
  if (error) throw new Error(error.message);
}

// ---- Sucursales -----------------------------------------------------------
export async function crearSucursal(clienteId: string, nombre: string, direccion?: string) {
  const { error } = await cliente().rpc('crear_sucursal', {
    p_cliente_id: clienteId, p_nombre: nombre, p_direccion: direccion ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function listarSucursales() {
  const { data, error } = await cliente()
    .from('sucursales')
    .select('id, nombre, direccion, es_principal, estado, created_at, clientes_pos(id, nombre_negocio, plan)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

// ---- Usuarios ---------------------------------------------------------
export async function listarUsuarios() {
  const { data, error } = await cliente()
    .from('empleados')
    .select('id, nombre_completo, rol, activo, es_staff_codec, clientes_pos(id, nombre_negocio, plan)')
    .order('nombre_completo', { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

// ---- Licencias --------------------------------------------------------
export async function listarLicencias() {
  const { data, error } = await cliente()
    .from('licencias')
    .select('id, modalidad, estado, precio_aplicado, vigente, origen, fecha_inicio, fecha_fin_periodo_actual, fecha_cancelacion, planes(codigo, nombre), clientes_pos(id, nombre_negocio)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function obtenerIdLicenciaVigente(clienteId: string) {
  const { data, error } = await cliente().from('licencias').select('id').eq('cliente_id', clienteId).eq('vigente', true).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id as string | undefined;
}

export async function cancelarLicencia(licenciaId: string, motivo: string) {
  const { error } = await cliente().rpc('cancelar_licencia', { p_licencia_id: licenciaId, p_motivo: motivo });
  if (error) throw new Error(error.message);
}

export async function registrarLicencia(params: {
  clienteId: string; planCodigo: string; modalidad: string;
  promocionCodigo?: string; motivo?: string;
}) {
  const { error } = await cliente().rpc('registrar_licencia', {
    p_cliente_id: params.clienteId,
    p_plan_codigo: params.planCodigo,
    p_modalidad: params.modalidad,
    p_promocion_codigo: params.promocionCodigo ?? null,
    p_motivo: params.motivo ?? null,
  });
  if (error) throw new Error(error.message);
}

// ---- Soporte ------------------------------------------------------------
export async function listarSoporteContratado() {
  const { data, error } = await cliente()
    .from('addons_cliente')
    .select('id, cantidad, precio_aplicado, fecha_inicio, fecha_fin, estado, addons!inner(codigo, nombre, categoria), clientes_pos(id, nombre_negocio, plan)')
    .eq('addons.categoria', 'SOPORTE')
    .order('fecha_inicio', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function listarSolicitudesSoporte() {
  const { data, error } = await cliente()
    .from('solicitudes_soporte')
    .select('id, asunto, descripcion, estado, atendida_en, created_at, clientes_pos(id, nombre_negocio)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function marcarSolicitudAtendida(id: string) {
  const { error } = await cliente()
    .from('solicitudes_soporte')
    .update({ estado: 'ATENDIDA', atendida_en: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ---- Auditoría ----------------------------------------------------------
export async function listarAuditoria(limite = 100) {
  const { data, error } = await cliente()
    .from('auditoria_admin')
    .select('id, accion, resultado, detalle, created_at, empleados(nombre_completo), clientes_pos(id, nombre_negocio)')
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return data;
}

export async function registrarAuditoria(accion: string, clienteId?: string, resultado: 'EXITO' | 'ERROR' | 'DENEGADO' = 'EXITO', detalle?: Record<string, any>) {
  const { error } = await cliente().rpc('registrar_auditoria', {
    p_accion: accion, p_cliente_id: clienteId ?? null, p_resultado: resultado, p_detalle: detalle ?? null,
  });
  if (error) throw new Error(error.message);
}
