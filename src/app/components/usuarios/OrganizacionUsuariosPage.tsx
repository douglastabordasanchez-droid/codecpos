/**
 * Usuarios de la organización — respaldados por Supabase (misma tabla
 * `empleados` que usa el login de la PWA), a diferencia del roster local por
 * PIN que gestiona UsuariosPage.tsx (usuariosStorage, sin cuenta de Supabase
 * Auth). Es la única vía en Electron para crear/promover admins y para que
 * el usuario quede visible desde el panel web y la app móvil. Solo visible
 * para admin/super_usuario de una instalación ya vinculada a la nube.
 */
import { useEffect, useState } from 'react';
import { Users, Plus, Loader2, ShieldCheck, X, Cloud } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useAuth } from '../../contexts/AuthContext';
import { getSupabaseClient } from '../../lib/supabase/config';
import { isLinked, getLinkedClienteId } from '../../lib/supabase/tenantLink';
import { esModuloActivoGlobal, MODULOS_CATALOGO, ModuloPOS } from '../../lib/permissions';

interface EmpleadoFila {
  id: string;
  nombre_completo: string;
  rol: string;
  activo: boolean;
  permisos: { modulosHabilitados?: string[] } | null;
}

const ROLES = ['cajero', 'admin', 'super_usuario', 'tecnico', 'cocina', 'barra', 'mesero'];

export default function OrganizacionUsuariosPage() {
  const { usuarioActual } = useAuth();
  const clienteId = getLinkedClienteId();
  const esAdmin = !!usuarioActual && ['admin', 'super_usuario'].includes(usuarioActual.rol as string);

  const [equipo, setEquipo] = useState<EmpleadoFila[]>([]);
  const [cargando, setCargando] = useState(true);
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

  const cargar = async () => {
    if (!clienteId) return;
    const client = getSupabaseClient();
    if (!client) return;
    setCargando(true);
    const { data } = await client
      .from('empleados')
      .select('id, nombre_completo, rol, activo, permisos')
      .eq('cliente_id', clienteId)
      .order('nombre_completo');
    setEquipo((data as EmpleadoFila[]) || []);
    setCargando(false);
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  useEffect(() => {
    if (!clienteId) return;
    const client = getSupabaseClient();
    if (!client) return;
    const canal = client
      .channel(`empleados-electron-${clienteId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'empleados', filter: `cliente_id=eq.${clienteId}` }, () => cargar())
      .subscribe();
    return () => { client.removeChannel(canal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  const toggleActivo = async (fila: EmpleadoFila) => {
    if (fila.id === usuarioActual?.id) return;
    const client = getSupabaseClient()!;
    const nuevo = !fila.activo;
    setEquipo((prev) => prev.map((e) => (e.id === fila.id ? { ...e, activo: nuevo } : e)));
    const { error: rpcError } = await client.rpc('actualizar_empleado_admin', {
      p_empleado_id: fila.id, p_activo: nuevo, p_rol: fila.rol,
    });
    if (rpcError) {
      setEquipo((prev) => prev.map((e) => (e.id === fila.id ? { ...e, activo: !nuevo } : e)));
      alert('No se pudo actualizar: ' + rpcError.message);
    }
  };

  const cambiarRol = async (fila: EmpleadoFila, nuevoRol: string) => {
    const client = getSupabaseClient()!;
    const anterior = fila.rol;
    setEquipo((prev) => prev.map((e) => (e.id === fila.id ? { ...e, rol: nuevoRol } : e)));
    const { error: rpcError } = await client.rpc('actualizar_empleado_admin', {
      p_empleado_id: fila.id, p_activo: fila.activo, p_rol: nuevoRol,
    });
    if (rpcError) {
      setEquipo((prev) => prev.map((e) => (e.id === fila.id ? { ...e, rol: anterior } : e)));
      alert('No se pudo cambiar el rol: ' + rpcError.message);
    }
  };

  const handleAgregar = async () => {
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
    cargar();
  };

  const modulosNegocio = MODULOS_CATALOGO.filter((m) => m.categoria !== 'desarrollador' && esModuloActivoGlobal(m.id));

  const abrirPermisos = (e: EmpleadoFila) => {
    const actuales = e.permisos?.modulosHabilitados;
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
    cargar();
  };

  if (!isLinked() || !clienteId) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <Cloud className="w-8 h-8 text-gray-400 mb-2" />
        <p className="text-gray-500 text-sm">Vincula esta instalación con tu licencia en la nube para gestionar usuarios de la organización.</p>
      </div>
    );
  }

  if (!esAdmin) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <ShieldCheck className="w-8 h-8 text-gray-400 mb-2" />
        <p className="text-gray-500 text-sm">Solo administradores pueden ver esta sección.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <div className="rounded-2xl shadow-xl p-6 bg-white border border-gray-200">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-lg">
                <Cloud className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-gray-900">Usuarios de la organización</h1>
                <p className="text-sm text-gray-500">
                  Se sincronizan con la nube y son visibles desde la app móvil y el panel web. El equipo local con PIN es independiente y no aparece aquí.
                </p>
              </div>
            </div>
            <Button
              onClick={() => setMostrarForm(true)}
              className="bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white font-bold shadow-lg h-11 px-5 rounded-xl"
            >
              <Plus className="w-5 h-5 mr-2" /> Agregar usuario
            </Button>
          </div>
        </div>

        <div className="rounded-2xl shadow-xl p-4 bg-white border border-gray-200">
          {cargando ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-sky-500 animate-spin" /></div>
          ) : equipo.length === 0 ? (
            <div className="text-center py-10">
              <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Nadie más tiene acceso a la nube todavía</p>
            </div>
          ) : (
            <div className="space-y-2">
              {equipo.map((e) => {
                const restringido = (e.permisos?.modulosHabilitados?.length || 0) > 0;
                const puedeEditar = e.rol !== 'super_usuario' && e.id !== usuarioActual?.id;
                return (
                  <div key={e.id} className="flex items-center justify-between gap-3 border border-gray-100 rounded-xl p-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-gray-900 truncate">{e.nombre_completo}{e.id === usuarioActual?.id ? ' (tú)' : ''}</p>
                      {puedeEditar && (
                        <button onClick={() => abrirPermisos(e)} className={`text-[11px] font-bold ${restringido ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {restringido ? 'Módulos restringidos — editar' : 'Todos los módulos — editar'}
                        </button>
                      )}
                    </div>
                    <select
                      value={e.rol}
                      onChange={(ev) => cambiarRol(e, ev.target.value)}
                      disabled={e.id === usuarioActual?.id}
                      className="h-9 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 text-sm px-2 disabled:opacity-50"
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button
                      onClick={() => toggleActivo(e)}
                      disabled={e.id === usuarioActual?.id}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold disabled:opacity-50 ${e.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}
                    >
                      {e.activo ? 'Activo' : 'Inactivo'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {mostrarForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-gray-900 font-bold text-lg">Agregar usuario</h2>
              <button onClick={() => setMostrarForm(false)} className="text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nombre completo</Label>
                <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Correo</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Contraseña temporal</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Rol</Label>
                <select
                  value={rol}
                  onChange={(e) => setRol(e.target.value)}
                  className="w-full h-10 rounded-lg px-3 text-sm bg-gray-50 border border-gray-200 text-gray-900 capitalize"
                >
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <Button onClick={handleAgregar} disabled={enviando} className="w-full h-11 bg-gradient-to-r from-sky-600 to-blue-600">
                {enviando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {enviando ? 'Creando...' : 'Crear usuario'}
              </Button>
              <p className="text-gray-400 text-xs text-center">Comparte el correo y la contraseña con la persona para que inicie sesión.</p>
            </div>
          </div>
        </div>
      )}

      {editandoPermisos && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-1 shrink-0">
              <h2 className="text-gray-900 font-bold text-lg">Permisos</h2>
              <button onClick={() => setEditandoPermisos(null)} className="text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-gray-500 text-xs mb-3 shrink-0">{editandoPermisos.nombre_completo}</p>
            <div className="flex-1 overflow-y-auto space-y-1.5">
              {modulosNegocio.map((m) => {
                const activo = permisosSel.has(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => togglePermiso(m.id)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border text-left ${
                      activo ? 'bg-emerald-50 border-emerald-300' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <span className="text-sm font-semibold text-gray-900">{m.icono} {m.nombre}</span>
                    <span className={`w-5 h-5 rounded-md ${activo ? 'bg-emerald-500' : 'border border-gray-300'}`} />
                  </button>
                );
              })}
            </div>
            <div className="pt-4 shrink-0">
              {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
              <Button onClick={guardarPermisos} disabled={guardandoPermisos} className="w-full h-11 bg-gradient-to-r from-sky-600 to-blue-600">
                {guardandoPermisos ? 'Guardando...' : 'Guardar permisos'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
