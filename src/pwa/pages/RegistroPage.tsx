import { useEffect, useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router';
import { UserPlus, Loader2, Eye, EyeOff } from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import { Label } from '../../app/components/ui/label';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';

interface ClienteDisponible {
  id: string;
  nombre_negocio: string;
}

/**
 * Primer registro para la PWA: prueba de propiedad del negocio vía las
 * credenciales de licencia ya existentes (usuarios_clientes), igual que la
 * vinculación de Electron (Fase 2) — pero aquí crea una cuenta PERSONAL
 * (correo/contraseña elegidos), no una identidad de máquina compartida.
 * Ver RPC provisionar_empleado (migración 0006).
 */
export default function RegistroPage() {
  const navigate = useNavigate();
  const { iniciarSesion } = usePwaAuth();

  const [clientes, setClientes] = useState<ClienteDisponible[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [usuarioLicencia, setUsuarioLicencia] = useState('');
  const [passwordLicencia, setPasswordLicencia] = useState('');
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPasswordLicencia, setMostrarPasswordLicencia] = useState(false);
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = getSupabaseClient();
    client?.from('clientes_pos').select('id, nombre_negocio').order('nombre_negocio').then(({ data }) => {
      setClientes(data || []);
    });
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!clienteId || !usuarioLicencia || !passwordLicencia || !nombreCompleto || !email || !password) {
      setError('Completa todos los campos');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);
    const client = getSupabaseClient();
    if (!client) {
      setLoading(false);
      setError('Supabase no configurado');
      return;
    }

    const { error: rpcError } = await client.rpc('provisionar_empleado', {
      p_cliente_id: clienteId,
      p_usuario_licencia: usuarioLicencia,
      p_password_licencia: passwordLicencia,
      p_email: email.trim(),
      p_password: password,
      p_nombre_completo: nombreCompleto.trim(),
    });

    if (rpcError) {
      setLoading(false);
      setError(rpcError.message);
      return;
    }

    const resultado = await iniciarSesion(email.trim(), password);
    setLoading(false);

    if (resultado.ok) {
      navigate('/', { replace: true });
    } else {
      setError(resultado.error || 'Cuenta creada, pero no se pudo iniciar sesión automáticamente');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mb-4 shadow-lg shadow-amber-500/20">
        <UserPlus className="w-8 h-8 text-white" />
      </div>
      <h1 className="text-white text-xl font-black mb-1">Crear cuenta</h1>
      <p className="text-slate-400 text-sm mb-6 text-center">
        Usa el mismo usuario y contraseña de licencia que ya tienes en la caja
      </p>

      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-3">
        <div className="space-y-1.5">
          <Label className="text-slate-300 text-xs">Negocio</Label>
          <select
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            className="w-full h-12 rounded-lg px-3 text-sm bg-slate-900 border border-slate-700 text-white"
          >
            <option value="">Selecciona tu negocio...</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre_negocio}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-xs">Usuario de licencia</Label>
            <Input value={usuarioLicencia} onChange={(e) => setUsuarioLicencia(e.target.value)} className="h-12 bg-slate-900 border-slate-700 text-white" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-xs">Contraseña de licencia</Label>
            <div className="relative">
              <Input
                type={mostrarPasswordLicencia ? 'text' : 'password'}
                value={passwordLicencia}
                onChange={(e) => setPasswordLicencia(e.target.value)}
                className="h-12 pr-10 bg-slate-900 border-slate-700 text-white"
              />
              <button
                type="button"
                onClick={() => setMostrarPasswordLicencia(!mostrarPasswordLicencia)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-label={mostrarPasswordLicencia ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {mostrarPasswordLicencia ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="h-px bg-slate-800 my-2" />

        <div className="space-y-1.5">
          <Label className="text-slate-300 text-xs">Tu nombre completo</Label>
          <Input value={nombreCompleto} onChange={(e) => setNombreCompleto(e.target.value)} className="h-12 bg-slate-900 border-slate-700 text-white" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-slate-300 text-xs">Tu correo</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 bg-slate-900 border-slate-700 text-white" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-slate-300 text-xs">Elige una contraseña</Label>
          <div className="relative">
            <Input
              type={mostrarPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 pr-10 bg-slate-900 border-slate-700 text-white"
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
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <Button type="submit" disabled={loading} className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-600">
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {loading ? 'Creando cuenta...' : 'Crear cuenta'}
        </Button>

        <p className="text-center text-sm text-slate-400">
          ¿Ya tienes cuenta? <Link to="/login" className="text-amber-400 font-semibold">Inicia sesión</Link>
        </p>
      </form>
    </div>
  );
}
