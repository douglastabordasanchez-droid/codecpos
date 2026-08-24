import { RouterProvider } from 'react-router';
import { router } from './routes-pos';
import { Toaster } from 'sonner';
import { POSProvider } from './contexts/POSContext';
import { AuthProvider } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MultitiendaProvider } from './contexts/MultitiendaContext';
import { DeviceProvider } from './contexts/DeviceContext';
import { BusinessProvider } from './contexts/BusinessContext';
import { useState, useEffect, lazy, Suspense } from 'react';

// ⚡ FIX ARRANQUE: SetupWizard solo se ve una vez (primera instalación) pero
// antes se importaba de forma estática, así que su código (y sus animaciones)
// se cargaban y parseaban en TODOS los arranques, para todos los usuarios,
// aunque nunca lo vuelvan a ver. Con lazy() queda fuera del paquete principal.
const SetupWizard = lazy(() => import('./pages/SetupWizard').then(m => ({ default: m.SetupWizard })));

// 🔐 Inicializar clientes de prueba automáticamente
const inicializarClientesPrueba = () => {
  const STORAGE_KEY = 'codecpos_dev_clientes';
  const clientesExistentes = localStorage.getItem(STORAGE_KEY);
  
  if (!clientesExistentes) {
    console.log('🎯 Inicializando clientes de PRUEBA...');
    
    const clientesPrueba = [
      {
        id: 'cliente_demo_1',
        nombreNegocio: 'Tienda Básica Anual',
        nit: '900111111-1',
        contacto: 'Demo Usuario 1',
        telefono: '3001234567',
        email: 'basico.anual@demo.com',
        usuario: 'basico1',
        contraseña: 'demo123',
        plan: 'BASICO',
        duracion: '1_ANO',
        machineId: 'MACHINE-DEMO-BASICO-ANUAL-001',
        estado: 'ACTIVA',
        fechaActivacion: new Date().toISOString(),
        fechaExpiracion: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        licenseKey: 'CODEC-BAS-DEMO-A1B2',
        createdAt: Date.now(),
        enPrueba: false,
        diasPruebaRestantes: 0,
      },
      {
        id: 'cliente_demo_2',
        nombreNegocio: 'Negocio Básico Vitalicio',
        nit: '900222222-2',
        contacto: 'Demo Usuario 2',
        telefono: '3002345678',
        email: 'basico.vitalicio@demo.com',
        usuario: 'basico2',
        contraseña: 'demo123',
        plan: 'BASICO',
        duracion: 'VITALICIA',
        machineId: 'MACHINE-DEMO-BASICO-VITAL-002',
        estado: 'ACTIVA',
        fechaActivacion: new Date().toISOString(),
        fechaExpiracion: undefined,
        licenseKey: 'CODEC-BAS-VITAL-C3D4',
        createdAt: Date.now(),
        enPrueba: false,
        diasPruebaRestantes: 0,
      },
      {
        id: 'cliente_demo_3',
        nombreNegocio: 'SuperTienda Premium Anual',
        nit: '900333333-3',
        contacto: 'Demo Usuario 3',
        telefono: '3003456789',
        email: 'premium.anual@demo.com',
        usuario: 'premium1',
        contraseña: 'demo123',
        plan: 'PREMIUM',
        duracion: '1_ANO',
        machineId: 'MACHINE-DEMO-PREMIUM-ANUAL-003',
        estado: 'ACTIVA',
        fechaActivacion: new Date().toISOString(),
        fechaExpiracion: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        licenseKey: 'CODEC-PREM-DEMO-E5F6',
        createdAt: Date.now(),
        enPrueba: false,
        diasPruebaRestantes: 0,
      },
      {
        id: 'cliente_demo_4',
        nombreNegocio: 'Mega Mercado Premium Vitalicio',
        nit: '900444444-4',
        contacto: 'Demo Usuario 4',
        telefono: '3004567890',
        email: 'premium.vitalicio@demo.com',
        usuario: 'premium2',
        contraseña: 'demo123',
        plan: 'PREMIUM',
        duracion: 'VITALICIA',
        machineId: 'MACHINE-DEMO-PREMIUM-VITAL-004',
        estado: 'ACTIVA',
        fechaActivacion: new Date().toISOString(),
        fechaExpiracion: undefined,
        licenseKey: 'CODEC-PREM-VITAL-G7H8',
        createdAt: Date.now(),
        enPrueba: false,
        diasPruebaRestantes: 0,
      },
      {
        id: 'cliente_demo_5',
        nombreNegocio: 'Prueba 7 Días FULL',
        nit: '900555555-5',
        contacto: 'Demo Usuario Trial',
        telefono: '3005555555',
        email: 'trial@demo.com',
        usuario: 'trial',
        contraseña: 'demo123',
        plan: 'PREMIUM',
        duracion: '1_MES',
        machineId: 'MACHINE-DEMO-TRIAL-005',
        estado: 'ACTIVA',
        fechaActivacion: new Date().toISOString(),
        fechaExpiracion: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 días
        licenseKey: 'CODEC-TRIAL-FULL-DEMO',
        createdAt: Date.now(),
        enPrueba: true,
        diasPruebaRestantes: 7,
      },
    ];
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clientesPrueba));
    console.log('✅ Clientes de PRUEBA creados automáticamente:', clientesPrueba);
  } else {
    console.log('ℹ️ Clientes de prueba ya existen');
  }
};

// Ejecutar inicialización ANTES de renderizar
inicializarClientesPrueba();

// 🚀 Marcar setup como completado para evitar wizard intrusivo
const marcarSetupCompletado = () => {
  const setupCompleted = localStorage.getItem('codecpos_setup');
  if (!setupCompleted) {
    localStorage.setItem('codecpos_setup', JSON.stringify({
      completed: true,
      autoConfigured: true,
      timestamp: new Date().toISOString(),
    }));
    console.log('✅ Setup marcado como completado automáticamente');
  }
};
marcarSetupCompletado();

function App() {
  console.log('🚀 App.tsx - Iniciando aplicación...');
  // ⚡ Antes 'isChecking' arrancaba en true y solo se resolvía en un
  // useEffect (que corre DESPUÉS del primer pintado) — eso forzaba un frame
  // de spinner "Iniciando CODEC POS..." incluso en el caso normal de todos
  // los días (setup ya completado). localStorage ya está disponible de
  // forma síncrona al montar, así que se calcula ahí directamente.
  const [showSetup, setShowSetup] = useState(() => !localStorage.getItem('codecpos_initial_setup_complete'));
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (showSetup) {
      console.log('🎯 Primera vez - Mostrando Setup Wizard');
    } else {
      console.log('✅ Setup ya completado - Cargando aplicación normal');
    }
  }, [showSetup]);

  const handleSetupComplete = () => {
    console.log('✅ Setup completado - Redirigiendo a aplicación');
    setShowSetup(false);
    
    // Forzar inicialización de clientes de prueba después del setup
    inicializarClientesPrueba();
    marcarSetupCompletado();
  };

  // Mostrar loading mientras verifica
  if (isChecking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Iniciando CODEC POS...</p>
        </div>
      </div>
    );
  }

  // Mostrar Setup Wizard si es primera vez
  if (showSetup) {
    return (
      <Suspense fallback={null}>
        <SetupWizard onComplete={handleSetupComplete} />
      </Suspense>
    );
  }

  // Aplicación normal
  try {
    return (
      <ErrorBoundary>
        <AuthProvider>
          <BusinessProvider>
          <POSProvider>
            <DeviceProvider>
            <MultitiendaProvider>
              <RouterProvider router={router} />
              <Toaster
                position="top-right"
                richColors
                duration={3000}
                closeButton
                expand={false}
                visibleToasts={3}
              />
            </MultitiendaProvider>
            </DeviceProvider>
          </POSProvider>
          </BusinessProvider>
        </AuthProvider>
      </ErrorBoundary>
    );
  } catch (error) {
    console.error('❌ ERROR CRÍTICO en App.tsx:', error);
    return (
      <div className="min-h-screen bg-red-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-8 max-w-2xl">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error al cargar la aplicación</h1>
          <p className="text-gray-700 mb-4">
            Ocurrió un error al inicializar CODEC POS.
          </p>
          <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
            {error instanceof Error ? error.message : String(error)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600"
          >
            Recargar Aplicación
          </button>
        </div>
      </div>
    );
  }
}

export default App;