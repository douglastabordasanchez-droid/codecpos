import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ShieldCheck } from 'lucide-react';
import { listarUsuarios, actualizarEmpleadoAdmin } from '../lib/adminApi';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { PageHeader, LoadingState, ErrorState, EmptyState, EstadoBadge, PlanBadge } from '../components/ui';

const ROLES = ['admin', 'super_usuario', 'cajero'];

export function UsuariosPage() {
  const { staff } = useAdminAuth();
  const soloLectura = staff?.nivelStaff === 'LECTURA';

  const [items, setItems] = useState<Awaited<ReturnType<typeof listarUsuarios>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);

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
    </div>
  );
}
