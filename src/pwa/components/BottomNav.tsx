import { NavLink } from 'react-router';
import { ShoppingCart, DollarSign, Package, ScanLine, User, LayoutDashboard } from 'lucide-react';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { useModulosActivos } from '../hooks/useModulosActivos';
import { ModuloPOS } from '../../app/lib/permissions';

const ITEMS = [
  { to: '/', icon: ShoppingCart, label: 'Vender', end: true, moduloRequerido: ModuloPOS.PUNTO_DE_VENTA },
  { to: '/pagos', icon: DollarSign, label: 'Pagos', end: false, moduloRequerido: ModuloPOS.CODEC_VERIFY },
  { to: '/escaner', icon: ScanLine, label: 'Escanear', end: false, moduloRequerido: ModuloPOS.PRODUCTOS },
  { to: '/inventario', icon: Package, label: 'Inventario', end: false, moduloRequerido: ModuloPOS.PRODUCTOS },
  { to: '/panel', icon: LayoutDashboard, label: 'Panel', end: false, soloAdmin: true, moduloRequerido: ModuloPOS.DASHBOARD },
  { to: '/perfil', icon: User, label: 'Perfil', end: false },
];

/**
 * Navegación inferior mobile-first. La pestaña Panel solo se ve si el rol es
 * admin/super_usuario, y cada pestaña respeta los módulos activos reales del
 * negocio (ver useModulosActivos — misma fuente que Panel Desarrollador >
 * Clientes en Electron).
 */
export function BottomNav() {
  const { empleado } = usePwaAuth();
  const { tieneModulo } = useModulosActivos();
  const esAdmin = !!empleado && ['admin', 'super_usuario'].includes(empleado.rol);
  const items = ITEMS.filter(
    (item) => (!item.soloAdmin || esAdmin) && (!item.moduloRequerido || tieneModulo(item.moduloRequerido))
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 flex items-center justify-around px-1 pb-[env(safe-area-inset-bottom)] z-40">
      {items.map(({ to, icon: Icon, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 py-3 px-1.5 min-w-0 flex-1 ${isActive ? 'text-amber-400' : 'text-slate-500'}`
          }
        >
          <Icon className="w-5 h-5 shrink-0" />
          <span className="text-[9px] font-semibold truncate max-w-full">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
