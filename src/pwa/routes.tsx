import { createBrowserRouter, Navigate } from 'react-router';
import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { PwaLayout } from './components/PwaLayout';
import { ModuloGate } from './components/ModuloGate';
import { ModuloPOS } from '../app/lib/permissions';
import LoginPage from './pages/LoginPage';
import RegistroPage from './pages/RegistroPage';
import PruebaGratisPage from './pages/PruebaGratisPage';
import InicioPage from './pages/InicioPage';
import PagoResultadoPage from './pages/PagoResultadoPage';

// ⚡ Antes cada página se importaba de forma estática: TODO (recharts,
// jspdf, xlsx, zxing para el escáner, etc.) viajaba en un único bundle de
// arranque. Al agregar Dashboard/Reportes ese bundle pasó de 1.8MB a 2.5MB
// y el service worker ni siquiera pudo generarse (límite de precache de
// Workbox, 2MB). Cada página pesada ahora carga solo cuando se visita —
// mismo patrón que ya usa Electron en routes-pos.tsx.
function lazyConReintento<T extends ComponentType<any>>(cargar: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const modulo = await cargar();
      sessionStorage.removeItem('codecpos-pwa-chunk-retry');
      return modulo;
    } catch (error) {
      if (!sessionStorage.getItem('codecpos-pwa-chunk-retry')) {
        sessionStorage.setItem('codecpos-pwa-chunk-retry', '1');
        window.location.reload();
      }
      throw error;
    }
  });
}

const VentasPage = lazyConReintento(() => import('./pages/VentasPage'));
const PagosPage = lazyConReintento(() => import('./pages/PagosPage'));
const AlertasPage = lazyConReintento(() => import('./pages/AlertasPage'));
const InventarioPage = lazyConReintento(() => import('./pages/InventarioPage'));
const ProductoFormPage = lazyConReintento(() => import('./pages/ProductoFormPage'));
const EscanerPage = lazyConReintento(() => import('./pages/EscanerPage'));
const PerfilPage = lazyConReintento(() => import('./pages/PerfilPage'));
const ConfiguracionPage = lazyConReintento(() => import('./pages/ConfiguracionPage'));
const PlanesPage = lazyConReintento(() => import('./pages/PlanesPage'));
const VenderPage = lazyConReintento(() => import('./pages/VenderPage'));
const GastosPage = lazyConReintento(() => import('./pages/GastosPage'));
const DevolucionesPage = lazyConReintento(() => import('./pages/DevolucionesPage'));
const CierreCajaPage = lazyConReintento(() => import('./pages/CierreCajaPage'));
const PanelDesarrolladorPage = lazyConReintento(() => import('./pages/PanelDesarrolladorPage'));
const FacturacionPage = lazyConReintento(() => import('./pages/FacturacionPage'));
const TallerPage = lazyConReintento(() => import('./pages/TallerPage'));
const PanaderiaPage = lazyConReintento(() => import('./pages/PanaderiaPage'));
const VeterinariaPage = lazyConReintento(() => import('./pages/VeterinariaPage'));
const DashboardPage = lazyConReintento(() => import('./pages/DashboardPage'));
const ReportesPage = lazyConReintento(() => import('./pages/ReportesPage'));
const CodigosBarrasPage = lazyConReintento(() => import('./pages/CodigosBarrasPage'));
const PromocionesPage = lazyConReintento(() => import('./pages/PromocionesPage'));
const ProveedoresPage = lazyConReintento(() => import('./pages/ProveedoresPage'));
const PersonalPage = lazyConReintento(() => import('./pages/PersonalPage'));
const FidelizacionPage = lazyConReintento(() => import('./pages/FidelizacionPage'));
const ContabilidadPage = lazyConReintento(() => import('./pages/ContabilidadPage'));
const MultitiendaPage = lazyConReintento(() => import('./pages/MultitiendaPage'));
const ArtesGraficasPage = lazyConReintento(() => import('./pages/ArtesGraficasPage'));
const PapeleriaPinateriaPage = lazyConReintento(() => import('./pages/PapeleriaPinateriaPage'));

function Cargando() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ConSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Cargando />}>{children}</Suspense>;
}

// basename '/app': la PWA comparte dominio con la landing comercial
// (servida en la raíz por vercel.json) y vive bajo ese subpath — ver
// vite.config.pwa.ts (base '/app/') para el resto del cambio.
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/registro', element: <RegistroPage /> },
  { path: '/prueba-gratis', element: <PruebaGratisPage /> },
  { path: '/pago/exitoso', element: <PagoResultadoPage /> },
  { path: '/pago/pendiente', element: <PagoResultadoPage /> },
  { path: '/pago/fallido', element: <PagoResultadoPage /> },
  {
    path: '/',
    element: <PwaLayout />,
    children: [
      { index: true, element: <InicioPage /> },
      { path: 'ventas', element: <ConSuspense><VentasPage /></ConSuspense> },
      { path: 'vender', element: <ConSuspense><ModuloGate modulo={ModuloPOS.PUNTO_DE_VENTA}><VenderPage /></ModuloGate></ConSuspense> },
      { path: 'pagos', element: <ConSuspense><ModuloGate modulo={ModuloPOS.CODEC_VERIFY}><PagosPage /></ModuloGate></ConSuspense> },
      { path: 'alertas', element: <ConSuspense><AlertasPage /></ConSuspense> },
      { path: 'inventario', element: <ConSuspense><ModuloGate modulo={ModuloPOS.PRODUCTOS}><InventarioPage /></ModuloGate></ConSuspense> },
      { path: 'inventario/:id', element: <ConSuspense><ModuloGate modulo={ModuloPOS.PRODUCTOS}><ProductoFormPage /></ModuloGate></ConSuspense> },
      { path: 'escaner', element: <ConSuspense><ModuloGate modulo={ModuloPOS.PRODUCTOS}><EscanerPage /></ModuloGate></ConSuspense> },
      { path: 'gastos', element: <ConSuspense><ModuloGate modulo={ModuloPOS.GASTOS}><GastosPage /></ModuloGate></ConSuspense> },
      { path: 'devoluciones', element: <ConSuspense><ModuloGate modulo={ModuloPOS.DEVOLUCIONES}><DevolucionesPage /></ModuloGate></ConSuspense> },
      { path: 'caja', element: <ConSuspense><ModuloGate modulo={ModuloPOS.CIERRE_CAJA}><CierreCajaPage /></ModuloGate></ConSuspense> },
      { path: 'taller', element: <ConSuspense><ModuloGate modulo={ModuloPOS.TALLER_REPARACIONES}><TallerPage /></ModuloGate></ConSuspense> },
      { path: 'panaderia', element: <ConSuspense><ModuloGate modulo={ModuloPOS.PANADERIA_ONCES}><PanaderiaPage /></ModuloGate></ConSuspense> },
      { path: 'veterinaria', element: <ConSuspense><ModuloGate modulo={ModuloPOS.VETERINARIA}><VeterinariaPage /></ModuloGate></ConSuspense> },
      { path: 'dashboard', element: <ConSuspense><ModuloGate modulo={ModuloPOS.DASHBOARD}><DashboardPage /></ModuloGate></ConSuspense> },
      { path: 'reportes', element: <ConSuspense><ModuloGate modulo={ModuloPOS.REPORTES}><ReportesPage /></ModuloGate></ConSuspense> },
      { path: 'codigos-barras', element: <ConSuspense><ModuloGate modulo={ModuloPOS.CODIGOS_BARRAS}><CodigosBarrasPage /></ModuloGate></ConSuspense> },
      { path: 'promociones', element: <ConSuspense><ModuloGate modulo={ModuloPOS.PROMOCIONES}><PromocionesPage /></ModuloGate></ConSuspense> },
      { path: 'proveedores', element: <ConSuspense><ModuloGate modulo={ModuloPOS.PROVEEDORES}><ProveedoresPage /></ModuloGate></ConSuspense> },
      { path: 'personal', element: <ConSuspense><ModuloGate modulo={ModuloPOS.USUARIOS}><PersonalPage /></ModuloGate></ConSuspense> },
      { path: 'fidelizacion', element: <ConSuspense><ModuloGate modulo={ModuloPOS.FIDELIZACION}><FidelizacionPage /></ModuloGate></ConSuspense> },
      { path: 'contabilidad', element: <ConSuspense><ModuloGate modulo={ModuloPOS.CONTABILIDAD}><ContabilidadPage /></ModuloGate></ConSuspense> },
      { path: 'multitienda', element: <ConSuspense><ModuloGate modulo={ModuloPOS.MULTITIENDA}><MultitiendaPage /></ModuloGate></ConSuspense> },
      { path: 'artes-graficas', element: <ConSuspense><ModuloGate modulo={ModuloPOS.ARTES_GRAFICAS}><ArtesGraficasPage /></ModuloGate></ConSuspense> },
      { path: 'papeleria-pinateria', element: <ConSuspense><ModuloGate modulo={ModuloPOS.PAPELERIA_PINATERIA}><PapeleriaPinateriaPage /></ModuloGate></ConSuspense> },
      { path: 'configuracion', element: <ConSuspense><ConfiguracionPage /></ConSuspense> },
      { path: 'planes', element: <ConSuspense><PlanesPage /></ConSuspense> },
      { path: 'facturacion', element: <ConSuspense><FacturacionPage /></ConSuspense> },
      { path: 'perfil', element: <ConSuspense><PerfilPage /></ConSuspense> },
      { path: 'desarrollador', element: <ConSuspense><PanelDesarrolladorPage /></ConSuspense> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
], { basename: '/app' });
