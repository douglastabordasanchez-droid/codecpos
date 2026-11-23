/**
 * «Pagos sin venta» en Ventas (caja, terminal, web y celular): transferencias que
 * llegaron por Codec Verify y no quedaron en ninguna venta. Cualquiera puede
 * Registrar (abre el punto de venta y la venta del mismo valor lo reconoce sola);
 * solo el administrador (o el modo administrador temporal) marca Revisado o
 * Limpia, y queda su nombre, así la cajera no los puede esconder.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, RefreshCw, Receipt, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { EVENTO_PAGOS_SIN_VENTA, limpiarPagosSinVenta, listarPagosSinVenta, marcarPagoRevisado, type PagoSinVenta, type VentaLocalCruce } from '../../app/lib/supabase/pagosSinVenta';
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
  /** Abre el punto de venta para registrar este pago (Ventas › Registrar). */
  onRegistrar?: (p: PagoSinVenta) => void;
  /** La lista de abajo (Ventas) muestra estos pagos como filas sin factura. */
  onPagos?: (p: PagoSinVenta[]) => void;
  className?: string;
}

const peso = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

function textoBanco(p: PagoSinVenta): string {
  const ref = String(p.referencia || '').replace(/^\[[^\]]+\]\s*/, '').trim();
  return ref.length > 90 ? `${ref.slice(0, 90)}…` : ref;
}

export function PagosSinVenta({ clienteId, desde, hasta, oscuro = true, cargarVentasLocales, puedeMarcar, quien, onRegistrar, onPagos, className = '' }: Props) {
  const [pagos, setPagos] = useState<PagoSinVenta[]>([]);
  const [cargando, setCargando] = useState(false);
  // Cerrado: se abre solo si la persona lo toca.
  const [abierto, setAbierto] = useState(false);
  const [limpiando, setLimpiando] = useState(false);
  const [marcando, setMarcando] = useState<string | null>(null);
  const desdeMs = desde.getTime();
  const onPagosRef = useRef(onPagos);
  onPagosRef.current = onPagos;
  const hastaMs = hasta?.getTime();

  const cargar = useCallback(async () => {
    if (!clienteId) return;
    setCargando(true);
    try {
      const locales = cargarVentasLocales ? await cargarVentasLocales().catch(() => []) : [];
      // Los pagos del último minuto se dejan quietos: la venta puede estar guardándose.
      const tope = Math.min(hastaMs ?? Date.now(), Date.now() - 60 * 1000);
      const lista = await listarPagosSinVenta(clienteId, new Date(desdeMs), new Date(tope), locales);
      setPagos(lista);
      onPagosRef.current?.(lista);
    } catch { /* sin conexión: se intenta en la próxima vuelta */ }
    finally { setCargando(false); }
  }, [clienteId, desdeMs, hastaMs, cargarVentasLocales]);

  useEffect(() => {
    void cargar();
    const t = window.setInterval(() => { void cargar(); }, 30_000);
    // Llegó un pago a esta caja: a los 65 s ya se sabe si quedó en una venta o no.
    let espera: number | undefined;
    const alLlegar = () => { window.clearTimeout(espera); espera = window.setTimeout(() => { void cargar(); }, 65_000); };
    const recargar = () => { void cargar(); };
    window.addEventListener('codecverify:pago_recibido', alLlegar);
    window.addEventListener(EVENTO_PAGOS_SIN_VENTA, recargar);
    return () => {
      window.clearInterval(t); window.clearTimeout(espera);
      window.removeEventListener('codecverify:pago_recibido', alLlegar);
      window.removeEventListener(EVENTO_PAGOS_SIN_VENTA, recargar);
    };
  }, [cargar]);

  const limpiarTodos = async () => {
    if (!window.confirm(`¿Eliminar los ${pagos.length} pagos sin venta de este periodo? Salen de Ventas y queda tu nombre como quien los eliminó.`)) return;
    setLimpiando(true);
    const n = await limpiarPagosSinVenta(pagos.map((p) => p.id), quien);
    setLimpiando(false);
    if (n > 0) { toast.success(`${n} ${n === 1 ? 'pago eliminado' : 'pagos eliminados'}`); window.dispatchEvent(new Event(EVENTO_PAGOS_SIN_VENTA)); }
    else toast.error('No se pudo eliminar. Revisa la conexión.');
  };

  const marcar = async (p: PagoSinVenta) => {
    setMarcando(p.id);
    const ok = await marcarPagoRevisado(p.id, quien);
    setMarcando(null);
    if (ok) {
      window.dispatchEvent(new Event(EVENTO_PAGOS_SIN_VENTA));
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
          <p className={`text-xs ${suave}`}>Llegaron por transferencia y no tienen factura. Están abajo en la lista sin número de factura; toca Añadir para cargarles los productos.</p>
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
              <div className="shrink-0 flex flex-col sm:flex-row gap-1.5">
                {onRegistrar && (
                  <button
                    type="button"
                    onClick={() => onRegistrar(p)}
                    className="px-3 py-2 rounded-lg text-xs font-bold bg-blue-600 text-[#fff] flex items-center justify-center gap-1"
                    title="Abre el punto de venta: agrega los productos y cobra con el mismo medio; el pago se reconoce solo"
                  >
                    <Receipt className="w-3.5 h-3.5" /> Añadir
                  </button>
                )}
                {puedeMarcar && (
                  <button
                    type="button"
                    disabled={marcando === p.id}
                    onClick={() => void marcar(p)}
                    className="px-3 py-2 rounded-lg text-xs font-bold bg-emerald-600 text-[#fff] flex items-center justify-center gap-1 disabled:opacity-60"
                    title="Ya se revisó: se registró a mano, era un abono o no es del negocio"
                  >
                    {marcando === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Revisado
                  </button>
                )}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <p className={`text-[11px] ${suave}`}>
              {puedeMarcar ? 'Revisado o Eliminar los saca de Ventas; queda tu nombre.' : 'Solo el administrador puede marcarlos como revisados o eliminarlos.'}
            </p>
            <div className="flex items-center gap-3 shrink-0">
              {puedeMarcar && (
                <button type="button" disabled={limpiando} onClick={() => void limpiarTodos()} className="text-xs font-bold flex items-center gap-1 text-red-500 disabled:opacity-60">
                  {limpiando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Eliminar todos
                </button>
              )}
              <button type="button" onClick={() => void cargar()} className={`text-xs font-bold flex items-center gap-1 ${titulo}`}>
                <RefreshCw className="w-3.5 h-3.5" /> Actualizar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
