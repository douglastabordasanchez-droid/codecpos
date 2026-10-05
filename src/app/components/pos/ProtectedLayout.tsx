import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import POSLayoutSidebar from './POSLayoutSidebar';
import { CodecVerifyListener } from '../codecVerify/CodecVerifyListener';
import { AutoUpdateListener } from './AutoUpdateListener';
import { useRegistrarInstalacion } from '../../hooks/useRegistrarInstalacion';
import { useDeveloperShortcut } from '../../hooks/useDeveloperShortcut';
import { useSyncModulosNube } from '../../hooks/useSyncModulosNube';
import { useAvisoLicencia } from '../../hooks/useAvisoLicencia';
import { LanProvider } from '../../contexts/LanContext';
import { precargarModulosEnSegundoPlano } from '../../lib/prefetchModulos';
import { AvisoRetencionDatos } from '../retencion/AvisoRetencionDatos';

/**
 * Wrapper para proteger el layout y asegurar que el AuthContext esté disponible
 */
export default function ProtectedLayout() {
  const navigate = useNavigate();
  const { estaAutenticado } = useAuth();

  // 🔍 DIAGNÓSTICO TEMPORAL — flicker "Productos en Carrito" (reporte Papotas
  // 2026-09-16): instrumentación para detectar qué provoca que el contenido
  // principal desaparezca ~1s mientras el sidebar sigue visible. Quitar una
  // vez identificada la causa real.
  useEffect(() => {
    console.log('[MOUNT] ProtectedLayout', performance.now());
    return () => console.log('[UNMOUNT] ProtectedLayout', performance.now());
  }, []);

  useEffect(() => {
    console.log('[AUTH CHANGE] ProtectedLayout estaAutenticado =', estaAutenticado, performance.now());
  }, [estaAutenticado]);

  // ⚡ ATAJO DE TECLADO: Ctrl+Shift+D para Panel de Desarrollador
  useDeveloperShortcut();

  // ☁️ Recibe en caliente lo que el equipo hace desde el celular (comandas de
  // mesa, cambios de estado de órdenes de taller). No hace nada si esta
  // instalación no está vinculada a la nube.
  useSyncModulosNube();

  // 📡 Registra esta instalación (machine_id + versión) contra su propia
  // licencia -- Fase 5 ampliada, punto 34. No bloquea nada si falla.
  useRegistrarInstalacion();

  // 💳 Avisa cuando la licencia (prueba o plan pagado) está por vencer, para
  // que el dueño renueve antes de quedar bloqueado -- mismo aviso que ya
  // recibe la PWA.
  useAvisoLicencia();

  // Redirigir si no está autenticado
  useEffect(() => {
    // ✅ SIEMPRE redirigir al login si no está autenticado
    // Ya no verificamos configuracionInicial porque está SIEMPRE en false
    if (!estaAutenticado) {
      navigate('/login', { replace: true });
    }
  }, [estaAutenticado, navigate]);

  // ⚡ FIX FLUIDEZ (app compilada): precarga en ocioso los chunks de los
  // módulos del sidebar apenas hay sesión — ver comentario en
  // prefetchModulos.ts. En dev no se nota (Vite ya es rápido sirviendo cada
  // módulo), pero en la app instalada evita la lectura de disco/asar "en
  // frío" justo cuando el usuario hace clic por primera vez.
  useEffect(() => {
    if (estaAutenticado) precargarModulosEnSegundoPlano();
  }, [estaAutenticado]);

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
      <AvisoRetencionDatos />
    </LanProvider>
  );
}