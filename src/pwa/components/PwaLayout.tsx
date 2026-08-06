import { Outlet, Navigate } from 'react-router';
import { Loader2 } from 'lucide-react';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { BottomNav } from './BottomNav';

export function PwaLayout() {
  const { empleado, cargando } = usePwaAuth();

  if (cargando) {
    return (
      <div className="min-h-screen bg-orange-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (!empleado) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <Outlet />
      <BottomNav />
    </>
  );
}
