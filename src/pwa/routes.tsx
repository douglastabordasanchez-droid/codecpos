import { createBrowserRouter, Navigate } from 'react-router';
import { PwaLayout } from './components/PwaLayout';
import { ModuloGate } from './components/ModuloGate';
import { ModuloPOS } from '../app/lib/permissions';
import LoginPage from './pages/LoginPage';
import RegistroPage from './pages/RegistroPage';
import ConfirmarPagoPage from './pages/ConfirmarPagoPage';
import InventarioPage from './pages/InventarioPage';
import ProductoFormPage from './pages/ProductoFormPage';
import EscanerPage from './pages/EscanerPage';
import PerfilPage from './pages/PerfilPage';
import DashboardPage from './pages/DashboardPage';
import ConfiguracionPage from './pages/ConfiguracionPage';
import VenderPage from './pages/VenderPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/registro', element: <RegistroPage /> },
  {
    path: '/',
    element: <PwaLayout />,
    children: [
      { index: true, element: <ModuloGate modulo={ModuloPOS.PUNTO_DE_VENTA}><VenderPage /></ModuloGate> },
      { path: 'pagos', element: <ModuloGate modulo={ModuloPOS.CODEC_VERIFY}><ConfirmarPagoPage /></ModuloGate> },
      { path: 'inventario', element: <ModuloGate modulo={ModuloPOS.PRODUCTOS}><InventarioPage /></ModuloGate> },
      { path: 'inventario/:id', element: <ModuloGate modulo={ModuloPOS.PRODUCTOS}><ProductoFormPage /></ModuloGate> },
      { path: 'escaner', element: <ModuloGate modulo={ModuloPOS.PRODUCTOS}><EscanerPage /></ModuloGate> },
      { path: 'panel', element: <ModuloGate modulo={ModuloPOS.DASHBOARD}><DashboardPage /></ModuloGate> },
      { path: 'configuracion', element: <ConfiguracionPage /> },
      { path: 'perfil', element: <PerfilPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
