/**
 * CODEC POS - Modal de Gestión de Permisos
 * Permite al super usuario configurar permisos de cajeros
 */

import { useState, useEffect } from 'react';
import { Shield, Save, CheckCircle, XCircle, BarChart3, ShoppingCart, Package, AlertTriangle, Settings, Users, DollarSign, FileText, Wallet, CreditCard, RotateCcw, RefreshCw, FileSpreadsheet, User, Building2, Crown, Star } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import type { Usuario, PermisosUsuario } from '../../contexts/AuthContext';
import { usePOS } from '../../contexts/POSContext';
import { toast } from 'sonner';

interface ModalPermisosProps {
  usuario: Usuario | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  handleGuardarPermisos: (usuarioId: string, permisos: PermisosUsuario) => boolean;
}

interface PermisoConfig {
  key: keyof PermisosUsuario;
  label: string;
  descripcion: string;
  icon: any;
  color: string;
  bgColor: string;
}

interface GrupoPermisos {
  titulo: string;
  descripcion: string;
  emoji: string;
  gradient: string;
  permisos: PermisoConfig[];
}

const GRUPOS_PERMISOS: GrupoPermisos[] = [
  {
    titulo: 'Operaciones Principales',
    descripcion: 'Funciones del día a día del cajero',
    emoji: '🛒',
    gradient: 'from-blue-500 to-indigo-600',
    permisos: [
      {
        key: 'ventas',
        label: 'Ventas',
        descripcion: 'Gestionar transacciones y cobros',
        icon: ShoppingCart,
        color: 'text-blue-500',
        bgColor: 'bg-blue-500/15',
      },
      {
        key: 'productos',
        label: 'Inventario',
        descripcion: 'Ver y gestionar productos',
        icon: Package,
        color: 'text-purple-500',
        bgColor: 'bg-purple-500/15',
      },
      {
        key: 'alertas',
        label: 'Alertas',
        descripcion: 'Stock bajo y vencimientos',
        icon: AlertTriangle,
        color: 'text-red-500',
        bgColor: 'bg-red-500/15',
      },
      {
        key: 'gastos',
        label: 'Gastos',
        descripcion: 'Registrar gastos operativos',
        icon: Wallet,
        color: 'text-pink-500',
        bgColor: 'bg-pink-500/15',
      },
      {
        key: 'devoluciones',
        label: 'Devoluciones',
        descripcion: 'Gestionar devoluciones de productos',
        icon: RotateCcw,
        color: 'text-rose-500',
        bgColor: 'bg-rose-500/15',
      },
      {
        key: 'cierreCaja',
        label: 'Cierre de Caja',
        descripcion: 'Ejecutar cierre de caja diario',
        icon: DollarSign,
        color: 'text-green-500',
        bgColor: 'bg-green-500/15',
      },
    ],
  },
  {
    titulo: 'Análisis y Reportes',
    descripcion: 'Acceso a estadísticas y métricas',
    emoji: '📊',
    gradient: 'from-amber-500 to-orange-500',
    permisos: [
      {
        key: 'dashboard',
        label: 'Dashboard',
        descripcion: 'Panel de estadísticas del sistema',
        icon: BarChart3,
        color: 'text-amber-500',
        bgColor: 'bg-amber-500/15',
      },
      {
        key: 'reportes',
        label: 'Reportes',
        descripcion: 'Reportes históricos y análisis',
        icon: FileSpreadsheet,
        color: 'text-orange-500',
        bgColor: 'bg-orange-500/15',
      },
      {
        key: 'empleados',
        label: 'Empleados',
        descripcion: 'Ver métricas personales',
        icon: User,
        color: 'text-blue-400',
        bgColor: 'bg-blue-400/15',
      },
      {
        key: 'codecVerify',
        label: 'Codec Verify',
        descripcion: 'Verificación de pagos digitales',
        icon: CreditCard,
        color: 'text-cyan-500',
        bgColor: 'bg-cyan-500/15',
      },
    ],
  },
  {
    titulo: 'Módulos Avanzados',
    descripcion: 'Multi-tienda y fidelización de clientes',
    emoji: '🚀',
    gradient: 'from-violet-500 to-purple-600',
    permisos: [
      {
        key: 'multitienda',
        label: 'Multi-Tienda',
        descripcion: 'Gestionar sucursales y transferencias de inventario',
        icon: Building2,
        color: 'text-indigo-500',
        bgColor: 'bg-indigo-500/15',
      },
      {
        key: 'fidelizacion',
        label: 'Fidelización',
        descripcion: 'Programa de puntos y recompensas de clientes',
        icon: Crown,
        color: 'text-purple-500',
        bgColor: 'bg-purple-500/15',
      },
      {
        key: 'panaderiaOnces',
        label: 'Panadería y Onces',
        descripcion: 'Gestión de ingredientes, recetas, mesas y combos',
        icon: Star,
        color: 'text-amber-500',
        bgColor: 'bg-amber-500/15',
      },
    ],
  },
  {
    titulo: 'Administración',
    descripcion: 'Acceso a configuración del sistema',
    emoji: '⚙️',
    gradient: 'from-slate-500 to-gray-600',
    permisos: [
      {
        key: 'configuracion',
        label: 'Configuración',
        descripcion: 'Ajustes generales del sistema',
        icon: Settings,
        color: 'text-gray-500',
        bgColor: 'bg-gray-500/15',
      },
      {
        key: 'usuarios',
        label: 'Usuarios',
        descripcion: 'Gestionar cuentas de usuario',
        icon: Users,
        color: 'text-indigo-500',
        bgColor: 'bg-indigo-500/15',
      },
    ],
  },
];

const PERMISOS_DEFAULT: PermisosUsuario = {
  dashboard: false,
  ventas: true,
  productos: true,
  alertas: true,
  configuracion: false,
  usuarios: false,
  cierreCaja: true,
  reportes: false,
  gastos: true,
  codecVerify: false,
  devoluciones: false,
  empleados: true,
  multitienda: false,
  fidelizacion: false,
  panaderiaOnces: true,
};

export function ModalPermisos({ usuario, open, onOpenChange, handleGuardarPermisos }: ModalPermisosProps) {
  const { darkMode } = usePOS();
  const dm = (d: string, l: string) => darkMode ? d : l;

  const [permisos, setPermisos] = useState<PermisosUsuario>(PERMISOS_DEFAULT);

  useEffect(() => {
    if (usuario?.permisos) {
      setPermisos({ ...PERMISOS_DEFAULT, ...usuario.permisos });
    } else if (usuario) {
      setPermisos(PERMISOS_DEFAULT);
    }
  }, [usuario]);

  const togglePermiso = (key: keyof PermisosUsuario) => {
    setPermisos(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const activarTodos = () => {
    const todos: PermisosUsuario = Object.fromEntries(
      Object.keys(permisos).map(k => [k, true])
    ) as unknown as PermisosUsuario;
    setPermisos(todos);
  };

  const desactivarTodos = () => {
    const ninguno: PermisosUsuario = Object.fromEntries(
      Object.keys(permisos).map(k => [k, false])
    ) as unknown as PermisosUsuario;
    setPermisos(ninguno);
  };

  const resetDefaults = () => {
    setPermisos(PERMISOS_DEFAULT);
    toast.info('Permisos restablecidos a valores por defecto');
  };

  const handleGuardar = () => {
    if (!usuario) return;
    const tieneAlgunPermiso = Object.values(permisos).some(p => p);
    if (!tieneAlgunPermiso) {
      toast.error('Debe asignar al menos un permiso');
      return;
    }
    const exito = handleGuardarPermisos(usuario.id, permisos);
    if (exito) {
      toast.success('¡Permisos actualizados exitosamente!', {
        description: `Permisos de ${usuario.nombreCompleto} guardados`
      });
      onOpenChange(false);
    } else {
      toast.error('Error al actualizar permisos');
    }
  };

  if (!usuario) return null;

  const totalPermisos = Object.keys(permisos).length;
  const permisosActivos = Object.values(permisos).filter(p => p).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-w-3xl max-h-[92vh] overflow-y-auto p-0 gap-0 ${
        darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'
      }`}>

        {/* ── HEADER PREMIUM ── */}
        <div className="relative overflow-hidden rounded-t-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 p-6">
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full blur-2xl" />
          <div className="relative flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Gestionar Permisos</h2>
                <p className="text-white/70 text-sm mt-0.5">
                  {usuario.nombreCompleto} · <span className="font-mono bg-white/20 px-1.5 py-0.5 rounded text-xs">{usuario.username}</span>
                </p>
                {/* Barra de progreso */}
                <div className="mt-3 flex items-center gap-3">
                  <div className="w-32 h-2 rounded-full bg-white/20 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-white transition-all duration-500"
                      style={{ width: `${(permisosActivos / totalPermisos) * 100}%` }}
                    />
                  </div>
                  <span className="text-white/80 text-xs font-semibold">
                    {permisosActivos}/{totalPermisos} permisos activos
                  </span>
                </div>
              </div>
            </div>

            {/* Acciones rápidas */}
            <div className="flex gap-2 shrink-0">
              <button
                onClick={activarTodos}
                className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition-all border border-white/30"
              >
                Todos ✓
              </button>
              <button
                onClick={desactivarTodos}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 text-xs font-semibold transition-all border border-white/20"
              >
                Ninguno ✗
              </button>
              <button
                onClick={resetDefaults}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 text-xs font-semibold transition-all border border-white/20"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* ── GRUPOS DE PERMISOS ── */}
        <div className="p-5 space-y-5">
          {GRUPOS_PERMISOS.map((grupo) => {
            const activosEnGrupo = grupo.permisos.filter(p => permisos[p.key]).length;
            const totalEnGrupo = grupo.permisos.length;
            return (
              <div key={grupo.titulo} className={`rounded-2xl border overflow-hidden ${dm('border-slate-700', 'border-gray-200')}`}>
                {/* Cabecera del grupo */}
                <div className={`flex items-center justify-between px-4 py-3 ${dm('bg-slate-800', 'bg-gray-50')} border-b ${dm('border-slate-700', 'border-gray-200')}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${grupo.gradient} flex items-center justify-center text-sm`}>
                      {grupo.emoji}
                    </div>
                    <div>
                      <h3 className={`font-bold text-sm ${dm('text-white', 'text-gray-900')}`}>{grupo.titulo}</h3>
                      <p className={`text-xs ${dm('text-slate-400', 'text-gray-500')}`}>{grupo.descripcion}</p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${
                    activosEnGrupo === totalEnGrupo
                      ? 'bg-green-500/15 text-green-500'
                      : activosEnGrupo === 0
                      ? dm('bg-slate-700 text-slate-400', 'bg-gray-100 text-gray-400')
                      : 'bg-amber-500/15 text-amber-500'
                  }`}>
                    {activosEnGrupo}/{totalEnGrupo}
                    {activosEnGrupo === totalEnGrupo && <CheckCircle className="w-3.5 h-3.5" />}
                  </div>
                </div>

                {/* Grid de permisos del grupo */}
                <div className={`grid grid-cols-2 gap-2.5 p-3 ${dm('bg-slate-900/50', 'bg-white')}`}>
                  {grupo.permisos.map((config) => {
                    const Icon = config.icon;
                    const activo = permisos[config.key] ?? false;
                    return (
                      <div
                        key={config.key}
                        onClick={() => togglePermiso(config.key)}
                        className={`relative flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all hover:scale-[1.02] select-none ${
                          activo
                            ? dm(
                                'bg-indigo-950/60 border-indigo-500/60 hover:border-indigo-400',
                                'bg-indigo-50 border-indigo-300 hover:border-indigo-400'
                              )
                            : dm(
                                'bg-slate-800/60 border-slate-700 hover:border-slate-500',
                                'bg-gray-50 border-gray-200 hover:border-gray-300'
                              )
                        }`}
                      >
                        {/* Icono */}
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                          activo ? config.bgColor : dm('bg-slate-700', 'bg-gray-100')
                        }`}>
                          <Icon className={`w-5 h-5 ${activo ? config.color : dm('text-slate-500', 'text-gray-400')}`} />
                        </div>

                        {/* Texto */}
                        <div className="flex-1 min-w-0">
                          <p className={`font-bold text-sm leading-tight ${dm('text-white', 'text-gray-900')}`}>
                            {config.label}
                          </p>
                          <p className={`text-xs truncate mt-0.5 ${dm('text-slate-400', 'text-gray-500')}`}>
                            {config.descripcion}
                          </p>
                        </div>

                        {/* Toggle */}
                        <div className={`relative w-10 h-5.5 rounded-full transition-colors shrink-0 flex items-center ${
                          activo ? 'bg-indigo-600' : dm('bg-slate-600', 'bg-gray-300')
                        }`} style={{ height: '22px', minWidth: '40px' }}>
                          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${
                            activo ? 'left-5' : 'left-0.5'
                          }`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── FOOTER ── */}
        <div className={`sticky bottom-0 flex gap-3 p-4 border-t ${dm('bg-slate-900 border-slate-700', 'bg-white border-gray-200')} rounded-b-2xl`}>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className={`flex-1 ${dm('border-slate-600 text-slate-300 hover:bg-slate-800', '')}`}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleGuardar}
            className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold"
          >
            <Save className="w-4 h-4 mr-2" />
            Guardar Permisos
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
