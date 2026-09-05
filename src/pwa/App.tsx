import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { PwaAuthProvider, usePwaAuth } from './contexts/PwaAuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { router } from './routes';
import { useAutoLock } from './hooks/useAutoLock';
import { useComandaAlerts } from './hooks/useComandaAlerts';
import LockScreen from './components/LockScreen';

/** Separado de App() porque usePwaAuth() necesita estar DENTRO de PwaAuthProvider. */
function ContenidoConBloqueo() {
  const { empleado } = usePwaAuth();
  const { bloqueado, desbloquear } = useAutoLock(empleado?.id);
  useComandaAlerts();

  if (empleado && bloqueado) {
    return <LockScreen empleadoId={empleado.id} onDesbloqueado={desbloquear} />;
  }

  return <RouterProvider router={router} />;
}

export default function App() {
  // Safari/iOS en modo standalone (agregada a pantalla de inicio) no recarga
  // la página al volver a abrirla desde el ícono -- WebKit la restaura
  // congelada desde el bfcache con el mismo estado de React que tenía antes
  // de pasar a segundo plano. Sin esto, una pantalla que se abrió cuando
  // todavía no había datos (p. ej. Ventas antes de que Electron terminara de
  // sincronizar) se queda mostrando ese estado vacío indefinidamente, porque
  // ningún useEffect vuelve a correr. Forzar un reload real cuando el evento
  // trae persisted=true replica lo que Chrome/Android sí hace solo.
  useEffect(() => {
    const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!esIOS) return;

    // WebKit puede reanudar una PWA suspendida sin disparar `pageshow` ni
    // volver a montar React. Al regresar desde segundo plano se hace un pull
    // inicial nuevo desde Supabase, igual que cuando Android abre la PWA.
    let estuvoEnSegundoPlano = document.visibilityState === 'hidden';
    const recargarDatosCentrales = () => {
      if (document.visibilityState !== 'visible' || !estuvoEnSegundoPlano || !navigator.onLine) return;
      estuvoEnSegundoPlano = false;
      window.location.reload();
    };
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'hidden') {
        estuvoEnSegundoPlano = true;
        return;
      }
      recargarDatosCentrales();
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };

    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('online', recargarDatosCentrales);
    return () => {
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('online', recargarDatosCentrales);
    };
  }, []);

  return (
    <ThemeProvider>
      <PwaAuthProvider>
        <ContenidoConBloqueo />
        <Toaster position="top-center" richColors />
      </PwaAuthProvider>
    </ThemeProvider>
  );
}
