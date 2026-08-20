import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { PwaAuthProvider } from './contexts/PwaAuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { router } from './routes';

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
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  return (
    <ThemeProvider>
      <PwaAuthProvider>
        <RouterProvider router={router} />
        <Toaster position="top-center" richColors />
      </PwaAuthProvider>
    </ThemeProvider>
  );
}
