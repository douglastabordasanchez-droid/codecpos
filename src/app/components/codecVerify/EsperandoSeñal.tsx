import { motion } from 'motion/react';
import { Smartphone, Wifi, Loader2, CheckCircle2, XCircle } from 'lucide-react';

interface EsperandoSeñalProps {
  estado: 'esperando' | 'verificado' | 'error';
  monto?: number;
  banco?: string;
}

export function EsperandoSeñal({ estado, monto, banco }: EsperandoSeñalProps) {
  return (
    <div className="relative py-6">
      {estado === 'esperando' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          {/* Animación de ondas */}
          <div className="relative">
            <motion.div
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.5, 0, 0.5],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
              }}
              className="absolute inset-0 bg-blue-500 rounded-full blur-xl"
            />
            <motion.div
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.7, 0, 0.7],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: 0.5,
              }}
              className="absolute inset-0 bg-purple-500 rounded-full blur-xl"
            />
            
            <div className="relative w-20 h-20 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center shadow-2xl">
              <Smartphone className="w-10 h-10 text-white" />
            </div>
          </div>

          {/* Texto animado */}
          <div className="text-center space-y-2">
            <div className="flex items-center gap-2 justify-center">
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
              <motion.p
                animate={{
                  opacity: [1, 0.5, 1],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                }}
                className="text-slate-300 font-medium"
              >
                Verificando pago en la cuenta del dueño...
              </motion.p>
            </div>
            
            <p className="text-slate-500 text-sm">
              Eduardo confirmará el pago desde su celular
            </p>
          </div>

          {/* Barra de progreso infinita */}
          <div className="w-full max-w-xs h-1 bg-slate-700 rounded-full overflow-hidden">
            <motion.div
              animate={{
                x: ['-100%', '200%'],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'linear',
              }}
              className="h-full w-1/3 bg-gradient-to-r from-blue-500 to-purple-500"
            />
          </div>

          {/* Iconos de conexión */}
          <div className="flex items-center gap-2 text-slate-600 text-xs">
            <Wifi className="w-4 h-4" />
            <span>Escuchando notificaciones...</span>
          </div>
        </motion.div>
      )}

      {estado === 'verificado' && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 10 }}
            className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center shadow-2xl"
          >
            <CheckCircle2 className="w-12 h-12 text-white" />
          </motion.div>

          <div className="text-center space-y-2">
            <p className="text-green-400 font-bold text-xl">¡Pago Verificado!</p>
            <p className="text-white text-3xl font-bold">
              ${monto?.toLocaleString('es-CO')}
            </p>
            <p className="text-slate-400 text-sm">
              Recibido vía {banco?.toUpperCase()}
            </p>
          </div>
        </motion.div>
      )}

      {estado === 'error' && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center shadow-2xl">
            <XCircle className="w-12 h-12 text-white" />
          </div>

          <div className="text-center space-y-2">
            <p className="text-red-400 font-bold text-xl">No Verificado</p>
            <p className="text-slate-400 text-sm">
              No se recibió confirmación del dueño
            </p>
            <p className="text-slate-500 text-xs">
              Verifica que Eduardo tenga su celular activo
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
