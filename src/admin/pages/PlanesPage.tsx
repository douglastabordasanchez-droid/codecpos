import { useEffect, useState } from 'react';
import { Crown } from 'lucide-react';
import { listarPlanesConPrecios } from '../lib/adminApi';
import { PageHeader, SectionCard, LoadingState, ErrorState, formatoMoneda } from '../components/ui';

export function PlanesPage() {
  const [planes, setPlanes] = useState<Awaited<ReturnType<typeof listarPlanesConPrecios>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listarPlanesConPrecios().then(setPlanes).catch((e) => setError(e.message));
  }, []);

  if (error) return <><PageHeader title="Planes y precios" /><ErrorState mensaje={error} /></>;

  return (
    <div>
      <PageHeader title="Planes y precios" subtitle="Fuente única del motor comercial -- ninguna app duplica estos valores" />
      {!planes ? (
        <LoadingState />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
          {planes.map((p) => (
            <SectionCard key={p.plan_codigo} className={p.plan_codigo === 'PREMIUM' ? 'border-emerald-500/40' : ''}>
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-bold text-lg">{p.plan_nombre}</h2>
                {p.plan_codigo === 'PREMIUM' && <Crown className="w-4 h-4 text-emerald-400" />}
              </div>

              {p.promocion_activa && p.precio_promocional_mensual != null ? (
                <div className="mt-2">
                  <p className="text-2xl font-bold text-amber-400 tabular-nums">{formatoMoneda(p.precio_promocional_mensual)}<span className="text-sm font-normal text-slate-400">/mes</span></p>
                  <p className="text-xs text-slate-500 line-through">{formatoMoneda(p.precio_mensual)}/mes normal</p>
                  <p className="text-xs text-amber-400 mt-1">Promoción de lanzamiento activa</p>
                </div>
              ) : (
                <p className="text-2xl font-bold text-emerald-400 mt-2 tabular-nums">
                  {formatoMoneda(p.precio_mensual)}<span className="text-sm font-normal text-slate-400">/mes</span>
                </p>
              )}

              <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-800 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Trimestral</p>
                  <p className="font-medium tabular-nums">{formatoMoneda(p.precio_trimestral)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Anual</p>
                  <p className="font-medium tabular-nums">{formatoMoneda(p.precio_anual)}</p>
                </div>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-600 mt-4">El plan Vitalicio (pago único) y el Enterprise (personalizado) no tienen precio de lista público -- se gestionan por cliente en el detalle de cada uno.</p>
    </div>
  );
}
