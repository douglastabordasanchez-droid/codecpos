// CODEC POS v2.0 — Roles de Terminal (Frontend)
// Para registrar un nuevo tipo de terminal, agrega un objeto a TERMINAL_ROLES.
// Esta configuración es consumida por MonitoreoTerminalesPage y LanContext.

export interface TerminalRole {
  id: string;
  label: string;
  description: string;
  capabilities: string[];
  badgeColor: string; // Tailwind color key: 'amber' | 'blue' | 'violet' | 'orange' | 'cyan' | 'green'
}

export const TERMINAL_ROLES: TerminalRole[] = [
  {
    id: 'super_usuario',
    label: 'Caja Principal',
    description: 'Servidor LAN + administración central',
    capabilities: ['all'],
    badgeColor: 'amber',
  },
  {
    id: 'cajero',
    label: 'Caja Secundaria',
    description: 'Punto de venta secundario',
    capabilities: ['ventas', 'caja'],
    badgeColor: 'blue',
  },
  {
    id: 'tecnico',
    label: 'Soporte Técnico',
    description: 'Terminal del taller de reparaciones',
    capabilities: ['taller'],
    badgeColor: 'violet',
  },
  {
    id: 'cocina',
    label: 'Pantalla Cocina',
    description: 'Recibe comandas de platos calientes',
    capabilities: ['comandas_entrada'],
    badgeColor: 'orange',
  },
  {
    id: 'barra',
    label: 'Barra',
    description: 'Recibe comandas de bebidas y postres',
    capabilities: ['comandas_entrada'],
    badgeColor: 'cyan',
  },
  {
    id: 'mesero',
    label: 'Mesero / Tablet',
    description: 'Envía comandas desde la mesa del cliente',
    capabilities: ['comandas_salida'],
    badgeColor: 'green',
  },
];

export function getRoleLabel(rolId: string): string {
  return TERMINAL_ROLES.find(r => r.id === rolId)?.label ?? rolId;
}

export function getRoleBadgeColor(rolId: string): string {
  return TERMINAL_ROLES.find(r => r.id === rolId)?.badgeColor ?? 'slate';
}

export function getRoleCapabilities(rolId: string): string[] {
  return TERMINAL_ROLES.find(r => r.id === rolId)?.capabilities ?? [];
}
