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
}

// ═══════════════════════════════════════════════════════
//  COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════
function NequiVerifyModalComponent({
  visible, monto, darkMode, cajeroNombre, numeroFactura, entidad = 'nequi', onCancelar, onConfirmar,
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
  }, []);

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

  const confirmButtonHabilitado = !codecActivo || estado === 'verificado' || estado === 'bypass';

  if (!visible) return null;

  return (
    <>
      {/* ── MODAL DE VERIFICACIÓN ── */}
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9000] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
          >
            <motion.div
              initial={{ scale: 0.88, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              className="relative w-full max-w-md rounded-3xl overflow-hidden"
              style={{
                background: darkMode ? 'rgba(13,22,45,0.97)' : '#fff',
                border: '1px solid rgba(249,115,22,0.25)',
                boxShadow: '0 0 0 1px rgba(249,115,22,0.12), 0 24px 60px rgba(0,0,0,0.55)',
                backdropFilter: 'blur(20px)',
              }}
            >
              {/* Borde top naranja */}
              <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, #f97316, transparent)' }} />

              {/* Glow superior */}
              <div className="absolute top-0 left-0 right-0 h-32 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(249,115,22,0.1), transparent 70%)' }} />

              {/* Botón X */}
              <button
                onClick={onCancelar}
                className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>

              <div className="relative z-10 p-7">
                {/* Header */}
                <div className="flex flex-col items-center text-center mb-6">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3"
                    style={{ background: config.gradientIcon, boxShadow: `0 0 24px ${config.glow}` }}
                  >
                    {entidad === 'nequi' ? (
                      <svg className="w-9 h-9 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z" />
                      </svg>
                    ) : (
                      <Landmark className="w-9 h-9 text-white" />
                    )}
                  </div>
                  <h3 className="font-black text-2xl mb-1" style={{ color: darkMode ? '#fff' : '#0f172a' }}>
                    Pago con {config.label}
                  </h3>
                  <p className="text-sm" style={{ color: darkMode ? '#64748b' : '#94a3b8' }}>
                    Total a cobrar
                  </p>
                  <div className="mt-2 font-black text-4xl" style={{ color: config.accent, textShadow: `0 0 24px ${config.accentSoft}` }}>
                    ${monto.toLocaleString('es-CO')}
                  </div>
                </div>

                {/* ─── BLOQUE CODEC VERIFY ─── */}
                {codecActivo && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl mb-5 overflow-hidden"
                    style={{
                      background: estado === 'verificado'
                        ? 'rgba(16,185,129,0.07)'
                        : estado === 'bypass'
                          ? 'rgba(234,179,8,0.07)'
                          : 'rgba(249,115,22,0.07)',
                      border: `1px solid ${estado === 'verificado' ? 'rgba(16,185,129,0.25)' : estado === 'bypass' ? 'rgba(234,179,8,0.25)' : 'rgba(249,115,22,0.22)'}`,
                    }}
                  >
                    {/* Barra superior de estado */}
                    <div
                      className="flex items-center justify-between px-4 py-2"
                      style={{ background: estado === 'verificado' ? 'rgba(16,185,129,0.1)' : estado === 'bypass' ? 'rgba(234,179,8,0.1)' : 'rgba(249,115,22,0.1)' }}
                    >
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4" style={{ color: estado === 'verificado' ? '#10b981' : estado === 'bypass' ? '#eab308' : '#f97316' }} />
                        <span className="text-xs font-bold" style={{ color: estado === 'verificado' ? '#10b981' : estado === 'bypass' ? '#eab308' : '#f97316' }}>
                          CODEC Verify
                        </span>
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                          style={{
                            background: estado === 'verificado' ? 'rgba(16,185,129,0.2)' : estado === 'bypass' ? 'rgba(234,179,8,0.2)' : 'rgba(249,115,22,0.2)',
                            color: estado === 'verificado' ? '#10b981' : estado === 'bypass' ? '#eab308' : '#f97316',
                          }}
                        >
                          {estado === 'verificado' ? 'CONFIRMADO' : estado === 'bypass' ? 'BYPASS' : 'ACTIVO'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {estado === 'esperando' && <CronometroEspera segundos={segundosEspera} />}
                      </div>
                    </div>

                    <div className="p-4">
                      {/* Estado: Esperando */}
                      {estado === 'esperando' && (
                        <div className="flex flex-col items-center py-3 gap-3">
                          <RadarWave />
                          <div className="text-center">
                            <p className="font-bold text-sm flex items-center justify-center gap-1" style={{ color: darkMode ? '#f1f5f9' : '#0f172a' }}>
                              Esperando el pago
                              <TypingDots />
                            </p>
                            <p className="text-xs mt-1" style={{ color: darkMode ? '#475569' : '#94a3b8' }}>
                              CODEC Verify está escuchando en tiempo real
                            </p>
                          </div>

                          {/* Botón de bypass */}
                          <button
                            onClick={() => setShowBypass(true)}
                            className="flex items-center gap-1.5 text-xs transition-all hover:opacity-80"
                            style={{ color: darkMode ? '#475569' : '#94a3b8' }}
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            Apagar verificación (requiere justificación)
                          </button>
                        </div>
                      )}

                      {/* Estado: Verificado */}
                      {estado === 'verificado' && pagoConfirmado && (
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                            style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.35)' }}
                          >
                            <ShieldCheck className="w-5 h-5 text-emerald-400" />
                          </div>
                          <div>
                            <p className="font-bold text-sm text-emerald-400">Pago verificado ✓</p>
                            <p className="text-xs" style={{ color: darkMode ? '#64748b' : '#94a3b8' }}>
                              {pagoConfirmado.remitente && `De: ${pagoConfirmado.remitente} · `}
                              {format(pagoConfirmado.timestamp, 'HH:mm:ss')}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Estado: Bypass */}
                      {estado === 'bypass' && (
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                            style={{ background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)' }}
                          >
                            <AlertTriangle className="w-5 h-5 text-yellow-400" />
                          </div>
                          <div>
                            <p className="font-bold text-sm text-yellow-400">Verificación omitida</p>
                            <p className="text-xs" style={{ color: darkMode ? '#64748b' : '#94a3b8' }}>
                              Registrado en auditoría · {cajeroNombre}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* Botones de acción */}
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={onCancelar}
                    className="flex-1 h-13 rounded-2xl"
                    style={{ borderColor: darkMode ? 'rgba(255,255,255,0.12)' : undefined, color: darkMode ? '#94a3b8' : undefined }}
                  >
                    Cancelar
                  </Button>
                  <button
                    onClick={handleConfirmar}
                    disabled={!confirmButtonHabilitado}
                    className="flex-1 h-13 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all"
                    style={{
                      background: confirmButtonHabilitado
                        ? 'linear-gradient(135deg, #10b981, #059669)'
                        : 'rgba(255,255,255,0.06)',
                      color: confirmButtonHabilitado ? '#fff' : darkMode ? '#334155' : '#94a3b8',
                      boxShadow: confirmButtonHabilitado ? '0 4px 16px rgba(16,185,129,0.4)' : 'none',
                      border: confirmButtonHabilitado ? 'none' : '1px solid rgba(255,255,255,0.08)',
                      cursor: confirmButtonHabilitado ? 'pointer' : 'not-allowed',
                      height: '52px',
                    }}
                  >
                    {!confirmButtonHabilitado
                      ? <><Lock className="w-4 h-4" /> Esperando pago</>
                      : <><ChevronRight className="w-5 h-5" /> Confirmar Pago</>
                    }
                  </button>
                </div>

                {!confirmButtonHabilitado && codecActivo && (
                  <p className="text-center text-xs mt-2.5" style={{ color: darkMode ? '#334155' : '#cbd5e1' }}>
                    El botón se habilitará automáticamente al recibir el pago
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* ── POPUP PAGO RECIBIDO ── */}
      <ModalPagoRecibidoNequi
        visible={showPagoRecibido}
        pago={pagoConfirmado}
        onCerrar={() => setShowPagoRecibido(false)}
      />
    </>
  );
}

export const NequiVerifyModal = memo(NequiVerifyModalComponent);
