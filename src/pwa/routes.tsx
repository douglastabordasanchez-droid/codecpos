import { createBrowserRouter, Navigate } from 'react-router';
import { PwaLayout } from './components/PwaLayout';
import { ModuloGate } from './components/ModuloGate';
import { ModuloPOS } from '../app/lib/permissions';
import LoginPage from './pages/LoginPage';
import RegistroPage from './pages/RegistroPage';
import InicioPage from './pages/InicioPage';
import VentasPage from './pages/VentasPage';
import PagosPage from './pages/PagosPage';
import AlertasPage from './pages/AlertasPage';
import InventarioPage from './pages/InventarioPage';
import ProductoFormPage from './pages/ProductoFormPage';
import EscanerPage from './pages/EscanerPage';
import PerfilPage from './pages/PerfilPage';
import ConfiguracionPage from './pages/ConfiguracionPage';
import VenderPage from './pages/VenderPage';
import GastosPage from './pages/GastosPage';
import DevolucionesPage from './pages/DevolucionesPage';
import CierreCajaPage from './pages/CierreCajaPage';
import PanelDesarrolladorPage from './pages/PanelDesarrolladorPage';
import FacturacionPage from './pages/FacturacionPage';
import TallerPage from './pages/TallerPage';
import PanaderiaPage from './pages/PanaderiaPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/registro', element: <RegistroPage /> },
  {
    path: '/',
    element: <PwaLayout />,
    children: [
      { index: true, element: <InicioPage /> },
      { path: 'ventas', element: <VentasPage /> },
      { path: 'vender', element: <ModuloGate modulo={ModuloPOS.PUNTO_DE_VENTA}><VenderPage /></ModuloGate> },
      { path: 'pagos', element: <ModuloGate modulo={ModuloPOS.CODEC_VERIFY}><PagosPage /></ModuloGate> },
      { path: 'alertas', element: <AlertasPage /> },
      { path: 'inventario', element: <ModuloGate modulo={ModuloPOS.PRODUCTOS}><InventarioPage /></ModuloGate> },
      { path: 'inventario/:id', element: <ModuloGate modulo={ModuloPOS.PRODUCTOS}><ProductoFormPage /></ModuloGate> },
      { path: 'escaner', element: <ModuloGate modulo={ModuloPOS.PRODUCTOS}><EscanerPage /></ModuloGate> },
      { path: 'gastos', element: <ModuloGate modulo={ModuloPOS.GASTOS}><GastosPage /></ModuloGate> },
      { path: 'devoluciones', element: <ModuloGate modulo={ModuloPOS.DEVOLUCIONES}><DevolucionesPage /></ModuloGate> },
      { path: 'caja', element: <ModuloGate modulo={ModuloPOS.CIERRE_CAJA}><CierreCajaPage /></ModuloGate> },
      { path: 'taller', element: <ModuloGate modulo={ModuloPOS.TALLER_REPARACIONES}><TallerPage /></ModuloGate> },
      { path: 'panaderia', element: <ModuloGate modulo={ModuloPOS.PANADERIA_ONCES}><PanaderiaPage /></ModuloGate> },
      { path: 'configuracion', element: <ConfiguracionPage /> },
      { path: 'facturacion', element: <FacturacionPage /> },
      { path: 'perfil', element: <PerfilPage /> },
      { path: 'desarrollador', element: <PanelDesarrolladorPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
