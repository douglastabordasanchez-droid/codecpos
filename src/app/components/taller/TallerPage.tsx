import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wrench, List, BarChart3, Power } from 'lucide-react';
import RecepcionDispositivoForm from './RecepcionDispositivoForm';
import ListaOrdenesTaller from './ListaOrdenesTaller';
import DetalleOrdenTaller from './DetalleOrdenTaller';
import DashboardTaller from './DashboardTaller';
import type { OrdenServicio } from '../../types/taller';
import { usePOS } from '../../contexts/POSContext';
import type { NuevaReparacionPayload } from '../../lib/lanService';

type Vista = 'lista' | 'dashboard';

export default function TallerPage() {
  const { darkMode } = usePOS();
  const STORAGE_MODULO_TALLER = 'codecpos_taller_reparaciones_activo';
  const [vistaActual, setVistaActual] = useState<Vista>('lista');
  const [mostrarRecepcion, setMostrarRecepcion] = useState(false);
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<OrdenServicio | null>(null);
  const [actualizarKey, setActualizarKey] = useState(0);
  const [moduloTallerActivo, setModuloTallerActivo] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_MODULO_TALLER);
      return raw === null ? true : raw === 'true';
    } catch { return true; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_MODULO_TALLER, String(moduloTallerActivo)); } catch {}
  }, [moduloTallerActivo]);

  const handleVerDetalle = (orden: OrdenServicio) => setOrdenSeleccionada(orden);
  const handleCerrarDetalle = () => { setOrdenSeleccionada(null); setActualizarKey((p) => p + 1); };
  const handleNuevaOrden = () => setMostrarRecepcion(true);
  const handleCerrarRecepcion = () => setMostrarRecepcion(false);
  const handleSuccessRecepcion = () => setActualizarKey((p) => p + 1);

  // ── Actualización en caliente del Kanban por eventos LAN ────────────────────
  useEffect(() => {
    // Nueva reparación asignada → refrescar lista
    const handlerNueva = (e: Event) => {
      const payload = (e as CustomEvent<NuevaReparacionPayload>).detail;
      console.log('[TallerPage] Nueva reparación LAN:', payload.numeroOrden);
      setActualizarKey((p) => p + 1);
    };
    // Cambio de estado por el técnico → refrescar lista en cajera/admin
    const handlerEstado = (e: Event) => {
      const payload = (e as CustomEvent<Record<string, unknown>>).detail;
      console.log('[TallerPage] Estado LAN actualizado:', payload.numeroOrden, '→', payload.nuevoEstado);
      setActualizarKey((p) => p + 1);
    };
    window.addEventListener('lan:nueva-reparacion', handlerNueva);
    window.addEventListener('lan:taller-estado-cambio', handlerEstado);
    return () => {
      window.removeEventListener('lan:nueva-reparacion', handlerNueva);
      window.removeEventListener('lan:taller-estado-cambio', handlerEstado);
    };
  }, []);

  const toggleModuloTaller = () => {
    const nuevo = !moduloTallerActivo;
    setModuloTallerActivo(nuevo);
    localStorage.setItem(STORAGE_MODULO_TALLER, String(nuevo));
    window.dispatchEvent(new Event('codecpos-taller-reparaciones-toggle'));
  };

  return (
    <div
      className={`h-full overflow-y-auto ${darkMode ? 'bg-transparent' : 'bg-slate-50'}`}
      style={{ scrollbarWidth: 'thin' }}
    >
      {/* ── Premium Tech Header ─────────────────────────────────────────── */}
      <div className={`relative overflow-hidden ${
        darkMode
          ? 'bg-gradient-to-r from-slate-900 via-blue-950/30 to-slate-900 border-b border-slate-800/80'
          : 'bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-xl shadow-slate-100/50'
      }`}>
        {/* Ambient glows */}
        <div className="absolute inset-0 pointer-events-none">
          <div className={`absolute -top-20 right-0 w-80 h-80 rounded-full blur-3xl ${darkMode ? 'bg-blue-600/8' : 'bg-blue-50/80'}`} />
          <div className={`absolute bottom-0 left-10 w-48 h-32 rounded-full blur-2xl ${darkMode ? 'bg-indigo-600/6' : 'bg-indigo-50/60'}`} />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 pt-5 flex items-center justify-between gap-4">
          {/* Left: logo + title */}
          <div className="flex items-center gap-4">
            <div className={`relative p-3 rounded-2xl flex-shrink-0 ${
              darkMode
                ? 'bg-blue-600/15 border border-blue-500/25 shadow-[0_0_28px_rgba(59,130,246,0.2)]'
                : 'bg-blue-600/10 border border-blue-200 shadow-lg shadow-blue-100/60'
            }`}>
              <Wrench className={`w-7 h-7 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
            </div>
            <div>
              <h1 className={`text-2xl font-black tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Taller de Reparaciones
              </h1>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Gestión profesional de órdenes de servicio técnico
              </p>
            </div>
          </div>

          {/* Right: module toggle */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${moduloTallerActivo ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
              <span className={`text-sm font-bold hidden sm:block ${moduloTallerActivo ? 'text-emerald-400' : 'text-red-500'}`}>
                {moduloTallerActivo ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            <button
              onClick={toggleModuloTaller}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                moduloTallerActivo
                  ? darkMode
                    ? 'bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 border border-emerald-500/30'
                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                  : darkMode
                    ? 'bg-red-600/15 hover:bg-red-600/25 text-red-400 border border-red-500/30'
                    : 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
              }`}
            >
              <Power className="w-4 h-4" />
              {moduloTallerActivo ? 'Apagar' : 'Encender'}
            </button>
          </div>
        </div>

        {/* Animated tab nav */}
        <div className="relative max-w-7xl mx-auto px-6 flex gap-0 mt-3">
          {([
            { key: 'lista' as Vista, label: 'Órdenes', icon: List },
            { key: 'dashboard' as Vista, label: 'Dashboard', icon: BarChart3 },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setVistaActual(key)}
              className={`relative px-6 py-2.5 flex items-center gap-2 text-sm font-semibold transition-colors rounded-t-xl ${
                vistaActual === key
                  ? darkMode ? 'text-blue-400' : 'text-blue-600'
                  : darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {vistaActual === key && (
                <motion.div
                  layoutId="taller-tab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-blue-500"
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto p-6">
        <AnimatePresence mode="wait">
          {vistaActual === 'lista' && (
            <motion.div
              key="lista"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.18 }}
            >
              <ListaOrdenesTaller
                key={actualizarKey}
                onVerDetalle={handleVerDetalle}
                onNuevaOrden={handleNuevaOrden}
              />
            </motion.div>
          )}
          {vistaActual === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.18 }}
            >
              <DashboardTaller key={actualizarKey} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {mostrarRecepcion && (
          <RecepcionDispositivoForm
            onClose={handleCerrarRecepcion}
            onSuccess={handleSuccessRecepcion}
          />
        )}
        {ordenSeleccionada && (
          <DetalleOrdenTaller
            ordenId={ordenSeleccionada.id}
            onClose={handleCerrarDetalle}
            onActualizar={() => setActualizarKey((p) => p + 1)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
