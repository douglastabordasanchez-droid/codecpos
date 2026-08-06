import { LogOut, User } from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { usePwaAuth } from '../contexts/PwaAuthContext';

export default function PerfilPage() {
  const { empleado, cerrarSesion } = usePwaAuth();

  return (
    <div className="min-h-screen bg-slate-950 pb-24 px-5 pt-8">
      <h1 className="text-white text-xl font-black mb-6">Perfil</h1>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
          <User className="w-7 h-7 text-white" />
        </div>
        <div>
          <p className="text-white font-bold">{empleado?.nombre_completo}</p>
          <p className="text-slate-400 text-xs capitalize">{empleado?.rol}</p>
        </div>
      </div>

      <Button
        onClick={cerrarSesion}
        variant="outline"
        className="w-full h-12 border-slate-700 text-red-400 hover:text-red-300"
      >
        <LogOut className="w-4 h-4 mr-2" />
        Cerrar sesión
      </Button>
    </div>
  );
}
