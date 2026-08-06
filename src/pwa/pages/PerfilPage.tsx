import { useNavigate } from 'react-router';
import { LogOut, User, Settings, ChevronRight } from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { usePwaAuth } from '../contexts/PwaAuthContext';

export default function PerfilPage() {
  const { empleado, cerrarSesion } = usePwaAuth();
  const navigate = useNavigate();
  const esAdmin = !!empleado && ['admin', 'super_usuario'].includes(empleado.rol);

  return (
    <div className="min-h-screen bg-orange-50 pb-24 px-5 pt-8">
      <h1 className="text-slate-900 text-xl font-black mb-6">Perfil</h1>

      <div className="bg-white border border-orange-100 rounded-2xl p-5 flex items-center gap-4 mb-6 shadow-sm">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
          <User className="w-7 h-7 text-white" />
        </div>
        <div>
          <p className="text-slate-900 font-bold">{empleado?.nombre_completo}</p>
          <p className="text-slate-400 text-xs capitalize">{empleado?.rol}</p>
        </div>
      </div>

      {esAdmin && (
        <button
          onClick={() => navigate('/configuracion')}
          className="w-full bg-white border border-orange-100 rounded-2xl p-4 flex items-center justify-between mb-6 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-amber-500" />
            <span className="text-slate-900 font-semibold text-sm">Configuración del negocio</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>
      )}

      <Button
        onClick={cerrarSesion}
        variant="outline"
        className="w-full h-12 border-orange-200 text-red-600 hover:text-red-700"
      >
        <LogOut className="w-4 h-4 mr-2" />
        Cerrar sesión
      </Button>
    </div>
  );
}
