import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { listarSucursales } from '../lib/adminApi';
import { PageHeader, LoadingState, ErrorState, EmptyState, EstadoBadge, PlanBadge } from '../components/ui';

export function SucursalesPage() {
  const [items, setItems] = useState<Awaited<ReturnType<typeof listarSucursales>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listarSucursales().then(setItems).catch((e) => setError(e.message));
  }, []);

  if (error) return <><PageHeader title="Sucursales" /><ErrorState mensaje={error} /></>;

  return (
    <div>
      <PageHeader title="Sucursales" subtitle={items ? `${items.length} en total` : undefined} />
      {!items ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState mensaje="No hay sucursales registradas todavía." />
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="px-4 py-3 font-medium">Empresa</th>
                <th className="px-4 py-3 font-medium">Sucursal</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s: any) => (
                <tr key={s.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-4 py-3">
                    {s.clientes_pos ? (
                      <Link to={`/clientes/${s.clientes_pos.id}`} className="hover:text-emerald-400">{s.clientes_pos.nombre_negocio}</Link>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {s.nombre} {s.es_principal && <span className="text-xs text-slate-500">(principal)</span>}
                    {s.direccion && <p className="text-xs text-slate-600">{s.direccion}</p>}
                  </td>
                  <td className="px-4 py-3"><PlanBadge plan={s.clientes_pos?.plan} /></td>
                  <td className="px-4 py-3"><EstadoBadge estado={s.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
