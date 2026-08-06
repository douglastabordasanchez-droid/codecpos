/**
 * CODEC POS v2.0 — Modal "Pago Recibido"
 * ✅ Diseño tech-premium en naranja
 * ✅ Animaciones con Motion
 * ✅ Se activa cuando CODEC Verify confirma el pago
 */

import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect } from 'react';
import { CheckCircle2, X, Smartphone, Zap, ShieldCheck, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export interface PagoConfirmado {
  monto: number;
  banco: string;
  remitente?: string;
  referencia?: string;
  timestamp: Date;
}

interface Props {
  visible: boolean;
  pago: PagoConfirmado | null;
  onCerrar: () => void;
}

const formatCOP = (v: number) =>
  `$${Number(v).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// ── Partícula flotante ──
function Particula({ delay, x, size }: { delay: number; x: number; size: number }) {
  return (
    <motion.div
      className="absolute bottom-0 rounded-full pointer-events-none"
      style={{ left: `${x}%`, width: size, height: size, background: 'rgba(249,115,22,0.6)' }}
      initial={{ y: 0, opacity: 0.8 }}
      animate={{ y: -320, opacity: 0, scale: [1, 1.4, 0] }}
      transition={{ duration: 2.2 + Math.random(), delay, repeat: Infinity, ease: 'easeOut' }}
    />
  );
}

// ── Anillo de pulso ──
function PulsoRing({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      className="absolute inset-0 rounded-full border-2 border-orange-400"
      initial={{ scale: 1, opacity: 0.8 }}
      animate={{ scale: 2.4, opacity: 0 }}
      transition={{ duration: 1.8, delay, repeat: Infinity, ease: 'easeOut' }}
    />
  );
}

export function ModalPagoRecibidoNequi({ visible, pago, onCerrar }: Props) {
  const [conteo, setConteo] = useState(3);
  const [fase, setFase] = useState<'entrada' | 'mostrando' | 'saliendo'>('entrada');

  useEffect(() => {
    if (!visible) { setConteo(3); setFase('entrada'); return; }
    setFase('entrada');
    const t1 = setTimeout(() => setFase('mostrando'), 400);
    return () => clearTimeout(t1);
  }, [visible]);

  // Countdown para auto-cierre opcional (no obligatorio, usuario decide)
  useEffect(() => {
    if (!visible || fase !== 'mostrando') return;
    setConteo(30);
    const iv = setInterval(() => setConteo(p => Math.max(p - 1, 0)), 1000);
    return () => clearInterval(iv);
  }, [visible, fase]);

  const particulas = [
    { x: 10, size: 6, delay: 0 }, { x: 25, size: 4, delay: 0.3 }, { x: 40, size: 8, delay: 0.7 },
    { x: 55, size: 5, delay: 0.1 }, { x: 70, size: 7, delay: 0.5 }, { x: 85, size: 4, delay: 0.9 },
    { x: 18, size: 5, delay: 1.1 }, { x: 65, size: 6, delay: 0.8 }, { x: 92, size: 4, delay: 0.4 },
  ];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="pago-recibido-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
        >
          <motion.div
            key="pago-recibido-card"
            initial={{ scale: 0.6, y: 60, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.85, y: -30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 22 }}
            className="relative w-full max-w-sm overflow-hidden"
            style={{
              borderRadius: '28px',
              background: 'linear-gradient(145deg, #0f172a 0%, #1c1020 100%)',
              border: '1px solid rgba(249,115,22,0.35)',
              boxShadow: '0 0 0 1px rgba(249,115,22,0.15), 0 32px 80px rgba(0,0,0,0.7), 0 0 60px rgba(249,115,22,0.2)',
            }}
          >
            {/* Partículas flotantes */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {particulas.map((p, i) => <Particula key={i} x={p.x} size={p.size} delay={p.delay} />)}
            </div>

            {/* Borde superior naranja */}
            <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: 'linear-gradient(90deg, transparent, #f97316, #fb923c, transparent)' }} />

            {/* Glow superior */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 pointer-events-none" style={{ background: 'radial-gradient(ellipse at top, rgba(249,115,22,0.25), transparent 70%)' }} />

            {/* Botón cerrar */}
            <button
              onClick={onCerrar}
              className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>

            <div className="relative z-10 p-7 flex flex-col items-center text-center">

              {/* Ícono central con anillos */}
              <div className="relative mb-6 mt-2">
                <div className="relative w-20 h-20">
                  <PulsoRing delay={0} />
                  <PulsoRing delay={0.6} />
                  <motion.div
                    initial={{ scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 16, delay: 0.15 }}
                    className="w-20 h-20 rounded-full flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)', boxShadow: '0 0 40px rgba(249,115,22,0.6), 0 8px 24px rgba(234,88,12,0.4)' }}
                  >
                    <CheckCircle2 className="w-10 h-10 text-white" strokeWidth={2.5} />
                  </motion.div>
                </div>
              </div>

              {/* Badge CODEC Verify */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full mb-4"
                style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)' }}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-orange-400" />
                <span className="text-orange-400 text-xs font-bold tracking-widest uppercase">CODEC Verify · Confirmado</span>
              </motion.div>

              {/* Título */}
              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="font-black text-white mb-1"
                style={{ fontSize: '1.75rem', lineHeight: 1.1, textShadow: '0 0 30px rgba(249,115,22,0.4)' }}
              >
                ¡Pago Recibido!
              </motion.h2>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.38 }}
                className="text-slate-500 text-sm mb-5"
              >
                Transacción verificada automáticamente
              </motion.p>

              {/* Card de datos del pago */}
              {pago && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.42 }}
                  className="w-full rounded-2xl p-4 mb-5 space-y-2.5"
                  style={{ background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.18)' }}
                >
                  {/* Monto */}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-xs font-semibold flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-orange-400" />
                      Monto recibido
                    </span>
                    <span className="font-black text-xl" style={{ color: '#f97316', textShadow: '0 0 20px rgba(249,115,22,0.5)' }}>
                      {formatCOP(pago.monto)}
                    </span>
                  </div>

                  <div className="h-px" style={{ background: 'rgba(249,115,22,0.15)' }} />

                  {/* Banco */}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 text-xs flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                      Canal
                    </span>
                    <span className="font-bold text-white text-sm capitalize">{pago.banco}</span>
                  </div>

                  {/* Remitente */}
                  {pago.remitente && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-xs">Remitente</span>
                      <span className="font-semibold text-slate-300 text-sm">{pago.remitente}</span>
                    </div>
                  )}

                  {/* Referencia */}
                  {pago.referencia && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-xs">Ref.</span>
                      <span className="font-mono text-orange-400 text-xs">{pago.referencia}</span>
                    </div>
                  )}

                  {/* Hora */}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 text-xs flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-slate-500" />
                      Hora
                    </span>
                    <span className="text-slate-400 text-xs font-mono">
                      {format(pago.timestamp, "HH:mm:ss 'del' dd MMM", { locale: es })}
                    </span>
                  </div>
                </motion.div>
              )}

              {/* Botón cerrar principal */}
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 }}
                onClick={onCerrar}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="w-full py-3.5 rounded-2xl font-black text-white text-base transition-all"
                style={{
                  background: 'linear-gradient(135deg, #f97316, #ea580c)',
                  boxShadow: '0 4px 20px rgba(249,115,22,0.45), 0 0 0 1px rgba(249,115,22,0.3)',
                }}
              >
                Entendido · Generar Factura
              </motion.button>

              <p className="text-slate-700 text-xs mt-3">
                El botón "Confirmar Pago" ya está habilitado
              </p>
            </div>

            {/* Borde inferior sutil */}
            <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(249,115,22,0.3), transparent)' }} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
