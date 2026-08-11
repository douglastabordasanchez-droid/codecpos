import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, User, Receipt, Package, Lock, Wallet, RotateCcw, ScanLine,
  Settings, LogOut, Sun, Moon, Crown, Zap, ShieldAlert, Wrench, Coffee,
} from 'lucide-react';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { useModulosActivos } from '../hooks/useModulosActivos';
import { useTheme } from '../contexts/ThemeContext';
import { ModuloPOS } from '../../app/lib/permissions';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import logo from '/logo.png';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ItemMenu {
  icon: any;
  label: string;
  subtitulo?: string;
  path: string;
  modulo?: ModuloPOS;
  soloAdmin?: boolean;
  soloStaff?: boolean;
}

export function SideMenu({ open, onClose }: Props) {
  const navigate = useNavigate();
  const { empleado, cerrarSesion } = usePwaAuth();
  const { tieneModulo } = useModulosActivos();
  const { tema, alternarTema } = useTheme();
  const [plan, setPlan] = useState<string | null>(null);

  const esAdmin = !!empleado && ['admin', 'super_usuario'].includes(empleado.rol);

  useEffect(() => {
    if (!open || !empleado) return;
    const client = getSupabaseClient();
    client
      ?.from('clientes_pos')
      .select('plan')
      .eq('id', empleado.cliente_id)
      .maybeSingle()
      .then(({ data }) => setPlan((data as { plan: string } | null)?.plan || null));
  }, [open, empleado]);

  const ir = (path: string) => {
    onClose();
    navigate(path);
  };

  const principal: ItemMenu[] = [
    { icon: User, label: 'Mi perfil', path: '/perfil' },
    { icon: Receipt, label: 'Ventas', subtitulo: 'Historial y estadísticas del día', path: '/ventas' },
    { icon: Package, label: 'Inventario', subtitulo: 'Productos, stock y fotos', path: '/inventario', modulo: ModuloPOS.PRODUCTOS },
  ];

  // Módulos completos del negocio, activados desde Electron (Configuración →
  // Módulos en la App Web). Van antes de "Herramientas" porque para un mesero
  // o un técnico esta es su pantalla de trabajo, no un accesorio.
  const modulos: ItemMenu[] = [
    { icon: Coffee, label: 'Panadería y Onces', subtitulo: 'Mesas, comandas y pedidos del salón', path: '/panaderia', modulo: ModuloPOS.PANADERIA_ONCES },
    { icon: Wrench, label: 'Taller', subtitulo: 'Órdenes de reparación y estados', path: '/taller', modulo: ModuloPOS.TALLER_REPARACIONES },
  ];

  const herramientas: ItemMenu[] = [
    { icon: Lock, label: 'Caja', subtitulo: 'Apertura, cierre y turno activo', path: '/caja', modulo: ModuloPOS.CIERRE_CAJA },
    { icon: Wallet, label: 'Gastos', subtitulo: 'Gastos operativos registrados', path: '/gastos', modulo: ModuloPOS.GASTOS },
    { icon: RotateCcw, label: 'Devoluciones', subtitulo: 'Procesar devolución de una venta', path: '/devoluciones', modulo: ModuloPOS.DEVOLUCIONES },
    { icon: ScanLine, label: 'Escáner', subtitulo: 'Buscar producto por código de barras', path: '/escaner', modulo: ModuloPOS.PRODUCTOS },
  ];

  const administracion: ItemMenu[] = [
    { icon: Settings, label: 'Configuración', subtitulo: 'Datos del negocio y módulos', path: '/configuracion', soloAdmin: true },
  ];

  const plataforma: ItemMenu[] = [
    { icon: ShieldAlert, label: 'Panel Desarrollador', subtitulo: 'Administra todos los negocios', path: '/desarrollador', soloStaff: true },
  ];

  const visible = (it: ItemMenu) =>
    (!it.modulo || tieneModulo(it.modulo)) && (!it.soloAdmin || esAdmin) && (!it.soloStaff || empleado?.es_staff_codec);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-40"
          />
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="fixed top-0 left-0 bottom-0 w-[82%] max-w-sm bg-slate-950 border-r border-slate-800 z-50 overflow-y-auto"
          >
            <div className="px-5 pt-6 pb-5 border-b border-slate-800 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20 overflow-hidden">
                  <img src={logo} alt="CODEC" className="w-7 h-7 object-contain" />
                </div>
                <div>
                  <p className="text-white font-black text-base leading-tight">CODEC POS</p>
                  {plan && (
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide mt-0.5 ${plan === 'PREMIUM' ? 'text-amber-400' : 'text-sky-400'}`}>
                      {plan === 'PREMIUM' ? <Crown className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                      {plan === 'PREMIUM' ? 'Premium' : 'Básico'}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={onClose} className="text-slate-500 p-1" aria-label="Cerrar menú">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-3 py-4">
              <p className="px-2 text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">Principal</p>
              {principal.filter(visible).map((it) => <MenuItem key={it.path} item={it} onClick={() => ir(it.path)} />)}

              {modulos.some(visible) && (
                <>
                  <p className="px-2 mt-4 text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">Módulos</p>
                  {modulos.filter(visible).map((it) => <MenuItem key={it.path} item={it} onClick={() => ir(it.path)} />)}
                </>
              )}

              {herramientas.some(visible) && (
                <>
                  <p className="px-2 mt-4 text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">Herramientas</p>
                  {herramientas.filter(visible).map((it) => <MenuItem key={it.path} item={it} onClick={() => ir(it.path)} />)}
                </>
              )}

              {administracion.some(visible) && (
                <>
                  <p className="px-2 mt-4 text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">Administración</p>
                  {administracion.filter(visible).map((it) => <MenuItem key={it.path} item={it} onClick={() => ir(it.path)} destacado />)}
                </>
              )}

              {plataforma.some(visible) && (
                <>
                  <p className="px-2 mt-4 text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">Plataforma</p>
                  {plataforma.filter(visible).map((it) => <MenuItem key={it.path} item={it} onClick={() => ir(it.path)} destacado />)}
                </>
              )}
            </div>

            <div className="mt-auto px-3 pb-6 pt-2 border-t border-slate-800 space-y-1">
              <button
                onClick={alternarTema}
                className="w-full flex items-center justify-between gap-3 px-2 py-3 rounded-xl text-slate-300 active:bg-slate-900"
              >
                <span className="flex items-center gap-3 text-sm font-semibold">
                  {tema === 'dark' ? <Moon className="w-4 h-4 text-slate-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
                  Modo {tema === 'dark' ? 'oscuro' : 'claro'}
                </span>
                <span className={`w-10 h-6 rounded-full flex items-center px-0.5 transition-colors ${tema === 'dark' ? 'bg-slate-800' : 'bg-amber-500'}`}>
                  <span className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${tema === 'dark' ? 'translate-x-0' : 'translate-x-4'}`} />
                </span>
              </button>
              <button
                onClick={() => { onClose(); cerrarSesion(); }}
                className="w-full flex items-center gap-3 px-2 py-3 rounded-xl text-red-400 active:bg-slate-900 text-sm font-semibold"
              >
                <LogOut className="w-4 h-4" />
                Cerrar sesión
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function MenuItem({ item, onClick, destacado }: { item: ItemMenu; onClick: () => void; destacado?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-2 py-3 rounded-xl text-left transition-colors active:scale-[0.99] ${
        destacado ? 'bg-gradient-to-r from-purple-500/15 to-fuchsia-500/10 border border-purple-500/20' : 'active:bg-slate-900'
      }`}
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${destacado ? 'bg-purple-500/15' : 'bg-slate-800'}`}>
        <item.icon className={`w-4.5 h-4.5 ${destacado ? 'text-purple-400' : 'text-slate-300'}`} />
      </div>
      <div className="min-w-0">
        <p className={`text-sm font-semibold truncate ${destacado ? 'text-purple-200' : 'text-white'}`}>{item.label}</p>
        {item.subtitulo && <p className="text-slate-500 text-xs truncate">{item.subtitulo}</p>}
      </div>
    </button>
  );
}
