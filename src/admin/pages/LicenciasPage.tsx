import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Sparkles } from 'lucide-react';
import { listarLicencias } from '../lib/adminApi';
import { PageHeader, LoadingState, ErrorState, EmptyState, EstadoBadge, PlanBadge, formatoMoneda, formatoFecha } from '../components/ui';

const ESTADOS = ['TODAS', 'TRIAL', 'ACTIVA', 'PENDIENTE_PAGO', 'CANCELADA', 'EXPIRADA', 'SUSPENDIDA'];

export function LicenciasPage() {
  const [items, setItems] = useState<Awaited<ReturnType<typeof listarLicencias>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('TODAS');

  useEffect(() => {
    listarLicencias().then(setItems).catch((e) => setError(e.message));
  }, []);

  const filtradas = useMemo(() => {
    if (!items) return [];
    return filtro === 'TODAS' ? items : items.filter((l: any) => l.estado === filtro);
  }, [items, filtro]);

  if (error) return <><PageHeader title="Licencias" /><ErrorState mensaje={error} /></>;

  return (
    <div>
      <PageHeader title="Licencias" subtitle={items ? `${items.length} en total` : undefined} />

      <div className="flex gap-2 mb-5 flex-wrap">
        {ESTADOS.map((e) => (
          <button
            key={e}
            onClick={() => setFiltro(e)}
            className={`text-xs font-medium rounded-full px-3 py-1.5 border transition-colors ${
              filtro === e ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
            }`}
          >
            {e === 'TODAS' ? 'Todas' : e}
          </button>
        ))}
      </div>

      {!items ? (
        <LoadingState />
      ) : filtradas.length === 0 ? (
        <EmptyState mensaje="No hay licencias que coincidan con el filtro." />
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-300 border-b border-slate-800">
                <th className="px-4 py-3 font-medium">Empresa</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Modalidad</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Precio aplicado</th>
                <th className="px-4 py-3 font-medium">Próxima renovación</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((l: any) => {
                const esVitalicio = l.modalidad === 'VITALICIA';
                return (
                  <tr key={l.id} className="border-b border-slate-800/60 last:border-0">
                    <td className="px-4 py-3">
                      {l.clientes_pos ? (
                        <Link to={`/clientes/${l.clientes_pos.id}`} className="hover:text-amber-400">{l.clientes_pos.nombre_negocio}</Link>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3"><PlanBadge plan={l.planes?.codigo} /></td>
                    <td className="px-4 py-3">
                      {esVitalicio ? (
                        <span className="inline-flex items-center gap-1 text-violet-300 text-xs font-medium"><Sparkles className="w-3.5 h-3.5" />Vitalicio</span>
                      ) : l.modalidad}
                    </td>
                    <td className="px-4 py-3"><EstadoBadge estado={l.vigente ? l.estado : `${l.estado} (histórica)`} /></td>
                    <td className="px-4 py-3 tabular-nums">{formatoMoneda(l.precio_aplicado)}</td>
                    <td className="px-4 py-3 text-slate-400">{esVitalicio ? '— (pago único)' : formatoFecha(l.fecha_fin_periodo_actual)}</td>
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
