import { getSupabaseClient } from './config';
import { isTenantSwitchInProgress } from '../tenantTransition';

const LS_CLIENTE_ID = 'codecpos_supabase_cliente_id';
const LS_SYNC_EMAIL = 'codecpos_supabase_sync_email';
const LS_SYNC_PASSWORD = 'codecpos_supabase_sync_password';
const LS_EMPRESA_LOCAL_ACTIVA = 'codecpos_datos_activos_cliente_id';

export interface ClienteDisponible {
  id: string;
  nombre_negocio: string;
}

export function getLinkedClienteId(): string | null {
  if (isTenantSwitchInProgress()) return null;
  const clienteVinculado = localStorage.getItem(LS_CLIENTE_ID);
  const empresaActiva = localStorage.getItem(LS_EMPRESA_LOCAL_ACTIVA);
  if (empresaActiva && clienteVinculado !== empresaActiva) return null;
  return clienteVinculado;
}

export function isLinked(): boolean {
  return !!getLinkedClienteId() && !!localStorage.getItem(LS_SYNC_EMAIL) && !!localStorage.getItem(LS_SYNC_PASSWORD);
}

export async function listarClientesDisponibles(): Promise<ClienteDisponible[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client
    .from('clientes_pos')
    .select('id, nombre_negocio')
    .order('nombre_negocio');
  if (error) {
    console.error('[tenantLink] Error listando clientes:', error.message);
    return [];
  }
  return data || [];
}

async function sha256Hex(texto: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Vincula esta instalación con un negocio en Supabase, usando las credenciales
 * de licencia YA existentes (usuarios_clientes) como prueba de propiedad.
 * Provisiona (o reutiliza, es idempotente) una identidad de Supabase Auth "de
 * máquina" para esta instalación, sin depender de que ningún empleado tenga
 * cuenta individual. Ver migración 0003/0004 (provisionar_sync_identidad).
 */
/** Evita que una llamada de red colgada deje el botón "Vinculando..." pegado para siempre sin ningún mensaje de error. */
function conTimeout<T>(promesa: Promise<T>, ms: number, mensaje: string): Promise<T> {
  return Promise.race([
    promesa,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(mensaje)), ms)),
  ]);
}

export async function vincularNegocio(
  clienteId: string,
  usuarioLicencia: string,
  passwordLicencia: string
): Promise<{ ok: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'nuestra base de datos no está configurada' };
  const empresaActiva = localStorage.getItem(LS_EMPRESA_LOCAL_ACTIVA);
  if (empresaActiva && empresaActiva !== clienteId) {
    return { ok: false, error: 'El negocio seleccionado no coincide con los datos locales activos' };
  }

  try {
    const syncEmail = `sync+${clienteId}@codecpos.internal`;
    const syncPassword = await sha256Hex(`${usuarioLicencia}:${passwordLicencia}:${clienteId}`);

    const { error: rpcError } = await conTimeout(
      client.rpc('provisionar_sync_identidad', {
        p_cliente_id: clienteId,
        p_usuario_licencia: usuarioLicencia,
        p_password_licencia: passwordLicencia,
        p_sync_email: syncEmail,
        p_sync_password: syncPassword,
      }),
      15000,
      'Tiempo de espera agotado verificando las credenciales. Revisa tu conexión e intenta de nuevo.'
    );

    if (rpcError) {
      return { ok: false, error: rpcError.message };
    }

    const { error: signInError } = await conTimeout(
      client.auth.signInWithPassword({ email: syncEmail, password: syncPassword }),
      15000,
      'Tiempo de espera agotado iniciando sesión. Revisa tu conexión e intenta de nuevo.'
    );

    if (signInError) {
      return { ok: false, error: signInError.message };
    }

    const { data: clienteAutenticado, error: scopeError } = await client.rpc('current_cliente_id');
    if (scopeError || String(clienteAutenticado) !== clienteId) {
      const { error: signOutError } = await client.auth.signOut();
      if (signOutError) console.error('[tenantLink] No se pudo cerrar la sesión de negocio incorrecta:', signOutError.message);
      return { ok: false, error: scopeError?.message || 'La identidad de sincronización pertenece a otro negocio' };
    }

    localStorage.setItem(LS_CLIENTE_ID, clienteId);
    localStorage.setItem(LS_SYNC_EMAIL, syncEmail);
    localStorage.setItem(LS_SYNC_PASSWORD, syncPassword);

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Error desconocido vinculando la instalación' };
  }
}

/**
 * Restablece la sesión de sync al iniciar la app, usando las credenciales
 * generadas la primera vez que se vinculó esta instalación (guardadas
 * localmente). Debe llamarse una vez al arrancar, antes de usar syncService.
 */
export async function restablecerSesionSync(): Promise<boolean> {
  const client = getSupabaseClient();
  const email = localStorage.getItem(LS_SYNC_EMAIL);
  const password = localStorage.getItem(LS_SYNC_PASSWORD);
  if (!client || !email || !password) return false;

  if (!getLinkedClienteId()) {
    const { error } = await client.auth.signOut();
    if (error) console.error('[tenantLink] No se pudo cerrar una sesión con tenant desactualizado:', error.message);
    return false;
  }

  const { error } = await client.auth.signInWithPassword({ email, password });
  return !error;
}

export function desvincularNegocio(): void {
  localStorage.removeItem(LS_CLIENTE_ID);
  localStorage.removeItem(LS_SYNC_EMAIL);
  localStorage.removeItem(LS_SYNC_PASSWORD);
}
