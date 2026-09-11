/**
 * 🏢 AISLAMIENTO MULTIEMPRESA POR EQUIPO
 *
 * Causa raíz del bug "inicio sesión con PAPOTASCO y veo los datos de Codec
 * Studio": TODO el catálogo/ventas/config de Electron vive en una única base
 * IndexedDB (`CodecPOS_DB`) y un puñado de claves de localStorage sin ninguna
 * partición por empresa — el vínculo a una empresa (`tenantLink.ts`) se hace
 * una sola vez por equipo y nada volvía a mirarlo en logins siguientes.
 *
 * Este módulo NO reconstruye el almacenamiento local (seguiría siendo el
 * mismo esquema, las mismas ~40 pantallas leyendo las mismas claves) — en su
 * lugar intercepta el momento del login: antes de mostrar cualquier
 * pantalla, archiva (sin borrar) los datos de la empresa que estaba activa y
 * carga los de la empresa con la que se acaba de iniciar sesión, restaurando
 * su propio archivo si ya se usó antes en este equipo, o dejándolos vacíos
 * si es la primera vez. Al volver a iniciar sesión con la empresa original,
 * sus datos archivados se restauran tal cual quedaron.
 *
 * Para el 99% de las instalaciones reales (una sola empresa, de por vida) el
 * `clienteId` activo nunca cambia — `activarEmpresaLocal` retorna de
 * inmediato sin tocar nada, cero impacto de rendimiento ni de riesgo.
 */

import { dbManager } from './indexedDB';
import { getSupabaseClient } from './supabase/config';

const DB_NAME_BASE = 'CodecPOS_DB';

const KEY_EMPRESA_LEGACY = 'codecpos_db_legacy_cliente_id';
const KEY_EMPRESA_ACTIVA = 'codecpos_datos_activos_cliente_id';
const ARCHIVE_PREFIX = 'codec_pos_tenant__';

const LS_CLIENTE_ID = 'codecpos_supabase_cliente_id';
const LS_SYNC_EMAIL = 'codecpos_supabase_sync_email';
const LS_SYNC_PASSWORD = 'codecpos_supabase_sync_password';

// Claves que NUNCA deben moverse al archivar/restaurar una empresa: o bien
// pertenecen al EQUIPO físico (impresora, red LAN, id de máquina), o son un
// índice compartido entre empresas que el propio login necesita leer sin
// importar cuál esté activa (p. ej. para reconocer a un dueño/empleado que
// ya inició sesión aquí antes con otra empresa), o son herramientas internas
// de Codec Studio (Panel Desarrollador), no datos de un cliente real.
const EXCLUIR_SIEMPRE = new Set<string>([
  // Vínculo de sincronización — esto es justo lo que este módulo mueve.
  LS_CLIENTE_ID, LS_SYNC_EMAIL, LS_SYNC_PASSWORD,
  KEY_EMPRESA_LEGACY, KEY_EMPRESA_ACTIVA,
  // Índice de logins locales — debe verse igual sin importar qué empresa
  // esté activa, para poder reconocer a un usuario que vuelve.
  'codecpos_usuarios', 'codecpos_sesiones', 'codecpos_sesion_activa',
  'codecpos_config_inicial', 'codecpos_config_cliente_completada',
  // Equipo físico, no la empresa.
  'codecpos_machine_id', 'device-type-overrides',
  'lan_server_ip', 'lan_terminal_id', 'codec_pos_lan_role',
  'printer_barras', 'pos-printer-etiquetas', 'pos-default-printer-name',
  'pos-dispositivos', 'use_global_printer', 'codec_pos_multi_display',
  'pos-dark-mode',
  // Programación de respaldo del equipo (el respaldo en sí opera sobre lo
  // que esté activo en cada momento, igual que cualquier otra pantalla).
  'codecpos_backup_config', 'codecpos_last_backup',
  // Herramientas internas de Codec Studio — no son datos de un cliente.
  'codecpos_dev_clientes', 'codecpos_dev_sheet_url', 'codecpos_dev_sheet_last_sync',
  'codec_pos_licencia_desarrollador',
  // Banderas de instalación (del equipo, no de la empresa).
  'codecpos_setup', 'codecpos_initial_setup_complete',
]);

function esClaveDeEmpresa(key: string): boolean {
  if (key.startsWith(ARCHIVE_PREFIX)) return false;
  if (EXCLUIR_SIEMPRE.has(key)) return false;
  return key.startsWith('pos-') || key.startsWith('pos_') || key.startsWith('codecpos_') || key.startsWith('codec_pos_');
}

function dbNameParaEmpresa(clienteId: string): string {
  const legacy = localStorage.getItem(KEY_EMPRESA_LEGACY);
  return clienteId === legacy ? DB_NAME_BASE : `${DB_NAME_BASE}__${clienteId}`;
}

/** Mueve (no copia) todas las claves de empresa actualmente "vivas" al archivo de `clienteId`. */
function archivarBajo(clienteId: string): void {
  const claves = Object.keys(localStorage).filter(esClaveDeEmpresa);
  for (const key of claves) {
    const valor = localStorage.getItem(key);
    if (valor === null) continue;
    localStorage.setItem(`${ARCHIVE_PREFIX}${clienteId}__${key}`, valor);
    localStorage.removeItem(key);
  }
  // El vínculo de sincronización también es parte de "cómo quedó" esta
  // empresa — así Prioridad 1 (login recordado) puede reautenticarse sin
  // volver a pedir la contraseña de licencia.
  const syncEmail = localStorage.getItem(LS_SYNC_EMAIL);
  const syncPassword = localStorage.getItem(LS_SYNC_PASSWORD);
  if (syncEmail) localStorage.setItem(`${ARCHIVE_PREFIX}${clienteId}__sync_email`, syncEmail);
  if (syncPassword) localStorage.setItem(`${ARCHIVE_PREFIX}${clienteId}__sync_password`, syncPassword);
}

/** Restaura (si existen) las claves archivadas de `clienteId` como las claves "vivas". Si nunca se usó esta empresa aquí, no restaura nada — arranca en blanco. */
function restaurarDesde(clienteId: string): { syncEmail?: string; syncPassword?: string } {
  const prefijo = `${ARCHIVE_PREFIX}${clienteId}__`;
  const claves = Object.keys(localStorage).filter((k) => k.startsWith(prefijo));
  let syncEmail: string | undefined;
  let syncPassword: string | undefined;
  for (const claveArchivada of claves) {
    const original = claveArchivada.slice(prefijo.length);
    const valor = localStorage.getItem(claveArchivada);
    if (valor === null) continue;
    if (original === 'sync_email') { syncEmail = valor; continue; }
    if (original === 'sync_password') { syncPassword = valor; continue; }
    localStorage.setItem(original, valor);
    localStorage.removeItem(claveArchivada);
  }
  return { syncEmail, syncPassword };
}

export interface CredencialesLicencia {
  usuario: string;
  password: string;
}

/**
 * Activa localmente los datos de `clienteId`: archiva (sin borrar) lo que
 * esté cargado de la empresa anterior y restaura/inicializa lo de la nueva.
 * Debe llamarse ANTES de dar por completado un login (Prioridad 1 y
 * Prioridad 3 de AuthContext.iniciarSesion) — no se usa en el login de
 * empleados (Prioridad 4): un empleado nunca debe poder cambiar a qué
 * empresa está sincronizado este equipo, solo el dueño con su licencia.
 *
 * `credenciales` solo se pasa en un login "fresco" con contraseña en texto
 * plano (Prioridad 3) — se usa exclusivamente si esta empresa nunca se usó
 * antes en este equipo (no hay vínculo de sync archivado que reutilizar).
 */
/**
 * @returns `true` si esto realmente archivó una empresa distinta y activó
 * `clienteId` (el llamador DEBE recargar/relanzar la app — ver AuthContext:
 * las pantallas ya montadas, como POSContext, cargaron su estado en memoria
 * ANTES del login y no se enteran solas de que la base activa cambió por
 * debajo). `false` si `clienteId` ya era la empresa activa (caso normal de
 * una instalación de un solo negocio) — nada que recargar.
 */
export async function activarEmpresaLocal(
  clienteId: string,
  credenciales?: CredencialesLicencia
): Promise<boolean> {
  if (!clienteId) return false;

  // Primera vez que corre este mecanismo en esta instalación: lo que ya
  // esté cargado (sin ninguna partición) se adopta tal cual como los datos
  // de la empresa actualmente vinculada — cero migración, cero riesgo para
  // instalaciones existentes de un solo negocio.
  let legacy = localStorage.getItem(KEY_EMPRESA_LEGACY);
  if (!legacy) {
    legacy = localStorage.getItem(LS_CLIENTE_ID) || clienteId;
    localStorage.setItem(KEY_EMPRESA_LEGACY, legacy);
  }

  const activaAntes = localStorage.getItem(KEY_EMPRESA_ACTIVA) || legacy;

  if (activaAntes === clienteId) {
    // Ya es la empresa activa — asegurar que la base IndexedDB correcta
    // esté abierta (cubre el caso de un primer login en esta sesión de la
    // app) y salir. Camino normal para el 99% de las instalaciones: cero
    // trabajo extra, cero riesgo.
    await dbManager.cambiarBaseDatos(dbNameParaEmpresa(clienteId));
    localStorage.setItem(KEY_EMPRESA_ACTIVA, clienteId);

    // Excepción: instalación recién nacida que TODAVÍA no tiene identidad de
    // sincronización (primer login de licencia de la vida de este equipo) —
    // sin esto, un equipo nuevo nunca quedaba vinculado a la nube.
    if (credenciales && !localStorage.getItem(LS_SYNC_EMAIL)) {
      const { vincularNegocio } = await import('./supabase/tenantLink');
      const resultado = await vincularNegocio(clienteId, credenciales.usuario, credenciales.password);
      if (!resultado.ok) {
        console.error('[TenantSwap] No se pudo vincular la sincronización de esta instalación nueva:', resultado.error);
      }
    }
    return false;
  }

  console.log(`[TenantSwap] Cambiando datos locales activos: ${activaAntes} → ${clienteId}`);

  // 1) Archivar lo que estaba activo (nunca se borra).
  archivarBajo(activaAntes);

  // 2) Abrir la base IndexedDB de la empresa entrante (independiente de la
  //    anterior — sus productos/ventas/clientes quedan intactos, aparte).
  await dbManager.cambiarBaseDatos(dbNameParaEmpresa(clienteId));

  // 3) Restaurar (o dejar en blanco, si es la primera vez) sus datos locales.
  const { syncEmail, syncPassword } = restaurarDesde(clienteId);

  // 4) Re-apuntar la identidad de sincronización con la nube a esta empresa.
  const client = getSupabaseClient();
  if (client) {
    if (syncEmail && syncPassword) {
      const { error } = await client.auth.signInWithPassword({ email: syncEmail, password: syncPassword });
      if (!error) {
        localStorage.setItem(LS_CLIENTE_ID, clienteId);
        localStorage.setItem(LS_SYNC_EMAIL, syncEmail);
        localStorage.setItem(LS_SYNC_PASSWORD, syncPassword);
      } else {
        console.error('[TenantSwap] No se pudo reautenticar la sincronización archivada:', error.message);
      }
    } else if (credenciales) {
      // Primera vez que esta empresa se usa en este equipo: provisionar (o
      // reutilizar, es idempotente) su identidad de sincronización.
      const { vincularNegocio } = await import('./supabase/tenantLink');
      const resultado = await vincularNegocio(clienteId, credenciales.usuario, credenciales.password);
      if (!resultado.ok) {
        console.error('[TenantSwap] No se pudo vincular la sincronización para la nueva empresa:', resultado.error);
      }
    }
  }

  localStorage.setItem(KEY_EMPRESA_ACTIVA, clienteId);
  return true;
}
