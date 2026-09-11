import { useState } from 'react';
import { KeyRound, Eye, EyeOff, X } from 'lucide-react';
import { fijarCredencialesLicenciaAdmin } from '../lib/adminApi';

export function CredencialesLicenciaModal({ clienteId, nombreNegocio, onCerrar }: { clienteId: string; nombreNegocio: string; onCerrar: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const handleGuardar = async () => {
    if (username.trim().length < 3) { setError('El usuario debe tener al menos 3 caracteres'); return; }
    if (password.length < 6) { setError('Mínimo 6 caracteres'); return; }
    setGuardando(true);
    setError(null);
    try {
      await fijarCredencialesLicenciaAdmin(clienteId, username.trim(), password);
      setListo(true);
    } catch (e: any) {
      setError(e.message || 'No se pudo fijar la credencial');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onCerrar}>
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-white font-bold text-base flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-400" /> Reparar acceso del dueño
          </h3>
          <button onClick={onCerrar} className="text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-slate-500 text-xs mb-4">{nombreNegocio}</p>

        {listo ? (
          <div className="space-y-3">
            <p className="text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
              Listo -- ya puede entrar en Electron y en la PWA con este usuario y contraseña.
            </p>
            <button onClick={onCerrar} className="w-full h-9 rounded-lg text-sm font-bold bg-slate-800 text-slate-300 hover:bg-slate-700">Cerrar</button>
          </div>
        ) : (
          <>
            <p className="text-slate-500 text-[11px] mb-3 bg-slate-800/50 border border-slate-800 rounded-lg px-3 py-2">
              Fija el usuario y contraseña de licencia de este negocio (reemplaza cualquiera anterior) y sincroniza en el mismo paso
              su cuenta en la nube -- útil para clientes de prueba gratuita, que nunca quedan con esta credencial configurada.
            </p>
            <div className="space-y-1.5 mb-2">
              <input
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(null); }}
                placeholder="Usuario (ej: PAPOTASCO)"
                className="w-full h-10 px-3 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm outline-none focus:border-amber-500"
              />
            </div>
            <div className="relative mb-2">
              <input
                type={mostrar ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                onKeyDown={(e) => e.key === 'Enter' && handleGuardar()}
                placeholder="Contraseña (mín. 6 caracteres)"
                className="w-full h-10 pl-3 pr-9 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm outline-none focus:border-amber-500"
              />
              <button type="button" tabIndex={-1} onClick={() => setMostrar((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                {mostrar ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
            <div className="flex gap-2 mt-3">
              <button onClick={onCerrar} className="flex-1 h-9 rounded-lg text-sm font-medium bg-slate-800 text-slate-300 hover:bg-slate-700">Cancelar</button>
              <button
                onClick={handleGuardar}
                disabled={guardando || username.trim().length < 3 || password.length < 6}
                className="flex-1 h-9 rounded-lg text-sm font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-40"
              >
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
