import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2,
  X,
  DollarSign,
  User,
  CreditCard,
  Zap,
  Bell,
} from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import {
  suscribirNotificacionesPago,
  marcarNotificacionPago,
  NotificacionPagoRow,
} from '../../lib/supabase/codecVerifyService';
import { isLinked } from '../../lib/supabase/tenantLink';
import { anunciarPagoRecibido } from '../../lib/voz';

export interface PagoEntrante {
  id: string;
  monto: number;
  banco: string;
  remitente: string;
  timestamp: string;
}

interface AlertaPagoEntranteProps {
  pago: PagoEntrante | null;
  onVincular: (pago: PagoEntrante) => void;
  onDescartar: () => void;
}

export function AlertaPagoEntrante({ pago, onVincular, onDescartar }: AlertaPagoEntranteProps) {
  const [tiempoRestante, setTiempoRestante] = useState(30);

  useEffect(() => {
    if (!pago) return;

    setTiempoRestante(30);
    
    const interval = setInterval(() => {
      setTiempoRestante(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          onDescartar();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [pago, onDescartar]);

  if (!pago) return null;

  const bancoColor = {
    nequi: 'from-purple-600 to-purple-800',
    daviplata: 'from-red-600 to-red-800',
    bancolombia: 'from-yellow-600 to-yellow-800',
    dale: 'from-green-600 to-green-800',
  }[pago.banco.toLowerCase()] || 'from-blue-600 to-blue-800';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
        onClick={onDescartar}
      >
        <motion.div
          initial={{ scale: 0.8, y: 50 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.8, y: 50 }}
          transition={{ type: 'spring', damping: 20 }}
          className="relative max-w-md w-full"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Card Principal */}
          <div className={`bg-gradient-to-br ${bancoColor} rounded-2xl shadow-2xl overflow-hidden`}>
            {/* Header con ícono de alerta */}
            <div className="relative p-6 pb-4">
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                }}
                className="absolute top-4 right-4"
              >
                <Bell className="w-8 h-8 text-white animate-pulse" />
              </motion.div>

              <div className="flex items-center gap-3">
                <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
                  <DollarSign className="w-8 h-8 text-white" />
                </div>
                <div>
                  <p className="text-white/80 text-sm font-medium">Pago Recibido</p>
                  <p className="text-white text-xs">desde {pago.banco.toUpperCase()}</p>
                </div>
              </div>

              {/* Monto en grande */}
              <div className="mt-4">
                <p className="text-white/70 text-sm mb-1">Monto:</p>
                <p className="text-white text-5xl font-bold tracking-tight">
                  ${pago.monto.toLocaleString('es-CO')}
                </p>
              </div>
            </div>

            {/* Detalles */}
            <div className="bg-white/10 backdrop-blur-sm p-4 space-y-3">
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-white/70" />
                <div className="flex-1">
                  <p className="text-white/60 text-xs">Remitente:</p>
                  <p className="text-white font-semibold">{pago.remitente}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <CreditCard className="w-5 h-5 text-white/70" />
                <div className="flex-1">
                  <p className="text-white/60 text-xs">Banco:</p>
                  <p className="text-white font-semibold">{pago.banco.toUpperCase()}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5 text-white/70" />
                <div className="flex-1">
                  <p className="text-white/60 text-xs">Hora:</p>
                  <p className="text-white font-semibold">{pago.timestamp}</p>
                </div>
              </div>
            </div>

            {/* Barra de tiempo */}
            <div className="bg-white/5 h-2 overflow-hidden">
              <motion.div
                initial={{ width: '100%' }}
                animate={{ width: `${(tiempoRestante / 30) * 100}%` }}
                className="h-full bg-white/40"
                transition={{ duration: 0.5 }}
              />
            </div>

            {/* Acciones */}
            <div className="p-4 bg-white/5 flex gap-3">
              <Button
                onClick={onDescartar}
                variant="outline"
                className="flex-1 border-white/20 text-white hover:bg-white/10"
              >
                <X className="w-4 h-4 mr-2" />
                Descartar ({tiempoRestante}s)
              </Button>
              <Button
                onClick={() => onVincular(pago)}
                className="flex-1 bg-white text-gray-900 hover:bg-white/90"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Vincular al Pedido
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// Hook para usar Codec Verify — sobre Supabase Realtime (ver codecVerifyService.ts)
export function useCodecVerify() {
  const [pagoEntrante, setPagoEntrante] = useState<PagoEntrante | null>(null);
  const [connected, setConnected] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const manejarNuevaNotificacion = useCallback((row: NotificacionPagoRow) => {
    const pago: PagoEntrante = {
      id: row.id,
      monto: row.monto || 0,
      banco: row.entidad || 'desconocido',
      remitente: row.referencia || 'Sin referencia',
      timestamp: new Date().toLocaleTimeString('es-CO'),
    };

    // 🔊 Anuncio de voz: se dice en voz alta apenas llega la confirmación de
    // pago al celular vinculado, sin importar si es manual o automático.
    anunciarPagoRecibido(pago.monto, pago.banco);

    // 🔗 Puente para consumidores existentes (p. ej. NequiVerifyModal en el
    // checkout), que ya escuchaban este evento esperando una infraestructura
    // real detrás — ver window.addEventListener('codecverify:pago_recibido', ...).
    window.dispatchEvent(
      new CustomEvent('codecverify:pago_recibido', {
        detail: { monto: pago.monto, banco: pago.banco, remitente: pago.remitente, referencia: row.referencia, origen: row.origen },
      })
    );

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(row.origen === 'automatizacion' ? '✅ Pago verificado automáticamente' : '💰 Pago recibido', {
          body: `$${pago.monto.toLocaleString('es-CO')} desde ${pago.banco}`,
          icon: '/icon.png',
          tag: 'codecverify-pago',
        });
      } catch (error) {
        console.error('Error mostrando notificación:', error);
      }
    }

    // Origen automático (webhook de correo/SMS con token secreto del
    // negocio) ya llega verificado — no tiene sentido pedirle al cajero que
    // "confirme" algo que el propio dueño ya recibió en su celular/correo.
    // Solo se avisa; el flujo manual sí sigue abriendo el modal de 30s.
    if (row.origen === 'automatizacion') {
      toast.success(`✅ Pago verificado automáticamente: $${pago.monto.toLocaleString('es-CO')} · ${pago.banco.toUpperCase()}`, {
        duration: 8000,
        description: pago.remitente !== 'Sin referencia' ? pago.remitente : undefined,
      });
      return;
    }

    setPagoEntrante(pago);
    toast.success(`Pago recibido: $${pago.monto.toLocaleString('es-CO')}`);
  }, []);

  const connect = useCallback(() => {
    if (unsubscribeRef.current || !isLinked()) return;
    const unsubscribe = suscribirNotificacionesPago(manejarNuevaNotificacion);
    if (unsubscribe) {
      unsubscribeRef.current = unsubscribe;
      setConnected(true);
    }
  }, [manejarNuevaNotificacion]);

  const disconnect = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    setConnected(false);
  }, []);

  useEffect(() => () => disconnect(), [disconnect]);

  const vincularPago = useCallback((pago: PagoEntrante) => {
    marcarNotificacionPago(pago.id, 'confirmado').then((r) => {
      if (!r.ok) console.error('Error confirmando notificación:', r.error);
    });
    toast.success('Pago vinculado correctamente');
    setPagoEntrante(null);
  }, []);

  const descartarPago = useCallback(() => {
    if (pagoEntrante) {
      marcarNotificacionPago(pagoEntrante.id, 'descartado').then((r) => {
        if (!r.ok) console.error('Error descartando notificación:', r.error);
      });
    }
    setPagoEntrante(null);
  }, [pagoEntrante]);

  const simularPagoEntrante = useCallback(() => {
    const bancos = ['nequi', 'daviplata', 'bancolombia', 'dale'];
    const remitentes = ['Juan Pérez', 'María García', 'Carlos López', 'Ana Martínez'];
    
    const pago: PagoEntrante = {
      id: `pago_${Date.now()}`,
      monto: Math.floor(Math.random() * 500000) + 10000,
      banco: bancos[Math.floor(Math.random() * bancos.length)],
      remitente: remitentes[Math.floor(Math.random() * remitentes.length)],
      timestamp: new Date().toLocaleTimeString('es-CO'),
    };

    setPagoEntrante(pago);
    toast.info('Pago simulado para demostración');
  }, []);

  return {
    pagoEntrante,
    simularPagoEntrante,
    vincularPago,
    descartarPago,
    connected,
    connect,     // ⚡ NUEVO: Exponer función de conexión
    disconnect,  // ⚡ NUEVO: Exponer función de desconexión
  };
}