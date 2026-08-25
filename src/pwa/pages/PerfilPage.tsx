import { useEffect, useState, FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import Cropper, { Area } from 'react-easy-crop';
import imageCompression from 'browser-image-compression';
import { toast } from 'sonner';
import {
  LogOut, User, Settings, ChevronRight, Crown, Zap, Users, Plus, X, Loader2, ShieldCheck, Check,
  Pencil, Camera, Cake, Phone as PhoneIcon, Fingerprint,
} from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import { Label } from '../../app/components/ui/label';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { useModulosActivos } from '../hooks/useModulosActivos';
import { MODULOS_CATALOGO, ModuloPOS } from '../../app/lib/permissions';
import {
  huellaDisponibleEnDispositivo, huellaHabilitada, habilitarHuella, deshabilitarHuella,
} from '../lib/huellaLock';
import logo from '/logo.png';

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', reject);
    image.src = url;
  });
}

async function recortarImagen(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, pixelCrop.width, pixelCrop.height
  );
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.92));
}

interface EmpleadoFila {
  id: string;
  nombre_completo: string;
  rol: string;
  activo: boolean;
  permisos: { modulosHabilitados?: string[] } | null;
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
  const { tieneModulo } = useModulosActivos();

  const [editandoPerfil, setEditandoPerfil] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);
  const [equipo, setEquipo] = useState<EmpleadoFila[]>([]);
  const [cargandoEquipo, setCargandoEquipo] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoPermisos, setEditandoPermisos] = useState<EmpleadoFila | null>(null);
  const [permisosSel, setPermisosSel] = useState<Set<ModuloPOS>>(new Set());
  const [guardandoPermisos, setGuardandoPermisos] = useState(false);

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState('cajero');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [huellaSoportada, setHuellaSoportada] = useState(false);
  const [huellaActiva, setHuellaActiva] = useState(false);
  const [activandoHuella, setActivandoHuella] = useState(false);

  useEffect(() => {
    huellaDisponibleEnDispositivo().then(setHuellaSoportada);
    if (empleado) setHuellaActiva(huellaHabilitada(empleado.id));
  }, [empleado]);

  const alternarHuella = async () => {
    if (!empleado) return;
    if (huellaActiva) {
      deshabilitarHuella(empleado.id);
      setHuellaActiva(false);
      toast.info('Desbloqueo con huella desactivado');
      return;
    }
    setActivandoHuella(true);
    const resultado = await habilitarHuella(empleado.id, empleado.nombre_completo);
    setActivandoHuella(false);
    if (resultado.ok) {
      setHuellaActiva(true);
      toast.success('Huella activada — la app se bloqueará tras 10 min en segundo plano');
    } else {
      toast.error(resultado.error || 'No se pudo activar la huella en este dispositivo');
    }
  };

  const cargarEquipo = async () => {
    if (!empleado) return;
    const client = getSupabaseClient();
    if (!client) return;
    setCargandoEquipo(true);
    const [{ data: clienteData }, { data: empleadosData }] = await Promise.all([
      client.from('clientes_pos').select('plan').eq('id', empleado.cliente_id).maybeSingle(),
      esAdmin
        ? client.from('empleados').select('id, nombre_completo, rol, activo, permisos').eq('cliente_id', empleado.cliente_id).order('nombre_completo')
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

  const modulosNegocio = MODULOS_CATALOGO.filter((m) => m.categoria !== 'desarrollador' && tieneModulo(m.id));

  const abrirPermisos = (e: EmpleadoFila) => {
    const actuales = e.permisos?.modulosHabilitados;
    // Sin permisos explícitos = ve todo lo que el negocio tiene activo (mismo
    // criterio que Electron) — se refleja marcando todo por defecto, así el
    // dueño ve el estado real antes de empezar a restringir.
    setPermisosSel(new Set(actuales && actuales.length > 0 ? actuales as ModuloPOS[] : modulosNegocio.map((m) => m.id)));
    setError(null);
    setEditandoPermisos(e);
  };

  const togglePermiso = (modulo: ModuloPOS) => {
    setPermisosSel((prev) => {
      const next = new Set(prev);
      if (next.has(modulo)) next.delete(modulo); else next.add(modulo);
      return next;
    });
  };

  const guardarPermisos = async () => {
    if (!editandoPermisos) return;
    setGuardandoPermisos(true);
    const client = getSupabaseClient()!;
    const { error: rpcError } = await client.rpc('actualizar_permisos_empleado', {
      p_empleado_id: editandoPermisos.id,
      p_modulos: Array.from(permisosSel),
    });
    setGuardandoPermisos(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setEditandoPermisos(null);
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
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center overflow-hidden shrink-0 shadow-lg shadow-orange-500/20">
          {empleado?.foto_url ? (
            <img src={empleado.foto_url} alt={empleado.nombre_completo} className="w-full h-full object-cover" />
          ) : empleado ? (
            <User className="w-7 h-7 text-white" />
          ) : (
            <img src={logo} alt="CODEC" className="w-8 h-8 object-contain" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-white font-bold truncate">{empleado?.nombre_completo}</p>
          <p className="text-slate-400 text-xs capitalize">{empleado?.rol}</p>
          {(empleado?.telefono || empleado?.fecha_nacimiento) && (
            <div className="flex items-center gap-3 mt-1">
              {empleado?.telefono && (
                <span className="flex items-center gap-1 text-slate-500 text-[11px]">
                  <PhoneIcon className="w-3 h-3" /> {empleado.telefono}
                </span>
              )}
              {empleado?.fecha_nacimiento && (
                <span className="flex items-center gap-1 text-slate-500 text-[11px]">
                  <Cake className="w-3 h-3" /> {new Date(empleado.fecha_nacimiento + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                </span>
              )}
            </div>
          )}
        </div>
        {empleado && (
          <button
            onClick={() => setEditandoPerfil(true)}
            aria-label="Editar perfil"
            className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 active:scale-95 transition-transform"
          >
            <Pencil className="w-3.5 h-3.5 text-slate-300" />
          </button>
        )}
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
            {equipo.map((e, i) => {
              const restringido = (e.permisos?.modulosHabilitados?.length || 0) > 0;
              const puedeEditar = e.rol !== 'super_usuario';
              return (
                <motion.div
                  key={e.id}
                  custom={i}
                  initial="hidden"
                  animate="show"
                  variants={fadeUp}
                  onClick={() => puedeEditar && abrirPermisos(e)}
                  className={`bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-3 flex items-center justify-between ${
                    puedeEditar ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{e.nombre_completo}</p>
                    <p className="text-slate-500 text-xs capitalize">{e.rol}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!e.activo && <span className="text-xs text-red-400 font-bold">Inactivo</span>}
                    {puedeEditar && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        restringido ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'
                      }`}>
                        {restringido ? 'Restringido' : 'Todos los módulos'}
                      </span>
                    )}
                    {puedeEditar && <ChevronRight className="w-4 h-4 text-slate-500" />}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {huellaSoportada && (
        <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-4 mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Fingerprint className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm">Desbloqueo con huella</p>
              <p className="text-slate-500 text-xs">Bloquea la app tras 10 min en segundo plano</p>
            </div>
          </div>
          <button
            onClick={alternarHuella}
            disabled={activandoHuella}
            className={`shrink-0 w-11 h-6 rounded-full relative transition-colors disabled:opacity-50 ${
              huellaActiva ? 'bg-emerald-500' : 'bg-slate-700'
            }`}
          >
            {activandoHuella ? (
              <Loader2 className="w-4 h-4 text-white animate-spin absolute top-1 left-1" />
            ) : (
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${huellaActiva ? 'right-0.5' : 'left-0.5'}`} />
            )}
          </button>
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

      {editandoPermisos && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
          <div className="w-full bg-slate-950 rounded-t-3xl border-t border-slate-800 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
              <div className="min-w-0">
                <h2 className="text-white font-bold text-lg flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
                  Permisos
                </h2>
                <p className="text-slate-500 text-xs truncate">{editandoPermisos.nombre_completo}</p>
              </div>
              <button onClick={() => setEditandoPermisos(null)} className="text-slate-400 shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-slate-500 text-xs px-5 pb-3 shrink-0">
              Elige qué módulos puede usar. Solo se listan los que tu negocio tiene activos.
            </p>
            <div className="flex-1 overflow-y-auto px-5 space-y-1.5">
              {modulosNegocio.map((m) => {
                const activo = permisosSel.has(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => togglePermiso(m.id)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                      activo ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    <span className={`flex items-center gap-2.5 text-sm font-semibold ${activo ? 'text-white' : 'text-slate-500'}`}>
                      <span className="text-base leading-none">{m.icono}</span>
                      {m.nombre}
                    </span>
                    <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                      activo ? 'bg-emerald-500' : 'border border-slate-700'
                    }`}>
                      {activo && <Check className="w-3 h-3 text-slate-950" />}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="px-5 py-4 shrink-0">
              {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
              <Button onClick={guardarPermisos} disabled={guardandoPermisos} className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-600">
                {guardandoPermisos && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {guardandoPermisos ? 'Guardando...' : 'Guardar permisos'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {editandoPerfil && empleado && (
        <EditarPerfilSheet onCerrar={() => setEditandoPerfil(false)} />
      )}
    </div>
  );
}

// ── Editar mi perfil ─────────────────────────────────────────────────────────

function EditarPerfilSheet({ onCerrar }: { onCerrar: () => void }) {
  const { empleado, actualizarEmpleadoLocal } = usePwaAuth();

  const [nombre, setNombre] = useState(empleado?.nombre_completo || '');
  const [telefono, setTelefono] = useState(empleado?.telefono || '');
  const [fechaNacimiento, setFechaNacimiento] = useState(empleado?.fecha_nacimiento || '');
  const [fotoUrl, setFotoUrl] = useState(empleado?.foto_url || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [imagenOriginal, setImagenOriginal] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaRecorte, setAreaRecorte] = useState<Area | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  const handleSeleccionarFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImagenOriginal(reader.result as string);
    reader.readAsDataURL(file);
  };

  const confirmarRecorte = async () => {
    if (!imagenOriginal || !areaRecorte || !empleado) return;
    setSubiendoFoto(true);
    try {
      const blobRecortado = await recortarImagen(imagenOriginal, areaRecorte);
      const blobComprimido = await imageCompression(blobRecortado as File, {
        maxSizeMB: 0.3,
        maxWidthOrHeight: 500,
        useWebWorker: true,
        initialQuality: 0.85,
      });

      const client = getSupabaseClient()!;
      // Ruta determinística (no aleatoria): cada vez que cambia la foto se
      // sobreescribe la misma, en vez de acumular archivos huérfanos.
      const nombreArchivo = `${empleado.cliente_id}/${empleado.id}.jpg`;
      const { error: uploadError } = await client.storage
        .from('empleados-fotos')
        .upload(nombreArchivo, blobComprimido, { contentType: 'image/jpeg', upsert: true });

      if (uploadError) {
        toast.error('Error subiendo la foto', { description: uploadError.message });
        return;
      }

      const { data: pub } = client.storage.from('empleados-fotos').getPublicUrl(nombreArchivo);
      // Cache-bust: la URL pública es la misma de siempre para esta persona,
      // así que sin esto el navegador seguiría mostrando la foto vieja.
      setFotoUrl(`${pub.publicUrl}?t=${Date.now()}`);
      setImagenOriginal(null);
      toast.success('Foto lista');
    } finally {
      setSubiendoFoto(false);
    }
  };

  const guardar = async () => {
    if (!empleado) return;
    if (!nombre.trim()) { setError('El nombre no puede quedar vacío'); return; }
    setGuardando(true);
    setError(null);
    const client = getSupabaseClient()!;
    const cambios = {
      nombre_completo: nombre.trim(),
      telefono: telefono.trim() || null,
      fecha_nacimiento: fechaNacimiento || null,
      foto_url: fotoUrl || null,
    };
    const { error: e } = await client.from('empleados').update(cambios).eq('id', empleado.id);
    setGuardando(false);
    if (e) { setError(e.message); return; }
    actualizarEmpleadoLocal(cambios);
    toast.success('Perfil actualizado');
    onCerrar();
  };

  // ── Recorte de foto en curso: pantalla completa dedicada ──
  if (imagenOriginal) {
    return (
      <div className="fixed inset-0 bg-black z-[60] flex flex-col">
        <div className="relative flex-1">
          <Cropper
            image={imagenOriginal}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, area) => setAreaRecorte(area)}
          />
        </div>
        <div className="p-5 space-y-3 bg-slate-950 shrink-0">
          <input
            type="range" min={1} max={3} step={0.01} value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImagenOriginal(null)}
              className="flex-1 h-12 border-slate-700 text-slate-300 bg-slate-900">
              Cancelar
            </Button>
            <Button onClick={confirmarRecorte} disabled={subiendoFoto}
              className="flex-1 h-12 bg-gradient-to-r from-amber-500 to-orange-600">
              {subiendoFoto ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              {subiendoFoto ? 'Subiendo...' : 'Usar foto'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
      <div className="w-full bg-slate-950 rounded-t-3xl border-t border-slate-800 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-white font-bold text-lg">Editar perfil</h2>
          <button onClick={onCerrar} className="text-slate-400"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 pb-8 space-y-4">
          <div className="flex justify-center py-2">
            <label className="relative cursor-pointer">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center overflow-hidden shadow-lg shadow-orange-500/20">
                {fotoUrl ? (
                  <img src={fotoUrl} alt={nombre} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-10 h-10 text-white" />
                )}
              </div>
              <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-slate-800 border-2 border-slate-950 flex items-center justify-center">
                <Camera className="w-4 h-4 text-white" />
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handleSeleccionarFoto} />
            </label>
          </div>

          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs">Nombre completo</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-12 bg-slate-900 border-slate-700 text-white" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs">Teléfono</Label>
            <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} type="tel" inputMode="tel"
              placeholder="300 000 0000" className="h-12 bg-slate-900 border-slate-700 text-white" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs">Fecha de cumpleaños</Label>
            <Input value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} type="date"
              className="h-12 bg-slate-900 border-slate-700 text-white" />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <Button onClick={guardar} disabled={guardando} className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-600">
            {guardando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </div>
      </div>
    </div>
  );
}
