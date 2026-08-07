import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
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
