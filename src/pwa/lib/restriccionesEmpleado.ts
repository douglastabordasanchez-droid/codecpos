/**
 * Restricciones que el administrador le pone a un empleado en
 * `empleados.permisos` (migración 0132). El servidor también bloquea
 * modificar o borrar a quien tiene soloAgregar; aquí solo se esconden los
 * botones para que no se tope con el error.
 */
import type { EmpleadoSupabase } from '../../app/lib/supabase/authService';

export const soloAgregar = (e: EmpleadoSupabase | null | undefined) => e?.permisos?.soloAgregar === true;

export const soloCelular = (e: EmpleadoSupabase | null | undefined) => e?.permisos?.soloCelular === true;

/** Celular o tableta (el iPad se presenta como Mac pero tiene pantalla táctil). */
export function esDispositivoMovil(): boolean {
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export const MENSAJE_SOLO_CELULAR = 'Tu usuario solo puede entrar desde el celular';
