import { useState, FormEvent } from 'react';
import { X, Mail, Loader2 } from 'lucide-react';
import { solicitarRecuperacionPassword } from '../../app/lib/supabase/authService';

interface Props {
  emailInicial?: string;
  onClose: () => void;
}

/**
 * Mismo mecanismo que RecuperarPasswordModal de Electron (Supabase Auth
 * resetPasswordForEmail) pero autocontenido — la PWA usa PwaAuthContext, no
 * el AuthContext de Electron, así que llama a authService directamente en
 * vez de pasar por useAuth().
 */
export function RecuperarPasswordModal({ emailInicial, onClose }: Props) {
  const [email, setEmail] = useState(emailInicial || '');
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const resultado = await solicitarRecuperacionPassword(email.trim());
    setLoading(false);

    if (resultado.ok) {
      setEnviado(true);
    } else {
      setError(resultado.error || 'Verifica tu conexión e intenta de nuevo.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-sm bg-white border border-orange-100 rounded-2xl p-6 relative shadow-xl">
        <button onClick={onClose} className="absolute top-3 right-3 text-slate-400" aria-label="Cerrar">
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-slate-900 font-bold text-base mb-1">Recuperar contraseña</h2>

        {enviado ? (
          <p className="text-emerald-600 text-sm mt-3">
            Si <strong>{email}</strong> tiene una cuenta registrada, te llegará un enlace para restablecer tu
            contraseña. Revisa también la carpeta de spam.
          </p>
        ) : (
          <>
            <p className="text-slate-500 text-xs mb-4">Requiere conexión a internet.</p>
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
                  className="w-full pl-10 pr-3 h-11 rounded-lg bg-orange-50 border border-orange-200 text-slate-900 text-sm outline-none focus:border-amber-500"
                />
              </div>
              {error && <p className="text-red-500 text-xs">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2"
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
