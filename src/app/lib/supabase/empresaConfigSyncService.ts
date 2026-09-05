import { getSupabaseClient } from './config';
import { getLinkedClienteId } from './tenantLink';

const CONFIG_KEY = 'codec_pos_config';
const PENDING_KEY = 'codec_pos_config_sync_pending';
const LOGO_BUCKET = 'empresa-logos';
const NETWORK_TIMEOUT_MS = 15_000;
const LOCAL_ONLY_FIELDS = new Set(['nombreImpresora', 'tamañoPapel', 'endpointApiUrl', 'apiKey', 'apiSecret']);

function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timer: number | undefined;
  return Promise.race([promise, new Promise<T>((_, reject) => { timer = window.setTimeout(() => reject(new Error(message)), NETWORK_TIMEOUT_MS); })]).finally(() => { if (timer) window.clearTimeout(timer); });
}
function readLocal(): Record<string, unknown> { try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}'); } catch { return {}; } }
function sharedFields(config: Record<string, unknown>): Record<string, unknown> { return Object.fromEntries(Object.entries(config).filter(([key]) => !LOCAL_ONLY_FIELDS.has(key) && key !== 'logoUrl')); }
async function uploadLogo(clienteId: string, logoDataUrl: string): Promise<string | null> {
  if (!logoDataUrl.startsWith('data:image/')) return null;
  const client = getSupabaseClient(); if (!client) return null;
  const [header, payload] = logoDataUrl.split(',', 2); if (!payload) throw new Error('El logo no tiene un formato válido');
  const mime = header.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64$/)?.[1]; if (!mime) throw new Error('El formato del logo no está permitido');
  const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0)); if (bytes.byteLength > 5 * 1024 * 1024) throw new Error('El logo supera el límite de 5 MB');
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'; const path = `${clienteId}/logo.${ext}`;
  const { error } = await withTimeout(client.storage.from(LOGO_BUCKET).upload(path, bytes, { contentType: mime, upsert: true }), 'La carga del logo tardó demasiado'); if (error) throw error; return path;
}
async function signedLogoUrl(path: string | null): Promise<string> {
  const client = getSupabaseClient(); if (!client || !path) return '';
  const { data, error } = await withTimeout(client.storage.from(LOGO_BUCKET).createSignedUrl(path, 60 * 60 * 24), 'No fue posible obtener el logo a tiempo'); if (error) throw error; return data?.signedUrl || '';
}
export async function guardarConfiguracionEmpresaEnNube(config: Record<string, unknown>): Promise<void> {
  const client = getSupabaseClient(); const clienteId = getLinkedClienteId(); if (!client || !clienteId || !navigator.onLine) return;
  const logoValue = typeof config.logoUrl === 'string' ? config.logoUrl : '';
  const logoPath = await uploadLogo(clienteId, logoValue);
  // Una URL firmada que llegó desde otro equipo no debe borrar el archivo.
  const row: Record<string, unknown> = { cliente_id: clienteId, datos: sharedFields(config), updated_at: new Date().toISOString() };
  if (logoValue.startsWith('data:image/')) row.logo_path = logoPath;
  if (logoValue === '') row.logo_path = null;
  const { error } = await withTimeout(client.from('empresa_configuraciones').upsert(row, { onConflict: 'cliente_id' }), 'No fue posible sincronizar la configuración a tiempo'); if (error) throw error;
}
export async function descargarConfiguracionEmpresaDesdeNube(): Promise<boolean> {
  const client = getSupabaseClient(); const clienteId = getLinkedClienteId(); if (!client || !clienteId || !navigator.onLine) return false;
  const { data, error } = await withTimeout(client.from('empresa_configuraciones').select('datos, logo_path').eq('cliente_id', clienteId).maybeSingle(), 'La consulta de configuración tardó demasiado'); if (error) throw error; if (!data) return false;
  const local = readLocal(); const logoUrl = await signedLogoUrl(data.logo_path); localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...local, ...(data.datos || {}), ...(logoUrl ? { logoUrl } : {}) })); window.dispatchEvent(new CustomEvent('codecpos:empresa-sincronizada')); return true;
}

export async function sincronizarConfiguracionEmpresaPendiente(): Promise<void> {
  if (localStorage.getItem(PENDING_KEY) !== 'true') return;
  await guardarConfiguracionEmpresaEnNube(readLocal());
  localStorage.removeItem(PENDING_KEY);
}

export function marcarConfiguracionEmpresaPendiente(): void {
  localStorage.setItem(PENDING_KEY, 'true');
}
