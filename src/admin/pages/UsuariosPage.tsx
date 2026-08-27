import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ShieldCheck, KeyRound, Eye, EyeOff, X, Sparkles, Copy, Check } from 'lucide-react';
import { listarUsuarios, actualizarEmpleadoAdmin, resetearPasswordEmpleadoAdmin } from '../lib/adminApi';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { PageHeader, LoadingState, ErrorState, EmptyState, EstadoBadge, PlanBadge } from '../components/ui';

const ROLES = ['admin', 'super_usuario', 'cajero'];

export function UsuariosPage() {
  const { staff } = useAdminAuth();
  const soloLectura = staff?.nivelStaff === 'LECTURA';

  const [items, setItems] = useState<Awaited<ReturnType<typeof listarUsuarios>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<{ id: string; nombre: string } | null>(null);

  const cargar = () => {
    listarUsuarios().then(setItems).catch((e) => setError(e.message));
  };
  useEffect(cargar, []);

  const handleCambiarRol = async (id: string, rol: string) => {
    setProcesando(id);
    try {
      await actualizarEmpleadoAdmin(id, { rol });
      cargar();
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
    } catch (e: any) {
      alert('No se pudo actualizar: ' + e.message);
    } finally {
      setProcesando(null);
    }
  };

  if (error) return <><PageHeader title="Usuarios" /><ErrorState mensaje={error} /></>;

  return (
    <div>
      <PageHeader title="Usuarios" subtitle={items ? `${items.length} en total` : undefined} />
      {!items ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState mensaje="No hay usuarios registrados todavía." />
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-300 border-b border-slate-800">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Usuario (correo)</th>
                <th className="px-4 py-3 font-medium">Empresa</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                {!soloLectura && <th className="px-4 py-3 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((u: any) => {
                const editable = !soloLectura && !u.es_staff_codec;
                return (
                  <tr key={u.id} className="border-b border-slate-800/60 last:border-0">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5">
                        {u.nombre_completo}
                        {u.es_staff_codec && <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" aria-label="Staff Codec Studio" />}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{u.email || '—'}</td>
                    <td className="px-4 py-3">
                      {u.clientes_pos ? (
                        <span className="flex items-center gap-2">
                          <Link to={`/clientes/${u.clientes_pos.id}`} className="hover:text-amber-400">{u.clientes_pos.nombre_negocio}</Link>
                          <PlanBadge plan={u.clientes_pos.plan} />
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {editable ? (
                        <select
                          value={u.rol}
                          disabled={procesando === u.id}
                          onChange={(e) => handleCambiarRol(u.id, e.target.value)}
                          className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs outline-none focus:border-amber-500 disabled:opacity-50"
                        >
                          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      ) : u.rol}
                    </td>
                    <td className="px-4 py-3"><EstadoBadge estado={u.activo ? 'ACTIVO' : 'INACTIVA'} /></td>
                    {!soloLectura && (
                      <td className="px-4 py-3">
                        {editable && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleToggleActivo(u.id, u.activo)}
                              disabled={procesando === u.id}
                              className={`text-xs font-medium rounded-lg px-3 py-1.5 border disabled:opacity-50 ${
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
                              className="text-xs font-medium rounded-lg px-2.5 py-1.5 border bg-slate-800/60 text-slate-300 border-slate-700 hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
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
    </div>
  );
}

// Alfabeto sin caracteres ambiguos (0/O, 1/l/I) -- pensado para que Douglas
// la lea en voz alta o la pegue en WhatsApp sin que el cliente la transcriba mal.
const ALFABETO_TEMPORAL = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function generarPasswordTemporal(longitud = 10): string {
  const bytes = new Uint32Array(longitud);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALFABETO_TEMPORAL[b % ALFABETO_TEMPORAL.length]).join('');
}

function ResetPasswordModal({ empleadoId, nombre, onCerrar }: { empleadoId: string; nombre: string; onCerrar: () => void }) {
  const [password, setPassword] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiada, setCopiada] = useState(false);

  const handleGenerarYCopiar = async () => {
    const nueva = generarPasswordTemporal();
    setPassword(nueva);
    setMostrar(true);
    setError(null);
    setGuardando(true);
    try {
      await resetearPasswordEmpleadoAdmin(empleadoId, nueva);
      await navigator.clipboard.writeText(nueva);
      setCopiada(true);
      setTimeout(() => setCopiada(false), 3000);
    } catch (e: any) {
      setError(e.message || 'No se pudo generar la contraseña');
    } finally {
      setGuardando(false);
    }
  };

  const handleGuardar = async () => {
    if (password.length < 6) {
      setError('Mínimo 6 caracteres');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await resetearPasswordEmpleadoAdmin(empleadoId, password);
      onCerrar();
    } catch (e: any) {
      setError(e.message || 'No se pudo restablecer la contraseña');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onCerrar}>
      <div
        className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-white font-bold text-base flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-400" /> Restablecer contraseña
          </h3>
          <button onClick={onCerrar} className="text-slate-500 hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-slate-500 text-xs mb-4">{nombre}</p>

        <p className="text-slate-500 text-[11px] mb-3 bg-slate-800/50 border border-slate-800 rounded-lg px-3 py-2">
          Esto fija una contraseña NUEVA. No es posible ver la contraseña actual — está cifrada de forma
          irreversible, ni siquiera Codec Studio puede leerla.
        </p>

        <button
          onClick={handleGenerarYCopiar}
          disabled={guardando}
          className="w-full h-10 rounded-lg text-sm font-bold bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 flex items-center justify-center gap-2 mb-3"
        >
          {copiada ? <Check className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
          {copiada ? '¡Copiada al portapapeles!' : 'Generar y copiar contraseña temporal'}
        </button>

        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-slate-600 text-[10px] uppercase tracking-wide">o escríbela tú</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        <div className="relative mb-2">
          <input
            type={mostrar ? 'text' : 'password'}
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && handleGuardar()}
            placeholder="Nueva contraseña (mín. 6 caracteres)"
            autoFocus
            className="w-full h-10 pl-3 pr-9 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm outline-none focus:border-amber-500"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setMostrar((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
          >
            {mostrar ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {error && <p className="text-red-400 text-xs mb-2">{error}</p>}

        <div className="flex gap-2 mt-3">
          <button
            onClick={onCerrar}
            className="flex-1 h-9 rounded-lg text-sm font-medium bg-slate-800 text-slate-300 hover:bg-slate-700"
          >
            Cancelar
          </button>
          <button
            onClick={handleGuardar}
            disabled={guardando || password.length < 6}
            className="flex-1 h-9 rounded-lg text-sm font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-40"
          >
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
