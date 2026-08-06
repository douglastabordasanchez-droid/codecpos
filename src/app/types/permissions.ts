export interface Permission {
  id: string;
  name: string;
  description: string;
  category: 'clientes' | 'ejecutivos' | 'reportes' | 'configuracion';
}

export interface RoleProfile {
  id: string;
  name: string;
  description: string;
  permissions: string[]; // Array de permission IDs
  isSystem: boolean; // Si es un perfil del sistema (no se puede eliminar)
  createdAt: string;
  updatedAt: string;
}

// Permisos disponibles en el sistema
export const AVAILABLE_PERMISSIONS: Permission[] = [
  // CLIENTES
  {
    id: 'clientes.view_all',
    name: 'Ver todos los clientes',
    description: 'Puede ver todos los clientes del sistema',
    category: 'clientes',
  },
  {
    id: 'clientes.view_assigned',
    name: 'Ver clientes asignados',
    description: 'Solo puede ver clientes que le han sido asignados',
    category: 'clientes',
  },
  {
    id: 'clientes.create',
    name: 'Crear clientes',
    description: 'Puede crear nuevos clientes',
    category: 'clientes',
  },
  {
    id: 'clientes.edit_all',
    name: 'Editar todos los clientes',
    description: 'Puede editar cualquier cliente',
    category: 'clientes',
  },
  {
    id: 'clientes.edit_assigned',
    name: 'Editar clientes asignados',
    description: 'Solo puede editar sus clientes asignados',
    category: 'clientes',
  },
  {
    id: 'clientes.delete',
    name: 'Eliminar clientes',
    description: 'Puede eliminar clientes del sistema',
    category: 'clientes',
  },
  {
    id: 'clientes.assign',
    name: 'Asignar clientes',
    description: 'Puede asignar clientes a otros ejecutivos',
    category: 'clientes',
  },
  {
    id: 'clientes.export',
    name: 'Exportar datos',
    description: 'Puede exportar información de clientes',
    category: 'clientes',
  },
  
  // EJECUTIVOS
  {
    id: 'ejecutivos.view',
    name: 'Ver ejecutivos',
    description: 'Puede ver la lista de ejecutivos',
    category: 'ejecutivos',
  },
  {
    id: 'ejecutivos.create',
    name: 'Crear ejecutivos',
    description: 'Puede crear nuevos ejecutivos',
    category: 'ejecutivos',
  },
  {
    id: 'ejecutivos.edit',
    name: 'Editar ejecutivos',
    description: 'Puede editar información de ejecutivos',
    category: 'ejecutivos',
  },
  {
    id: 'ejecutivos.delete',
    name: 'Eliminar ejecutivos',
    description: 'Puede eliminar ejecutivos del sistema',
    category: 'ejecutivos',
  },
  
  // REPORTES
  {
    id: 'reportes.dashboard',
    name: 'Ver dashboard',
    description: 'Acceso al dashboard general',
    category: 'reportes',
  },
  {
    id: 'reportes.advanced',
    name: 'Reportes avanzados',
    description: 'Puede generar reportes avanzados',
    category: 'reportes',
  },
  
  // CONFIGURACIÓN
  {
    id: 'configuracion.profiles',
    name: 'Gestionar perfiles',
    description: 'Puede crear y editar perfiles de permisos',
    category: 'configuracion',
  },
  {
    id: 'configuracion.integrations',
    name: 'Configurar integraciones',
    description: 'Acceso a configuración de Zapier y APIs',
    category: 'configuracion',
  },
];

// Perfiles predefinidos del sistema
export const SYSTEM_PROFILES: Omit<RoleProfile, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Ejecutivo Admin',
    description: 'Perfil con permisos administrativos completos para ejecutivos',
    isSystem: true,
    permissions: [
      'clientes.view_all',
      'clientes.create',
      'clientes.edit_all',
      'clientes.delete',
      'clientes.assign',
      'clientes.export',
      'ejecutivos.view',
      'ejecutivos.create',
      'ejecutivos.edit',
      'reportes.dashboard',
      'reportes.advanced',
    ],
  },
  {
    name: 'Ejecutivo Genérico',
    description: 'Perfil básico con acceso limitado a clientes asignados',
    isSystem: true,
    permissions: [
      'clientes.view_assigned',
      'clientes.create',
      'clientes.edit_assigned',
      'reportes.dashboard',
    ],
  },
];
