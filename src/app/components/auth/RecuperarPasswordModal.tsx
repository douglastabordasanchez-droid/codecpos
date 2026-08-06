import { useState, FormEvent } from 'react';
import { X, Mail, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';

interface Props {
  onClose: () => void;
}

/**
 * Reemplazo real de la vieja "recuperación" vía contraseña maestra: envía un
 * correo de restablecimiento a través de Supabase Auth. Solo funciona para
 * cuentas con `email` asignado (ver campo opcional en Usuario) y requiere
 * conexión a internet — aceptable porque la recuperación de contraseña es,
 * por naturaleza, una operación poco frecuente que puede esperar a tener red.
 */
export function RecuperarPasswordModal({ onClose }: Props) {
  const { solicitarRecuperacionPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const resultado = await solicitarRecuperacionPassword(email.trim());
    setLoading(false);

    if (resultado.ok) {
      setEnviado(true);
    } else {
      toast.error('No se pudo enviar el correo', {
        description: resultado.error || 'Verifica tu conexión a internet e intenta de nuevo.',
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-sm bg-slate-800 rounded-2xl border border-slate-700/50 p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-slate-400 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-white font-bold text-base mb-1">Recuperar contraseña</h2>

        {enviado ? (
          <p className="text-emerald-400 text-sm mt-3">
            Si <strong>{email}</strong> tiene una cuenta con correo vinculado, te llegará un enlace para
            restablecer tu contraseña. Revisa también la carpeta de spam.
          </p>
        ) : (
          <>
            <p className="text-slate-400 text-xs mb-4">
              Solo funciona para cuentas con correo asignado por un administrador. Requiere conexión a
              internet.
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu-correo@ejemplo.com"
                  className="w-full pl-10 pr-3 py-2 rounded-lg bg-slate-900/50 border border-slate-600 text-white text-sm outline-none focus:border-amber-500"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold py-2 text-sm flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
