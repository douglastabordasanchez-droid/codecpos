/**
 * Roles personalizados y alta de usuarios en la nube — compartido por la web,
 * el celular y Electron (migración 0103). Todo pasa por funciones del
 * servidor que exigen ser administrador del negocio.
 *
 * Un rol personalizado = rol base operativo + módulos permitidos. Al
 * asignarlo, el empleado queda con `permisos.modulosHabilitados`, que ya
 * respetan los tres clientes al iniciar sesión.
 */
import { getSupabaseClient } from './config';
import { MODULOS_CATALOGO, ModuloPOS, type ModuloInfo } from '../permissions';

export interface RolPersonalizado {
  id: string;
  nombre: string;
  descripcion: string | null;
  rolBase: RolBase;
  modulos: string[];
  color: string | null;
}

export type RolBase = 'cajero' | 'tecnico' | 'mesero' | 'cocina' | 'barra';

export const ROLES_SISTEMA: Array<{ value: string; label: string; descripcion: string }> = [
  { value: 'super_usuario', label: 'Super usuario', descripcion: 'Dueño: acceso total' },
  { value: 'admin', label: 'Administrador', descripcion: 'Acceso total y gestiona al personal' },
  { value: 'cajero', label: 'Cajero', descripcion: 'Vende, cobra y cierra caja' },
  { value: 'tecnico', label: 'Técnico', descripcion: 'Taller y órdenes de servicio' },
  { value: 'mesero', label: 'Mesero', descripcion: 'Mesas y pedidos del salón' },
  { value: 'cocina', label: 'Cocina', descripcion: 'Comandas de cocina' },
  { value: 'barra', label: 'Barra', descripcion: 'Comandas de bar' },
];

export const ROLES_BASE: RolBase[] = ['cajero', 'tecnico', 'mesero', 'cocina', 'barra'];

export const etiquetaRol = (rol: string) => ROLES_SISTEMA.find((r) => r.value === rol)?.label || rol;

/** Módulos que tiene sentido asignar a un rol (sin herramientas de desarrollador ni administración del sistema). */
export const MODULOS_ASIGNABLES: ModuloInfo[] = MODULOS_CATALOGO.filter((m) =>
  m.categoria !== 'desarrollador' && ![ModuloPOS.MONITOREO_TERMINALES].includes(m.id));

export const COLORES_ROL = ['#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#ef4444', '#ec4899', '#14b8a6', '#64748b'];

function cliente() {
  const c = getSupabaseClient();
  if (!c) throw new Error('Sin conexión con la nube');
  return c;
}

const traducirError = (mensaje: string) =>
  /duplicate key|already registered|Ya existe una cuenta/i.test(mensaje) ? 'Ya existe una cuenta con ese correo' : mensaje;

async function rpc<T>(nombre: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await cliente().rpc(nombre, args);
  if (error) throw new Error(traducirError(error.message));
  return data as T;
}

export async function listarRolesPersonalizados(clienteId: string): Promise<RolPersonalizado[]> {
  const { data, error } = await cliente()
    .from('roles_personalizados')
    .select('id, nombre, descripcion, rol_base, modulos, color')
    .eq('cliente_id', clienteId)
    .order('nombre');
  if (error) throw new Error(error.message);
  return ((data as any[]) || []).map((r) => ({
    id: r.id, nombre: r.nombre, descripcion: r.descripcion, rolBase: r.rol_base, modulos: r.modulos || [], color: r.color,
  }));
}

/** Se llama cuando cambia la lista de roles en cualquier dispositivo. Devuelve cómo dejar de escuchar. */
export function suscribirRolesPersonalizados(clienteId: string, alCambiar: () => void): () => void {
  const c = getSupabaseClient();
  if (!c) return () => {};
  const canal = c
    .channel(`roles-personalizados-${clienteId}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'roles_personalizados', filter: `cliente_id=eq.${clienteId}` }, alCambiar)
    .subscribe();
  return () => { c.removeChannel(canal); };
}

export function guardarRolPersonalizado(rol: { id?: string | null; nombre: string; rolBase: RolBase; modulos: string[]; descripcion?: string; color?: string | null }) {
  return rpc<string>('guardar_rol_personalizado', {
    p_id: rol.id || null,
    p_nombre: rol.nombre.trim(),
    p_rol_base: rol.rolBase,
    p_modulos: rol.modulos,
    p_descripcion: rol.descripcion || null,
    p_color: rol.color || null,
  });
}

export const eliminarRolPersonalizado = (id: string) => rpc<void>('eliminar_rol_personalizado', { p_id: id });

/** `valor`: un rol de sistema ('cajero') o 'rp:<id>' para uno personalizado. */
export function asignarRol(empleadoId: string, valor: string) {
  const personalizado = valor.startsWith('rp:') ? valor.slice(3) : null;
  return rpc<void>('asignar_rol_empleado', {
    p_empleado_id: empleadoId,
    p_rol: personalizado ? null : valor,
    p_rol_personalizado_id: personalizado,
  });
}

export function crearEmpleado(datos: { nombre: string; email: string; password: string; rol: string }) {
  const personalizado = datos.rol.startsWith('rp:') ? datos.rol.slice(3) : null;
  return rpc<string>('crear_empleado_con_rol', {
    p_email: datos.email.trim().toLowerCase(),
    p_password: datos.password,
    p_nombre_completo: datos.nombre.trim(),
    p_rol: personalizado ? 'cajero' : datos.rol,
    p_rol_personalizado_id: personalizado,
  });
}

/** Valor del selector de rol para un empleado: su rol personalizado si tiene, si no el de sistema. */
export function valorRolDeEmpleado(e: { rol: string; permisos?: { rolPersonalizadoId?: string } | null }) {
  return e.permisos?.rolPersonalizadoId ? `rp:${e.permisos.rolPersonalizadoId}` : e.rol;
}
