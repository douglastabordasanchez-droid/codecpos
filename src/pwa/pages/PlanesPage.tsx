import { useEffect, useState } from 'react';
import { Check, Crown, Zap, Loader2, Tag, X } from 'lucide-react';
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
  precio_vitalicio: number | null;
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
 * Elegir plan -> modalidad -> resumen -> pagar con Mercado Pago (Checkout
 * Pro). El botón solo crea la preferencia y redirige -- el precio real lo
 * calcula el servidor (crear-pago-licencia, nunca confía en lo que se
 * muestra acá) y la licencia solo se activa cuando el webhook confirma el
 * pago contra la API de Mercado Pago (ver webhook-mercadopago). Los precios
 * vienen siempre de plan_catalogo_publico() (motor comercial real, mismo
 * cálculo que usan la landing y el Admin Web), nunca hardcodeados aquí.
 */
export default function PlanesPage() {
  const { empleado } = usePwaAuth();
  const [planes, setPlanes] = useState<PlanCatalogo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planSeleccionado, setPlanSeleccionado] = useState<string | null>(null);
  const [modalidad, setModalidad] = useState<Modalidad>('MENSUAL');
  const [procesandoPago, setProcesandoPago] = useState(false);
  const [codigoInput, setCodigoInput] = useState('');
  const [codigoAplicado, setCodigoAplicado] = useState<{ codigo: string; porcentaje: number } | null>(null);
  const [validandoCodigo, setValidandoCodigo] = useState(false);
  const [errorCodigo, setErrorCodigo] = useState<string | null>(null);

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
    return p.precio_vitalicio;
  };

  const handleAplicarCodigo = async () => {
    if (!codigoInput.trim()) return;
    setValidandoCodigo(true);
    setErrorCodigo(null);
    const client = getSupabaseClient();
    const { data, error: rpcError } = await client
      ? await client.rpc('validar_codigo_descuento', { p_codigo: codigoInput.trim() }).maybeSingle()
      : { data: null, error: null };
    setValidandoCodigo(false);

    if (rpcError || !data) {
      setErrorCodigo('No se pudo validar el código');
      return;
    }
    const fila = data as { valido: boolean; porcentaje: number | null; mensaje: string };
    if (!fila.valido || fila.porcentaje == null) {
      setErrorCodigo(fila.mensaje || 'Código inválido');
      return;
    }
    setCodigoAplicado({ codigo: codigoInput.trim().toUpperCase(), porcentaje: fila.porcentaje });
  };

  const quitarCodigo = () => {
    setCodigoAplicado(null);
    setCodigoInput('');
    setErrorCodigo(null);
  };

  const precioConDescuento = (precio: number): number =>
    codigoAplicado ? Math.round(precio * (1 - codigoAplicado.porcentaje / 100)) : precio;

  const handlePagar = async () => {
    if (!plan) return;
    const precio = precioPorModalidad(plan, modalidad);
    if (precio == null) return;

    setProcesandoPago(true);
    setError(null);
    const client = getSupabaseClient();
    if (!client) {
      setProcesandoPago(false);
      setError('nuestra base de datos no está configurada');
      return;
    }

    const { data, error: fnError } = await client.functions.invoke('crear-pago-licencia', {
      body: { planCodigo: plan.plan_codigo, modalidad, codigoDescuento: codigoAplicado?.codigo },
    });

    if (fnError || !data?.ok) {
      setProcesandoPago(false);
      setError(data?.error || fnError?.message || 'No se pudo iniciar el pago. Intenta de nuevo.');
      return;
    }

    window.location.href = data.initPoint;
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
                  {(() => {
                    const precio = precioPorModalidad(plan, modalidad);
                    if (precio == null) return <span className="font-bold">Consultar disponibilidad</span>;
                    if (!codigoAplicado) return <span className="font-bold">{formatoMoneda(precio)}</span>;
                    return (
                      <span className="text-right">
                        <span className="block text-xs text-slate-500 line-through">{formatoMoneda(precio)}</span>
                        <span className="font-bold text-emerald-400">{formatoMoneda(precioConDescuento(precio))}</span>
                      </span>
                    );
                  })()}
                </div>
                <div className="space-y-1.5 mt-3 text-sm text-slate-400">
                  <p className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Activación inmediata</p>
                  <p className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Cancela cuando quieras</p>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-800">
                  {codigoAplicado ? (
                    <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
                      <span className="flex items-center gap-2 text-sm text-emerald-400">
                        <Tag className="w-4 h-4" /> {codigoAplicado.codigo} aplicado (-{codigoAplicado.porcentaje}%)
                      </span>
                      <button onClick={quitarCodigo} className="text-slate-400 hover:text-white">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        value={codigoInput}
                        onChange={(e) => { setCodigoInput(e.target.value); setErrorCodigo(null); }}
                        placeholder="Código de descuento"
                        className="flex-1 bg-slate-950/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white uppercase outline-none focus:border-amber-500"
                      />
                      <button
                        onClick={handleAplicarCodigo}
                        disabled={validandoCodigo || !codigoInput.trim()}
                        className="text-sm font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg px-4"
                      >
                        {validandoCodigo ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aplicar'}
                      </button>
                    </div>
                  )}
                  {errorCodigo && <p className="text-red-400 text-xs mt-2">{errorCodigo}</p>}
                </div>
              </div>

              {error && (
                <p className="text-red-300 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-3">{error}</p>
              )}
              <Button
                onClick={handlePagar}
                disabled={procesandoPago || precioPorModalidad(plan, modalidad) == null}
                className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-600 disabled:opacity-50"
              >
                {procesandoPago ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {precioPorModalidad(plan, modalidad) == null ? 'No disponible todavía' : 'Pagar con Mercado Pago'}
              </Button>
              <p className="text-center text-xs text-slate-500 mt-3">
                Serás redirigido a Mercado Pago para completar el pago de forma segura.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
