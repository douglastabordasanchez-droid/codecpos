/**
 * CONTADOR DE PRUEBA FLOTANTE - CODEC POS v2.0
 * Indicador visible de días restantes en modo prueba
 */

import { motion, AnimatePresence } from 'motion/react';
import { Clock, Zap, Crown } from 'lucide-react';
import { usePOS } from '../../contexts/POSContext';
import { usePlanRestrictions } from '../../hooks/usePlanRestrictions';

export function TrialCounterFloat() {
  const { darkMode } = usePOS();
  const { isTrial, planInfo } = usePlanRestrictions();

  // Solo mostrar si está en prueba
  if (!isTrial || planInfo.diasPruebaRestantes <= 0) return null;

  const diasRestantes = planInfo.diasPruebaRestantes;
  const porcentaje = (diasRestantes / 7) * 100;
  
  // Color según días restantes
  const getColor = () => {
    if (diasRestantes >= 5) return 'green';
    if (diasRestantes >= 3) return 'amber';
    return 'red';
  };

  const color = getColor();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.9 }}
        className="fixed top-20 right-6 z-50"
      >
        <motion.div
          animate={{
            y: [0, -5, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className={`relative backdrop-blur-xl rounded-2xl shadow-2xl border-2 overflow-hidden ${
            darkMode
              ? 'bg-slate-800/90 border-purple-500/40'
              : 'bg-white/90 border-purple-300'
          }`}
        >
          {/* Gradient animado de fondo */}
          <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 via-transparent to-amber-500/20 animate-pulse" />

          <div className="relative p-4 min-w-[260px]">
            {/* Header */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-amber-500 rounded-xl flex items-center justify-center shadow-lg">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Modo Full - Prueba
                </h3>
                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Todas las funciones desbloqueadas
                </p>
              </div>
            </div>

            {/* Contador de días */}
            <div className={`p-4 rounded-xl mb-3 ${
              darkMode ? 'bg-slate-700/50' : 'bg-purple-50'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Clock className={`w-4 h-4 text-${color}-500`} />
                  <span className={`text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Días restantes
                  </span>
                </div>
                <motion.span
                  key={diasRestantes}
                  initial={{ scale: 1.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className={`text-2xl font-black text-${color}-500`}
                >
                  {diasRestantes}
                </motion.span>
              </div>

              {/* Barra de progreso */}
              <div className={`h-2 rounded-full overflow-hidden ${
                darkMode ? 'bg-slate-600' : 'bg-gray-200'
              }`}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${porcentaje}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className={`h-full bg-gradient-to-r ${
                    color === 'green'
                      ? 'from-green-500 to-emerald-500'
                      : color === 'amber'
                      ? 'from-amber-500 to-orange-500'
                      : 'from-red-500 to-rose-500'
                  }`}
                />
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={() => {
                // Aquí puedes abrir el modal de upgrade
                console.log('Abrir modal de upgrade');
              }}
              className="w-full py-2 rounded-xl bg-gradient-to-r from-purple-600 to-amber-500 hover:from-purple-700 hover:to-amber-600 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 group"
            >
              <Crown className="w-4 h-4 text-white group-hover:scale-110 transition-transform" />
              <span className="text-white font-bold text-sm">
                Actualizar a Premium
              </span>
            </button>

            {/* Mensaje de urgencia si quedan pocos días */}
            {diasRestantes <= 2 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className={`mt-3 p-2 rounded-lg text-center ${
                  darkMode ? 'bg-red-900/30' : 'bg-red-50'
                }`}
              >
                <p className={`text-xs font-semibold ${darkMode ? 'text-red-400' : 'text-red-700'}`}>
                  ⚠️ Tu prueba vence pronto
                </p>
              </motion.div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
