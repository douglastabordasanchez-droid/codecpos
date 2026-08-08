import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  User, LogOut, Sun, Moon,
  ShieldCheck, ShieldOff, Crown, Zap, PanelLeftClose, PanelLeftOpen, Bell,
} from 'lucide-react';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { useModulosActivos } from '../hooks/useModulosActivos';
import { useTheme } from '../contexts/ThemeContext';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { codecVerifyPwaActivo, alternarCodecVerifyPwa, suscribirNotificacionesPagoPwa } from '../lib/codecVerifyPwa';
import { NAV_PRINCIPAL as PRINCIPAL, NAV_HERRAMIENTAS as HERRAMIENTAS, NAV_ADMINISTRACION as ADMINISTRACION, NAV_PLATAFORMA as PLATAFORMA, ItemNavSidebar as ItemNav } from '../lib/sidebarNav';
import { esRutaOculta, EVENTO_SIDEBAR_OCULTOS_CAMBIADO } from '../lib/sidebarPrefs';
import logo from '/logo.png';

export function DesktopLayout() {
  const { empleado, cargando, cerrarSesion } = usePwaAuth();
  const { tieneModulo } = useModulosActivos();
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

  const esAdmin = !!empleado && ['admin', 'super_usuario'].includes(empleado.rol);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const actualizar = () => forceUpdate((n) => n + 1);
    window.addEventListener(EVENTO_SIDEBAR_OCULTOS_CAMBIADO, actualizar);
    return () => window.removeEventListener(EVENTO_SIDEBAR_OCULTOS_CAMBIADO, actualizar);
  }, []);

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

  const visible = (it: ItemNav) =>
    (!it.modulo || tieneModulo(it.modulo)) && (!it.soloAdmin || esAdmin) && (!it.soloStaff || empleado?.es_staff_codec) &&
    (it.fijo || !esRutaOculta(it.path));

  const toggleVerify = () => {
    const nuevo = alternarCodecVerifyPwa();
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
          <NavGroup label={null} items={PRINCIPAL.filter(visible)} colapsado={colapsado} />
          {HERRAMIENTAS.some(visible) && <NavGroup label="Herramientas" items={HERRAMIENTAS.filter(visible)} colapsado={colapsado} />}
          {ADMINISTRACION.some(visible) && <NavGroup label="Administración" items={ADMINISTRACION.filter(visible)} destacado colapsado={colapsado} />}
          {PLATAFORMA.some(visible) && <NavGroup label="Plataforma" items={PLATAFORMA.filter(visible)} destacado colapsado={colapsado} />}
        </nav>

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

function NavGroup({ label, items, destacado, colapsado }: { label: string | null; items: ItemNav[]; destacado?: boolean; colapsado?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div>
      {label && !colapsado && <p className="px-3 mb-1.5 text-slate-500 text-[10px] font-bold uppercase tracking-wider">{label}</p>}
      <div className="space-y-0.5">
        {items.map((it) => (
          <NavLink
            key={it.path}
            to={it.path}
            end={it.end}
            title={colapsado ? it.label : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${colapsado ? 'justify-center' : ''} ${
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
            <it.icon className="w-4 h-4 shrink-0" />
            {!colapsado && <span className="truncate">{it.label}</span>}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
