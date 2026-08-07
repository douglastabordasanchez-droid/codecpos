import { NavLink } from 'react-router';
import { Home, Receipt, DollarSign, Bell } from 'lucide-react';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { useModulosActivos } from '../hooks/useModulosActivos';
import { ModuloPOS } from '../../app/lib/permissions';
import logo from '/logo.png';

const ITEMS_IZQUIERDA = [
  { to: '/', icon: Home, label: 'Inicio', end: true },
  { to: '/ventas', icon: Receipt, label: 'Ventas', end: false },
];

const ITEMS_DERECHA = [
  { to: '/pagos', icon: DollarSign, label: 'Pagos', end: false, moduloRequerido: ModuloPOS.CODEC_VERIFY },
  { to: '/alertas', icon: Bell, label: 'Alertas', end: false },
];

/**
 * Navegación inferior con el botón CODEC elevado al centro (acción
 * principal: vender), inspirada en el diseño anterior del usuario. Cada
 * pestaña respeta los módulos activos reales del negocio (useModulosActivos).
 */
export function BottomNav() {
  const { tieneModulo } = useModulosActivos();
  const derecha = ITEMS_DERECHA.filter((item) => !item.moduloRequerido || tieneModulo(item.moduloRequerido));

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center gap-1 py-3 px-2 min-w-0 flex-1 ${isActive ? 'text-amber-400' : 'text-slate-500'}`;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800 flex items-center justify-around px-1 pb-[env(safe-area-inset-bottom)] z-40">
      {ITEMS_IZQUIERDA.map(({ to, icon: Icon, label, end }) => (
        <NavLink key={to} to={to} end={end} className={linkClass}>
          <Icon className="w-5 h-5 shrink-0" />
          <span className="text-[9px] font-semibold truncate max-w-full">{label}</span>
        </NavLink>
      ))}

      <NavLink to="/vender" className="flex flex-col items-center flex-1 -mt-7">
        {({ isActive }) => (
          <>
            <div
              className={`w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/40 border-4 border-slate-950 transition-transform ${
                isActive ? 'scale-105' : ''
              }`}
            >
              <img src={logo} alt="CODEC" className="w-8 h-8 object-contain" />
            </div>
            <span className={`text-[9px] font-bold mt-1 ${isActive ? 'text-amber-400' : 'text-slate-400'}`}>Vender</span>
          </>
        )}
      </NavLink>

      {derecha.map(({ to, icon: Icon, label, end }) => (
        <NavLink key={to} to={to} end={end} className={linkClass}>
          <Icon className="w-5 h-5 shrink-0" />
          <span className="text-[9px] font-semibold truncate max-w-full">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
