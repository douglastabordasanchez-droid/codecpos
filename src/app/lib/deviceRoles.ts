/**
 * Gestión de dispositivos predeterminados por tipo (localStorage)
 * Permite que cualquier sección del sistema lea el dispositivo asignado a cada rol.
 */

export type TipoDispositivo = 'impresora' | 'bascula' | 'escaner' | 'cajon' | 'display';

export interface DeviceRoleAssignment {
  deviceId: string;
  nombre: string;
  puerto?: string;
}

const STORAGE_KEY = 'device-roles-defaults';

function loadRoles(): Partial<Record<TipoDispositivo, DeviceRoleAssignment>> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveRoles(roles: Partial<Record<TipoDispositivo, DeviceRoleAssignment>>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(roles));
  } catch {}
}

export function getDefaultForTipo(tipo: TipoDispositivo): DeviceRoleAssignment | null {
  return loadRoles()[tipo] ?? null;
}

export function setDefaultForTipo(tipo: TipoDispositivo, assignment: DeviceRoleAssignment | null) {
  const roles = loadRoles();
  if (assignment) {
    roles[tipo] = assignment;
  } else {
    delete roles[tipo];
  }
  saveRoles(roles);
}

export function getAllDefaults(): Partial<Record<TipoDispositivo, DeviceRoleAssignment>> {
  return loadRoles();
}
