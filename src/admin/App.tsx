import { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router';
import { Loader2 } from 'lucide-react';
import { AdminAuthProvider, useAdminAuth } from './contexts/AdminAuthContext';
import { AdminLoginPage } from './components/AdminLoginPage';
import { AdminLayout } from './components/AdminLayout';
import { DashboardPage } from './pages/DashboardPage';
import { ClientesPage } from './pages/ClientesPage';
import { ClienteDetallePage } from './pages/ClienteDetallePage';
import { PlanesPage } from './pages/PlanesPage';
import { PromocionesPage } from './pages/PromocionesPage';
import { SucursalesPage } from './pages/SucursalesPage';
import { UsuariosPage } from './pages/UsuariosPage';
import { LicenciasPage } from './pages/LicenciasPage';
import { SoportePage } from './pages/SoportePage';
import { AuditoriaPage } from './pages/AuditoriaPage';

// Protección de rutas: sin sesión de staff -> login. La verificación real
// (es_staff_codec) ya ocurrió en AdminAuthContext -- si `staff` es null aquí
// (incluida una sesión que expiró en cualquier momento, detectado vía
// onAuthStateChange), no hay forma de ver ninguna ruta administrativa. Esto
// es solo la capa de UX: todo lo que estas páginas consultan/mutan también
// está protegido en el propio backend (RLS + `es_staff_actual()`), así que
// nunca se depende únicamente de ocultar la ruta.
function RutaProtegida({ children }: { children: ReactNode }) {
  const { staff, cargando } = useAdminAuth();
  const location = useLocation();

  if (cargando) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
      </div>
    );
  }
  if (!staff) {
    return <Navigate to="/login" replace state={{ desde: location.pathname }} />;
  }
  return <AdminLayout>{children}</AdminLayout>;
}

function RutasAdmin() {
  const { staff, cargando } = useAdminAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={cargando ? null : staff ? <Navigate to="/" replace /> : <AdminLoginPage />}
      />
      <Route path="/" element={<RutaProtegida><DashboardPage /></RutaProtegida>} />
      <Route path="/clientes" element={<RutaProtegida><ClientesPage /></RutaProtegida>} />
      <Route path="/clientes/:id" element={<RutaProtegida><ClienteDetallePage /></RutaProtegida>} />
      <Route path="/planes" element={<RutaProtegida><PlanesPage /></RutaProtegida>} />
      <Route path="/promociones" element={<RutaProtegida><PromocionesPage /></RutaProtegida>} />
      <Route path="/sucursales" element={<RutaProtegida><SucursalesPage /></RutaProtegida>} />
      <Route path="/usuarios" element={<RutaProtegida><UsuariosPage /></RutaProtegida>} />
      <Route path="/licencias" element={<RutaProtegida><LicenciasPage /></RutaProtegida>} />
      <Route path="/soporte" element={<RutaProtegida><SoportePage /></RutaProtegida>} />
      <Route path="/auditoria" element={<RutaProtegida><AuditoriaPage /></RutaProtegida>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    // basename '/admin': comparte dominio con la PWA ('/app') y la landing
    // ('/') — mismo patrón, ver vite.config.admin.ts (base '/admin/') y
    // vercel.json para el resto del despliegue.
    <BrowserRouter basename="/admin">
      <AdminAuthProvider>
        <RutasAdmin />
      </AdminAuthProvider>
    </BrowserRouter>
  );
}
