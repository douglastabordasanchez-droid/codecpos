/**
 * CODECPOS v2.0 - Componente de Versículo Bíblico
 * Muestra la Palabra de Dios de manera visible en el sistema
 */

import { motion, AnimatePresence } from 'motion/react';
import { Book, Sparkles, Heart } from 'lucide-react';
import { useVersiculosBiblicos } from '../../hooks/useVersiculosBiblicos';
import { usePOS } from '../../contexts/POSContext';
import { useState } from 'react';

export default function VersiculoBiblico() {
  const { darkMode } = usePOS();
  const { obtenerVersiculoDelDia } = useVersiculosBiblicos();
  const [expandido, setExpandido] = useState(false);
  
  const versiculo = obtenerVersiculoDelDia();

  if (!versiculo) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative"
    >
      <motion.div
        whileHover={{ scale: 1.02 }}
        onClick={() => setExpandido(!expandido)}
        className={`cursor-pointer transition-all duration-300 ${
          darkMode
            ? 'bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-blue-600/20 border border-blue-500/30'
            : 'bg-gradient-to-r from-blue-50 via-purple-50 to-blue-50 border border-blue-200'
        } rounded-2xl p-4 backdrop-blur-xl shadow-lg hover:shadow-xl`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            darkMode ? 'bg-blue-500/20' : 'bg-blue-100'
          }`}>
            {versiculo.tipo === 'especial' ? (
              <Sparkles className={`w-5 h-5 ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`} />
            ) : versiculo.tipo === 'obediencia' ? (
              <Book className={`w-5 h-5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
            ) : (
              <Heart className={`w-5 h-5 ${darkMode ? 'text-pink-400' : 'text-pink-600'}`} />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-lg">✝️</span>
              <p className={`text-xs font-bold uppercase tracking-wider ${
                darkMode ? 'text-blue-300' : 'text-blue-600'
              }`}>
                Palabra de Dios
              </p>
              {versiculo.tipo === 'especial' && (
                <span className="text-xs">🌟</span>
              )}
            </div>
            
            <AnimatePresence mode="wait">
              {expandido ? (
                <motion.div
                  key="expandido"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2"
                >
                  <p className={`text-sm leading-relaxed ${
                    darkMode ? 'text-gray-200' : 'text-gray-700'
                  }`}>
                    "{versiculo.texto}"
                  </p>
                  <p className={`text-xs font-semibold mt-2 italic ${
                    darkMode ? 'text-blue-400' : 'text-blue-600'
                  }`}>
                    — {versiculo.referencia}
                  </p>
                </motion.div>
              ) : (
                <motion.p
                  key="compacto"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={`text-sm truncate ${
                    darkMode ? 'text-gray-300' : 'text-gray-600'
                  }`}
                >
                  "{versiculo.texto.substring(0, 60)}..."
                </motion.p>
              )}
            </AnimatePresence>

            <p className={`text-xs mt-1 ${
              darkMode ? 'text-gray-400' : 'text-gray-500'
            }`}>
              {versiculo.referencia}
            </p>
          </div>

          <motion.div
            animate={{ rotate: expandido ? 180 : 0 }}
            className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}
          >
            ▼
          </motion.div>
        </div>

        {/* Mensaje contextual */}
        {expandido && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-3 pt-3 border-t ${
              darkMode ? 'border-blue-500/20' : 'border-blue-200'
            }`}
          >
            {versiculo.tipo === 'obediencia' && (
              <div className={`flex items-center gap-2 text-xs ${
                darkMode ? 'text-yellow-300' : 'text-yellow-700'
              }`}>
                <span>🙏</span>
                <p className="font-medium">
                  La obediencia a Dios trae bendición y prosperidad en tu negocio
                </p>
              </div>
            )}
            {versiculo.tipo === 'aliento' && (
              <div className={`flex items-center gap-2 text-xs ${
                darkMode ? 'text-green-300' : 'text-green-700'
              }`}>
                <span>💚</span>
                <p className="font-medium">
                  Dios está contigo en cada venta, en cada cliente, en cada día
                </p>
              </div>
            )}
            {versiculo.tipo === 'especial' && (
              <div className={`flex items-center gap-2 text-xs ${
                darkMode ? 'text-purple-300' : 'text-purple-700'
              }`}>
                <span>🌟</span>
                <p className="font-medium">
                  No temas, Él es tu fortaleza y sustento en el trabajo diario
                </p>
              </div>
            )}
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
