import { useState } from 'react';
import { motion } from 'motion/react';
import { Fingerprint, LogOut, Loader2 } from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { verificarHuella } from '../lib/huellaLock';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import logo from '/logo.png';

interface LockScreenProps {
  empleadoId: string;
  onDesbloqueado: () => void;
}

export default function LockScreen({ empleadoId, onDesbloqueado }: LockScreenProps) {
  const { cerrarSesion } = usePwaAuth();
  const [verificando, setVerificando] = useState(false);
  const [error, setError] = useState('');

  const intentarDesbloquear = async () => {
    setVerificando(true);
    setError('');
    const ok = await verificarHuella(empleadoId);
    setVerificando(false);
    if (ok) {
      onDesbloqueado();
    } else {
      setError('No se pudo validar la huella. Inténtalo de nuevo.');
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center text-center max-w-xs w-full"
      >
        <img src={logo} alt="Codec POS" className="w-16 h-16 rounded-2xl mb-6" />
        <h1 className="text-white text-lg font-bold mb-1">Sesión bloqueada</h1>
        <p className="text-slate-500 text-sm mb-8">Confirma tu identidad para continuar</p>

        <button
          onClick={intentarDesbloquear}
          disabled={verificando}
          className="w-24 h-24 rounded-full bg-emerald-500/10 border-2 border-emerald-500/40 flex items-center justify-center mb-6 active:scale-95 transition-transform disabled:opacity-50"
        >
          {verificando ? (
            <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
          ) : (
            <Fingerprint className="w-10 h-10 text-emerald-400" />
          )}
        </button>

        {error && <p className="text-red-400 text-xs mb-4">{error}</p>}

        <Button onClick={intentarDesbloquear} disabled={verificando} className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 mb-3">
          Desbloquear con huella
        </Button>

        <Button onClick={cerrarSesion} variant="ghost" className="w-full h-11 text-slate-500 hover:text-slate-300">
          <LogOut className="w-4 h-4 mr-2" />
          Cerrar sesión
        </Button>
      </motion.div>
    </div>
  );
}
