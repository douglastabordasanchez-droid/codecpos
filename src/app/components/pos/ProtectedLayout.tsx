import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import POSLayoutSidebar from './POSLayoutSidebar';
import { CodecVerifyListener } from '../codecVerify/CodecVerifyListener';
import { useDeveloperShortcut } from '../../hooks/useDeveloperShortcut';
import { useSyncModulosNube } from '../../hooks/useSyncModulosNube';
import { LanProvider } from '../../contexts/LanContext';

/**
 * Wrapper para proteger el layout y asegurar que el AuthContext esté disponible
 */
export default function ProtectedLayout() {
  const navigate = useNavigate();
  const { estaAutenticado, configuracionInicial } = useAuth();

  // ⚡ ATAJO DE TECLADO: Ctrl+Shift+D para Panel de Desarrollador
  useDeveloperShortcut();

  // ☁️ Recibe en caliente lo que el equipo hace desde el celular (comandas de
  // mesa, cambios de estado de órdenes de taller). No hace nada si esta
  // instalación no está vinculada a la nube.
  useSyncModulosNube();

  console.log('🔐 ProtectedLayout - Estado:', { estaAutenticado, configuracionInicial });

  // Redirigir si no está autenticado
  useEffect(() => {
    // ✅ SIEMPRE redirigir al login si no está autenticado
    // Ya no verificamos configuracionInicial porque está SIEMPRE en false
    if (!estaAutenticado) {
      console.log('🚫 Usuario no autenticado - Redirigiendo al login...');
      navigate('/login', { replace: true });
    } else {
      console.log('✅ Usuario autenticado - Mostrando layout');
    }
  }, [estaAutenticado, navigate]);

  // Si no está autenticado, mostrar loading mientras redirige
  if (!estaAutenticado) {
    console.log('⏳ Esperando autenticación...');
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-white text-lg font-semibold">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  console.log('✅ Renderizando POSLayoutSidebar...');

  // Si está autenticado, renderizar el layout
  // ✅ CodecVerifyListener ACTIVADO con optimizaciones
  return (
    <LanProvider>
      <POSLayoutSidebar />
      <CodecVerifyListener />
    </LanProvider>
  );
}