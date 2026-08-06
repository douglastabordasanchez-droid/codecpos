// Se usa createHashRouter (no createBrowserRouter) porque en producción la
// app se carga vía loadFile() con protocolo file:// — con History API
// (pushState) el pathname real pasa a ser la ruta del archivo en disco, que
// no coincide con ninguna ruta definida y el router no renderiza nada
// (pantalla en blanco). El hash router evita esto por completo.
import { createHashRouter, Navigate } from 'react-router';
import { lazy, Suspense, ReactNode } from 'react';

import ProtectedLayout from './components/pos/ProtectedLayout';
import { PlanProtectedRoute } from './components/auth/PlanProtectedRoute';
import { useAuth } from './contexts/AuthContext';
import { esModuloActivoGlobal, ModuloPOS } from './lib/permissions';

// Lazy loading de componentes
const POSPage = lazy(() => import('./components/pos/POSPageNew'));
const ProductosPage = lazy(() => import('./components/pos/ProductosPage'));
const VentasPage = lazy(() => import('./components/pos/VentasPage'));
const DashboardPOSPage = lazy(() => import('./components/pos/DashboardPOSPage'));
const AlertasPage = lazy(() => import('./components/pos/AlertasPage'));
const ConfiguracionPage = lazy(() => import('./components/pos/ConfiguracionPage'));
const CierreCajaPage = lazy(() => import('./components/pos/CierreCajaPage'));
const ReportesPage = lazy(() => import('./components/pos/ReportesPage'));
const GastosPage = lazy(() => import('./components/pos/GastosPage'));
const ContabilidadPage = lazy(() => import('./components/pos/ContabilidadPage'));
const DevolucionesPage = lazy(() => import('./components/pos/DevolucionesPage'));
const DispositivosPage = lazy(() => import('./components/devices/DispositivosPage'));
const UsuariosPage = lazy(() => import('./components/usuarios/UsuariosPage').then(m => ({ default: m.UsuariosPage })).catch(() => ({ default: () => <div>Error cargando Usuarios</div> })));
const CodecVerifyConexionPage = lazy(() => import('./components/codecVerify/CodecVerifyConexionPage'));
const DeveloperPanel = lazy(() => import('./components/developer/DeveloperPanel').then(m => ({ default: m.DeveloperPanel })).catch(() => ({ default: () => <div>Error cargando Developer</div> })));
const StaffLoginGate = lazy(() => import('./components/developer/StaffLoginGate').then(m => ({ default: m.StaffLoginGate })));
// ✅ NUEVAS FUNCIONALIDADES AVANZADAS
const FidelizacionPage = lazy(() => import('./pages/FidelizacionPage'));
const ProveedoresPage = lazy(() => import('./pages/ProveedoresPage'));
const PromocionesPage = lazy(() => import('./pages/PromocionesPage'));
const MultitiendaPage = lazy(() => import('./pages/MultitiendaPage'));
const CodigosBarrasPage = lazy(() => import('./pages/CodigosBarrasPageFull'));
const IntegracionesPage = lazy(() => import('./pages/IntegracionesPage'));
const TallerPage = lazy(() => import('./components/taller/TallerPage'));
const PanaderiaOncesPage = lazy(() => import('./components/pos/PanaderiaOncesPage'));
const MonitoreoTerminalesPage = lazy(() => import('./components/monitoreo/MonitoreoTerminalesPage'));

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-white text-lg font-semibold">Cargando POS...</p>
      </div>
    </div>
  );
}

function ModuleProtectedRoute({ modulo, children }: { modulo: ModuloPOS; children: ReactNode }) {
  const { esDesarrollador, usuarioActual } = useAuth();
  const esSuperUsuario = usuarioActual?.rol === 'super_usuario';

  // Developer y super_usuario: acceso irrestricto a cualquier módulo
  if (esDesarrollador || esSuperUsuario) return <>{children}</>;

  // Usuarios con módulos explícitamente asignados: si el módulo está en su lista, se permite
  const modulosExplicitos = new Set((usuarioActual?.modulosActivos || []) as string[]);
  if (modulosExplicitos.size > 0 && modulosExplicitos.has(modulo)) return <>{children}</>;

  // Verificación global como último recurso
  if (!esModuloActivoGlobal(modulo)) {
    return <Navigate to="/pos" replace />;
  }

  return <>{children}</>;
}

// ✅ LOGIN WRAPPER: usa logoutKey para forzar re-mount limpio en cada logout
function LoginWrapper() {
  const { logoutKey } = useAuth();
  const LoginPage = lazy(() => import('./components/auth/LoginPage'));
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LoginPage key={logoutKey} />
    </Suspense>
  );
}

function DeveloperRouteGuard() {
  const { esDesarrollador } = useAuth();

  // 🛡️ Ya no depende de una sesión POS previa ni de una contraseña maestra
  // compartida: el staff de Codec Studio se autentica con su propia cuenta
  // de Supabase Auth (ver StaffLoginGate / iniciarSesionStaff en AuthContext).
  if (!esDesarrollador) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <StaffLoginGate />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <DeveloperPanel />
    </Suspense>
  );
}

export const router = createHashRouter([
  {
    path: '/login',
    element: <LoginWrapper />,
  },
  {
    path: '/',
    element: <ProtectedLayout />,
    children: [
      { index: true, element: <Navigate to="/pos" replace /> },
      {
        // 🛡️ El Panel de Administración ahora vive DENTRO del layout normal
        // del POS (misma barra lateral, misma navegación) en vez de abrirse
        // como un modal flotante aparte — página completa, conectado con
        // todo el sistema, sin perder el contexto de navegación.
        path: 'developer',
        element: <DeveloperRouteGuard />,
      },
      {
        path: 'pos',
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <POSPage />
          </Suspense>
        )
      },
      { 
        path: 'productos', 
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <ProductosPage />
          </Suspense>
        ) 
      },
      { 
        path: 'ventas', 
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <VentasPage />
          </Suspense>
        ) 
      },
      { 
        path: 'dashboard', 
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <PlanProtectedRoute
              requiredFeature="dashboard"
              featureName="Dashboard Ejecutivo"
              featureDescription="Métricas avanzadas, análisis en tiempo real y reportes visuales completos"
            >
              <DashboardPOSPage />
            </PlanProtectedRoute>
          </Suspense>
        ) 
      },
      { 
        path: 'alertas', 
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <AlertasPage />
          </Suspense>
        ) 
      },
      {
        path: 'usuarios',
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <UsuariosPage />
          </Suspense>
        )
      },
      { 
        path: 'configuracion', 
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <ConfiguracionPage />
          </Suspense>
        ) 
      },
      { 
        path: 'cierre-caja', 
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <CierreCajaPage />
          </Suspense>
        ) 
      },
      { 
        path: 'reportes', 
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <ReportesPage />
          </Suspense>
        ) 
      },
      {
        path: 'gastos',
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <GastosPage />
          </Suspense>
        )
      },
      {
        path: 'contabilidad',
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <ContabilidadPage />
          </Suspense>
        )
      },
      { 
        path: 'devoluciones', 
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <DevolucionesPage />
          </Suspense>
        ) 
      },
      { 
        path: 'dispositivos', 
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <DispositivosPage />
          </Suspense>
        ) 
      },
      { 
        path: 'codec-verify',
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <PlanProtectedRoute
              requiredFeature="codec_verify"
              featureName="Codec Verify PRO"
              featureDescription="Sistema avanzado de notificaciones en tiempo real para pagos móviles (Nequi, Daviplata, Bancolombia)"
            >
              <CodecVerifyConexionPage />
            </PlanProtectedRoute>
          </Suspense>
        )
      },
      // ✅ NUEVAS FUNCIONALIDADES AVANZADAS
      { 
        path: 'fidelizacion', 
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <FidelizacionPage />
          </Suspense>
        ) 
      },
      { 
        path: 'proveedores', 
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <ProveedoresPage />
          </Suspense>
        ) 
      },
      { 
        path: 'promociones', 
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <PromocionesPage />
          </Suspense>
        ) 
      },
      { 
        path: 'multitienda', 
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <MultitiendaPage />
          </Suspense>
        ) 
      },
      { 
        path: 'codigos-barras', 
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <CodigosBarrasPage />
          </Suspense>
        ) 
      },
      {
        path: 'integraciones',
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <IntegracionesPage />
          </Suspense>
        )
      },
      {
        path: 'taller',
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <ModuleProtectedRoute modulo={ModuloPOS.TALLER_REPARACIONES}>
              <TallerPage />
            </ModuleProtectedRoute>
          </Suspense>
        )
      },
      {
        path: 'panaderia-onces',
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <ModuleProtectedRoute modulo={ModuloPOS.PANADERIA_ONCES}>
              <PanaderiaOncesPage />
            </ModuleProtectedRoute>
          </Suspense>
        )
      },
      {
        path: 'monitoreo',
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <ModuleProtectedRoute modulo={ModuloPOS.MONITOREO_TERMINALES}>
              <MonitoreoTerminalesPage />
            </ModuleProtectedRoute>
          </Suspense>
        )
      },
      { path: '*', element: <Navigate to="/pos" replace /> },
    ],
  },
]);
