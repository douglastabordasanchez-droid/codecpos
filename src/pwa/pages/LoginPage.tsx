import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router';
import { Zap, Loader2, Eye, EyeOff } from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import { Label } from '../../app/components/ui/label';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { RecuperarPasswordModal } from '../components/RecuperarPasswordModal';

export default function LoginPage() {
  const navigate = useNavigate();
  const { iniciarSesion } = usePwaAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [mostrarRecuperar, setMostrarRecuperar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const resultado = await iniciarSesion(email.trim(), password);
    setLoading(false);
    if (resultado.ok) {
      navigate('/', { replace: true });
    } else {
      setError(resultado.error || 'Credenciales inválidas');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mb-4 shadow-lg shadow-amber-500/20">
        <Zap className="w-8 h-8 text-white" />
      </div>
      <h1 className="text-white text-2xl font-black mb-1">CODEC POS</h1>
      <p className="text-slate-400 text-sm mb-8">Administra tu negocio desde el celular</p>

      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div className="space-y-1.5">
          <Label className="text-slate-300 text-xs">Correo</Label>
          <Input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu-correo@ejemplo.com"
            className="h-12 bg-slate-900 border-slate-700 text-white"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-slate-300 text-xs">Contraseña</Label>
          <div className="relative">
            <Input
              type={mostrarPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tu contraseña"
              className="h-12 pr-11 bg-slate-900 border-slate-700 text-white"
            />
            <button
              type="button"
              onClick={() => setMostrarPassword(!mostrarPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {mostrarPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setMostrarRecuperar(true)}
            className="text-amber-400 text-xs font-semibold"
          >
            ¿Olvidaste tu contraseña?
          </button>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <Button type="submit" disabled={loading} className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-600">
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {loading ? 'Ingresando...' : 'Ingresar'}
        </Button>

        <p className="text-center text-sm text-slate-400">
          ¿Primera vez aquí?{' '}
          <Link to="/registro" className="text-amber-400 font-semibold">
            Crear cuenta
          </Link>
        </p>
      </form>

      {mostrarRecuperar && (
        <RecuperarPasswordModal emailInicial={email} onClose={() => setMostrarRecuperar(false)} />
      )}
    </div>
  );
}
