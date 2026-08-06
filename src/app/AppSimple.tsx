/**
 * VERSIÓN SIMPLIFICADA PARA DIAGNÓSTICO
 * Solo carga lo esencial para el login
 */

import { RouterProvider } from 'react-router';
import { router } from './routes-pos';
import { Toaster } from 'sonner';
import { AuthProvider } from './contexts/AuthContext';
import { hashPassword } from './lib/passwordHash';

console.log('📦 AppSimple.tsx - Cargando versión simplificada...');

// Inicializar usuario Admin por defecto
const initAdmin = () => {
  try {
    const usuarios = localStorage.getItem('codecpos_usuarios');
    if (!usuarios) {
      const admin = {
        id: 'super_' + Date.now(),
        nombreCompleto: 'Administrador CODEC POS',
        cedula: '0000000000',
        username: 'Admin',
        password: hashPassword('CodecPOS2026!'),
        rol: 'super_usuario',
        activo: true,
        fechaCreacion: new Date().toISOString(),
        creadoPor: 'SISTEMA',
      };
      localStorage.setItem('codecpos_usuarios', JSON.stringify([admin]));
      console.log('✅ Usuario Admin creado:', admin.username);
    } else {
      console.log('✅ Usuarios ya existen');
    }
  } catch (error) {
    console.error('❌ Error inicializando Admin:', error);
  }
};

initAdmin();

function AppSimple() {
  console.log('🚀 Renderizando AppSimple...');

  return (
    <div>
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </div>
  );
}

export default AppSimple;
