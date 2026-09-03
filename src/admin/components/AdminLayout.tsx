import { ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router';
import {
  LayoutDashboard, Users, Tag, Percent, Store, UserCog, KeyRound,
  Headphones, ScrollText, LogOut, TicketPercent, Menu, X,
} from 'lucide-react';
import { useAdminAuth } from '../contexts/AdminAuthContext';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/planes', label: 'Planes y precios', icon: Tag },
  { to: '/promociones', label: 'Promociones', icon: Percent },
  { to: '/codigos-descuento', label: 'Códigos de descuento', icon: TicketPercent },
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
  const [menuAbierto, setMenuAbierto] = useState(false);

  const handleLogout = async () => {
    await cerrarSesion();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {menuAbierto && <button aria-label="Cerrar menú" onClick={() => setMenuAbierto(false)} className="fixed inset-0 z-40 bg-black/60 md:hidden" />}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-slate-800 bg-slate-900 flex flex-col transform transition-transform md:static md:w-64 md:translate-x-0 ${menuAbierto ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-slate-800">
          <img src="/logoapp.png" alt="" className="w-8 h-8 rounded-lg shrink-0" />
          <span className="font-bold text-white">Codec POS Admin</span>
          <button aria-label="Cerrar menú" onClick={() => setMenuAbierto(false)} className="ml-auto p-2 text-slate-400 hover:text-white md:hidden"><X className="w-5 h-5" /></button>
        </div>
        <nav className="flex-1 py-4 px-2 space-y-1">
          {NAV.map(({ to, label, icon: Icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gradient-to-r from-orange-500/20 to-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
              onClick={() => setMenuAbierto(false)}
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-800">
          <div className="px-2 mb-2">
            <p className="text-sm font-medium truncate text-white">{staff?.nombreCompleto}</p>
            <p className="text-xs text-amber-400/90">{staff?.nivelStaff ? NIVEL_LABEL[staff.nivelStaff] ?? staff.nivelStaff : 'Sin nivel asignado'}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="sticky top-0 z-30 flex h-14 items-center border-b border-slate-800 bg-slate-950/95 px-4 md:hidden">
          <button aria-label="Abrir menú" onClick={() => setMenuAbierto(true)} className="p-2 text-slate-300 hover:text-white"><Menu className="w-5 h-5" /></button>
          <span className="ml-2 text-sm font-semibold text-white">Codec POS Admin</span>
        </div>
        <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
