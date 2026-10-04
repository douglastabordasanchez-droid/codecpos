/**
 * Ventana de "Pago recibido" de Codec Verify: grande, al centro, en modo
 * claro siempre (para que resalte sobre cualquier pantalla), con el monto en
 * grande y los datos del pago. La abre alertaPagos/useAlertasPago con el
 * evento EVENTO_PAGO_RECIBIDO; se cierra sola a los 20 segundos o con "Listo".
 * Si entran varios pagos seguidos, muestra el último y cuántos más llegaron.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { Check, VolumeX, Volume2, X, Clock, Landmark, Hash, ShieldCheck } from 'lucide-react';
import type { NotificacionPagoRow } from '../lib/codecVerifyPwa';
import { guardarAlertasPago, obtenerAlertasPago } from '../lib/alertaPagos';

export const EVENTO_PAGO_RECIBIDO = 'codecverify:pago-recibido';

export interface DetallePagoPopup {
  row: NotificacionPagoRow;
  ejemplo?: boolean;
  recibidoEn: number;
}

export function abrirPopupPago(row: NotificacionPagoRow, ejemplo = false) {
  window.dispatchEvent(new CustomEvent<DetallePagoPopup>(EVENTO_PAGO_RECIBIDO, { detail: { row, ejemplo, recibidoEn: Date.now() } }));
}

const DURACION_MS = 20_000;

const BANCOS: Record<string, { nombre: string; color: string; fondo: string }> = {
  nequi: { nombre: 'Nequi', color: '#da0081', fondo: '#fde7f3' },
  daviplata: { nombre: 'Daviplata', color: '#e30613', fondo: '#fde8e9' },
  bancolombia: { nombre: 'Bancolombia', color: '#2c2a29', fondo: '#fff5cc' },
  davivienda: { nombre: 'Davivienda', color: '#e1251b', fondo: '#fde9e8' },
  bre_b: { nombre: 'Bre-B', color: '#0b6bcb', fondo: '#e6f1fc' },
  transferencia: { nombre: 'Transferencia', color: '#0f766e', fondo: '#e6f6f4' },
};

function infoBanco(entidad: string | null) {
  const clave = (entidad || '').toLowerCase().trim();
  return BANCOS[clave] || { nombre: clave ? clave.charAt(0).toUpperCase() + clave.slice(1) : 'Pago', color: '#0f766e', fondo: '#e6f6f4' };
}

export function PopupPagoRecibido() {
  const navigate = useNavigate();
  const [actual, setActual] = useState<DetallePagoPopup | null>(null);
  const [extra, setExtra] = useState(0);
  const [silenciado, setSilenciado] = useState(() => { const p = obtenerAlertasPago(); return !p.sonido && !p.voz; });
  const temporizador = useRef<number | null>(null);
  const abierto = useRef(false);

  useEffect(() => {
    const alRecibir = (e: Event) => {
      const detalle = (e as CustomEvent<DetallePagoPopup>).detail;
      setExtra((n) => (abierto.current ? n + 1 : 0));
      abierto.current = true;
      setActual(detalle);
      const p = obtenerAlertasPago();
      setSilenciado(!p.sonido && !p.voz);
    };
    window.addEventListener(EVENTO_PAGO_RECIBIDO, alRecibir);
    return () => window.removeEventListener(EVENTO_PAGO_RECIBIDO, alRecibir);
  }, []);

  useEffect(() => {
    if (!actual) return;
    if (temporizador.current) window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => cerrar(), DURACION_MS);
    return () => { if (temporizador.current) window.clearTimeout(temporizador.current); };
  }, [actual]);

  const cerrar = () => { abierto.current = false; setActual(null); setExtra(0); };

  if (!actual) return null;
  const { row, ejemplo } = actual;
  const banco = infoBanco(row.entidad);
  const automatico = row.origen === 'automatizacion';
  const hora = new Date(actual.recibidoEn).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

  const alternarSilencio = () => {
    const nuevo = !silenciado;
    guardarAlertasPago({ sonido: !nuevo, voz: !nuevo });
    setSilenciado(nuevo);
  };

  const fila = (Icono: typeof Clock, etiqueta: string, valor: string) => (
    <div className="flex items-center justify-between gap-3 py-2.5" style={{ borderTop: '1px solid #eef0f3' }}>
      <span className="flex items-center gap-2 text-sm" style={{ color: '#64748b' }}>
        <Icono className="w-4 h-4" /> {etiqueta}
      </span>
      <span className="text-sm font-semibold text-right truncate" style={{ color: '#0f172a' }}>{valor}</span>
    </div>
  );

  // Portal al <body>: así ningún contenedor con desenfoque o transformación la encierra.
  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-5"
      style={{ background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)' }}
      onClick={cerrar}
      role="dialog"
      aria-modal="true"
      aria-label="Pago recibido"
    >
      <style>{`
        @keyframes pagoEntrada { from { opacity: 0; transform: translateY(14px) scale(.96) } to { opacity: 1; transform: none } }
        @keyframes pagoPulso { 0% { box-shadow: 0 0 0 0 rgba(16,185,129,.45) } 100% { box-shadow: 0 0 0 22px rgba(16,185,129,0) } }
        @keyframes pagoBarra { from { transform: scaleX(1) } to { transform: scaleX(0) } }
      `}</style>
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-[28px]"
        style={{ background: '#ffffff', boxShadow: '0 30px 80px rgba(15,23,42,.35)', animation: 'pagoEntrada .28s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={cerrar} aria-label="Cerrar" className="absolute right-4 top-4 p-1.5 rounded-full" style={{ color: '#94a3b8' }}>
          <X className="w-5 h-5" />
        </button>

        <div className="px-7 pt-8 pb-6 text-center" style={{ background: 'linear-gradient(180deg, #ecfdf5 0%, #ffffff 100%)' }}>
          {ejemplo && (
            <span className="inline-block mb-3 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide" style={{ background: '#fef3c7', color: '#92400e' }}>
              EJEMPLO
            </span>
          )}
          <div
            className="mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: '#10b981', animation: 'pagoPulso 1.6s ease-out infinite' }}
          >
            <Check className="w-9 h-9" strokeWidth={3} style={{ color: '#ffffff' }} />
          </div>
          <p className="text-sm font-semibold" style={{ color: '#047857' }}>{automatico ? 'Pago recibido' : 'Pago reportado'}</p>
          <p className="mt-1 font-black tracking-tight leading-none" style={{ color: '#0f172a', fontSize: 'clamp(40px, 12vw, 52px)' }}>
            ${Number(row.monto).toLocaleString('es-CO')}
          </p>
          <span
            className="inline-flex items-center gap-1.5 mt-4 px-3 py-1 rounded-full text-sm font-bold"
            style={{ background: banco.fondo, color: banco.color }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: banco.color }} /> {banco.nombre}
          </span>
          {extra > 0 && (
            <p className="mt-3 text-xs font-semibold" style={{ color: '#64748b' }}>
              y {extra} {extra === 1 ? 'pago más' : 'pagos más'} en los últimos segundos
            </p>
          )}
        </div>

        <div className="px-7">
          {fila(Landmark, 'Medio', banco.nombre)}
          {fila(Clock, 'Hora', hora)}
          {row.referencia && fila(Hash, 'Referencia', row.referencia)}
          {fila(ShieldCheck, 'Estado', automatico ? 'Verificado por Codec Verify' : 'Pendiente de confirmar')}
        </div>

        <div className="px-7 pt-4 pb-6 space-y-2.5">
          <button
            onClick={cerrar}
            className="w-full h-12 rounded-2xl text-base font-bold active:scale-[0.99]"
            style={{ background: '#0f172a', color: '#ffffff' }}
          >
            Listo
          </button>
          <div className="flex gap-2.5">
            <button
              onClick={() => { cerrar(); navigate('/pagos'); }}
              className="flex-1 h-11 rounded-2xl text-sm font-semibold"
              style={{ background: '#f1f5f9', color: '#0f172a' }}
            >
              Ver pagos
            </button>
            <button
              onClick={alternarSilencio}
              className="flex-1 h-11 rounded-2xl text-sm font-semibold flex items-center justify-center gap-1.5"
              style={{ background: '#f1f5f9', color: silenciado ? '#047857' : '#0f172a' }}
            >
              {silenciado ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              {silenciado ? 'Activar sonido' : 'Silenciar'}
            </button>
          </div>
        </div>

        <div className="h-1 origin-left" style={{ background: '#10b981', animation: `pagoBarra ${DURACION_MS}ms linear forwards` }} key={actual.recibidoEn} />
      </div>
    </div>,
    document.body,
  );
}
