import { useState, FormEvent } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { useAdminAuth } from '../contexts/AdminAuthContext';

/**
 * Login del Admin Web. Misma verificación que StaffLoginGate de Electron
 * (verificarAccesoStaff, vía AdminAuthContext) -- ver comentario ahí.
 */
export function AdminLoginPage() {
  const { iniciarSesion } = useAdminAuth();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const resultado = await iniciarSesion(usuario.trim(), password);
    setCargando(false);
    if (!resultado.ok) setError(resultado.error || 'Acceso denegado');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center gap-2 text-white">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <h1 className="font-bold text-lg">Codec POS — Admin</h1>
        </div>
        <p className="text-slate-400 text-xs">
          Acceso exclusivo de staff Codec Studio. Requiere conexión a internet.
        </p>

        <input
          type="text"
          required
          autoFocus
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          placeholder="Usuario o email de staff"
          autoCapitalize="none"
          className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white text-sm outline-none focus:border-emerald-500"
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white text-sm outline-none focus:border-emerald-500"
        />

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <button
          type="submit"
          disabled={cargando}
          className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-semibold py-2 text-sm flex items-center justify-center gap-2"
        >
          {cargando && <Loader2 className="w-4 h-4 animate-spin" />}
          {cargando ? 'Verificando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
