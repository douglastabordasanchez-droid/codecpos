/**
 * CODEC POS v2.0 — Modal de verificación de pago (Nequi / Daviplata / Transferencia)
 * ✅ Botón confirmar bloqueado hasta recibir verificación
 * ✅ Estado "Esperando pago..." animado
 * ✅ Verificación real: Supabase Realtime + poll de respaldo sobre
 *    notificaciones_pago, con match por monto exacto + "reclamo" atómico
 *    (ver src/app/lib/supabase/codecVerifyService.ts, suscribirPagoEsperado)
 * ✅ Bypass con log obligatorio (quién, cuándo, por qué)
 * ✅ Popup premium al recibir el pago
 * ✅ Sin CodecVerify → flujo normal
 */

import { memo, useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, ShieldCheck, Clock, AlertTriangle, FileText,
  Wifi, ChevronRight, Lock, Unlock, Landmark,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '../ui/button';
import { ModalPagoRecibidoNequi, PagoConfirmado } from './ModalPagoRecibidoNequi';
import { suscribirPagoEsperado } from '../../lib/supabase/codecVerifyService';
import { marcarMontoEsperado, colorMedioPago } from '../../lib/codecVerifyEspera';
import { createPortal } from 'react-dom';
import { Check, Loader2 } from 'lucide-react';

// ─── Clave para logs de bypass ───────────────────────
const BYPASS_LOG_KEY = 'codec-verify-bypass-log';

export interface BypassLogEntry {
  id: string;
  fecha: string;    // ISO
  hora: string;     // HH:mm:ss
  cajero: string;
  razon: string;
  monto: number;
  factura?: string;
}

export function guardarBypassLog(entry: Omit<BypassLogEntry, 'id' | 'fecha' | 'hora'>) {
  try {
    const now = new Date();
    const log: BypassLogEntry[] = JSON.parse(localStorage.getItem(BYPASS_LOG_KEY) || '[]');
    log.unshift({
      ...entry,
      id: `bps-${Date.now()}`,
      fecha: now.toISOString(),
      hora: format(now, 'HH:mm:ss'),
    });
    // Conservar últimos 500 registros
    localStorage.setItem(BYPASS_LOG_KEY, JSON.stringify(log.slice(0, 500)));
  } catch { /* silent */ }
}

// ─── Verificar si CODEC Verify está activo ────────────
// 🛡️ FIX: antes leía 'codec_pos_config'.plan==='premium', un interruptor
// DISTINTO al que realmente prende la suscripción Realtime de pagos
// (CodecVerifyListener/AlertaPagoEntrante usan 'codecverify_config'.enabled).
// Si el usuario activaba Codec Verify desde su pantalla real de conexión,
// este modal seguía pensando que estaba apagado (o viceversa).
export function isCodecVerifyActivo(): boolean {
  try {
    const cfg = JSON.parse(localStorage.getItem('codecverify_config') || '{}');
    return cfg.enabled === true;
  } catch { return false; }
}

export type EntidadPago = 'nequi' | 'daviplata' | 'transferencia' | 'bancolombia' | 'bre_b';

const ENTIDAD_CONFIG: Record<EntidadPago, { label: string; gradientIcon: string; glow: string; accent: string; accentSoft: string }> = {
  nequi: {
    label: 'Nequi',
    gradientIcon: 'linear-gradient(135deg, #c026d3, #7e22ce)',
    glow: 'rgba(192,38,211,0.45)',
    accent: '#c026d3',
    accentSoft: 'rgba(192,38,211,0.4)',
  },
  daviplata: {
    label: 'Daviplata',
    gradientIcon: 'linear-gradient(135deg, #ef4444, #b91c1c)',
    glow: 'rgba(239,68,68,0.45)',
    accent: '#ef4444',
    accentSoft: 'rgba(239,68,68,0.4)',
  },
  transferencia: {
    label: 'Transferencia',
    gradientIcon: 'linear-gradient(135deg, #0ea5e9, #0369a1)',
    glow: 'rgba(14,165,233,0.45)',
    accent: '#0ea5e9',
    accentSoft: 'rgba(14,165,233,0.4)',
  },
  bancolombia: {
    label: 'Bancolombia',
    gradientIcon: 'linear-gradient(135deg, #eab308, #a16207)',
    glow: 'rgba(202,138,4,0.45)',
    accent: '#ca8a04',
    accentSoft: 'rgba(202,138,4,0.4)',
  },
  // Bre-B: sistema interoperable de pagos inmediatos de Colombia (ACH Colombia,
  // reemplaza/complementa transferencias con llave entre bancos) — el dinero
  // sigue llegando a la cuenta bancaria real del negocio, así que la
  // verificación usa el mismo match por monto que las demás entidades.
  bre_b: {
    label: 'Bre-B',
    gradientIcon: 'linear-gradient(135deg, #14b8a6, #0f766e)',
    glow: 'rgba(20,184,166,0.45)',
    accent: '#14b8a6',
    accentSoft: 'rgba(20,184,166,0.4)',
  },
};

// ─── Typing dots ───────────────────────────────────────
function TypingDots() {
  return (
    <span className="inline-flex gap-1 items-center ml-1">
      {[0, 0.2, 0.4].map((d, i) => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-orange-400"
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
          transition={{ duration: 1, delay: d, repeat: Infinity }}
        />
      ))}
    </span>
  );
}

// ─── Onda de radar ─────────────────────────────────────
function RadarWave() {
  return (
    <div className="relative flex items-center justify-center w-24 h-24">
      {[0, 0.5, 1.0].map((d, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border-2 border-orange-500"
          style={{ width: 30 + i * 22, height: 30 + i * 22 }}
          animate={{ scale: [1, 1.9, 1], opacity: [0.7, 0, 0.7] }}
          transition={{ duration: 2, delay: d, repeat: Infinity, ease: 'easeOut' }}
        />
      ))}
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.25), rgba(234,88,12,0.15))', border: '1.5px solid rgba(249,115,22,0.5)' }}
      >
        <Wifi className="w-6 h-6 text-orange-400" />
      </div>
    </div>
  );
}

// ─── Segmentos de tiempo transcurrido ──────────────────
function CronometroEspera({ segundos }: { segundos: number }) {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
      style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.25)' }}>
      <Clock className="w-3.5 h-3.5 text-orange-400" />
      <span className="font-mono text-orange-400 text-xs font-bold">
        {m.toString().padStart(2, '0')}:{s.toString().padStart(2, '0')}
      </span>
    </div>
  );
}

// ─── PROPS ─────────────────────────────────────────────
interface Props {
  visible: boolean;
  monto: number;
  darkMode: boolean;
  cajeroNombre: string;
  numeroFactura?: string;
  /** Qué método de pago se está verificando — cambia texto/color, no la lógica. */
  entidad?: EntidadPago;
  onCancelar: () => void;
  onConfirmar: () => void;
  /**
   * Se dispara apenas CODEC Verify detecta el pago (match automático o
   * bypass), ANTES de que el cajero toque "Confirmar Pago" — incluso si
   * este carrito no es el que está visible en pantalla en ese momento
   * (el cajero pudo cambiar a otro carrito mientras esperaba). Permite que
   * MultiFacturasPOS avise "Carrito #N recibió el pago" sin depender de que
   * el modal esté montado/visible.
   */
  onPagoDetectado?: (pago: PagoConfirmado) => void;
}

// ═══════════════════════════════════════════════════════
//  COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════
function NequiVerifyModalComponent({
  visible, monto, darkMode, cajeroNombre, numeroFactura, entidad = 'nequi', onCancelar, onConfirmar, onPagoDetectado,
}: Props) {
  const codecActivo = isCodecVerifyActivo();
  const config = ENTIDAD_CONFIG[entidad];

  // Estados de verificación
  const [estado, setEstado] = useState<'esperando' | 'verificado' | 'bypass'>('esperando');
  const [pagoConfirmado, setPagoConfirmado] = useState<PagoConfirmado | null>(null);
  const [showPagoRecibido, setShowPagoRecibido] = useState(false);
  const [segundosEspera, setSegundosEspera] = useState(0);

  // Bypass
  const [showBypass, setShowBypass] = useState(false);
  const [razonBypass, setRazonBypass] = useState('');
  const [errorBypass, setErrorBypass] = useState('');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Clave única de esta espera de pago (no depende de `numeroFactura`, que
  // puede venir vacío) — se regenera cada vez que el modal se abre.
  const claveEsperaRef = useRef<string>('');
  const desuscribirRef = useRef<(() => void) | null>(null);

  const recibirPago = useCallback((pago: PagoConfirmado) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setPagoConfirmado(pago);
    setEstado('verificado');
    setShowPagoRecibido(true);
    try { window.navigator.vibrate?.([100, 50, 100]); } catch {}
    onPagoDetectado?.(pago);
  }, [onPagoDetectado]);

  // Suscripción real a Supabase (Realtime + poll de respaldo) mientras se
  // espera el pago — ver suscribirPagoEsperado en codecVerifyService.ts.
  useEffect(() => {
    if (!visible || !codecActivo || estado !== 'esperando') return;

    const cancelar = suscribirPagoEsperado(monto, claveEsperaRef.current, (row) => {
      recibirPago({
        monto: Number(row.monto) || monto,
        banco: config.label,
        remitente: row.referencia || undefined,
        referencia: row.referencia || undefined,
        timestamp: new Date(row.created_at),
      });
    });
    desuscribirRef.current = cancelar;

    return () => {
      cancelar?.();
      desuscribirRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, codecActivo, estado, monto]);

  // Cronómetro de espera
  useEffect(() => {
    if (!visible || !codecActivo || estado !== 'esperando') {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    setSegundosEspera(0);
    timerRef.current = setInterval(() => setSegundosEspera(p => p + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [visible, codecActivo, estado]);

  // Reset al abrir
  useEffect(() => {
    if (visible) {
      claveEsperaRef.current = `VERIF-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      setEstado('esperando');
      setPagoConfirmado(null);
      setShowPagoRecibido(false);
      setShowBypass(false);
      setRazonBypass('');
      setErrorBypass('');
      setSegundosEspera(0);
    } else {
      desuscribirRef.current?.();
      desuscribirRef.current = null;
    }
  }, [visible]);

  const handleBypassSubmit = () => {
    if (razonBypass.trim().length < 10) {
      setErrorBypass('La razón debe tener al menos 10 caracteres');
      return;
    }
    guardarBypassLog({
      cajero: cajeroNombre,
      razon: razonBypass.trim(),
      monto,
      factura: numeroFactura,
    });
    setEstado('bypass');
    setShowBypass(false);
    toast.warning('⚠️ Bypass registrado', {
      description: `Se registró el apagado de verificación por: ${razonBypass.trim().substring(0, 50)}`,
    });
  };

  const handleConfirmar = () => {
    onConfirmar();
  };

  // Mientras se espera este monto, el aviso general de "Pago recibido" no se abre encima.
  useEffect(() => {
    if (!visible || !codecActivo) return;
    marcarMontoEsperado(monto);
    return () => marcarMontoEsperado(null);
  }, [visible, codecActivo, monto]);

  // Igual que en la web: al llegar el pago se muestra "¡Pago recibido!" y la venta se confirma sola.
  useEffect(() => {
    if (!visible) return;
    if (estado === 'verificado') {
      const t = setTimeout(() => onConfirmar(), 1400);
      return () => clearTimeout(t);
    }
    if (estado === 'bypass') onConfirmar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, visible]);

  const confirmButtonHabilitado = !codecActivo || estado === 'verificado' || estado === 'bypass';

  if (!visible) return null;

  // Mismo diseño de la web (src/pwa/components/EsperandoPagoModal.tsx): tarjeta clara y grande.
  const estilo = colorMedioPago(entidad);
  const tiempo = `${Math.floor(segundosEspera / 60)}:${String(segundosEspera % 60).padStart(2, '0')}`;
  const recibido = estado === 'verificado' && pagoConfirmado;

  return (
    <>
      {createPortal(
        <div className="fixed inset-0 z-[9000] flex items-center justify-center p-5" style={{ background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(3px)' }} role="dialog" aria-modal="true" aria-label="Esperando el pago">
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
                {codecActivo && !recibido && (
                  <>
                    <span className="absolute inset-0 rounded-full" style={{ background: estilo.color, animation: 'esperaOnda 1.8s ease-out infinite' }} />
                    <span className="absolute inset-0 rounded-full" style={{ background: estilo.color, animation: 'esperaOnda 1.8s ease-out .9s infinite' }} />
                  </>
                )}
                <div className="relative w-20 h-20 rounded-full flex items-center justify-center" style={{ background: recibido ? '#10b981' : estilo.color }}>
                  {recibido
                    ? <Check className="w-10 h-10" strokeWidth={3} style={{ color: '#fff' }} />
                    : codecActivo ? <Loader2 className="w-9 h-9 animate-spin" style={{ color: '#fff' }} /> : <Landmark className="w-9 h-9" style={{ color: '#fff' }} />}
                </div>
              </div>
              <p className="text-base font-bold" style={{ color: recibido ? '#047857' : estilo.color }}>
                {recibido ? '¡Pago recibido!' : codecActivo ? 'Esperando el pago' : `Pago con ${config.label}`}
              </p>
              <p className="mt-1 font-black tracking-tight leading-none" style={{ color: '#0f172a', fontSize: '48px' }}>
                ${Math.round(monto).toLocaleString('es-CO')}
              </p>
              <span className="inline-flex items-center gap-1.5 mt-4 px-3 py-1 rounded-full text-sm font-bold" style={{ background: estilo.fondo, color: estilo.color }}>
                <span className="w-2 h-2 rounded-full" style={{ background: estilo.color }} /> {config.label}
              </span>
              <p className="mt-4 text-sm" style={{ color: '#64748b' }}>
                {recibido
                  ? `Codec Verify confirmó la transferencia${pagoConfirmado?.timestamp ? ` a las ${format(pagoConfirmado.timestamp, 'HH:mm')}` : ''}. Terminando la venta...`
                  : codecActivo
                    ? `Pídele al cliente que transfiera el valor exacto por ${config.label}. La venta se confirma sola cuando llegue.`
                    : 'Confirma cuando veas el pago en tu cuenta.'}
              </p>
              {codecActivo && !recibido && <p className="mt-2 text-xs font-semibold tabular-nums" style={{ color: '#94a3b8' }}>Esperando {tiempo}</p>}
            </div>

            {!recibido && (
              <div className="px-7 pb-6 space-y-2.5">
                {codecActivo && segundosEspera >= 90 && (
                  <p className="text-xs rounded-xl px-3 py-2" style={{ background: '#fffbeb', color: '#92400e' }}>
                    ¿Ya le salió el pago al cliente? Revisa que el celular con Codec Verify tenga internet, o confirma manualmente si viste el pago.
                  </p>
                )}
                <button
                  onClick={() => (codecActivo ? setShowBypass(true) : handleConfirmar())}
                  className="w-full h-12 rounded-2xl text-sm font-bold"
                  style={{ background: '#0f172a', color: '#ffffff' }}
                >
                  {codecActivo ? 'Confirmar sin verificar' : 'Confirmar pago'}
                </button>
                <button onClick={onCancelar} className="w-full h-11 rounded-2xl text-sm font-semibold" style={{ background: '#f1f5f9', color: '#0f172a' }}>
                  Cancelar y cambiar el medio de pago
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}

      {/* ── MODAL BYPASS (justificación) ── */}
      <AnimatePresence>
        {showBypass && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9100] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm rounded-2xl p-6"
              style={{ background: darkMode ? '#0f172a' : '#fff', border: '1px solid rgba(234,179,8,0.3)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)' }}>
                  <FileText className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <h4 className="font-black text-sm" style={{ color: darkMode ? '#fff' : '#0f172a' }}>Apagar CODEC Verify</h4>
                  <p className="text-[11px]" style={{ color: darkMode ? '#64748b' : '#94a3b8' }}>Se registrará en auditoría</p>
                </div>
              </div>

              <div
                className="flex items-start gap-2 p-3 rounded-xl mb-4"
                style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)' }}
              >
                <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                <p className="text-xs" style={{ color: darkMode ? '#fbbf24' : '#92400e' }}>
                  Esta acción quedará registrada con la hora exacta, tu nombre (<strong>{cajeroNombre}</strong>) y la razón indicada. Será revisable por el administrador.
                </p>
              </div>

              <label className="block text-xs font-bold mb-1.5" style={{ color: darkMode ? '#94a3b8' : '#64748b' }}>
                Razón del bypass *
              </label>
              <textarea
                value={razonBypass}
                onChange={e => { setRazonBypass(e.target.value); setErrorBypass(''); }}
                placeholder="Ej: El cliente no podía esperar, la app de Nequi presentaba fallas..."
                rows={3}
                className="w-full rounded-xl px-3 py-2.5 text-sm resize-none mb-1"
                style={{
                  background: darkMode ? 'rgba(255,255,255,0.05)' : '#f8fafc',
                  border: errorBypass ? '1.5px solid #ef4444' : darkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e2e8f0',
                  color: darkMode ? '#fff' : '#0f172a',
                  outline: 'none',
                }}
                autoFocus
              />
              {errorBypass && <p className="text-red-400 text-xs mb-2">{errorBypass}</p>}
              <p className="text-xs mb-4" style={{ color: darkMode ? '#334155' : '#cbd5e1' }}>
                Mínimo 10 caracteres · {razonBypass.length} escritos
              </p>

              <div className="flex gap-2.5">
                <button
                  onClick={() => { setShowBypass(false); setRazonBypass(''); setErrorBypass(''); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: darkMode ? 'rgba(255,255,255,0.06)' : '#f1f5f9', color: darkMode ? '#64748b' : '#475569' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleBypassSubmit}
                  className="flex-1 py-2.5 rounded-xl text-sm font-black"
                  style={{ background: 'linear-gradient(135deg, #eab308, #ca8a04)', color: '#fff', boxShadow: '0 2px 12px rgba(234,179,8,0.35)' }}
                >
                  Registrar y continuar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </>
  );
}

export const NequiVerifyModal = memo(NequiVerifyModalComponent);
