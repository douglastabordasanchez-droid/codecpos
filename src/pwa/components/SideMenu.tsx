import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { X, LogOut, Sun, Moon, Crown, Zap } from 'lucide-react';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { useMenuPersonalizado, type ItemMenu } from '../hooks/useMenuPersonalizado';
import { HojaAccionesModulo, ModulosOcultos, usePresionLarga } from './EdicionMenu';
import { useTheme } from '../contexts/ThemeContext';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import logo from '/logo.png';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SideMenu({ open, onClose }: Props) {
  const navigate = useNavigate();
  const { empleado, cerrarSesion } = usePwaAuth();
  const { grupos, ocultos } = useMenuPersonalizado({ movil: true });
  const [editando, setEditando] = useState<{ item: ItemMenu; hermanos: string[] } | null>(null);
  const { tema, alternarTema } = useTheme();
  const [plan, setPlan] = useState<string | null>(null);

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

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px]"
          />
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="fixed inset-y-0 left-0 z-50 h-[100dvh] w-[80vw] max-w-[300px] overflow-y-auto border-r border-slate-800 bg-slate-950 pb-[env(safe-area-inset-bottom)]"
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
              {grupos.map((g) => {
                const visibles = g.items.filter((it) => !it.oculto);
                if (visibles.length === 0) return null;
                const hermanos = visibles.map((it) => it.path);
                return (
                  <div key={g.id}>
                    {g.titulo && <p className="px-2 mt-4 text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">{g.titulo}</p>}
                    {visibles.map((it) => (
                      <MenuItem key={it.path} item={it} destacado={g.destacado} onClick={() => ir(it.path)} onEditar={() => setEditando({ item: it, hermanos })} />
                    ))}
                  </div>
                );
              })}
              <div className="mt-4"><ModulosOcultos ocultos={ocultos} /></div>
              <p className="px-2 mt-3 text-[11px] text-slate-600">Mantén presionado un módulo para renombrarlo, moverlo u ocultarlo.</p>
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
          {editando && <HojaAccionesModulo item={editando.item} hermanos={editando.hermanos} onCerrar={() => setEditando(null)} />}
        </>
      )}
    </AnimatePresence>
  );
}

function MenuItem({ item, onClick, onEditar, destacado }: { item: ItemMenu; onClick: () => void; onEditar: () => void; destacado?: boolean }) {
  const presion = usePresionLarga(onEditar);
  return (
    <button
      onClick={onClick}
      {...presion}
      className={`w-full flex items-center gap-3 px-2 py-3 rounded-xl text-left transition-colors active:scale-[0.99] select-none [-webkit-touch-callout:none] ${
        destacado ? 'bg-gradient-to-r from-purple-500/15 to-fuchsia-500/10 border border-purple-500/20' : 'active:bg-slate-900'
      }`}
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${destacado ? 'bg-purple-500/15' : 'bg-slate-800'}`}>
        <item.icon className={`w-4.5 h-4.5 ${destacado ? 'text-purple-400' : 'text-slate-300'}`} />
      </div>
      <div className="min-w-0">
        <p className={`text-sm font-semibold truncate ${destacado ? 'text-purple-200' : 'text-white'}`}>{item.nombre}</p>
        {item.subtitulo && <p className="text-slate-500 text-xs truncate">{item.subtitulo}</p>}
      </div>
    </button>
  );
}
