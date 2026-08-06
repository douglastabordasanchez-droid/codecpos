// CODEC POS v2.0 — Roles de Terminal (Backend Electron)
// Para añadir un nuevo tipo de terminal (cocina, barra, pantalla extra),
// agrega un objeto a TERMINAL_ROLES. No se requiere ningún otro cambio.

export const TERMINAL_ROLES = [
  {
    id: 'super_usuario',
    label: 'Caja Principal',
    description: 'Servidor LAN + administración',
    capabilities: ['all'],
  },
  {
    id: 'cajero',
    label: 'Caja Secundaria',
    description: 'Punto de venta secundario',
    capabilities: ['ventas', 'caja'],
  },
  {
    id: 'tecnico',
    label: 'Soporte Técnico',
    description: 'Terminal del taller de reparaciones',
    capabilities: ['taller'],
  },
  {
    id: 'cocina',
    label: 'Pantalla Cocina',
    description: 'Recibe comandas de platos calientes',
    capabilities: ['comandas_entrada'],
  },
  {
    id: 'barra',
    label: 'Barra',
    description: 'Recibe comandas de bebidas y postres',
    capabilities: ['comandas_entrada'],
  },
  {
    id: 'mesero',
    label: 'Mesero / Tablet',
    description: 'Envía comandas desde la mesa del cliente',
    capabilities: ['comandas_salida'],
  },
];

export function getTerminalRole(rolId) {
  return TERMINAL_ROLES.find(r => r.id === rolId) ?? { id: rolId, label: rolId, capabilities: [] };
}

export function canReceiveComandas(rolId) {
  const role = getTerminalRole(rolId);
  return role.capabilities.includes('all') || role.capabilities.includes('comandas_entrada');
}
