/**
 * CODECPOS v2.0 - Tipos de Autenticación
 * Tipos compartidos para el sistema de autenticación
 */

export type RolUsuario = 'super_usuario' | 'cajero' | 'tecnico';

export interface Usuario {
  id: string;
  nombreCompleto: string;
  cedula: string;
  username: string;
  password: string;
  rol: RolUsuario;
  activo: boolean;
  fechaCreacion: string;
  creadoPor: string;
}

export interface SesionActiva {
  usuarioId: string;
  nombreUsuario: string;
  rol: RolUsuario;
  horaInicio: string;
  ultimaActividad: string;
}

export interface RegistroSesion {
  id: string;
  usuarioId: string;
  nombreUsuario: string;
  cedula: string;
  horaInicio: string;
  horaFin?: string;
  duracion?: number;
  ventasRealizadas?: number;
  totalVentas?: number;
}
