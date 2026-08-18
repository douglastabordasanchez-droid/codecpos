import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ShieldCheck } from 'lucide-react';
import { listarUsuarios } from '../lib/adminApi';
import { PageHeader, LoadingState, ErrorState, EmptyState, EstadoBadge, PlanBadge } from '../components/ui';

export function UsuariosPage() {
  const [items, setItems] = useState<Awaited<ReturnType<typeof listarUsuarios>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listarUsuarios().then(setItems).catch((e) => setError(e.message));
  }, []);

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
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Empresa</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u: any) => (
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
                        <Link to={`/clientes/${u.clientes_pos.id}`} className="hover:text-emerald-400">{u.clientes_pos.nombre_negocio}</Link>
                        <PlanBadge plan={u.clientes_pos.plan} />
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{u.rol}</td>
                  <td className="px-4 py-3"><EstadoBadge estado={u.activo ? 'ACTIVO' : 'INACTIVA'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
