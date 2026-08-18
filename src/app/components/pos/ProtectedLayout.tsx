import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import POSLayoutSidebar from './POSLayoutSidebar';
import { CodecVerifyListener } from '../codecVerify/CodecVerifyListener';
import { AutoUpdateListener } from './AutoUpdateListener';
import { useRegistrarInstalacion } from '../../hooks/useRegistrarInstalacion';
import { useDeveloperShortcut } from '../../hooks/useDeveloperShortcut';
import { useSyncModulosNube } from '../../hooks/useSyncModulosNube';
import { LanProvider } from '../../contexts/LanContext';

/**
 * Wrapper para proteger el layout y asegurar que el AuthContext esté disponible
 */
export default function ProtectedLayout() {
  const navigate = useNavigate();
  const { estaAutenticado } = useAuth();

  // ⚡ ATAJO DE TECLADO: Ctrl+Shift+D para Panel de Desarrollador
  useDeveloperShortcut();

  // ☁️ Recibe en caliente lo que el equipo hace desde el celular (comandas de
  // mesa, cambios de estado de órdenes de taller). No hace nada si esta
  // instalación no está vinculada a la nube.
  useSyncModulosNube();

  // 📡 Registra esta instalación (machine_id + versión) contra su propia
  // licencia -- Fase 5 ampliada, punto 34. No bloquea nada si falla.
  useRegistrarInstalacion();

  // Redirigir si no está autenticado
  useEffect(() => {
    // ✅ SIEMPRE redirigir al login si no está autenticado
    // Ya no verificamos configuracionInicial porque está SIEMPRE en false
    if (!estaAutenticado) {
      navigate('/login', { replace: true });
    }
  }, [estaAutenticado, navigate]);

  // Si no está autenticado, mostrar loading mientras redirige
  if (!estaAutenticado) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-white text-lg font-semibold">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  // Si está autenticado, renderizar el layout
  // ✅ CodecVerifyListener ACTIVADO con optimizaciones
  return (
    <LanProvider>
      <POSLayoutSidebar />
      <CodecVerifyListener />
      <AutoUpdateListener />
    </LanProvider>
  );
}