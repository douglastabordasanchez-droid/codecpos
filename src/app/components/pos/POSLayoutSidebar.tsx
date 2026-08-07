import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import {
  ShoppingCart, Package, Receipt, RotateCcw, BarChart3, Calculator,
  FileText, Wallet, Settings, Monitor, Users, User, Bell, Gift,
  TrendingUp, Tag, Building2, Barcode, Zap, Shield, ChevronLeft, ChevronRight,
  ChevronDown, Sun, Moon, LogOut, Crown, Lock, Webhook, Maximize, Minimize, Maximize2, Wrench, Coffee, Pencil, Wifi,
} from 'lucide-react';
import { usePOS } from '../../contexts/POSContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePlanRestrictions } from '../../hooks/usePlanRestrictions';



import { ModalUpgradePremium } from '../licencia/ModalUpgradePremium';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { useMultitienda } from '../../contexts/MultitiendaContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  ModuloPOS,
  obtenerModulosPersonalizados,
  ConfiguracionModuloPersonalizado,
  obtenerModulosGlobales,
  EVENTO_MODULOS_GLOBALES_ACTUALIZADOS,
  esModuloPermitidoLicenciaDesarrollador,
  type ConfiguracionModulosGlobal,
} from '../../lib/permissions';
import logoImage from '/logo.png';

type MenuItemType = {
  path: string;
  icon: any;
  label: string;
  color: string;
  moduloId?: ModuloPOS;
  // CAPA 1: Permisos de ROL (qué puede VER según su rol de usuario)
  requiredPermission?: 'ventas' | 'productos' | 'dashboard' | 'alertas' | 'configuracion' | 'usuarios' | 'cierreCaja' | 'reportes' | 'gastos' | 'codecVerify' | 'devoluciones' | 'monitoreo' | 'empleados' | 'panaderiaOnces';
  adminOnly?: boolean; // Solo para super_usuario
  // CAPA 2: Restricciones de PLAN (qué puede USAR según su plan de licencia)
  requiresPremium?: boolean;
  premiumFeature?: 'dashboard' | 'codec_verify' | 'reportes_avanzados';
  featureDescription?: string;
};

const arePathArraysEqual = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

export default function POSLayoutSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { darkMode, toggleDarkMode, uiScale } = usePOS();
  const { usuarioActual, esSuperUsuario, esDesarrollador, cerrarSesion, estaAutenticado, modoAdminTemporalActivo, activarModoAdminTemporal, desactivarModoAdminTemporal } = useAuth();
  const { planInfo, hasFeature } = usePlanRestrictions();
  // ── MULTI-TIENDA ──
  const { tiendas, tiendaActual, cambiarTienda } = useMultitienda();
  const [collapsed, setCollapsed] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showAdminTempDialog, setShowAdminTempDialog] = useState(false);
  const [adminTempUsername, setAdminTempUsername] = useState('');
  const [adminTempPassword, setAdminTempPassword] = useState('');
  const [selectedFeature, setSelectedFeature] = useState<{ name: string; description: string }>({
    name: '',
    description: '',
  });
  const [showTiendaDropdown, setShowTiendaDropdown] = useState(false);
  const [showFooter, setShowFooter] = useState(true);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [modulosGlobalConfig, setModulosGlobalConfig] = useState<ConfiguracionModulosGlobal>(() => obtenerModulosGlobales());
  const [modulosPersonalizados, setModulosPersonalizados] = useState<Record<ModuloPOS, ConfiguracionModuloPersonalizado>>(() => {
    const configs = obtenerModulosPersonalizados();
    return configs.reduce((acc, config) => {
      acc[config.id] = config;
      return acc;
    }, {} as Record<ModuloPOS, ConfiguracionModuloPersonalizado>);
  });
  const [menuOrder, setMenuOrder] = useState<string[]>([]);
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);

  // Nombres personalizados de módulos: path → label editado por el usuario
  const CUSTOM_MODULES_NAMES_KEY = 'codecpos_custom_modules';
  const [sidebarModules, setSidebarModules] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('codecpos_custom_modules');
      if (saved) return JSON.parse(saved) as Record<string, string>;
    } catch {}
    return {};
  });
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const rolNormalizado = (usuarioActual?.rol || '').toLowerCase().trim();
  const hasDeveloperPanelAccess = esDesarrollador || rolNormalizado === 'super_admin' || rolNormalizado === 'developer';

  const MENU_ORDER_STORAGE_KEY = 'codecpos.sidebar.menu.order.v1';

  // Estado de pantalla completa
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Verificar estado de fullscreen al montar
  useEffect(() => {
    const checkFullscreen = async () => {
      if (window.electron?.isFullscreen) {
        const fullscreenStatus = await window.electron.isFullscreen();
        setIsFullscreen(fullscreenStatus);
      }
    };
    checkFullscreen();
  }, []);

  // Inyecta CSS que compensa que 100vh (viewport real) ≠ altura visual dentro del contenedor escalado.
  // Sin esto, las páginas con h-screen solo llenan uiScale×100% del área visible y dejan
  // una franja blanca en la parte inferior.
  useEffect(() => {
    const compensated = `${100 / uiScale}vh`;
    const style = document.createElement('style');
    style.id = 'codecpos-scale-fix';
    style.textContent = `
      #pos-scalable-content .h-screen { height: ${compensated} !important; }
      #pos-scalable-content .min-h-screen { min-height: ${compensated} !important; }
    `;
    const existing = document.getElementById('codecpos-scale-fix');
    if (existing) existing.remove();
    document.head.appendChild(style);
    return () => { document.getElementById('codecpos-scale-fix')?.remove(); };
  }, [uiScale]);

  useEffect(() => {
    const updateCustomModules = () => {
      const configs = obtenerModulosPersonalizados();
      setModulosPersonalizados(configs.reduce((acc, config) => {
        acc[config.id] = config;
        return acc;
      }, {} as Record<ModuloPOS, ConfiguracionModuloPersonalizado>));
    };

    window.addEventListener('codecpos:modulos-personalizados-actualizados', updateCustomModules);
    window.addEventListener('storage', updateCustomModules);
    return () => {
      window.removeEventListener('codecpos:modulos-personalizados-actualizados', updateCustomModules);
      window.removeEventListener('storage', updateCustomModules);
    };
  }, []);

  useEffect(() => {
    const syncGlobalModules = () => {
      setModulosGlobalConfig(obtenerModulosGlobales());
    };

    window.addEventListener(EVENTO_MODULOS_GLOBALES_ACTUALIZADOS, syncGlobalModules);
    window.addEventListener('storage', syncGlobalModules);

    return () => {
      window.removeEventListener(EVENTO_MODULOS_GLOBALES_ACTUALIZADOS, syncGlobalModules);
      window.removeEventListener('storage', syncGlobalModules);
    };
  }, []);

  // Manejar toggle de pantalla completa
  const handleToggleFullscreen = async () => {
    if (window.electron?.toggleFullscreen) {
      try {
        const newState = await window.electron.toggleFullscreen();
        setIsFullscreen(newState);
        toast.success(newState ? 'Pantalla completa activada' : 'Pantalla completa desactivada', {
          description: newState ? 'Presiona F11 para salir' : 'Vista normal restaurada'
        });
      } catch (err) {
        console.error('Error al cambiar pantalla completa:', err);
        toast.error('Error al cambiar modo de pantalla');
      }
    } else {
      toast.info('Función disponible solo en app de escritorio');
    }
  };

  // ✅ MENÚ COMPLETO - SE MUESTRA SIEMPRE, RESTRICCIONES AL HACER CLICK
  const menuItems: MenuItemType[] = [
    { 
      path: '/pos', 
      icon: ShoppingCart, 
      label: 'Punto de Venta', 
      color: 'emerald', 
      moduloId: ModuloPOS.PUNTO_DE_VENTA,
      requiredPermission: 'ventas',
    },
    { 
      path: '/productos', 
      icon: Package, 
      label: 'Inventario', 
      color: 'blue', 
      moduloId: ModuloPOS.PRODUCTOS,
      requiredPermission: 'productos',
    },
    { 
      path: '/ventas', 
      icon: Receipt, 
      label: 'Ventas', 
      color: 'purple', 
      moduloId: ModuloPOS.VENTAS_HISTORIAL,
      requiredPermission: 'ventas',
    },
    {
      path: '/panaderia-onces',
      icon: Coffee,
      label: 'Panadería y Onces',
      color: 'orange',
      moduloId: ModuloPOS.PANADERIA_ONCES,
      requiredPermission: 'panaderiaOnces',
    },
    { 
      path: '/devoluciones', 
      icon: RotateCcw, 
      label: 'Devoluciones', 
      color: 'orange', 
      moduloId: ModuloPOS.DEVOLUCIONES,
      requiredPermission: 'devoluciones',
    },
    // 🛡️ FIX: los 14 ítems de abajo tenían `adminOnly: true` ADEMÁS de su
    // `moduloId` — un resabio del sistema de permisos anterior al de módulos
    // por usuario. `canAccessItem` evalúa `adminOnly` DESPUÉS del permiso
    // explícito del usuario y lo pisa incondicionalmente para cualquier rol
    // no-admin, sin importar qué le haya concedido el admin desde Gestionar
    // Permisos o Personal. Resultado: un cajero/técnico SIEMPRE veía solo los
    // 9 módulos sin `adminOnly` (Punto de Venta, Inventario, Ventas,
    // Panadería, Devoluciones, Cierre de Caja, Gastos, Contabilidad, Alertas)
    // sin importar cuántos permisos se le otorgaran — el sistema granular de
    // `moduloId` nunca llegaba a decidir nada para estos 14. Se quita
    // `adminOnly` de todos: el permiso por usuario (moduloId) ya es el
    // mecanismo diseñado para que el admin decida esto caso por caso.
    {
      path: '/dashboard',
      icon: BarChart3,
      label: 'Dashboard',
      color: 'amber',
      moduloId: ModuloPOS.DASHBOARD,
      requiresPremium: true,
      premiumFeature: 'dashboard',
      featureDescription: 'Dashboard Ejecutivo con métricas avanzadas en tiempo real',
    },
    {
      path: '/cierre-caja',
      icon: Calculator,
      label: 'Cierre de Caja',
      color: 'violet',
      moduloId: ModuloPOS.CIERRE_CAJA,
      requiredPermission: 'cierreCaja',
    },
    {
      path: '/reportes',
      icon: FileText,
      label: 'Reportes',
      color: 'indigo',
      moduloId: ModuloPOS.REPORTES,
      requiresPremium: true,
      premiumFeature: 'reportes_avanzados',
      featureDescription: 'Reportes avanzados con exportación y análisis predictivo',
    },
    {
      path: '/gastos',
      icon: Wallet,
      label: 'Gastos',
      color: 'red',
      moduloId: ModuloPOS.GASTOS,
      requiredPermission: 'gastos',
    },
    {
      path: '/contabilidad',
      icon: Calculator,
      label: 'Contabilidad',
      color: 'emerald',
      moduloId: ModuloPOS.CONTABILIDAD,
    },
    {
      path: '/configuracion',
      icon: Settings,
      label: 'Configuración',
      color: 'cyan',
      moduloId: ModuloPOS.CONFIGURACION,
      requiredPermission: 'configuracion',
    },
    {
      path: '/dispositivos',
      icon: Monitor,
      label: 'Dispositivos',
      color: 'purple',
      moduloId: ModuloPOS.DISPOSITIVOS,
    },
    {
      path: '/usuarios',
      icon: Users,
      label: 'Personal',
      color: 'teal',
      moduloId: ModuloPOS.USUARIOS,
      requiredPermission: 'usuarios',
    },
    {
      path: '/alertas',
      icon: Bell,
      label: 'Alertas',
      color: 'orange',
      moduloId: ModuloPOS.ALERTAS_STOCK,
      requiredPermission: 'alertas',
    },
    // ✅ NUEVAS FUNCIONALIDADES AVANZADAS
    {
      path: '/fidelizacion',
      icon: Gift,
      label: 'Fidelización',
      color: 'purple',
      moduloId: ModuloPOS.FIDELIZACION,
    },
    {
      path: '/proveedores',
      icon: TrendingUp,
      label: 'Proveedores',
      color: 'blue',
      moduloId: ModuloPOS.PROVEEDORES,
    },
    {
      path: '/promociones',
      icon: Tag,
      label: 'Promociones',
      color: 'orange',
      moduloId: ModuloPOS.PROMOCIONES,
    },
    {
      path: '/multitienda',
      icon: Building2,
      label: 'Multi-Tienda',
      color: 'cyan',
      moduloId: ModuloPOS.MULTITIENDA,
    },
    {
      path: '/codigos-barras',
      icon: Barcode,
      label: 'Códigos de Barras',
      color: 'indigo',
      moduloId: ModuloPOS.CODIGOS_BARRAS,
    },
    {
      path: '/integraciones',
      icon: Webhook,
      label: 'Integraciones',
      color: 'violet',
      moduloId: ModuloPOS.INTEGRACIONES,
    },
    {
      path: '/taller',
      icon: Wrench,
      label: 'Taller de Reparaciones',
      color: 'blue',
      moduloId: ModuloPOS.TALLER_REPARACIONES,
    },
    {
      path: '/codec-verify',
      icon: Zap,
      label: 'Codec Verify',
      color: 'fuchsia',
      moduloId: ModuloPOS.CODEC_VERIFY,
      requiresPremium: true,
      premiumFeature: 'codec_verify',
      featureDescription: 'Sistema avanzado de verificación de identidad y prevención de fraude',
    },
    {
      path: '/monitoreo',
      icon: Wifi,
      label: 'Monitoreo de Terminales',
      color: 'cyan',
      moduloId: ModuloPOS.MONITOREO_TERMINALES,
    },
    // 🔐 Visible para cualquier super_usuario (no solo tras pasar ya el login
    // de staff) — /developer se encarga de pedir esas credenciales si hacen
    // falta. Sin esto no había forma de descubrir la pantalla la primera vez.
    ...(hasDeveloperPanelAccess || esSuperUsuario ? [{
      path: '/developer',
      icon: Shield,
      label: 'Panel de Desarrollador',
      color: 'purple',
      adminOnly: true,
    }] : []),
  ];

  // ✅ VERIFICAR SI UN ITEM ESTÁ DISPONIBLE PARA EL USUARIO
  const canAccessItem = (item: MenuItemType): { allowed: boolean; reason?: string } => {
    if (item.path === '/developer') {
      return { allowed: hasDeveloperPanelAccess, reason: hasDeveloperPanelAccess ? undefined : 'admin_only' };
    }

    // FILTRO 1: Licencia del desarrollador (máxima prioridad — restricción real de producto)
    if (item.moduloId && !esModuloPermitidoLicenciaDesarrollador(item.moduloId)) {
      return { allowed: false, reason: 'hidden_by_license' };
    }

    // Admin maestro o modo temporal tienen paso libre tras el filtro de licencia
    if (esSuperUsuario || modoAdminTemporalActivo || hasDeveloperPanelAccess) {
      return { allowed: true };
    }

    // Si el dueño fuerza visibilidad global, se renderiza de inmediato
    if (modulosGlobalConfig.forceGlobalModules) {
      return { allowed: true };
    }

    // 🛡️ FIX: el PERMISO por rol (autoritativo, otorgado en Empleados /
    // Gestionar Permisos) y la ORGANIZACIÓN visual del panel (Configuración →
    // Personalización del Espacio de Trabajo) son dos cosas distintas y se
    // evalúan por separado. El permiso de rol decide QUIÉN puede ver el
    // módulo — eso nunca lo toca el toggle de Configuración. El toggle de
    // Configuración solo puede OCULTAR, entre los módulos que el rol ya
    // permite, los que el negocio no usa; jamás otorga acceso que el rol no
    // dio. Antes ese toggle se ignoraba por completo en cuanto el usuario
    // tenía algún permiso explícito configurado (el caso normal de cualquier
    // cajero/técnico ya dado de alta), así que "mostrar/ocultar paneles"
    // desde Configuración no tenía ningún efecto real para ellos.
    if (item.moduloId) {
      const modulosUsuario = new Set((usuarioActual?.modulosActivos || []) as ModuloPOS[]);
      const tienePermisoDeRol = modulosUsuario.size > 0 ? modulosUsuario.has(item.moduloId) : true;

      if (!tienePermisoDeRol) {
        return { allowed: false, reason: 'no_permission' };
      }

      if (!modulosGlobalConfig.modulosActivos.includes(item.moduloId)) {
        return { allowed: false, reason: 'disabled_globally' };
      }
    }

    if (item.adminOnly) {
      return { allowed: false, reason: 'admin_only' };
    }

    if (item.requiredPermission && !item.moduloId) {
      const hasPermission = usuarioActual?.permisos?.[item.requiredPermission];
      if (hasPermission !== true) {
        return { allowed: false, reason: 'no_permission' };
      }
    }

    return { allowed: true };
  };

  // Render final aplicando la cascada completa por módulo
  const visibleMenuItems = menuItems.filter((item) => canAccessItem(item).allowed);

  useEffect(() => {
    try {
      const savedOrder = localStorage.getItem(MENU_ORDER_STORAGE_KEY);
      if (savedOrder) {
        const parsedOrder = JSON.parse(savedOrder);
        if (Array.isArray(parsedOrder)) {
          setMenuOrder(parsedOrder.filter((path): path is string => typeof path === 'string'));
        }
      }
    } catch (error) {
      console.warn('No se pudo cargar el orden de módulos del sidebar:', error);
    }
  }, []);

  useEffect(() => {
    const visiblePaths = visibleMenuItems.map(item => item.path);
    setMenuOrder(prev => {
      const orderedExisting = prev.filter(path => visiblePaths.includes(path));
      const missingPaths = visiblePaths.filter(path => !orderedExisting.includes(path));
      const nextOrder = [...orderedExisting, ...missingPaths];
      return arePathArraysEqual(prev, nextOrder) ? prev : nextOrder;
    });
  }, [visibleMenuItems]);

  useEffect(() => {
    if (menuOrder.length === 0) return;
    try {
      localStorage.setItem(MENU_ORDER_STORAGE_KEY, JSON.stringify(menuOrder));
    } catch (error) {
      console.warn('No se pudo guardar el orden de módulos del sidebar:', error);
    }
  }, [menuOrder]);

  const orderedVisibleMenuItems = useMemo(() => {
    const orderIndex = new Map(menuOrder.map((path, index) => [path, index]));
    return [...visibleMenuItems].sort((a, b) => {
      const indexA = orderIndex.has(a.path) ? orderIndex.get(a.path)! : Number.MAX_SAFE_INTEGER;
      const indexB = orderIndex.has(b.path) ? orderIndex.get(b.path)! : Number.MAX_SAFE_INTEGER;
      return indexA - indexB;
    });
  }, [visibleMenuItems, menuOrder]);

  const handleDragStart = (path: string) => {
    setDraggedPath(path);
  };

  const handleDragOver = (event: React.DragEvent<HTMLButtonElement>, path: string) => {
    event.preventDefault();
    if (draggedPath && draggedPath !== path) {
      setDragOverPath(path);
    }
  };

  const handleDrop = (path: string) => {
    if (!draggedPath || draggedPath === path) {
      setDraggedPath(null);
      setDragOverPath(null);
      return;
    }

    setMenuOrder(prev => {
      const workingOrder = [...prev];
      if (!workingOrder.includes(draggedPath)) {
        workingOrder.push(draggedPath);
      }
      if (!workingOrder.includes(path)) {
        workingOrder.push(path);
      }

      const fromIndex = workingOrder.indexOf(draggedPath);
      const toIndex = workingOrder.indexOf(path);

      if (fromIndex === -1 || toIndex === -1) return prev;

      workingOrder.splice(fromIndex, 1);
      workingOrder.splice(toIndex, 0, draggedPath);
      return workingOrder;
    });

    setDraggedPath(null);
    setDragOverPath(null);
  };

  const handleDragEnd = () => {
    setDraggedPath(null);
    setDragOverPath(null);
  };

  const handleRenameModule = (path: string, newName: string) => {
    const trimmed = newName.trim();
    setEditingPath(null);
    if (!trimmed) return;
    const updated = { ...sidebarModules, [path]: trimmed };
    setSidebarModules(updated);
    try {
      localStorage.setItem(CUSTOM_MODULES_NAMES_KEY, JSON.stringify(updated));
    } catch (err) {
      console.warn('No se pudo guardar el nombre personalizado del módulo:', err);
    }
  };

  // ✅ MANEJAR CLICK EN OPCIÓN DEL MENÚ
  const handleMenuClick = (item: MenuItemType) => {
    const access = canAccessItem(item);

    if (!access.allowed) {
      if (access.reason === 'premium_required') {
        // Mostrar modal de upgrade a Premium
        setSelectedFeature({
          name: item.label,
          description: item.featureDescription || 'Esta funcionalidad requiere el Plan Premium',
        });
        setShowUpgradeModal(true);
        return;
      } else if (access.reason === 'admin_only') {
        toast.error('Acceso denegado', {
          description: 'Esta opción solo está disponible para Administradores'
        });
        return;
      } else if (access.reason === 'no_permission') {
        toast.error('Sin permisos', {
          description: 'No tienes permisos para acceder a esta función'
        });
        return;
      } else if (access.reason === 'hidden_by_license') {
        toast.error('Módulo no disponible', {
          description: 'Este módulo fue deshabilitado por la licencia del desarrollador.'
        });
        return;
      } else if (access.reason === 'disabled_globally') {
        toast.error('Módulo desactivado', {
          description: 'Este módulo está apagado desde la configuración global del negocio.'
        });
        return;
      }
    }

    // Navegar normalmente
    navigate(item.path);
  };

  // ✅ VERIFICAR SI UN ITEM ESTÁ BLOQUEADO (para estilos visuales)
  const isItemLocked = (item: MenuItemType): boolean => {
    const access = canAccessItem(item);
    return !access.allowed && access.reason === 'premium_required';
  };

  const isItemDisabled = (item: MenuItemType): boolean => {
    const access = canAccessItem(item);
    return !access.allowed && (access.reason === 'admin_only' || access.reason === 'no_permission');
  };

  const getColorClasses = (color: string, isActive: boolean) => {
    const colors: { [key: string]: string } = {
      emerald: isActive ? 'from-emerald-500 to-emerald-600 text-white' : 'hover:bg-emerald-500/10 hover:text-emerald-400',
      blue: isActive ? 'from-blue-500 to-blue-600 text-white' : 'hover:bg-blue-500/10 hover:text-blue-400',
      purple: isActive ? 'from-purple-500 to-purple-600 text-white' : 'hover:bg-purple-500/10 hover:text-purple-400',
      red: isActive ? 'from-red-500 to-red-600 text-white' : 'hover:bg-red-500/10 hover:text-red-400',
      amber: isActive ? 'from-amber-500 to-amber-600 text-white' : 'hover:bg-amber-500/10 hover:text-amber-400',
      violet: isActive ? 'from-violet-500 to-violet-600 text-white' : 'hover:bg-violet-500/10 hover:text-violet-400',
      indigo: isActive ? 'from-indigo-500 to-indigo-600 text-white' : 'hover:bg-indigo-500/10 hover:text-indigo-400',
      cyan: isActive ? 'from-cyan-500 to-cyan-600 text-white' : 'hover:bg-cyan-500/10 hover:text-cyan-400',
      teal: isActive ? 'from-teal-500 to-teal-600 text-white' : 'hover:bg-teal-500/10 hover:text-teal-400',
      rose: isActive ? 'from-rose-500 to-rose-600 text-white' : 'hover:bg-rose-500/10 hover:text-rose-400',
      fuchsia: isActive ? 'from-fuchsia-500 to-fuchsia-600 text-white' : 'hover:bg-fuchsia-500/10 hover:text-fuchsia-400',
      orange: isActive ? 'from-orange-500 to-orange-600 text-white' : 'hover:bg-orange-500/10 hover:text-orange-400',
    };
    return colors[color] || colors.emerald;
  };

  const getDeveloperColor = (isActive: boolean) => {
    return isActive 
      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/30'
      : darkMode
      ? 'hover:bg-purple-500/15 hover:text-purple-300 text-gray-200'
      : 'hover:bg-purple-500/10 hover:text-purple-600 text-gray-600';
  };

  const getMenuItemCustomization = (item: MenuItemType) => {
    if (!item.moduloId) return null;
    return modulosPersonalizados[item.moduloId] || null;
  };

  const renderMenuIcon = (item: MenuItemType, className?: string) => {
    const customization = getMenuItemCustomization(item);
    if (customization?.icono) {
      return (
        <span className={className} style={{ color: customization.color || undefined }}>
          {customization.icono}
        </span>
      );
    }

    const Icon = item.icon;
    return <Icon className={className} style={customization?.color ? { color: customization.color } : undefined} />;
  };

  const getMenuLabel = (item: MenuItemType) => {
    if (sidebarModules[item.path]) return sidebarModules[item.path];
    const customization = getMenuItemCustomization(item);
    return customization?.nombre || item.label;
  };

  const getMenuColor = (item: MenuItemType) => {
    const customization = getMenuItemCustomization(item);
    return customization?.color || item.color;
  };

  const scaleBg = darkMode ? 'radial-gradient(ellipse at 60% 0%, #1a233b 0%, #111827 100%)' : '#f8fafc';

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: scaleBg, overflow: 'hidden' }}>
    <div
      id="pos-scalable-content"
      style={{
        transform: `scale(${uiScale})`,
        transformOrigin: 'top left',
        width: `calc(${100 / uiScale}vw + 2px)`,
        height: `calc(${100 / uiScale}vh + 2px)`,
        overflow: 'hidden',
      }}
    >
    <div className={`h-full flex ${darkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
      {/* Sidebar */}
      <motion.div
        initial={false}
        animate={{ width: collapsed ? '80px' : '280px' }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className={`h-full flex flex-col border-r relative ${
          darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'
        } shadow-2xl`}
      >
        {/* Header */}
        <div className={`flex-shrink-0 p-4 border-b ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
          <div className="flex items-center justify-center">
            {!collapsed ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3 w-full"
              >
                <div className="w-12 h-12 flex-shrink-0">
                  <img
                    src={logoImage}
                    alt="CODEC POS"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      // Fallback a SVG si logo.png no existe
                      e.currentTarget.style.display = 'none';
                      const svg = document.createElement('div');
                      svg.innerHTML = '<div class="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white font-black text-xl shadow-lg">CP</div>';
                      e.currentTarget.parentElement?.appendChild(svg.firstChild!);
                    }}
                  />
                </div>
                
                <div className="flex flex-col">
                  <h1 className={`text-xl font-black tracking-tight ${
                    darkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    CODEC POS
                  </h1>
                  <p className={`text-xs font-semibold ${
                    darkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    v2.0 • Codec Studio
                  </p>
                </div>
              </motion.div>
            ) : (
              <div className="w-10 h-10">
                <img
                  src={logoImage}
                  alt="CODEC POS"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    // Fallback a SVG si logo.png no existe
                    e.currentTarget.style.display = 'none';
                    const svg = document.createElement('div');
                    svg.innerHTML = '<div class="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white font-black text-sm shadow-lg">CP</div>';
                    e.currentTarget.parentElement?.appendChild(svg.firstChild!);
                  }}
                />
              </div>
            )}
          </div>

          {/* ── SELECTOR DE TIENDA ACTIVA ── */}
          {!collapsed && tiendas.length > 0 && (
            <div className="mt-3 relative">
              <button
                onClick={() => setShowTiendaDropdown(!showTiendaDropdown)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 transition-all text-left"
              >
                <span className="text-lg">{tiendaActual?.emoji || '🏪'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white/80 truncate">
                    {tiendaActual?.nombre || 'Sin tienda'}
                  </p>
                  <p className="text-[10px] text-white/40">Tienda activa</p>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-white/40 transition-transform ${showTiendaDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showTiendaDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl overflow-hidden shadow-2xl border border-white/15"
                  style={{ background: 'rgba(15,23,42,0.97)' }}>
                  {tiendas.map(t => (
                    <button
                      key={t.id}
                      onClick={() => { cambiarTienda(t.id); setShowTiendaDropdown(false); toast.success(`Tienda activa: ${t.nombre}`); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-all hover:bg-white/10 ${
                        tiendaActual?.id === t.id ? 'bg-white/10' : ''
                      }`}
                    >
                      <span className="text-lg">{t.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{t.nombre}</p>
                        {t.esPrincipal && <p className="text-[10px] text-white/40">Principal</p>}
                      </div>
                      {tiendaActual?.id === t.id && (
                        <div className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {collapsed && tiendaActual && (
            <div className="mt-2 flex justify-center">
              <span title={tiendaActual.nombre} className="text-xl">{tiendaActual.emoji}</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 min-h-0 p-4 space-y-2 overflow-y-auto scrollbar-thin">
          {orderedVisibleMenuItems.map((item) => {
            const isActive = location.pathname === item.path;
            const locked = isItemLocked(item);
            const disabled = isItemDisabled(item);
            const isDragged = draggedPath === item.path;
            const isDragOver = dragOverPath === item.path;
            const itemColor = getMenuColor(item);
            const customization = getMenuItemCustomization(item);
            
            return (
              <motion.button
                key={item.path}
                onClick={() => handleMenuClick(item)}
                draggable
                onDragStart={() => handleDragStart(item.path)}
                onDragOver={(event) => handleDragOver(event, item.path)}
                onDrop={() => handleDrop(item.path)}
                onDragEnd={handleDragEnd}
                whileHover={{ scale: (locked || disabled) ? 1.01 : 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`relative group w-full flex items-center gap-3 transition-all ${
                  collapsed
                    ? 'justify-center px-0 py-2'
                    : `px-4 py-3 rounded-2xl ${
                        locked || disabled
                          ? `${darkMode ? 'bg-slate-800/70 text-gray-300' : 'bg-gray-100/50 text-gray-400'} ${locked ? 'cursor-pointer' : 'cursor-not-allowed'} opacity-80`
                          : isActive
                          ? `bg-gradient-to-r ${getColorClasses(itemColor, true)} shadow-lg`
                          : `${darkMode ? 'text-white' : 'text-gray-600'} ${getColorClasses(itemColor, false)}`
                        }`
                } ${isDragged ? 'opacity-60' : ''} ${isDragOver ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-transparent' : ''}`}
              >
                {collapsed ? (
                  // ── COLLAPSED: ícono dentro de su propio contenedor centrado ──
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                    locked || disabled
                      ? `${darkMode ? 'bg-slate-800/50' : 'bg-gray-100/50'} opacity-60`
                      : isActive
                      ? `bg-gradient-to-br ${getColorClasses(itemColor, true)} shadow-lg`
                      : `${darkMode ? 'text-gray-100 hover:bg-slate-700' : 'text-gray-500 hover:bg-gray-100'}`
                  }`}>
                    {renderMenuIcon(item, 'w-5 h-5 flex-shrink-0')}
                    {locked && (
                      <div className="absolute -top-1 -right-1">
                        <Lock className="w-3 h-3 text-amber-500" />
                      </div>
                    )}
                  </div>
                ) : (
                  // ── EXPANDED: layout normal ──
                  <>
                    {renderMenuIcon(item, 'w-5 h-5 flex-shrink-0')}
                    <div className="flex items-center justify-between w-full min-w-0">
                      {editingPath === item.path ? (
                        <input
                          autoFocus
                          type="text"
                          value={editingValue}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') handleRenameModule(item.path, editingValue);
                            if (e.key === 'Escape') setEditingPath(null);
                          }}
                          onBlur={() => handleRenameModule(item.path, editingValue)}
                          className={`flex-1 mr-2 text-sm font-semibold bg-transparent border-b outline-none ${
                            darkMode
                              ? 'border-white/50 text-white placeholder-white/30'
                              : 'border-gray-500 text-gray-900 placeholder-gray-400'
                          }`}
                        />
                      ) : (
                        <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="font-semibold text-sm flex-1 truncate"
                          style={customization?.color ? { color: customization.color } : undefined}
                        >
                          {getMenuLabel(item)}
                        </motion.span>
                      )}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {editingPath !== item.path && (esSuperUsuario || modoAdminTemporalActivo) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingPath(item.path);
                              setEditingValue(getMenuLabel(item));
                            }}
                            className={`hidden group-hover:flex items-center justify-center w-5 h-5 rounded transition-all ${
                              darkMode
                                ? 'text-white/40 hover:text-white hover:bg-white/15'
                                : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200/70'
                            }`}
                            title="Renombrar módulo"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                        {locked && (
                          <div className="flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-purple-500 to-amber-500 rounded-full">
                            <Crown className="w-3 h-3 text-white" />
                            <span className="text-[10px] font-black text-white">PRO</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </motion.button>
            );
          })}
        </nav>

        {/* 🛡️ FIX: antes este botón solo aparecía cuando `hasDeveloperPanelAccess`
            ya era true — pero esa bandera SOLO se activa DESPUÉS de pasar el
            login de staff en /developer. Resultado: no había ninguna forma de
            descubrir/llegar a esa pantalla desde el sidebar, un candado sin
            picaporte. Ahora se muestra a cualquier super_usuario (el dueño del
            negocio) y navega a la ruta completa /developer — StaffLoginGate ya
            se encarga de pedir las credenciales de staff ahí mismo. */}
        {(hasDeveloperPanelAccess || esSuperUsuario) && (
          <div className="flex-shrink-0 px-3 pb-1 pt-2">
            <button
              onClick={() => navigate('/developer')}
              title="Panel de Desarrollador"
              className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                darkMode
                  ? 'bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 border-purple-700/50 hover:border-purple-500'
                  : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200 hover:border-purple-400'
              }`}
            >
              <Shield className={`w-4 h-4 flex-shrink-0 ${darkMode ? 'text-purple-400' : 'text-purple-500'}`} />
              {!collapsed && <span>Panel Desarrollador</span>}
            </button>
          </div>
        )}

        {/* Botón para toggle del footer */}
        <div className={`flex-shrink-0 px-4 py-2 border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
          <button
            onClick={() => setShowFooter(!showFooter)}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl transition-all ${
              darkMode
                ? 'bg-slate-800 hover:bg-slate-700 text-white'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            {showFooter ? (
              <>
                <ChevronDown className="w-4 h-4" />
                {!collapsed && <span className="text-xs font-semibold">Ocultar Panel</span>}
              </>
            ) : (
              <>
                <ChevronRight className="w-4 h-4" />
                {!collapsed && <span className="text-xs font-semibold">Mostrar Panel</span>}
              </>
            )}
          </button>
        </div>

        {/* Footer */}
        {showFooter && (
        <div className={`flex-shrink-0 max-h-[52vh] overflow-y-auto p-4 border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'} space-y-3`}>
          {/* Badge de Plan Actual - ADMINISTRADOR vs CLIENTE */}
          {!collapsed && !hasDeveloperPanelAccess && (
            <div className={`p-2 rounded-xl text-center ${
              esSuperUsuario
                ? 'bg-gradient-to-r from-blue-600 to-cyan-500'
                : planInfo.plan === 'PREMIUM'
                ? 'bg-gradient-to-r from-purple-600 to-amber-500'
                : darkMode
                ? 'bg-slate-800 border border-slate-600'
                : 'bg-gray-100 border border-gray-300'
            }`}>
              <div className="flex items-center justify-center gap-2">
                {esSuperUsuario ? (
                  <>
                    <Shield className="w-4 h-4 text-white" />
                    <span className="text-xs font-black text-white">ADMINISTRADOR</span>
                  </>
                ) : planInfo.plan === 'PREMIUM' ? (
                  <>
                    <Crown className="w-4 h-4 text-white" />
                    <span className="text-xs font-black text-white">PLAN PREMIUM</span>
                  </>
                ) : (
                  <>
                    <Shield className={`w-4 h-4 ${darkMode ? 'text-gray-200' : 'text-gray-600'}`} />
                    <span className={`text-xs font-bold ${darkMode ? 'text-white' : 'text-gray-700'}`}>
                      PLAN BÁSICO
                    </span>
                  </>
                )}
              </div>
              {esSuperUsuario ? (
                <p className="text-[10px] mt-1 text-white/90">
                  Acceso Completo • Todos los Permisos
                </p>
              ) : planInfo.plan === 'BASICO' ? (
                <p className={`text-[10px] mt-1 ${darkMode ? 'text-gray-200' : 'text-gray-600'}`}>
                  {planInfo.maxProductos} productos • {planInfo.maxUsuarios} usuarios
                </p>
              ) : null}
            </div>
          )}

          {/* Usuario Actual */}
          {!collapsed && usuarioActual && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-3 rounded-xl ${
                darkMode 
                  ? 'bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600' 
                  : 'bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  esSuperUsuario
                    ? 'bg-gradient-to-br from-amber-400 to-orange-500'
                    : 'bg-gradient-to-br from-blue-400 to-purple-500'
                }`}>
                  {esSuperUsuario ? (
                    <Crown className="w-5 h-5 text-white" />
                  ) : (
                    <User className="w-5 h-5 text-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold truncate ${
                    darkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    {usuarioActual.nombreCompleto}
                  </p>
                  <p className={`text-xs truncate ${
                    darkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    {hasDeveloperPanelAccess
                      ? '🛠️ Desarrollador'
                      : esSuperUsuario
                      ? '👑 Administrador'
                      : usuarioActual?.rol === 'tecnico'
                      ? '🔧 Técnico'
                      : '👤 Cajero'}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {collapsed && usuarioActual && (
            <div className="flex justify-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                esSuperUsuario
                  ? 'bg-gradient-to-br from-amber-400 to-orange-500'
                  : 'bg-gradient-to-br from-blue-400 to-purple-500'
              }`}>
                {esSuperUsuario ? (
                  <Crown className="w-5 h-5 text-white" />
                ) : (
                  <User className="w-5 h-5 text-white" />
                )}
              </div>
            </div>
          )}

          {modoAdminTemporalActivo && !collapsed && (
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                  MODO ADMIN TEMPORAL ACTIVO
                </span>
              </div>
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                Cajero: <strong>{usuarioActual?.nombreCompleto}</strong>
              </p>
              <button
                onClick={() => navigate('/usuarios')}
                className="w-full text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg py-1.5 px-3 transition-colors"
              >
                Gestionar permisos del cajero
              </button>
            </div>
          )}

          <Button
            onClick={() => {
              if (modoAdminTemporalActivo) {
                desactivarModoAdminTemporal();
                toast.success('Modo Administrador temporal desactivado');
              } else {
                setShowAdminTempDialog(true);
              }
            }}
            variant={modoAdminTemporalActivo ? 'secondary' : 'outline'}
            className={`w-full rounded-2xl ${collapsed ? 'px-3' : ''}`}
          >
            <Shield className={`w-5 h-5 ${collapsed ? 'mx-auto' : 'mr-2'}`} />
            {!collapsed && <span>{modoAdminTemporalActivo ? 'Salir modo Admin' : 'Acceso Admin Temporal'}</span>}
          </Button>

          {/* Dark Mode Toggle */}
          <Button
            onClick={toggleDarkMode}
            variant="outline"
            className={`w-full rounded-2xl ${collapsed ? 'px-3' : ''}`}
          >
            {darkMode ? (
              <Sun className={`w-5 h-5 ${collapsed ? 'mx-auto' : 'mr-2'}`} />
            ) : (
              <Moon className={`w-5 h-5 ${collapsed ? 'mx-auto' : 'mr-2'}`} />
            )}
            {!collapsed && <span>{darkMode ? 'Modo Claro' : 'Modo Oscuro'}</span>}
          </Button>

          {/* Pantalla Completa */}
          <Button
            onClick={handleToggleFullscreen}
            variant="outline"
            className={`w-full rounded-2xl ${collapsed ? 'px-3' : ''}`}
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {isFullscreen ? (
              <Minimize className={`w-5 h-5 ${collapsed ? 'mx-auto' : 'mr-2'}`} />
            ) : (
              <Maximize2 className={`w-5 h-5 ${collapsed ? 'mx-auto' : 'mr-2'}`} />
            )}
            {!collapsed && <span>{isFullscreen ? 'Salir Pantalla Completa' : 'Pantalla Completa'}</span>}
          </Button>

          {/* Cerrar Sesión */}
          <Button
            onClick={() => setShowLogoutDialog(true)}
            variant="outline"
            className={`w-full rounded-2xl text-red-600 hover:text-red-700 hover:bg-red-50 ${
              collapsed ? 'px-3' : ''
            }`}
          >
            <LogOut className={`w-5 h-5 ${collapsed ? 'mx-auto' : 'mr-2'}`} />
            {!collapsed && <span>Cerrar Sesión</span>}
          </Button>
        </div>
        )}

        {/* Toggle Button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`absolute -right-3 top-20 w-6 h-6 rounded-full flex items-center justify-center shadow-lg ${
            darkMode 
              ? 'bg-slate-700 text-white border-2 border-slate-600' 
              : 'bg-white text-gray-700 border-2 border-gray-300'
          } hover:scale-110 transition-transform z-10`}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </motion.div>

      {/* Main Content */}
      <div className={`flex-1 h-full min-h-0 w-full ${darkMode ? 'bg-slate-900' : 'bg-slate-50'} overflow-y-auto`}>
        <Outlet />
      </div>

      {/* Modal de Actualización a Premium */}
      <ModalUpgradePremium
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        featureName={selectedFeature.name}
        featureDescription={selectedFeature.description}
      />

      <Dialog open={showAdminTempDialog} onOpenChange={(open) => { if (!open) setShowAdminTempDialog(false); }}>
        <DialogContent className={`max-w-md ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-gray-200 text-slate-900'}`}>
          <DialogHeader>
            <DialogTitle className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Acceso Administrador Temporal
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <Input
              value={adminTempUsername}
              onChange={(e) => setAdminTempUsername(e.target.value)}
              placeholder="Usuario administrador"
              className={`w-full h-12 ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : ''}`}
            />
            <Input
              type="password"
              value={adminTempPassword}
              onChange={(e) => setAdminTempPassword(e.target.value)}
              placeholder="Contraseña"
              className={`w-full h-12 ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : ''}`}
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => {
                  setAdminTempUsername('');
                  setAdminTempPassword('');
                  setShowAdminTempDialog(false);
                }}
              >
                Cancelar
              </Button>
              <Button
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  if (!adminTempUsername.trim() || !adminTempPassword.trim()) {
                    toast.error('Ingresa usuario y contraseña de administrador');
                    return;
                  }

                  const activado = activarModoAdminTemporal(adminTempUsername, adminTempPassword);
                  if (activado) {
                    toast.success('Modo administrador temporal activado');
                    setShowAdminTempDialog(false);
                    setAdminTempUsername('');
                    setAdminTempPassword('');
                  } else {
                    toast.error('Credenciales de administrador inválidas');
                  }
                }}
              >
                Activar modo Admin
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog de confirmación de cierre de sesión ── */}
      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent className={`max-w-sm ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-gray-200 text-slate-900'}`}>
          <DialogHeader>
            <DialogTitle className={`text-xl font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              <LogOut className="w-5 h-5 text-red-500" />
              Cerrar Sesión
            </DialogTitle>
          </DialogHeader>
          <p className={`text-sm mt-2 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
            ¿Deseas cerrar la sesión de <strong>{usuarioActual?.nombreCompleto || usuarioActual?.username}</strong>?
          </p>
          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowLogoutDialog(false)}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700 text-white border-0"
              onClick={() => {
                setShowLogoutDialog(false);
                cerrarSesion();
                navigate('/login', { replace: true });
                toast.success('Sesión cerrada', { description: 'Hasta pronto' });
              }}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Cerrar Sesión
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
    </div>
    </div>
  );
}
