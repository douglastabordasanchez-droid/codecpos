import { useState, FormEvent } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Reemplaza la antigua contraseña maestra hardcodeada. Verifica ONLINE
 * (Supabase Auth) que la cuenta pertenece al staff de Codec Studio antes de
 * otorgar acceso al Panel Desarrollador — a propósito no depende de sesión
 * POS previa, así el staff puede entrar en cualquier instalación de cliente
 * con su propia cuenta, sin necesitar credenciales locales de ese negocio.
 */
export function StaffLoginGate() {
  const { iniciarSesionStaff } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const resultado = await iniciarSesionStaff(email.trim(), password);
    setLoading(false);
    if (!resultado.ok) {
      setError(resultado.error || 'Acceso denegado');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 bg-slate-900 border border-slate-800 rounded-2xl p-6"
      >
        <div className="flex items-center gap-2 text-white">
          <ShieldCheck className="w-5 h-5 text-amber-400" />
          <h1 className="font-bold text-lg">Acceso Staff Codec Studio</h1>
        </div>
        <p className="text-slate-400 text-xs">
          Cuenta interna de soporte, verificada contra nuestra base de datos. Requiere conexión a internet.
        </p>

        <input
          type="text"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Usuario o email de staff"
          autoCapitalize="none"
          className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white text-sm outline-none focus:border-amber-500"
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white text-sm outline-none focus:border-amber-500"
        />

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold py-2 text-sm flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {loading ? 'Verificando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
