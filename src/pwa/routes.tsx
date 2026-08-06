import { createBrowserRouter, Navigate } from 'react-router';
import { PwaLayout } from './components/PwaLayout';
import LoginPage from './pages/LoginPage';
import RegistroPage from './pages/RegistroPage';
import ConfirmarPagoPage from './pages/ConfirmarPagoPage';
import InventarioPage from './pages/InventarioPage';
import ProductoFormPage from './pages/ProductoFormPage';
import EscanerPage from './pages/EscanerPage';
import PerfilPage from './pages/PerfilPage';
import DashboardPage from './pages/DashboardPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/registro', element: <RegistroPage /> },
  {
    path: '/',
    element: <PwaLayout />,
    children: [
      { index: true, element: <ConfirmarPagoPage /> },
      { path: 'inventario', element: <InventarioPage /> },
      { path: 'inventario/:id', element: <ProductoFormPage /> },
      { path: 'escaner', element: <EscanerPage /> },
      { path: 'panel', element: <DashboardPage /> },
      { path: 'perfil', element: <PerfilPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
