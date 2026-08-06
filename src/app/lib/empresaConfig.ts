// CODEC POS v2.0 — Configuración dinámica de la empresa
// Lee parámetros de codec_pos_config en localStorage

const CONFIG_KEY = 'codec_pos_config';
const FALLBACK_NOMBRE = 'CODEC STUDIO';

/**
 * Devuelve el nombre configurado por el administrador para mensajes al cliente
 * (WhatsApp, tirillas, etc.). Fallback: "CODEC STUDIO".
 */
export function getNombreEmpresaCliente(): string {
  try {
    const config = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
    return (config.nombreEmpresaCliente as string)?.trim() || FALLBACK_NOMBRE;
  } catch {
    return FALLBACK_NOMBRE;
  }
}
