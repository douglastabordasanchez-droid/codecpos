import { useState, FormEvent } from 'react';
import { X, KeyRound, Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { cambiarMiPassword } from '../../app/lib/supabase/authService';

interface Props {
  /** Contraseña genérica puesta por Codec: no se puede cerrar ni pide la actual. */
  obligatorio?: boolean;
  onListo: () => void;
  onCerrar?: () => void;
  onCerrarSesion?: () => void;
}

export function CambiarPasswordModal({ obligatorio = false, onListo, onCerrar, onCerrarSesion }: Props) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (nueva.length < 6) { setError('La contraseña nueva debe tener al menos 6 caracteres'); return; }
    if (nueva !== confirmar) { setError('Las dos contraseñas no coinciden'); return; }
    if (!obligatorio && !actual) { setError('Escribe tu contraseña actual'); return; }
    setGuardando(true);
    const r = await cambiarMiPassword(obligatorio ? null : actual, nueva);
    setGuardando(false);
    if (!r.ok) { setError(r.error || 'No se pudo cambiar la contraseña'); return; }
    toast.success('Contraseña cambiada. La próxima vez entra con la nueva.');
    onListo();
  };

  const campo = 'w-full px-3 h-11 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm outline-none focus:border-amber-500';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4">
      <div className="w-full max-w-sm bg-slate-900/95 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 relative shadow-xl">
        {!obligatorio && onCerrar && (
          <button onClick={onCerrar} className="absolute top-3 right-3 text-slate-500" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        )}

        <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mb-3">
          <KeyRound className="w-5 h-5 text-amber-400" />
        </div>
        <h2 className="text-white font-bold text-base mb-1">
          {obligatorio ? 'Crea tu contraseña' : 'Cambiar contraseña'}
        </h2>
        <p className="text-slate-400 text-xs mb-4">
          {obligatorio
            ? 'Entraste con una contraseña temporal. Pon una propia que solo tú conozcas para seguir.'
            : 'Escribe tu contraseña actual y la nueva.'}
        </p>

        <form onSubmit={guardar} className="space-y-3">
          {!obligatorio && (
            <input
              type={mostrar ? 'text' : 'password'}
              autoComplete="current-password"
              value={actual}
              onChange={(e) => { setActual(e.target.value); setError(null); }}
              placeholder="Contraseña actual"
              className={campo}
            />
          )}
          <div className="relative">
            <input
              type={mostrar ? 'text' : 'password'}
              autoComplete="new-password"
              autoFocus
              value={nueva}
              onChange={(e) => { setNueva(e.target.value); setError(null); }}
              placeholder="Contraseña nueva (mínimo 6)"
              className={`${campo} pr-10`}
            />
            <button
              type="button"
              onClick={() => setMostrar((m) => !m)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
              aria-label={mostrar ? 'Ocultar' : 'Mostrar'}
            >
              {mostrar ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <input
            type={mostrar ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmar}
            onChange={(e) => { setConfirmar(e.target.value); setError(null); }}
            placeholder="Repite la contraseña nueva"
            className={campo}
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={guardando}
            className="w-full h-11 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2"
          >
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
            {guardando ? 'Guardando...' : 'Guardar contraseña'}
          </button>
          {obligatorio && onCerrarSesion && (
            <button type="button" onClick={onCerrarSesion} className="w-full text-slate-500 text-xs pt-1">
              Cerrar sesión
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
