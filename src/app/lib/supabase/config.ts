import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;

/**
 * Ninguna consulta a la nube espera para siempre. Con internet que se cae a
 * medias (wifi débil de la terminal o de la caja) una petición podía quedar
 * colgada sin fin y la sincronización detrás de ella no volvía a correr.
 * Las subidas de archivos y las funciones (la DIAN puede tardar) tienen más margen. Si quien llama ya trae su propia
 * señal de cancelación, se respetan las dos.
 */
const ESPERA_MAXIMA_MS = 45_000;
const ESPERA_MAXIMA_ARCHIVOS_MS = 180_000;
function fetchConLimite(entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof AbortController === 'undefined') return fetch(entrada, init);
  const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
  const limite = url.includes('/storage/v1/') || url.includes('/functions/v1/') ? ESPERA_MAXIMA_ARCHIVOS_MS : ESPERA_MAXIMA_MS;
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), limite);
  const externa = init?.signal;
  if (externa) {
    if (externa.aborted) control.abort();
    else externa.addEventListener('abort', () => control.abort(), { once: true });
  }
  return fetch(entrada, { ...init, signal: control.signal }).finally(() => clearTimeout(reloj));
}

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    global: { fetch: fetchConLimite },
  });
} else {
  console.warn(
    '[supabase] Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'Copia .env.example a .env y completa las credenciales.'
  );
}

export function getSupabaseClient(): SupabaseClient | null {
  return client;
}

export function isSupabaseConfigured(): boolean {
  return client !== null;
}

/** URL + anon key públicos, para construir a mano llamadas REST/RPC fuera del cliente JS (p. ej. el webhook de Codec Verify que copian a Tasker/Apps Script). */
export function getSupabasePublicConfig(): { url: string; anonKey: string } | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
}

export async function testSupabaseConnection(): Promise<boolean> {
  if (!client) return false;

  const { error } = await client
    .from('clientes_pos')
    .select('id', { count: 'exact', head: true });

  if (error) {
    console.error('[supabase] Error de conexión:', error.message);
    return false;
  }

  return true;
}
