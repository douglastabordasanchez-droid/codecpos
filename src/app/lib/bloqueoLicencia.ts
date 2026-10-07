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
