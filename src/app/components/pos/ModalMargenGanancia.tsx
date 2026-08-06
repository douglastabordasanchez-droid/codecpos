/**
 * ============================================
 * MODAL DE MARGEN DE GANANCIA PERSONALIZADO
 * CODEC POS v2.0
 * ============================================
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, TrendingUp, DollarSign, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from 'sonner';

interface ModalMargenGananciaProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
}

export function ModalMargenGanancia({ isOpen, onClose, darkMode }: ModalMargenGananciaProps) {
  // Cargar configuración desde localStorage
  const [margenConfig, setMargenConfig] = useState(() => {
    const saved = localStorage.getItem('pos-margen-automatico-config');
    return saved ? JSON.parse(saved) : {
      activo: false,
      porcentaje: 30
    };
  });

  const handleToggle = () => {
    const newConfig = { ...margenConfig, activo: !margenConfig.activo };
    setMargenConfig(newConfig);
    localStorage.setItem('pos-margen-automatico-config', JSON.stringify(newConfig));
    
    toast.success(
      newConfig.activo ? '✅ Margen automático activado' : '⚪ Margen automático desactivado',
      { description: newConfig.activo ? 'Los precios se calcularán automáticamente' : 'Podrás ingresar precios manualmente' }
    );
  };

  const handlePorcentajeChange = (value: number) => {
    const newConfig = { ...margenConfig, porcentaje: value };
    setMargenConfig(newConfig);
    localStorage.setItem('pos-margen-automatico-config', JSON.stringify(newConfig));
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className={`max-w-2xl w-full max-h-[90vh] overflow-y-auto scrollbar-thin rounded-3xl p-8 ${
            darkMode 
              ? 'bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-amber-600/50' 
              : 'bg-white border-2 border-amber-400'
          } shadow-2xl`}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl flex items-center justify-center shadow-lg">
                <TrendingUp className="w-7 h-7 text-white" />
              </div>
              <div>
                <h2 className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Personaliza tu Ganancia
                </h2>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Configura el margen de ganancia automático
                </p>
              </div>
            </div>
            <Button
              onClick={onClose}
              variant="ghost"
              size="sm"
              className="w-10 h-10 p-0 rounded-xl"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="space-y-6">
            {/* Toggle Activar/Desactivar */}
            <div className={`p-5 rounded-2xl border-2 ${
              margenConfig.activo
                ? darkMode
                  ? 'bg-emerald-900/20 border-emerald-700/50'
                  : 'bg-emerald-50 border-emerald-300'
                : darkMode
                ? 'bg-slate-700/30 border-slate-600'
                : 'bg-gray-50 border-gray-300'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Cálculo Automático de Precios
                  </Label>
                  <p className={`text-sm mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    {margenConfig.activo 
                      ? '✅ Los precios de venta se calcularán automáticamente sumando tu margen de ganancia al costo' 
                      : '⚪ Los precios de venta se ingresarán manualmente para cada producto'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleToggle}
                  className={`relative inline-flex h-10 w-20 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                    margenConfig.activo 
                      ? 'bg-emerald-600' 
                      : darkMode ? 'bg-slate-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-9 w-9 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      margenConfig.activo ? 'translate-x-10' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Campo de Porcentaje (solo visible si está activo) */}
            {margenConfig.activo && (
              <>
                <div className="space-y-3">
                  <Label htmlFor="porcentaje" className={`text-base font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    💰 Porcentaje de Ganancia
                  </Label>
                  <div className="relative">
                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-amber-500" />
                    <Input
                      id="porcentaje"
                      type="number"
                      min="0"
                      max="1000"
                      step="1"
                      value={margenConfig.porcentaje}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value);
                        if (!isNaN(value) && value >= 0) {
                          handlePorcentajeChange(value);
                        }
                      }}
                      className={`pl-14 pr-12 h-16 text-2xl font-black text-center ${
                        darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-gray-50'
                      }`}
                    />
                    <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-2xl font-black ${
                      darkMode ? 'text-amber-400' : 'text-amber-600'
                    }`}>
                      %
                    </span>
                  </div>
                  
                  {/* 🎚️ NUEVO: Slider Visual */}
                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between items-center text-xs font-semibold">
                      <span className={darkMode ? 'text-gray-500' : 'text-gray-500'}>0%</span>
                      <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Desliza para ajustar</span>
                      <span className={darkMode ? 'text-gray-500' : 'text-gray-500'}>200%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      step="1"
                      value={margenConfig.porcentaje}
                      onChange={(e) => handlePorcentajeChange(parseFloat(e.target.value))}
                      className={`w-full h-3 rounded-lg appearance-none cursor-pointer slider-thumb ${
                        darkMode ? 'bg-slate-700' : 'bg-gray-200'
                      }`}
                      style={{
                        background: darkMode 
                          ? `linear-gradient(to right, #f59e0b 0%, #f59e0b ${margenConfig.porcentaje / 2}%, #334155 ${margenConfig.porcentaje / 2}%, #334155 100%)`
                          : `linear-gradient(to right, #f59e0b 0%, #f59e0b ${margenConfig.porcentaje / 2}%, #e5e7eb ${margenConfig.porcentaje / 2}%, #e5e7eb 100%)`
                      }}
                    />
                  </div>
                  
                  <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                    Este porcentaje se sumará al costo para calcular el precio de venta automáticamente
                  </p>
                </div>

                {/* Ejemplo Visual */}
                <div className={`p-6 rounded-2xl border-2 ${
                  darkMode 
                    ? 'bg-slate-800/50 border-slate-600' 
                    : 'bg-white border-gray-200'
                }`}>
                  <h4 className={`text-sm font-bold mb-4 flex items-center gap-2 ${
                    darkMode ? 'text-amber-400' : 'text-amber-700'
                  }`}>
                    <TrendingUp className="w-5 h-5" />
                    Ejemplo de Cálculo Automático
                  </h4>
                  <div className="space-y-4 font-mono">
                    <div className="flex justify-between items-center">
                      <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Costo del Producto:
                      </span>
                      <span className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        $10,000
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Margen ({margenConfig.porcentaje}%):
                      </span>
                      <span className={`text-lg font-bold ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                        +${(10000 * (margenConfig.porcentaje / 100)).toLocaleString('es-CO')}
                      </span>
                    </div>
                    <div className={`pt-4 border-t-2 ${
                      darkMode ? 'border-amber-600/30' : 'border-amber-300'
                    }`}>
                      <div className="flex justify-between items-center">
                        <span className={`text-base font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          Precio de Venta:
                        </span>
                        <span className={`text-2xl font-black ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                          ${(10000 * (1 + margenConfig.porcentaje / 100)).toLocaleString('es-CO')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tabla de Ejemplos */}
                <div className={`p-6 rounded-2xl border-2 ${
                  darkMode 
                    ? 'bg-emerald-900/10 border-emerald-700/30' 
                    : 'bg-emerald-50 border-emerald-200'
                }`}>
                  <h4 className={`text-sm font-bold mb-4 ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                    📊 Tabla de Conversión Rápida
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className={`border-b-2 ${darkMode ? 'border-emerald-700/30' : 'border-emerald-300'}`}>
                          <th className={`text-left py-3 px-3 font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            Costo
                          </th>
                          <th className={`text-left py-3 px-3 font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            Margen
                          </th>
                          <th className={`text-left py-3 px-3 font-bold ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                            Precio Venta
                          </th>
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        {[1000, 5000, 10000, 25000, 50000].map((costo) => (
                          <tr key={costo} className={`border-b ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                            <td className={`py-3 px-3 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                              ${costo.toLocaleString('es-CO')}
                            </td>
                            <td className={`py-3 px-3 font-bold ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                              +${(costo * (margenConfig.porcentaje / 100)).toLocaleString('es-CO')}
                            </td>
                            <td className={`py-3 px-3 font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                              ${(costo * (1 + margenConfig.porcentaje / 100)).toLocaleString('es-CO')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* Información Informativa */}
            <div className={`p-5 rounded-2xl border-2 ${
              darkMode 
                ? 'bg-blue-900/20 border-blue-700/30' 
                : 'bg-blue-50 border-blue-200'
            }`}>
              <div className="flex gap-3">
                <AlertCircle className="w-6 h-6 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <h4 className={`font-bold text-base ${darkMode ? 'text-blue-400' : 'text-blue-900'}`}>
                    ℹ️ ¿Cómo funciona?
                  </h4>
                  <ul className={`text-sm space-y-1.5 ${darkMode ? 'text-blue-300' : 'text-blue-800'}`}>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>Cuando esté <span className="font-bold">activado</span>, al crear un producto solo ingresarás el <span className="font-bold">costo</span></span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>El sistema calculará automáticamente el <span className="font-bold">precio de venta</span> sumando tu margen de ganancia</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>Puedes modificar el precio manualmente si necesitas un margen diferente para algún producto específico</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>Esta configuración es <span className="font-bold">100% opcional</span> - puedes desactivarla cuando quieras</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Botón de Cerrar */}
            <Button
              onClick={onClose}
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-lg font-bold"
            >
              <CheckCircle className="w-6 h-6 mr-2" />
              ¡Listo! Cerrar
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}