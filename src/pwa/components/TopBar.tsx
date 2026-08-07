import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Menu, Bell } from 'lucide-react';
import { SideMenu } from './SideMenu';
import logo from '/logo.png';

export function TopBar() {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <div className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80">
        <div className="h-14 px-4 flex items-center justify-between">
          <button
            onClick={() => setMenuAbierto(true)}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-300 active:bg-slate-900"
            aria-label="Abrir menú"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <img src={logo} alt="CODEC POS" className="w-5 h-5 object-contain" />
            <span className="text-white text-sm font-black tracking-tight">CODEC POS</span>
          </div>

          <button
            onClick={() => navigate('/alertas')}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-300 active:bg-slate-900"
            aria-label="Alertas"
          >
            <Bell className="w-5 h-5" />
          </button>
        </div>
      </div>
      <SideMenu open={menuAbierto} onClose={() => setMenuAbierto(false)} />
    </>
  );
}
