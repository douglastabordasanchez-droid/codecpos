import { NavLink } from 'react-router';
import { DollarSign, Package, ScanLine, User, LayoutDashboard } from 'lucide-react';
import { usePwaAuth } from '../contexts/PwaAuthContext';

const ITEMS = [
  { to: '/', icon: DollarSign, label: 'Pagos', end: true },
  { to: '/escaner', icon: ScanLine, label: 'Escanear', end: false },
  { to: '/inventario', icon: Package, label: 'Inventario', end: false },
  { to: '/panel', icon: LayoutDashboard, label: 'Panel', end: false, soloAdmin: true },
  { to: '/perfil', icon: User, label: 'Perfil', end: false },
];

/** Navegación inferior mobile-first. La pestaña Panel solo se ve si el rol es admin/super_usuario. */
export function BottomNav() {
  const { empleado } = usePwaAuth();
  const esAdmin = !!empleado && ['admin', 'super_usuario'].includes(empleado.rol);
  const items = ITEMS.filter((item) => !item.soloAdmin || esAdmin);

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)] z-40">
      {items.map(({ to, icon: Icon, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 py-3 px-6 ${isActive ? 'text-amber-400' : 'text-slate-500'}`
          }
        >
          <Icon className="w-5 h-5" />
          <span className="text-[10px] font-semibold">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
