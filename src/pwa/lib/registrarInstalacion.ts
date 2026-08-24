import { getSupabaseClient } from '../../app/lib/supabase/config';

/**
 * Registra esta sesión de PWA/App Android contra `instalaciones` (motor
 * comercial, misma tabla y RPC que ya usa Electron vía useRegistrarInstalacion).
 * Antes solo Electron se registraba -- el dashboard de instalaciones del
 * Admin Web (StatCard "PWA / App") mostraba siempre 0 porque nadie llamaba
 * esta RPC desde acá. La app Android nativa es un WebView de esta misma
 * PWA (ver androidBridge.ts), así que un mismo dispositivo se cuenta una
 * sola vez con tipo 'PWA' sin importar si corre en navegador o en la app.
 *
 * El id de dispositivo no puede venir de hardware (no hay acceso desde un
 * navegador/WebView) -- se genera una sola vez y se persiste en
 * localStorage, igual de estable que el machine_id de Electron para el
 * propósito de `registrar_instalacion` (upsert por machine_id+tipo).
 */
const DEVICE_ID_KEY = 'codec_pos_pwa_device_id';

function obtenerOCrearDeviceId(): string {
  try {
    const existente = localStorage.getItem(DEVICE_ID_KEY);
    if (existente) return existente;
    const nuevo = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, nuevo);
    return nuevo;
  } catch {
    // localStorage no disponible -- se genera uno efímero, no crítico
    // (en el peor caso esta sesión se cuenta como una instalación nueva
    // cada vez, en vez de reusar la misma fila).
    return crypto.randomUUID();
  }
}

let yaRegistrado = false;

export async function registrarInstalacionPwa(): Promise<void> {
  if (yaRegistrado) return;
  const client = getSupabaseClient();
  if (!client) return;

  const deviceId = obtenerOCrearDeviceId();
  const { error } = await client.rpc('registrar_instalacion', {
    p_machine_id: deviceId,
    p_tipo: 'PWA',
  });
  if (!error) yaRegistrado = true;
  else console.warn('No se pudo registrar la instalación PWA (no crítico):', error.message);
}
