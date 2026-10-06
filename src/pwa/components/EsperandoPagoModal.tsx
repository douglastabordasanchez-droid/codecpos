/**
 * "Esperando el pago" — al cobrar con Nequi, Daviplata, Bre-B o cualquier
 * transferencia y con Codec Verify activo, la venta espera a que el pago
 * llegue (lo detecta la app Android, el iPhone con Atajos o el correo) y se
 * confirma sola. Usa la misma espera por monto exacto y el mismo reclamo
 * atómico de Electron (suscribirPagoEsperado), así un pago nunca sirve para
 * dos ventas.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BellRing, Check, Loader2, X } from 'lucide-react';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { suscribirPagoEsperado, type NotificacionPagoRow } from '../../app/lib/supabase/codecVerifyService';
import { nombreMedioPago } from '../../app/lib/voz';
import { marcarMontoEsperado, colorMedioPago } from '../../app/lib/codecVerifyEspera';

export const METODOS_TRANSFERENCIA = ['nequi', 'daviplata', 'bre_b', 'bancolombia', 'davivienda', 'transferencia'];

export { esperandoMonto } from '../../app/lib/codecVerifyEspera';

interface Props {
  clienteId: string;
  monto: number;
  metodo: string;
  /** Identificador temporal con el que se reclama el pago (se reemplaza luego por el número de la venta). */
  clave: string;
  onPagado: (pago: NotificacionPagoRow) => void;
  onConfirmarManual: () => void;
  onCancelar: () => void;
}

export function EsperandoPagoModal({ clienteId, monto, metodo, clave, onPagado, onConfirmarManual, onCancelar }: Props) {
  const [recibido, setRecibido] = useState<NotificacionPagoRow | null>(null);
  const [segundos, setSegundos] = useState(0);
  const terminado = useRef(false);
  /** Aviso del banco de que entró dinero pero sin el valor (DaviPlata): el valor llega después por SMS. */
  const [avisoSinValor, setAvisoSinValor] = useState<{ entidad: string; hora: number } | null>(null);
  const nombre = nombreMedioPago(metodo) || 'transferencia';
  const estilo = colorMedioPago(metodo);

  useEffect(() => {
    marcarMontoEsperado(monto);
    const cancelar = suscribirPagoEsperado(monto, clave, (row) => {
      if (terminado.current) return;
      terminado.current = true;
      setRecibido(row);
      setTimeout(() => onPagado(row), 1400);
    }, clienteId);
    const client = getSupabaseClient();
    const canal = client?.channel(`aviso-sin-valor-${clave}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'codec_verify_eventos', filter: `cliente_id=eq.${clienteId}` }, (payload: any) => {
        if (payload?.new?.resultado === 'sin_valor' && !terminado.current) setAvisoSinValor({ entidad: payload.new.entidad || 'el banco', hora: Date.now() });
      })
      .subscribe();
    const reloj = window.setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => { cancelar?.(); if (canal) client?.removeChannel(canal); window.clearInterval(reloj); marcarMontoEsperado(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, monto, clave]);

  const tiempo = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`;

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-5" style={{ background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(3px)' }} role="dialog" aria-modal="true" aria-label="Esperando el pago">
      <style>{`
        @keyframes esperaOnda { 0% { transform: scale(.85); opacity: .7 } 100% { transform: scale(1.9); opacity: 0 } }
        @keyframes esperaEntrada { from { opacity: 0; transform: translateY(12px) scale(.97) } to { opacity: 1; transform: none } }
      `}</style>
      <div className="relative w-full max-w-sm overflow-hidden rounded-[28px]" style={{ background: '#ffffff', boxShadow: '0 30px 80px rgba(15,23,42,.35)', animation: 'esperaEntrada .25s ease-out' }}>
        {!recibido && (
          <button onClick={onCancelar} aria-label="Cancelar" className="absolute right-4 top-4 p-1.5 rounded-full" style={{ color: '#94a3b8' }}>
            <X className="w-5 h-5" />
          </button>
        )}
        <div className="px-7 pt-9 pb-6 text-center" style={{ background: recibido ? 'linear-gradient(180deg,#ecfdf5,#fff)' : `linear-gradient(180deg, ${estilo.fondo}, #ffffff)` }}>
          <div className="relative mx-auto mb-5 w-20 h-20">
            {!recibido && (
              <>
                <span className="absolute inset-0 rounded-full" style={{ background: estilo.color, animation: 'esperaOnda 1.8s ease-out infinite' }} />
                <span className="absolute inset-0 rounded-full" style={{ background: estilo.color, animation: 'esperaOnda 1.8s ease-out .9s infinite' }} />
              </>
            )}
            <div className="relative w-20 h-20 rounded-full flex items-center justify-center" style={{ background: recibido ? '#10b981' : estilo.color }}>
              {recibido ? <Check className="w-10 h-10" strokeWidth={3} style={{ color: '#fff' }} /> : <Loader2 className="w-9 h-9 animate-spin" style={{ color: '#fff' }} />}
            </div>
          </div>
          <p className="text-base font-bold" style={{ color: recibido ? '#047857' : estilo.color }}>
            {recibido ? '¡Pago recibido!' : 'Esperando el pago'}
          </p>
          <p className="mt-1 font-black tracking-tight leading-none" style={{ color: '#0f172a', fontSize: 'clamp(40px, 12vw, 52px)' }}>
            ${Math.round(monto).toLocaleString('es-CO')}
          </p>
          <span className="inline-flex items-center gap-1.5 mt-4 px-3 py-1 rounded-full text-sm font-bold" style={{ background: estilo.fondo, color: estilo.color }}>
            <span className="w-2 h-2 rounded-full" style={{ background: estilo.color }} /> {nombre}
          </span>
          <p className="mt-4 text-sm" style={{ color: '#64748b' }}>
            {recibido
              ? 'Codec Verify confirmó la transferencia. Terminando la venta...'
              : `Pídele al cliente que transfiera el valor exacto por ${nombre}. La venta se confirma sola cuando llegue.`}
          </p>
          {!recibido && <p className="mt-2 text-xs font-semibold tabular-nums" style={{ color: '#94a3b8' }}>Esperando {tiempo}</p>}
        </div>

        {!recibido && (
          <div className="px-7 pb-6 space-y-2.5">
            {avisoSinValor && (
              <div className="rounded-2xl px-4 py-3 text-left space-y-2.5" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                <p className="text-sm font-bold flex items-center gap-2" style={{ color: '#047857' }}>
                  <BellRing className="w-4 h-4" /> {nombreMedioPago(avisoSinValor.entidad) || avisoSinValor.entidad} avisó que entró dinero
                </p>
                <p className="text-xs" style={{ color: '#065f46' }}>
                  Ese aviso no trae el valor; el valor llega en unos minutos por SMS y la venta se confirma sola. Si ya verificaste que es este pago, confírmalo ahora.
                </p>
                <button onClick={onConfirmarManual} className="w-full h-11 rounded-xl text-sm font-bold" style={{ background: '#10b981', color: '#ffffff' }}>
                  Ya entró: confirmar ${Math.round(monto).toLocaleString('es-CO')}
                </button>
              </div>
            )}
            {segundos >= 90 && !avisoSinValor && (
              <p className="text-xs rounded-xl px-3 py-2" style={{ background: '#fffbeb', color: '#92400e' }}>
                ¿Ya le salió el pago al cliente? Revisa que el celular con Codec Verify tenga internet, o confirma manualmente si viste el pago.
              </p>
            )}
            <button onClick={onConfirmarManual} className="w-full h-12 rounded-2xl text-sm font-bold" style={{ background: '#0f172a', color: '#ffffff' }}>
              Confirmar sin verificar
            </button>
            <button onClick={onCancelar} className="w-full h-11 rounded-2xl text-sm font-semibold" style={{ background: '#f1f5f9', color: '#0f172a' }}>
              Cancelar y cambiar el medio de pago
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
