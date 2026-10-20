/**
 * Cuándo un negocio no puede usar el sistema: lo decide Codec Studio desde
 * cualquiera de sus paneles (Electron, /app/desarrollador o /admin) al
 * suspender al cliente, o la fecha de su licencia al vencerse. Se lee de
 * `clientes_pos`, que es la copia que el trigger mantiene de la licencia
 * vigente (migraciones 0047, 0087 y 0115). La misma regla la usan Electron,
 * la web y la app del celular.
 */
export type MotivoBloqueoLicencia = 'SUSPENDIDA' | 'CANCELADA' | 'VENCIDA';

export interface EstadoLicenciaCliente {
  estado?: string | null;
  duracion?: string | null;
  fecha_expiracion?: string | null;
}

export function motivoBloqueoLicencia(fila: EstadoLicenciaCliente | null | undefined): MotivoBloqueoLicencia | null {
  if (!fila) return null;
  if (fila.estado === 'SUSPENDIDA') return 'SUSPENDIDA';
  if (fila.estado === 'CANCELADA') return 'CANCELADA';
  if (fila.estado === 'VENCIDA' || fila.estado === 'EXPIRADA') return 'VENCIDA';
  if (fila.duracion !== 'VITALICIA' && fila.fecha_expiracion && new Date(fila.fecha_expiracion).getTime() < Date.now()) {
    return 'VENCIDA';
  }
  return null;
}

export const WHATSAPP_CODEC_STUDIO = '573238646844';

/**
 * Cómo va el vencimiento de un negocio, para los paneles de Codec Studio
 * (/admin, /app/desarrollador y Electron). El backend pausa solo la licencia
 * pagada que pasa su fecha sin pago (migración 0118); las vitalicias no vencen.
 */
export interface ResumenVencimiento {
  texto: string;
  tono: 'ok' | 'aviso' | 'vencida' | 'neutro';
}

export function resumenVencimiento(estado: string | null | undefined, duracion: string | null | undefined, fechaFin: string | null | undefined): ResumenVencimiento {
  if (duracion === 'VITALICIA' || estado === 'VITALICIA') return { texto: 'Vitalicia, no vence', tono: 'neutro' };
  if (estado === 'SUSPENDIDA') return { texto: 'Suspendida a mano', tono: 'vencida' };
  if (estado === 'CANCELADA') return { texto: 'Cancelada', tono: 'vencida' };
  if (!fechaFin) return { texto: 'Sin fecha de vencimiento', tono: 'neutro' };
  const fecha = new Date(fechaFin).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  const dias = Math.ceil((new Date(fechaFin).getTime() - Date.now()) / 86_400_000);
  if (dias <= 0 || estado === 'VENCIDA' || estado === 'EXPIRADA') {
    return { texto: `Pausada por falta de pago · venció el ${fecha}`, tono: 'vencida' };
  }
  if (dias <= 2) return { texto: `Vence ${dias === 1 ? 'mañana' : 'en 2 días'} · ${fecha}`, tono: 'aviso' };
  return { texto: `Vence el ${fecha} · faltan ${dias} días`, tono: 'ok' };
}

/** Título del aviso que ve el negocio, según el tipo que creó el backend. */
export function tituloAvisoLicencia(tipo: string | null | undefined): string {
  if (tipo === 'VENCE_EN_2_DIAS') return 'Tu licencia vence en 2 días';
  if (tipo === 'VENCE_EN_1_DIA') return 'Tu licencia vence mañana';
  return 'Tu licencia está por vencer';
}
