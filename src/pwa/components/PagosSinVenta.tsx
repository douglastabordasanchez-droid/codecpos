/**
 * «Pagos sin venta» en Ventas (caja, terminal, web y celular): transferencias que
 * llegaron por Codec Verify y no quedaron en ninguna venta. Solo el administrador
 * las marca como revisadas (queda su nombre), así la cajera no las puede esconder.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { listarPagosSinVenta, marcarPagoRevisado, type PagoSinVenta, type VentaLocalCruce } from '../../app/lib/supabase/pagosSinVenta';
import { nombreMedioPago } from '../../app/lib/voz';

interface Props {
  clienteId: string | null | undefined;
  desde: Date;
  hasta?: Date;
  oscuro?: boolean;
  /** Ventas de este equipo (caja o terminal) que quizá aún no subieron a la nube. */
  cargarVentasLocales?: () => Promise<VentaLocalCruce[]>;
  puedeMarcar: boolean;
  quien: string;
  className?: string;
}

const peso = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

function textoBanco(p: PagoSinVenta): string {
  const ref = String(p.referencia || '').replace(/^\[[^\]]+\]\s*/, '').trim();
  return ref.length > 90 ? `${ref.slice(0, 90)}…` : ref;
}

export function PagosSinVenta({ clienteId, desde, hasta, oscuro = true, cargarVentasLocales, puedeMarcar, quien, className = '' }: Props) {
  const [pagos, setPagos] = useState<PagoSinVenta[]>([]);
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [marcando, setMarcando] = useState<string | null>(null);
  const desdeMs = desde.getTime();
  const hastaMs = hasta?.getTime();

  const cargar = useCallback(async () => {
    if (!clienteId) return;
    setCargando(true);
    try {
      const locales = cargarVentasLocales ? await cargarVentasLocales().catch(() => []) : [];
      // Los pagos de los últimos 3 minutos se dejan quietos: la venta puede estar guardándose.
      const tope = Math.min(hastaMs ?? Date.now(), Date.now() - 3 * 60 * 1000);
      setPagos(await listarPagosSinVenta(clienteId, new Date(desdeMs), new Date(tope), locales));
    } catch { /* sin conexión: se intenta en la próxima vuelta */ }
    finally { setCargando(false); }
  }, [clienteId, desdeMs, hastaMs, cargarVentasLocales]);

  useEffect(() => {
    void cargar();
    const t = window.setInterval(() => { void cargar(); }, 60_000);
    return () => window.clearInterval(t);
  }, [cargar]);

  const marcar = async (p: PagoSinVenta) => {
    setMarcando(p.id);
    const ok = await marcarPagoRevisado(p.id, quien);
    setMarcando(null);
    if (ok) {
      setPagos((xs) => xs.filter((x) => x.id !== p.id));
      toast.success(`Pago de ${peso(p.monto)} marcado como revisado`);
    } else {
      toast.error('No se pudo marcar. Revisa la conexión.');
    }
  };

  if (!clienteId || pagos.length === 0) return null;
  const total = pagos.reduce((s, p) => s + p.monto, 0);

  const caja = oscuro ? 'bg-amber-500/10 border-amber-500/40' : 'bg-amber-50 border-amber-300';
  const titulo = oscuro ? 'text-amber-300' : 'text-amber-800';
  const suave = oscuro ? 'text-slate-400' : 'text-slate-600';
  const fila = oscuro ? 'bg-slate-900/60 border-slate-700' : 'bg-white border-amber-200';
  const fuerte = oscuro ? 'text-white' : 'text-slate-900';

  return (
    <div className={`rounded-2xl border ${caja} ${className}`}>
      <button type="button" onClick={() => setAbierto((v) => !v)} className="w-full flex items-center gap-3 p-4 text-left">
        <AlertTriangle className={`w-6 h-6 shrink-0 ${titulo}`} />
        <div className="flex-1 min-w-0">
          <p className={`font-black ${titulo}`}>
            {pagos.length} {pagos.length === 1 ? 'pago recibido sin venta' : 'pagos recibidos sin venta'} · {peso(total)}
          </p>
          <p className={`text-xs ${suave}`}>Llegaron por transferencia y no aparecen en ninguna venta de este periodo.</p>
        </div>
        {cargando && <Loader2 className={`w-4 h-4 animate-spin ${suave}`} />}
        <ChevronDown className={`w-5 h-5 shrink-0 transition ${titulo} ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && (
        <div className="px-4 pb-4 space-y-2">
          {pagos.map((p) => (
            <div key={p.id} className={`rounded-xl border p-3 flex items-center gap-3 ${fila}`}>
              <div className="flex-1 min-w-0">
                <p className={`font-black ${fuerte}`}>
                  {peso(p.monto)} <span className={`font-semibold text-sm ${suave}`}>por {nombreMedioPago(p.entidad) || 'transferencia'}</span>
                </p>
                <p className={`text-xs ${suave}`}>
                  {new Date(p.created_at).toLocaleString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                  {textoBanco(p) ? ` · ${textoBanco(p)}` : ''}
                </p>
              </div>
              {puedeMarcar && (
                <button
                  type="button"
                  disabled={marcando === p.id}
                  onClick={() => void marcar(p)}
                  className="shrink-0 px-3 py-2 rounded-lg text-xs font-bold bg-emerald-600 text-[#fff] flex items-center gap-1 disabled:opacity-60"
                  title="Ya se revisó: se registró a mano, era un abono o no es del negocio"
                >
                  {marcando === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Revisado
                </button>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <p className={`text-[11px] ${suave}`}>
              {puedeMarcar ? 'Marca «Revisado» cuando confirmes de dónde vino el pago; queda tu nombre.' : 'Solo el administrador puede marcarlos como revisados.'}
            </p>
            <button type="button" onClick={() => void cargar()} className={`text-xs font-bold flex items-center gap-1 ${titulo}`}>
              <RefreshCw className="w-3.5 h-3.5" /> Actualizar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
