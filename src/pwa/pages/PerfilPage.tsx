import { useEffect, useState, FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { LogOut, User, Settings, ChevronRight, Crown, Zap, Users, Plus, X, Loader2 } from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import { Label } from '../../app/components/ui/label';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import logo from '/logo.png';

interface EmpleadoFila {
  id: string;
  nombre_completo: string;
  rol: string;
  activo: boolean;
}

const ROLES = ['cajero', 'admin', 'tecnico', 'cocina', 'barra', 'mesero'];

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3 } }),
};

export default function PerfilPage() {
  const { empleado, cerrarSesion } = usePwaAuth();
  const navigate = useNavigate();
  const esAdmin = !!empleado && ['admin', 'super_usuario'].includes(empleado.rol);

  const [plan, setPlan] = useState<string | null>(null);
  const [equipo, setEquipo] = useState<EmpleadoFila[]>([]);
  const [cargandoEquipo, setCargandoEquipo] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState('cajero');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargarEquipo = async () => {
    if (!empleado) return;
    const client = getSupabaseClient();
    if (!client) return;
    setCargandoEquipo(true);
    const [{ data: clienteData }, { data: empleadosData }] = await Promise.all([
      client.from('clientes_pos').select('plan').eq('id', empleado.cliente_id).maybeSingle(),
      esAdmin
        ? client.from('empleados').select('id, nombre_completo, rol, activo').eq('cliente_id', empleado.cliente_id).order('nombre_completo')
        : Promise.resolve({ data: [] as EmpleadoFila[] }),
    ]);
    setPlan((clienteData as { plan: string } | null)?.plan || null);
    setEquipo((empleadosData as EmpleadoFila[]) || []);
    setCargandoEquipo(false);
  };

  useEffect(() => {
    cargarEquipo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empleado?.cliente_id]);

  const handleAgregar = async (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !email.trim() || password.length < 6) {
      setError('Completa nombre, correo y una contraseña de al menos 6 caracteres');
      return;
    }
    setEnviando(true);
    setError(null);
    const client = getSupabaseClient()!;
    const { error: rpcError } = await client.rpc('invitar_empleado', {
      p_email: email.trim(),
      p_password: password,
      p_nombre_completo: nombre.trim(),
      p_rol: rol,
    });
    setEnviando(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setNombre('');
    setEmail('');
    setPassword('');
    setRol('cajero');
    setMostrarForm(false);
    cargarEquipo();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24 px-5 pt-8">
      <h1 className="text-white text-xl font-black mb-6">Perfil</h1>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-5 flex items-center gap-4 mb-4 shadow-sm"
      >
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center overflow-hidden shadow-lg shadow-orange-500/20">
          {empleado ? <User className="w-7 h-7 text-white" /> : <img src={logo} alt="CODEC" className="w-8 h-8 object-contain" />}
        </div>
        <div>
          <p className="text-white font-bold">{empleado?.nombre_completo}</p>
          <p className="text-slate-400 text-xs capitalize">{empleado?.rol}</p>
        </div>
      </motion.div>

      {plan && (
        <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4 flex items-center gap-3 mb-6">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${plan === 'PREMIUM' ? 'bg-amber-500/15' : 'bg-sky-500/15'}`}>
            {plan === 'PREMIUM' ? <Crown className="w-5 h-5 text-amber-400" /> : <Zap className="w-5 h-5 text-sky-400" />}
          </div>
          <div>
            <p className="text-slate-400 text-xs">Tu plan actual</p>
            <p className="text-white font-bold text-sm">{plan === 'PREMIUM' ? 'Premium' : 'Básico'}</p>
          </div>
        </div>
      )}

      {esAdmin && (
        <button
          onClick={() => navigate('/configuracion')}
          className="w-full bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4 flex items-center justify-between mb-6 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-amber-400" />
            <span className="text-white font-semibold text-sm">Configuración del negocio</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500" />
        </button>
      )}

      {esAdmin && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-400" />
              <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wide">Equipo</h2>
            </div>
            <button
              onClick={() => setMostrarForm(true)}
              className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20"
              aria-label="Agregar usuario"
            >
              <Plus className="w-4 h-4 text-white" />
            </button>
          </div>

          <div className="space-y-2">
            {cargandoEquipo && <p className="text-slate-500 text-sm text-center py-4">Cargando...</p>}
            {!cargandoEquipo && equipo.length === 0 && (
              <p className="text-slate-500 text-sm text-center py-4">Sin compañeros registrados todavía</p>
            )}
            {equipo.map((e, i) => (
              <motion.div
                key={e.id}
                custom={i}
                initial="hidden"
                animate="show"
                variants={fadeUp}
                className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-white font-semibold text-sm">{e.nombre_completo}</p>
                  <p className="text-slate-500 text-xs capitalize">{e.rol}</p>
                </div>
                {!e.activo && <span className="text-xs text-red-400 font-bold">Inactivo</span>}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      <Button
        onClick={cerrarSesion}
        variant="outline"
        className="w-full h-12 border-slate-700 bg-slate-900/50 text-red-400 hover:text-red-300 hover:bg-slate-900"
      >
        <LogOut className="w-4 h-4 mr-2" />
        Cerrar sesión
      </Button>

      {mostrarForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
          <div className="w-full bg-slate-950 rounded-t-3xl border-t border-slate-800 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 className="text-white font-bold text-lg">Agregar usuario</h2>
              <button onClick={() => setMostrarForm(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAgregar} className="px-5 pb-8 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-slate-400 text-xs">Nombre completo</Label>
                <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-12 bg-slate-900 border-slate-700 text-white" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-400 text-xs">Correo</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 bg-slate-900 border-slate-700 text-white" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-400 text-xs">Contraseña temporal</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 bg-slate-900 border-slate-700 text-white" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-400 text-xs">Rol</Label>
                <select
                  value={rol}
                  onChange={(e) => setRol(e.target.value)}
                  className="w-full h-12 rounded-lg px-3 text-sm bg-slate-900 border border-slate-700 text-white capitalize"
                >
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <Button type="submit" disabled={enviando} className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-600">
                {enviando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {enviando ? 'Creando...' : 'Crear usuario'}
              </Button>
              <p className="text-slate-500 text-xs text-center">Comparte el correo y la contraseña con la persona para que inicie sesión.</p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
