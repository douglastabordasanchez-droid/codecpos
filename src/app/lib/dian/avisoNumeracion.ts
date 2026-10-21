/**
 * Aviso de numeración DIAN por vencer. La resolución vence en su fecha
 * aunque le queden números, y desde ese día la DIAN rechaza las facturas.
 * La renueva el contribuyente (o su contador) en el MUISCA; el sistema solo
 * avisa con tiempo: 15 días antes, una vez al día.
 */
import type { ResolucionDian } from './types';

export const DIAS_AVISO_NUMERACION = 15;

export interface NumeracionPorVencer { id?: string; prefijo: string; vigenciaHasta: string; diasRestantes: number }

/** Días entre hoy y la fecha de vigencia, contados por fecha calendario de Colombia. */
function diasHasta(vigenciaHasta: string, ahora: Date): number {
  const hoy = new Date(ahora.getTime() - 5 * 3600_000).toISOString().slice(0, 10);
  return Math.round((Date.parse(vigenciaHasta.slice(0, 10)) - Date.parse(hoy)) / 86_400_000);
}

export function numeracionesPorVencer(resoluciones: ResolucionDian[], ahora = new Date(), dias = DIAS_AVISO_NUMERACION): NumeracionPorVencer[] {
  return resoluciones
    .filter((r) => r.estado === 'activa' && r.vigenciaHasta)
    .map((r) => ({ id: r.id, prefijo: r.prefijo, vigenciaHasta: r.vigenciaHasta!.slice(0, 10), diasRestantes: diasHasta(r.vigenciaHasta!, ahora) }))
    .filter((r) => r.diasRestantes <= dias)
    .sort((a, b) => a.diasRestantes - b.diasRestantes);
}

export function textoAvisoNumeracion(n: NumeracionPorVencer): string {
  const fecha = new Date(`${n.vigenciaHasta}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  if (n.diasRestantes < 0) return `La numeración ${n.prefijo} venció el ${fecha}. La DIAN rechaza las facturas con ese prefijo.`;
  if (n.diasRestantes === 0) return `La numeración ${n.prefijo} vence hoy.`;
  return `La numeración ${n.prefijo} vence el ${fecha} (${n.diasRestantes === 1 ? 'mañana' : `en ${n.diasRestantes} días`}).`;
}
