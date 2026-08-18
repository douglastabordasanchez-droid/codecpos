import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { listarAuditoria } from '../lib/adminApi';
import { PageHeader, LoadingState, ErrorState, EmptyState, EstadoBadge, formatoFechaHora } from '../components/ui';

export function AuditoriaPage() {
  const [items, setItems] = useState<Awaited<ReturnType<typeof listarAuditoria>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listarAuditoria().then(setItems).catch((e) => setError(e.message));
  }, []);

  if (error) return <><PageHeader title="Auditoría" /><ErrorState mensaje={error} /></>;

  return (
    <div>
      <PageHeader title="Auditoría" subtitle="Bitácora de acciones del staff -- nunca visible para los clientes" />
      {!items ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState mensaje="Todavía no hay acciones registradas." />
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="px-4 py-3 font-medium">Cuándo</th>
                <th className="px-4 py-3 font-medium">Administrador</th>
                <th className="px-4 py-3 font-medium">Acción</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a: any) => (
                <tr key={a.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{formatoFechaHora(a.created_at)}</td>
                  <td className="px-4 py-3">{a.empleados?.nombre_completo ?? 'Sistema'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{a.accion}</td>
                  <td className="px-4 py-3">
                    {a.clientes_pos ? <Link to={`/clientes/${a.clientes_pos.id}`} className="hover:text-emerald-400">{a.clientes_pos.nombre_negocio}</Link> : '—'}
                  </td>
                  <td className="px-4 py-3"><EstadoBadge estado={a.resultado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
