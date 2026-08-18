import { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router';
import {
  LayoutDashboard, Users, Tag, Percent, Store, UserCog, KeyRound,
  Headphones, ScrollText, LogOut, ShieldCheck,
} from 'lucide-react';
import { useAdminAuth } from '../contexts/AdminAuthContext';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/planes', label: 'Planes y precios', icon: Tag },
  { to: '/promociones', label: 'Promociones', icon: Percent },
  { to: '/sucursales', label: 'Sucursales', icon: Store },
  { to: '/usuarios', label: 'Usuarios', icon: UserCog },
  { to: '/licencias', label: 'Licencias', icon: KeyRound },
  { to: '/soporte', label: 'Soporte', icon: Headphones },
  { to: '/auditoria', label: 'Auditoría', icon: ScrollText },
];

const NIVEL_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Super administrador',
  SOPORTE: 'Soporte',
  LECTURA: 'Solo lectura',
};

export function AdminLayout({ children }: { children: ReactNode }) {
  const { staff, cerrarSesion } = useAdminAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await cerrarSesion();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      <aside className="w-64 shrink-0 border-r border-slate-800 flex flex-col">
        <div className="h-16 flex items-center gap-2 px-5 border-b border-slate-800">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <span className="font-bold">Codec POS Admin</span>
        </div>
        <nav className="flex-1 py-4 px-2 space-y-1">
          {NAV.map(({ to, label, icon: Icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-emerald-500/15 text-emerald-400' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-800">
          <div className="px-2 mb-2">
            <p className="text-sm font-medium truncate">{staff?.nombreCompleto}</p>
            <p className="text-xs text-slate-500">{staff?.nivelStaff ? NIVEL_LABEL[staff.nivelStaff] ?? staff.nivelStaff : 'Sin nivel asignado'}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-900 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
