import { useState } from 'react';
import { Outlet, Navigate } from 'react-router';
import { Loader2 } from 'lucide-react';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { BottomNav } from './BottomNav';
import { TopBar } from './TopBar';
import { DesktopLayout } from './DesktopLayout';
import { useIsDesktop } from '../hooks/useIsDesktop';

/**
 * Mismo enlace, misma app, mismo login — en pantallas ≥1024px (12" en
 * adelante) se ve como el sistema de escritorio (sidebar, como Electron);
 * en celular sigue el shell de bottom nav de siempre. Ninguna página ni
 * servicio cambia, solo la navegación que las envuelve.
 */
export function PwaLayout() {
  const { empleado, cargando } = usePwaAuth();
  const esEscritorio = useIsDesktop();
  const [navInferiorVisible, setNavInferiorVisible] = useState(true);

  if (cargando) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
      </div>
    );
  }

  if (!empleado) {
    return <Navigate to="/login" replace />;
  }

  if (esEscritorio) {
    return <DesktopLayout />;
  }

  return (
    <>
      <TopBar navInferiorVisible={navInferiorVisible} onToggleNavInferior={() => setNavInferiorVisible((v) => !v)} />
      <Outlet />
      {navInferiorVisible && <BottomNav />}
    </>
  );
}
