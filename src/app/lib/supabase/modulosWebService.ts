/**
 * CODEC POS v2.0 — Qué módulos se ven en la app web / celular
 *
 * Dos listas distintas, a propósito:
 *
 *   • `clientes_pos.modulos_activos` → LA LICENCIA. Qué compró el negocio.
 *     La edita Codec Studio desde Panel Desarrollador. Nadie más.
 *   • `clientes_pos.modulos_web`     → LA ELECCIÓN DEL DUEÑO. De lo que ya
 *     tiene, qué quiere ver en el celular. La edita él, desde su Electron.
 *
 * La PWA muestra la INTERSECCIÓN de ambas (ver useModulosActivos), así que
 * activar algo aquí nunca puede conceder un módulo que no se compró.
 *
 * `modulos_web = null` significa "todavía no eligió" → se ven todos los de su
 * licencia, exactamente como se comportaba la PWA antes de existir esto.
 */
import { getSupabaseClient } from './config';
import { getLinkedClienteId } from './tenantLink';
import { ModuloPOS } from '../permissions';

export interface EstadoModulosWeb {
  /** Módulos que el negocio tiene licenciados (fuente: modulos_activos). */
  licenciados: ModuloPOS[];
  /** Selección actual para móvil. null = aún sin elegir (se ven todos). */
  web: ModuloPOS[] | null;
}

/**
 * Módulos que YA tienen una pantalla real en la PWA. El resto del catálogo se
 * muestra en la tarjeta de Configuración como "próximamente" — con el
 * interruptor deshabilitado, porque encenderlos no haría aparecer nada.
 * Se amplía a medida que se porta cada módulo.
 */
export const MODULOS_DISPONIBLES_EN_WEB: ModuloPOS[] = [
  ModuloPOS.PUNTO_DE_VENTA,
  ModuloPOS.VENTAS_HISTORIAL,
  ModuloPOS.PRODUCTOS,
  ModuloPOS.CIERRE_CAJA,
  ModuloPOS.GASTOS,
  ModuloPOS.DEVOLUCIONES,
  ModuloPOS.ALERTAS_STOCK,
  ModuloPOS.CODEC_VERIFY,
  ModuloPOS.TALLER_REPARACIONES,
  ModuloPOS.PANADERIA_ONCES,
];

export function estaDisponibleEnWeb(modulo: ModuloPOS): boolean {
  return MODULOS_DISPONIBLES_EN_WEB.includes(modulo);
}

export async function obtenerEstadoModulosWeb(): Promise<EstadoModulosWeb | null> {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return null;

  const { data, error } = await client
    .from('clientes_pos')
    .select('modulos_activos, modulos_web, plan')
    .eq('id', clienteId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const fila = data as { modulos_activos: string[] | null; modulos_web: string[] | null };

  return {
    licenciados: (fila.modulos_activos ?? []) as ModuloPOS[],
    web: fila.modulos_web ? (fila.modulos_web as ModuloPOS[]) : null,
  };
}

/**
 * Guarda la selección. Pasa por el RPC `actualizar_modulos_web` y no por un
 * UPDATE directo: la policy de clientes_pos exige ser un `empleados` con rol
 * admin, y esta instalación de Electron se autentica con una identidad de
 * sync, que no es un empleado. Ver migración 0024.
 */
export async function guardarModulosWeb(modulos: ModuloPOS[]): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase no configurado');

  const { error } = await client.rpc('actualizar_modulos_web', {
    p_modulos: Array.from(new Set(modulos)),
  });
  if (error) throw new Error(error.message);
}
