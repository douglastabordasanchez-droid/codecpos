import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router';
import { Sparkles, Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import { Label } from '../../app/components/ui/label';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';

/**
 * Registro público de un negocio NUEVO (Fase 5) -- distinto de RegistroPage,
 * que es autoservicio de un EMPLEADO de un negocio que ya tiene licencia.
 * Aquí no existe negocio ni licencia todavía: los crea crear_cuenta_prueba()
 * (migración 0052) en una sola transacción, con una licencia TRIAL de 14
 * días. El backend controla la fecha de vencimiento -- este formulario no
 * decide nada de eso, solo recolecta los datos mínimos.
 */
export default function PruebaGratisPage() {
  const navigate = useNavigate();
  const { iniciarSesion } = usePwaAuth();

  const [nombreCompleto, setNombreCompleto] = useState('');
  const [nombreNegocio, setNombreNegocio] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!nombreCompleto.trim() || !nombreNegocio.trim() || !email.trim() || !telefono.trim() || !password) {
      setError('Completa todos los campos');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== confirmarPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (!aceptaTerminos) {
      setError('Debes aceptar los términos y condiciones para continuar');
      return;
    }

    setLoading(true);
    const client = getSupabaseClient();
    if (!client) {
      setLoading(false);
      setError('nuestra base de datos no está configurada');
      return;
    }

    const { error: rpcError } = await client.rpc('crear_cuenta_prueba', {
      p_nombre_completo: nombreCompleto.trim(),
      p_nombre_negocio: nombreNegocio.trim(),
      p_email: email.trim(),
      p_telefono: telefono.trim(),
      p_password: password,
    });

    if (rpcError) {
      setLoading(false);
      setError(rpcError.message);
      return;
    }

    const resultado = await iniciarSesion(email.trim(), password);
    setLoading(false);

    if (resultado.ok) {
      setListo(true);
    } else {
      setError(resultado.error || 'Tu cuenta se creó, pero no se pudo iniciar sesión automáticamente. Intenta iniciar sesión.');
    }
  };

  if (listo) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-4 shadow-xl shadow-emerald-500/30">
          <CheckCircle2 className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-white text-2xl font-black mb-2">¡Tu prueba gratuita comenzó!</h1>
        <p className="text-slate-400 text-sm mb-8 max-w-xs">
          Te quedan 14 días para probar Codec POS sin restricciones. No necesitas tarjeta ni hacer nada más.
        </p>
        <Button
          onClick={() => navigate('/', { replace: true })}
          className="w-full max-w-xs h-12 bg-gradient-to-r from-amber-500 to-orange-600 shadow-lg shadow-orange-500/20"
        >
          Entrar a Codec POS
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-6">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mb-4 shadow-xl shadow-orange-500/30">
        <Sparkles className="w-8 h-8 text-white" />
      </div>
      <h1 className="text-white text-xl font-black mb-1">Probar 14 días gratis</h1>
      <p className="text-slate-400 text-sm mb-6 text-center max-w-xs">
        Crea tu cuenta y empieza a usar Codec POS ahora mismo, sin tarjeta de crédito.
      </p>

      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-3 bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 shadow-2xl">
        <div className="space-y-1.5">
          <Label className="text-slate-400 text-xs">Tu nombre completo</Label>
          <Input value={nombreCompleto} onChange={(e) => setNombreCompleto(e.target.value)} className="h-12 bg-slate-950/60 border-slate-700 text-white" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-slate-400 text-xs">Nombre de tu negocio</Label>
          <Input value={nombreNegocio} onChange={(e) => setNombreNegocio(e.target.value)} className="h-12 bg-slate-950/60 border-slate-700 text-white" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-slate-400 text-xs">Tu correo</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 bg-slate-950/60 border-slate-700 text-white" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-slate-400 text-xs">Tu teléfono</Label>
          <Input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} className="h-12 bg-slate-950/60 border-slate-700 text-white" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs">Contraseña</Label>
            <div className="relative">
              <Input
                type={mostrarPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 pr-10 bg-slate-950/60 border-slate-700 text-white"
              />
              <button
                type="button"
                onClick={() => setMostrarPassword(!mostrarPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {mostrarPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs">Confirmar</Label>
            <Input
              type={mostrarPassword ? 'text' : 'password'}
              value={confirmarPassword}
              onChange={(e) => setConfirmarPassword(e.target.value)}
              className="h-12 bg-slate-950/60 border-slate-700 text-white"
            />
          </div>
        </div>

        <label className="flex items-start gap-2 text-xs text-slate-400 pt-1">
          <input
            type="checkbox"
            checked={aceptaTerminos}
            onChange={(e) => setAceptaTerminos(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-slate-700 bg-slate-950/60 accent-amber-500"
          />
          <span>Acepto los términos de uso y la política de tratamiento de datos de Codec POS.</span>
        </label>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <Button type="submit" disabled={loading} className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-600 shadow-lg shadow-orange-500/20">
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {loading ? 'Creando tu cuenta...' : 'Empezar mi prueba gratis'}
        </Button>

        <p className="text-center text-sm text-slate-400">
          ¿Ya tienes cuenta? <Link to="/login" className="text-amber-400 font-semibold">Inicia sesión</Link>
        </p>
      </form>
    </div>
  );
}
