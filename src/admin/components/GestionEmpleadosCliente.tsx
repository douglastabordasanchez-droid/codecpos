import { useEffect, useState } from 'react';
import { KeyRound, Plus, Trash2, X } from 'lucide-react';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { listarEmpleadosCliente, crearEmpleadoAdmin, actualizarEmpleadoAdmin, eliminarEmpleadoAdmin } from '../lib/adminApi';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { SectionCard, LoadingState, EmptyState, EstadoBadge } from './ui';
import { ResetPasswordModal } from './ResetPasswordModal';

const ROLES = ['super_usuario', 'admin', 'cajero', 'tecnico', 'cocina', 'barra', 'mesero'];

type EmpleadoFila = Awaited<ReturnType<typeof listarEmpleadosCliente>>[number];

export function GestionEmpleadosCliente({ clienteId, onCambio }: { clienteId: string; onCambio?: () => void }) {
  const { staff } = useAdminAuth();
  const soloLectura = staff?.nivelStaff === 'LECTURA';

  const [items, setItems] = useState<EmpleadoFila[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<{ id: string; nombre: string } | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nuevo, setNuevo] = useState({ nombreCompleto: '', email: '', password: '', rol: 'cajero', telefono: '' });
  const [creando, setCreando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  const cargar = () => {
    listarEmpleadosCliente(clienteId).then(setItems).catch((e) => setError(e.message));
  };

  useEffect(cargar, [clienteId]);

  // Altas/cambios de rol/activo hechos desde Electron o la PWA para este
  // mismo cliente deben verse aquí sin recargar la página.
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    const canal = client
      .channel(`empleados-admin-${clienteId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'empleados', filter: `cliente_id=eq.${clienteId}` }, () => cargar())
      .subscribe();
    return () => { client.removeChannel(canal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  const handleCambiarRol = async (id: string, rol: string) => {
    setProcesando(id);
    try {
      await actualizarEmpleadoAdmin(id, { rol });
      cargar();
      onCambio?.();
    } catch (e: any) {
      alert('No se pudo cambiar el rol: ' + e.message);
    } finally {
      setProcesando(null);
    }
  };

  const handleToggleActivo = async (id: string, activoActual: boolean) => {
    setProcesando(id);
    try {
      await actualizarEmpleadoAdmin(id, { activo: !activoActual });
      cargar();
      onCambio?.();
    } catch (e: any) {
      alert('No se pudo actualizar: ' + e.message);
    } finally {
      setProcesando(null);
    }
  };

  const handleEliminar = async (id: string, nombre: string) => {
    if (!window.confirm(`¿Eliminar definitivamente a ${nombre}? Esta acción no se puede deshacer.`)) return;
    setProcesando(id);
    try {
      await eliminarEmpleadoAdmin(id);
      cargar();
      onCambio?.();
    } catch (e: any) {
      alert('No se pudo eliminar: ' + e.message);
    } finally {
      setProcesando(null);
    }
  };

  const handleCrear = async () => {
    if (!nuevo.nombreCompleto.trim() || !nuevo.email.trim() || nuevo.password.length < 6) {
      setErrorForm('Completa nombre, correo y una contraseña de al menos 6 caracteres');
      return;
    }
    setCreando(true);
    setErrorForm(null);
    try {
      await crearEmpleadoAdmin(clienteId, {
        nombreCompleto: nuevo.nombreCompleto.trim(),
        email: nuevo.email.trim(),
        password: nuevo.password,
        rol: nuevo.rol,
        telefono: nuevo.telefono.trim() || undefined,
      });
      setNuevo({ nombreCompleto: '', email: '', password: '', rol: 'cajero', telefono: '' });
      setMostrarForm(false);
      cargar();
      onCambio?.();
    } catch (e: any) {
      setErrorForm(e.message);
    } finally {
      setCreando(false);
    }
  };

  return (
    <SectionCard
      title="Usuarios del negocio"
      className="mb-6"
    >
      {!soloLectura && (
        <div className="flex justify-end mb-3">
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="flex items-center gap-1.5 text-sm bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 rounded-lg px-3 py-1.5"
          >
            <Plus className="w-4 h-4" /> Agregar usuario
          </button>
        </div>
      )}

      {mostrarForm && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              placeholder="Nombre completo"
              value={nuevo.nombreCompleto}
              onChange={(e) => setNuevo((f) => ({ ...f, nombreCompleto: e.target.value }))}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
            />
            <input
              type="email"
              placeholder="Correo"
              value={nuevo.email}
              onChange={(e) => setNuevo((f) => ({ ...f, email: e.target.value }))}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
            />
            <input
              type="password"
              placeholder="Contraseña (mín. 6 caracteres)"
              value={nuevo.password}
              onChange={(e) => setNuevo((f) => ({ ...f, password: e.target.value }))}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
            />
            <input
              placeholder="Teléfono (opcional)"
              value={nuevo.telefono}
              onChange={(e) => setNuevo((f) => ({ ...f, telefono: e.target.value }))}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
            />
            <select
              value={nuevo.rol}
              onChange={(e) => setNuevo((f) => ({ ...f, rol: e.target.value }))}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
            >
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {errorForm && <p className="text-red-400 text-xs">{errorForm}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => { setMostrarForm(false); setErrorForm(null); }}
              className="flex items-center gap-1.5 text-sm bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-lg px-3 py-2"
            >
              <X className="w-4 h-4" /> Cancelar
            </button>
            <button
              onClick={handleCrear}
              disabled={creando}
              className="flex-1 text-sm font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-50 rounded-lg px-3 py-2"
            >
              {creando ? 'Creando...' : 'Crear usuario'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
      {!items ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState mensaje="Este cliente todavía no tiene usuarios." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-300 border-b border-slate-800">
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">Correo</th>
                <th className="px-3 py-2 font-medium">Rol</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                {!soloLectura && <th className="px-3 py-2 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-3 py-2">{u.nombre_completo}</td>
                  <td className="px-3 py-2 text-slate-400 font-mono text-xs">{u.email || '—'}</td>
                  <td className="px-3 py-2">
                    {soloLectura ? u.rol : (
                      <select
                        value={u.rol}
                        disabled={procesando === u.id}
                        onChange={(e) => handleCambiarRol(u.id, e.target.value)}
                        className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs outline-none focus:border-amber-500 disabled:opacity-50"
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-2"><EstadoBadge estado={u.activo ? 'ACTIVO' : 'INACTIVA'} /></td>
                  {!soloLectura && (
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleActivo(u.id, u.activo)}
                          disabled={procesando === u.id}
                          className={`text-xs font-medium rounded-lg px-2.5 py-1.5 border disabled:opacity-50 ${
                            u.activo
                              ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                          }`}
                        >
                          {u.activo ? 'Desactivar' : 'Activar'}
                        </button>
                        <button
                          onClick={() => setResetTarget({ id: u.id, nombre: u.nombre_completo })}
                          disabled={procesando === u.id}
                          title="Restablecer contraseña"
                          className="text-xs font-medium rounded-lg px-2 py-1.5 border bg-slate-800/60 text-slate-300 border-slate-700 hover:bg-slate-800 disabled:opacity-50"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleEliminar(u.id, u.nombre_completo)}
                          disabled={procesando === u.id}
                          title="Eliminar"
                          className="text-xs font-medium rounded-lg px-2 py-1.5 border bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20 disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resetTarget && (
        <ResetPasswordModal
          empleadoId={resetTarget.id}
          nombre={resetTarget.nombre}
          onCerrar={() => setResetTarget(null)}
        />
      )}
    </SectionCard>
  );
}
