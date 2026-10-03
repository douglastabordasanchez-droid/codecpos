import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  User, LogOut, Sun, Moon,
  ShieldCheck, ShieldOff, Crown, Zap, PanelLeftClose, PanelLeftOpen, Bell,
} from 'lucide-react';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { codecVerifyPwaActivo, alternarCodecVerifyPwa, suscribirNotificacionesPagoPwa } from '../lib/codecVerifyPwa';
import { useMenuPersonalizado, type GrupoMenu, type ItemMenu } from '../hooks/useMenuPersonalizado';
import { HojaAccionesModulo, ModulosOcultos, usePresionLarga } from './EdicionMenu';
import logo from '/logo.png';

export function DesktopLayout() {
  const { empleado, cargando, cerrarSesion } = usePwaAuth();
  const { grupos, ocultos } = useMenuPersonalizado({ movil: false });
  const [editando, setEditando] = useState<{ item: ItemMenu; hermanos: string[] } | null>(null);
  const { tema, alternarTema } = useTheme();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<string | null>(null);
  const [verifyActivo, setVerifyActivo] = useState(codecVerifyPwaActivo);
  const [colapsado, setColapsado] = useState(() => localStorage.getItem('codecpos-sidebar-colapsado') === '1');

  const alternarColapso = () => {
    setColapsado((c) => {
      const nuevo = !c;
      localStorage.setItem('codecpos-sidebar-colapsado', nuevo ? '1' : '0');
      return nuevo;
    });
  };

  useEffect(() => {
    if (!empleado) return;
    getSupabaseClient()
      ?.from('clientes_pos')
      .select('plan')
      .eq('id', empleado.cliente_id)
      .maybeSingle()
      .then(({ data }) => setPlan((data as { plan: string } | null)?.plan || null));
  }, [empleado?.cliente_id]);

  useEffect(() => {
    const actualizar = () => setVerifyActivo(codecVerifyPwaActivo());
    window.addEventListener('codecverify-pwa:config-changed', actualizar);
    return () => window.removeEventListener('codecverify-pwa:config-changed', actualizar);
  }, []);

  useEffect(() => {
    if (!verifyActivo || !empleado) return;
    const unsubscribe = suscribirNotificacionesPagoPwa(empleado.cliente_id, (row) => {
      const monto = `$${Number(row.monto).toLocaleString('es-CO')}`;
      if (row.origen === 'automatizacion') {
        toast.success(`✅ Pago verificado automáticamente: ${monto} · ${(row.entidad || '').toUpperCase()}`, { duration: 8000 });
      } else {
        toast.info(`💰 Pago manual reportado: ${monto} · ${(row.entidad || '').toUpperCase()}`, { duration: 8000 });
      }
    });
    return () => unsubscribe?.();
  }, [verifyActivo, empleado?.cliente_id]);

  const toggleVerify = () => {
    const nuevo = alternarCodecVerifyPwa(empleado?.id);
    setVerifyActivo(nuevo);
    toast.success(nuevo ? 'Codec Verify activado' : 'Codec Verify desactivado');
  };

  if (cargando) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex">
      {/* Sidebar */}
      <aside className={`${colapsado ? 'w-[76px]' : 'w-64'} shrink-0 bg-slate-950/80 backdrop-blur-xl border-r border-slate-800/80 flex flex-col h-screen sticky top-0 transition-[width] duration-200`}>
        <div className={`h-16 flex items-center gap-3 border-b border-slate-800/80 shrink-0 ${colapsado ? 'justify-center px-0' : 'px-5'}`}>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20 overflow-hidden shrink-0">
            <img src={logo} alt="CODEC" className="w-6 h-6 object-contain" />
          </div>
          {!colapsado && (
            <div className="min-w-0">
              <p className="text-white font-black text-sm leading-tight truncate">CODEC POS</p>
              {plan && (
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide ${plan === 'PREMIUM' ? 'text-amber-400' : 'text-sky-400'}`}>
                  {plan === 'PREMIUM' ? <Crown className="w-2.5 h-2.5" /> : <Zap className="w-2.5 h-2.5" />}
                  {plan === 'PREMIUM' ? 'Premium' : 'Básico'}
                </span>
              )}
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 space-y-5">
          {grupos.map((g) => (
            <NavGroup key={g.id} grupo={g} colapsado={colapsado} onEditar={(item, hermanos) => setEditando({ item, hermanos })} />
          ))}
          <ModulosOcultos ocultos={ocultos} colapsado={colapsado} />
          {!colapsado && <p className="px-3 text-[10px] text-slate-600">Mantén presionado o clic derecho en un módulo para editarlo.</p>}
        </nav>
        {editando && <HojaAccionesModulo item={editando.item} hermanos={editando.hermanos} onCerrar={() => setEditando(null)} />}

        <div className="px-3 py-3 border-t border-slate-800/80 space-y-1 shrink-0">
          <button
            onClick={alternarColapso}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:bg-slate-900 hover:text-slate-200 text-sm font-semibold ${colapsado ? 'justify-center' : ''}`}
            title={colapsado ? 'Expandir menú' : 'Contraer menú'}
          >
            {colapsado ? <PanelLeftOpen className="w-4 h-4 shrink-0" /> : <PanelLeftClose className="w-4 h-4 shrink-0" />}
            {!colapsado && <span>Contraer menú</span>}
          </button>
          <NavLink
            to="/perfil"
            title={colapsado ? (empleado?.nombre_completo || 'Mi perfil') : undefined}
            className={({ isActive }) =>
              `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${colapsado ? 'justify-center' : ''} ${
                isActive ? 'bg-slate-800/80 text-white' : 'text-slate-300 hover:bg-slate-900'
              }`
            }
          >
            <User className="w-4 h-4 shrink-0" />
            {!colapsado && <span className="truncate">{empleado?.nombre_completo || 'Mi perfil'}</span>}
          </NavLink>
          <button
            onClick={alternarTema}
            title={colapsado ? `Modo ${tema === 'dark' ? 'oscuro' : 'claro'}` : undefined}
            className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:bg-slate-900 text-sm font-semibold ${colapsado ? 'justify-center' : ''}`}
          >
            <span className={`flex items-center gap-3 ${colapsado ? '' : ''}`}>
              {tema === 'dark' ? <Moon className="w-4 h-4 text-slate-400 shrink-0" /> : <Sun className="w-4 h-4 text-amber-500 shrink-0" />}
              {!colapsado && <>Modo {tema === 'dark' ? 'oscuro' : 'claro'}</>}
            </span>
          </button>
          <button
            onClick={cerrarSesion}
            title={colapsado ? 'Cerrar sesión' : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400 hover:bg-slate-900 text-sm font-semibold ${colapsado ? 'justify-center' : ''}`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!colapsado && 'Cerrar sesión'}
          </button>
        </div>
      </aside>

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        <div className="h-16 px-6 flex items-center justify-end gap-2 border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-xl sticky top-0 z-20">
          <button
            onClick={toggleVerify}
            className={`h-10 px-3 rounded-lg flex items-center gap-2 text-xs font-bold transition-colors ${
              verifyActivo ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-900 text-slate-500'
            }`}
          >
            {verifyActivo ? <ShieldCheck className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
            Codec Verify {verifyActivo ? 'activo' : 'inactivo'}
          </button>
          <button
            onClick={() => navigate('/alertas')}
            className="h-10 w-10 rounded-lg flex items-center justify-center text-slate-300 hover:bg-slate-900"
            aria-label="Alertas"
          >
            <Bell className="w-5 h-5" />
          </button>
        </div>

        <main className="max-w-6xl mx-auto px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavGroup({ grupo, colapsado, onEditar }: { grupo: GrupoMenu; colapsado?: boolean; onEditar: (item: ItemMenu, hermanos: string[]) => void }) {
  const visibles = grupo.items.filter((it) => !it.oculto);
  if (visibles.length === 0) return null;
  const hermanos = visibles.map((it) => it.path);
  return (
    <div>
      {grupo.titulo && !colapsado && <p className="px-3 mb-1.5 text-slate-500 text-[10px] font-bold uppercase tracking-wider">{grupo.titulo}</p>}
      <div className="space-y-0.5">
        {visibles.map((it) => (
          <EnlaceMenu key={it.path} item={it} destacado={grupo.destacado} colapsado={colapsado} onEditar={() => onEditar(it, hermanos)} />
        ))}
      </div>
    </div>
  );
}

function EnlaceMenu({ item, destacado, colapsado, onEditar }: { item: ItemMenu; destacado?: boolean; colapsado?: boolean; onEditar: () => void }) {
  const presion = usePresionLarga(onEditar);
  return (
    <NavLink
      to={item.path}
      end={item.end}
      title={colapsado ? item.nombre : undefined}
      {...presion}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors select-none [-webkit-touch-callout:none] ${colapsado ? 'justify-center' : ''} ${
          isActive
            ? destacado
              ? 'bg-gradient-to-r from-purple-500/20 to-fuchsia-500/10 text-purple-200 border border-purple-500/20'
              : 'bg-slate-800/80 text-white'
            : destacado
              ? 'text-purple-300/80 hover:bg-slate-900'
              : 'text-slate-300 hover:bg-slate-900'
        }`
      }
    >
      <item.icon className="w-4 h-4 shrink-0" />
      {!colapsado && <span className="truncate">{item.nombre}</span>}
    </NavLink>
  );
}
