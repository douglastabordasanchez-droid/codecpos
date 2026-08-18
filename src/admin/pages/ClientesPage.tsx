import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Search } from 'lucide-react';
import { listarClientes } from '../lib/adminApi';
import { PageHeader, LoadingState, ErrorState, EmptyState, EstadoBadge, PlanBadge } from '../components/ui';

const ESTADOS = ['TODOS', 'ACTIVA', 'PRUEBA', 'VENCIDA', 'CANCELADA', 'SUSPENDIDA', 'PENDIENTE_PAGO'];

function diasRestantes(fechaFin: string | null | undefined): number | null {
  if (!fechaFin) return null;
  const ms = new Date(fechaFin).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function ClientesPage() {
  const [clientes, setClientes] = useState<Awaited<ReturnType<typeof listarClientes>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('TODOS');

  useEffect(() => {
    listarClientes().then(setClientes).catch((e) => setError(e.message));
  }, []);

  const filtrados = useMemo(() => {
    if (!clientes) return [];
    return clientes.filter((c) => {
      const coincideBusqueda = c.nombre_negocio.toLowerCase().includes(busqueda.toLowerCase());
      const coincideEstado = filtroEstado === 'TODOS' || c.estado === filtroEstado;
      return coincideBusqueda && coincideEstado;
    });
  }, [clientes, busqueda, filtroEstado]);

  if (error) return <><PageHeader title="Clientes" /><ErrorState mensaje={error} /></>;

  return (
    <div>
      <PageHeader title="Clientes" subtitle={clientes ? `${clientes.length} en total` : undefined} />

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre de negocio…"
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
        >
          {ESTADOS.map((e) => <option key={e} value={e}>{e === 'TODOS' ? 'Todos los estados' : e}</option>)}
        </select>
      </div>

      {!clientes ? (
        <LoadingState />
      ) : filtrados.length === 0 ? (
        <EmptyState mensaje="No hay clientes que coincidan con la búsqueda." />
      ) : (
        <div className="space-y-2">
          {filtrados.map((c) => (
            <Link
              key={c.id}
              to={`/clientes/${c.id}`}
              className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-emerald-500/50 transition-colors"
            >
              <div>
                <p className="font-medium">{c.nombre_negocio}</p>
                {c.email && <p className="text-xs text-slate-500 mt-0.5">{c.email}</p>}
                {c.licencia_vigente?.estado === 'TRIAL' && (
                  <p className="text-xs text-amber-400 mt-0.5">
                    En prueba · {diasRestantes(c.licencia_vigente.fecha_fin_periodo_actual)} días restantes
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <PlanBadge plan={c.plan} />
                <EstadoBadge estado={c.estado} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
