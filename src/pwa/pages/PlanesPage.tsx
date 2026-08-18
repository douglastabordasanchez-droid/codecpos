import { useEffect, useState } from 'react';
import { Check, Crown, Zap, Loader2 } from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';

type Modalidad = 'MENSUAL' | 'TRIMESTRAL' | 'ANUAL' | 'VITALICIA';

interface PlanCatalogo {
  plan_codigo: string;
  plan_nombre: string;
  precio_mensual: number | null;
  precio_trimestral: number | null;
  precio_anual: number | null;
  promocion_activa: boolean;
  precio_promocional_mensual: number | null;
}

const MODALIDADES: { valor: Modalidad; etiqueta: string }[] = [
  { valor: 'MENSUAL', etiqueta: 'Mensual' },
  { valor: 'TRIMESTRAL', etiqueta: 'Trimestral' },
  { valor: 'ANUAL', etiqueta: 'Anual' },
  { valor: 'VITALICIA', etiqueta: 'Vitalicio' },
];

const formatoMoneda = (valor: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(valor);

/**
 * Checkout PREPARATORIO (Fase 5, punto 32) -- elegir plan -> modalidad ->
 * resumen -> pagar. El botón de pago queda deshabilitado a propósito: la
 * integración real de Mercado Pago es una fase posterior (punto 31). Los
 * precios vienen siempre de plan_catalogo_publico() (motor comercial real,
 * mismo cálculo que usan la landing y el Admin Web), nunca hardcodeados aquí.
 */
export default function PlanesPage() {
  const { empleado } = usePwaAuth();
  const [planes, setPlanes] = useState<PlanCatalogo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planSeleccionado, setPlanSeleccionado] = useState<string | null>(null);
  const [modalidad, setModalidad] = useState<Modalidad>('MENSUAL');

  useEffect(() => {
    const client = getSupabaseClient();
    client?.rpc('plan_catalogo_publico').then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setPlanes(data as PlanCatalogo[]);
      if (data && data.length > 0) setPlanSeleccionado((data as PlanCatalogo[])[0].plan_codigo);
    });
  }, []);

  const plan = planes?.find((p) => p.plan_codigo === planSeleccionado) ?? null;

  const precioPorModalidad = (p: PlanCatalogo, m: Modalidad): number | null => {
    if (m === 'MENSUAL') return p.promocion_activa && p.precio_promocional_mensual != null ? p.precio_promocional_mensual : p.precio_mensual;
    if (m === 'TRIMESTRAL') return p.precio_trimestral;
    if (m === 'ANUAL') return p.precio_anual;
    return null; // Vitalicio: sin precio configurado todavía (ver configuracion_comercial.precio_vitalicio_premium)
  };

  if (error) return <div className="min-h-screen bg-slate-950 text-white p-6">{error}</div>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white p-6 pb-28">
      <h1 className="text-2xl font-black mb-1">Elige tu plan</h1>
      <p className="text-slate-400 text-sm mb-6">
        {empleado ? `Para ${empleado.nombre_completo}` : 'Selecciona el plan que mejor se ajuste a tu negocio.'}
      </p>

      {!planes ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-amber-400" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {planes.map((p) => (
              <button
                key={p.plan_codigo}
                onClick={() => setPlanSeleccionado(p.plan_codigo)}
                className={`text-left p-5 rounded-2xl border-2 transition-colors ${
                  planSeleccionado === p.plan_codigo
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-slate-800 bg-slate-900/60'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {p.plan_codigo === 'PREMIUM' ? <Crown className="w-4 h-4 text-amber-400" /> : <Zap className="w-4 h-4 text-slate-400" />}
                  <span className="font-bold">{p.plan_nombre}</span>
                </div>
                <p className="text-2xl font-black">
                  {precioPorModalidad(p, 'MENSUAL') != null ? formatoMoneda(precioPorModalidad(p, 'MENSUAL')!) : '—'}
                  <span className="text-sm font-normal text-slate-400"> /mes</span>
                </p>
                {p.promocion_activa && p.plan_codigo === 'PREMIUM' && (
                  <p className="text-xs text-emerald-400 mt-1">Precio de lanzamiento activo</p>
                )}
              </button>
            ))}
          </div>

          {plan && (
            <>
              <div className="flex gap-2 mb-6 overflow-x-auto">
                {MODALIDADES.map((m) => (
                  <button
                    key={m.valor}
                    onClick={() => setModalidad(m.valor)}
                    className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium border ${
                      modalidad === m.valor ? 'border-amber-500 bg-amber-500/10 text-amber-300' : 'border-slate-800 text-slate-400'
                    }`}
                  >
                    {m.etiqueta}
                  </button>
                ))}
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 mb-6">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Resumen</p>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-300">{plan.plan_nombre} · {MODALIDADES.find((m) => m.valor === modalidad)?.etiqueta}</span>
                  <span className="font-bold">
                    {precioPorModalidad(plan, modalidad) != null
                      ? formatoMoneda(precioPorModalidad(plan, modalidad)!)
                      : 'Consultar disponibilidad'}
                  </span>
                </div>
                <div className="space-y-1.5 mt-3 text-sm text-slate-400">
                  <p className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Activación inmediata</p>
                  <p className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Cancela cuando quieras</p>
                </div>
              </div>

              <Button disabled className="w-full h-12 opacity-60 cursor-not-allowed">
                Pagar -- próximamente
              </Button>
              <p className="text-center text-xs text-slate-500 mt-3">
                El pago en línea (Mercado Pago) se habilita en una fase posterior. Mientras tanto, escríbenos a soporte para activar tu plan.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
