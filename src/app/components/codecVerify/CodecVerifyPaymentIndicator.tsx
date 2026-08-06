/**
 * Indicador de Codec Verify en el Modal de Pago
 * Muestra el estado de la conexión y notifica al cajero cuando llega un pago
 */

import { motion, AnimatePresence } from 'motion/react';
import { Shield, Smartphone, Check, Clock, Zap } from 'lucide-react';
import { useCodecVerify } from './AlertaPagoEntrante';
import { usePOS } from '../../contexts/POSContext';

interface CodecVerifyPaymentIndicatorProps {
  metodoPago?: 'nequi' | 'daviplata' | 'transferencia' | 'tarjeta' | 'efectivo';
}

export function CodecVerifyPaymentIndicator({ metodoPago }: CodecVerifyPaymentIndicatorProps) {
  const { darkMode } = usePOS();
  const { connected, pagoEntrante } = useCodecVerify();

  // Solo mostrar para métodos de pago móviles
  const metodosMoviles = ['nequi', 'daviplata', 'transferencia'];
  const mostrar = !metodoPago || metodosMoviles.includes(metodoPago);

  if (!mostrar) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={`mb-6 p-5 rounded-2xl border-2 ${
          pagoEntrante
            ? darkMode 
              ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-green-500/50 shadow-2xl shadow-green-500/30' 
              : 'bg-gradient-to-r from-green-100 to-emerald-100 border-green-400 shadow-2xl shadow-green-300/50'
            : connected
              ? darkMode 
                ? 'bg-gradient-to-r from-purple-500/10 to-violet-500/10 border-purple-500/30 backdrop-blur-xl' 
                : 'bg-gradient-to-r from-purple-100/70 to-violet-100/70 border-purple-300 backdrop-blur-xl shadow-lg'
              : darkMode 
                ? 'bg-slate-700/50 border-slate-600' 
                : 'bg-gray-100/70 border-gray-300 backdrop-blur-xl'
        }`}
      >
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${
            pagoEntrante
              ? 'bg-gradient-to-br from-green-600 to-emerald-700 animate-pulse'
              : connected
                ? darkMode ? 'bg-gradient-to-br from-purple-600 to-violet-700' : 'bg-gradient-to-br from-purple-600 to-violet-600'
                : darkMode ? 'bg-slate-600' : 'bg-gray-400'
          }`}>
            {pagoEntrante ? (
              <Check className="w-7 h-7 text-white" />
            ) : (
              <Shield className="w-7 h-7 text-white" />
            )}
          </div>
          
          <div className="flex-1">
            {pagoEntrante ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <p className={`font-bold text-lg ${
                    darkMode ? 'text-green-300' : 'text-green-900'
                  }`}>
                    ¡Pago Detectado! 
                  </p>
                  <Zap className={`w-5 h-5 ${
                    darkMode ? 'text-green-400' : 'text-green-600'
                  } animate-bounce`} />
                </div>
                <p className={`text-sm font-semibold ${
                  darkMode ? 'text-green-400' : 'text-green-700'
                }`}>
                  {pagoEntrante.banco.toUpperCase()} - ${pagoEntrante.monto.toLocaleString('es-CO')}
                </p>
                <p className={`text-xs ${
                  darkMode ? 'text-green-500' : 'text-green-600'
                }`}>
                  Remitente: {pagoEntrante.remitente}
                </p>
              </>
            ) : connected ? (
              <>
                <p className={`font-bold text-base ${
                  darkMode ? 'text-purple-300' : 'text-purple-900'
                }`}>
                  Codec Verify Activo ✓
                </p>
                <p className={`text-sm ${
                  darkMode ? 'text-purple-400' : 'text-purple-700'
                }`}>
                  Recibirás notificación instantánea cuando llegue el pago
                </p>
              </>
            ) : (
              <>
                <p className={`font-bold text-base ${
                  darkMode ? 'text-slate-300' : 'text-gray-700'
                }`}>
                  Codec Verify Inactivo
                </p>
                <p className={`text-sm ${
                  darkMode ? 'text-slate-400' : 'text-gray-600'
                }`}>
                  Esperando conexión con el servidor...
                </p>
              </>
            )}
          </div>

          {pagoEntrante ? (
            <div className="flex flex-col items-center gap-1">
              <div className="w-4 h-4 rounded-full bg-green-500 animate-ping" />
              <span className={`text-xs font-bold ${
                darkMode ? 'text-green-400' : 'text-green-700'
              }`}>
                NUEVO
              </span>
            </div>
          ) : connected ? (
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
          ) : (
            <div className="w-3 h-3 rounded-full bg-gray-400" />
          )}
        </div>

        {/* Mensaje de espera para pagos móviles */}
        {connected && !pagoEntrante && metodoPago && metodosMoviles.includes(metodoPago) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className={`mt-4 pt-4 border-t ${
              darkMode ? 'border-purple-500/20' : 'border-purple-200'
            }`}
          >
            <div className="flex items-center gap-2 text-sm">
              <Clock className={`w-4 h-4 ${
                darkMode ? 'text-purple-400' : 'text-purple-600'
              }`} />
              <span className={darkMode ? 'text-purple-300' : 'text-purple-700'}>
                Esperando confirmación del cliente vía {metodoPago}...
              </span>
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}