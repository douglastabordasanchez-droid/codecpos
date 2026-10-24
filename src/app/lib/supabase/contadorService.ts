/**
 * "Mi contador": conexión del negocio con su contador en Codec Document
 * (migración 0122, Edge Function contador-sync). El token de la conexión
 * nunca llega al navegador: solo se ve el estado.
 */
import { getSupabaseClient } from './config';

export interface EstadoContador {
  estado: 'activo' | 'revocado' | 'desvinculado';
  empresa: string | null;
  contador: string | null;
  vinculadoEn: string | null;
  ultimoEnvioEn: string | null;
  ultimoError: string | null;
  pendientes: number;
  enviados: number;
  rechazados: number;
}

function cliente() {
  const c = getSupabaseClient();
  if (!c) throw new Error('nuestra base de datos no está configurada');
  return c;
}

/** null = este negocio nunca se ha conectado con un contador. */
export async function obtenerEstadoContador(): Promise<EstadoContador | null> {
  const { data, error } = await cliente().rpc('mi_contador_estado');
  if (error) throw new Error(error.message);
  const fila = (data as any[] | null)?.[0];
  if (!fila) return null;
  return {
    estado: fila.estado,
    empresa: fila.empresa,
    contador: fila.contador,
    vinculadoEn: fila.vinculado_en,
    ultimoEnvioEn: fila.ultimo_envio_en,
    ultimoError: fila.ultimo_error,
    pendientes: Number(fila.pendientes) || 0,
    enviados: Number(fila.enviados) || 0,
    rechazados: Number(fila.rechazados) || 0,
  };
}

async function invocar<T>(cuerpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await cliente().functions.invoke('contador-sync', { body: cuerpo });
  if (error) {
    // supabase-js envuelve los errores HTTP: el mensaje útil viene en el cuerpo.
    let detalle = error.message;
    try {
      const cuerpoError = await (error as any).context?.json?.();
      if (cuerpoError?.error) detalle = cuerpoError.error;
    } catch { /* se queda el mensaje genérico */ }
    throw new Error(detalle);
  }
  return data as T;
}

export const conectarContador = (codigo: string) =>
  invocar<{ empresa: string | null; contador: string | null; encolados: number }>({ accion: 'vincular', codigo });

export const desconectarContador = () => invocar<{ ok: boolean }>({ accion: 'desvincular' });

/** Pregunta a Codec Document si la conexión sigue viva; si el contador la cortó, queda «revocado». */
export const verificarContador = () => invocar<{ estado: string | null }>({ accion: 'verificar' });
