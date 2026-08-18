import { getSupabaseClient } from './config';

export interface EmpleadoSupabase {
  id: string;
  cliente_id: string;
  nombre_completo: string;
  rol: string;
  activo: boolean;
  es_staff_codec: boolean;
  permisos?: { modulosHabilitados?: string[] } | null;
  foto_url?: string | null;
  fecha_nacimiento?: string | null;
  telefono?: string | null;
}

const CAMPOS_EMPLEADO = 'id, cliente_id, nombre_completo, rol, activo, es_staff_codec, permisos, foto_url, fecha_nacimiento, telefono';

/**
 * Verificación ONLINE contra Supabase Auth. Usada para:
 * 1) priming best-effort de sesión en la nube tras un login local exitoso (Fase 2 la aprovechará para sync)
 * 2) el gate del Panel Desarrollador (staff Codec Studio), que exige internet a propósito
 *
 * `emailOUsuario` acepta un correo real (empleados con cuenta personal,
 * ver invitar_empleado) O el usuario de licencia del negocio (el dueño
 * entra con la MISMA credencial que usa en Electron — ver migración 0014,
 * decisión explícita para simplificar el onboarding). Si no tiene forma de
 * correo, se resuelve primero vía resolver_login_licencia.
 */
export async function signInSupabase(
  emailOUsuario: string,
  password: string
): Promise<{ ok: boolean; empleado?: EmpleadoSupabase; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'nuestra base de datos no está configurada' };

  let email = emailOUsuario;
  if (!email.includes('@')) {
    const { data: clienteId, error: resolveError } = await client.rpc('resolver_login_licencia', {
      p_usuario: emailOUsuario,
      p_password: password,
    });
    if (resolveError || !clienteId) {
      return { ok: false, error: 'Usuario o contraseña incorrectos' };
    }
    email = `owner+${clienteId}@codecpos.internal`;
  }

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { ok: false, error: error?.message || 'Credenciales inválidas' };
  }

  const { data: empleado, error: empError } = await client
    .from('empleados')
    .select(CAMPOS_EMPLEADO)
    .eq('id', data.user.id)
    .maybeSingle();

  if (empError || !empleado) {
    return { ok: false, error: 'Cuenta sin perfil de empleado asociado' };
  }

  return { ok: true, empleado: empleado as EmpleadoSupabase };
}

/**
 * Acepta el correo real de staff O un usuario corto (ver migración 0046,
 * resolver_email_staff) — el usuario SOLO sirve para encontrar el correo;
 * la contraseña la sigue verificando exclusivamente signInSupabase() más
 * abajo contra Supabase Auth, sin cambios en esa verificación.
 */
export async function verificarAccesoStaff(
  emailOUsuario: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  let email = emailOUsuario;
  if (!email.includes('@')) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: 'nuestra base de datos no está configurada' };
    const { data: correoResuelto, error: resolveError } = await client.rpc('resolver_email_staff', {
      p_username: emailOUsuario,
    });
    if (resolveError || !correoResuelto) {
      return { ok: false, error: 'Usuario o contraseña incorrectos' };
    }
    email = correoResuelto as string;
  }

  const resultado = await signInSupabase(email, password);
  if (!resultado.ok) return { ok: false, error: resultado.error };
  if (!resultado.empleado?.es_staff_codec) {
    return { ok: false, error: 'Esta cuenta no tiene acceso de staff Codec Studio' };
  }
  return { ok: true };
}

export async function solicitarRecuperacionPassword(
  email: string
): Promise<{ ok: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'nuestra base de datos no está configurada' };

  const { error } = await client.auth.resetPasswordForEmail(email);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
