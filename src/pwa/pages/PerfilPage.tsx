import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { LogOut, User, Settings, ChevronRight } from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import logo from '/logo.png';

export default function PerfilPage() {
  const { empleado, cerrarSesion } = usePwaAuth();
  const navigate = useNavigate();
  const esAdmin = !!empleado && ['admin', 'super_usuario'].includes(empleado.rol);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24 px-5 pt-8">
      <h1 className="text-white text-xl font-black mb-6">Perfil</h1>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-5 flex items-center gap-4 mb-6 shadow-sm"
      >
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center overflow-hidden shadow-lg shadow-orange-500/20">
          {empleado ? <User className="w-7 h-7 text-white" /> : <img src={logo} alt="CODEC" className="w-8 h-8 object-contain" />}
        </div>
        <div>
          <p className="text-white font-bold">{empleado?.nombre_completo}</p>
          <p className="text-slate-400 text-xs capitalize">{empleado?.rol}</p>
        </div>
      </motion.div>

      {esAdmin && (
        <button
          onClick={() => navigate('/configuracion')}
          className="w-full bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4 flex items-center justify-between mb-6 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-amber-400" />
            <span className="text-white font-semibold text-sm">Configuración del negocio</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500" />
        </button>
      )}

      <Button
        onClick={cerrarSesion}
        variant="outline"
        className="w-full h-12 border-slate-700 bg-slate-900/50 text-red-400 hover:text-red-300 hover:bg-slate-900"
      >
        <LogOut className="w-4 h-4 mr-2" />
        Cerrar sesión
      </Button>
    </div>
  );
}
