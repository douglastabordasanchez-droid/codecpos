/**
 * MODAL UPGRADE TO PREMIUM - CODEC POS v2.0
 * Bloqueo visual estilo "Vitrina" para incentivar upgrade
 * Se muestra cuando un usuario BÁSICO intenta acceder a funciones PREMIUM
 */

import { motion } from 'motion/react';
import {
  Crown,
  Zap,
  X,
  Check,
  Lock,
  TrendingUp,
  Users,
  Database,
  Smartphone,
  BarChart3,
  Shield,
  Infinity,
} from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { usePOS } from '../../contexts/POSContext';

interface ModalUpgradePremiumProps {
  isOpen: boolean;
  onClose: () => void;
  featureName?: string;
  featureDescription?: string;
}

export function ModalUpgradePremium({
  isOpen,
  onClose,
  featureName = 'Función Premium',
  featureDescription = 'Esta funcionalidad está disponible únicamente en el Plan Premium',
}: ModalUpgradePremiumProps) {
  const { darkMode } = usePOS();

  if (!isOpen) return null;

  const beneficiosPremium = [
    {
      icon: Database,
      titulo: 'Productos Ilimitados',
      descripcion: 'Sin límite de productos en inventario',
      color: 'text-blue-500',
    },
    {
      icon: Users,
      titulo: 'Usuarios Ilimitados',
      descripcion: 'Equipos de trabajo sin restricciones',
      color: 'text-green-500',
    },
    {
      icon: BarChart3,
      titulo: '12 Meses de Historial',
      descripcion: 'Análisis completo anual de ventas',
      color: 'text-purple-500',
    },
    {
      icon: Smartphone,
      titulo: 'Codec Verify PRO',
      descripcion: 'Notificaciones de pagos móviles',
      color: 'text-amber-500',
    },
    {
      icon: Shield,
      titulo: 'Personalización Total',
      descripcion: 'Tirillas, IVA y configuración',
      color: 'text-indigo-500',
    },
    {
      icon: TrendingUp,
      titulo: 'Dashboard Ejecutivo',
      descripcion: 'Métricas en tiempo real',
      color: 'text-pink-500',
    },
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="w-full max-w-4xl max-h-[90vh] overflow-y-auto"
      >
        <Card
          className={`${
            darkMode
              ? 'bg-gradient-to-br from-slate-800 via-purple-900/20 to-slate-800 border-2 border-purple-500/30'
              : 'bg-gradient-to-br from-white via-purple-50 to-white border-2 border-purple-200'
          } shadow-2xl`}
        >
          {/* Header */}
          <div className="relative p-8 pb-6">
            {/* Botón cerrar */}
            <button
              onClick={onClose}
              className={`absolute top-4 right-4 p-2 rounded-xl transition-all ${
                darkMode
                  ? 'hover:bg-slate-700 text-gray-400 hover:text-white'
                  : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
              }`}
            >
              <X className="w-6 h-6" />
            </button>

            {/* Icono bloqueado */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.2 }}
              className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-purple-600 to-amber-500 rounded-3xl flex items-center justify-center shadow-2xl relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-purple-600 to-amber-500 rounded-3xl blur-2xl opacity-50 animate-pulse" />
              <Lock className="w-12 h-12 text-white relative z-10" />
            </motion.div>

            {/* Título */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-center"
            >
              <h2
                className={`text-3xl font-black mb-2 bg-gradient-to-r from-purple-600 to-amber-500 bg-clip-text text-transparent`}
              >
                Desbloquea {featureName}
              </h2>
              <p className={`text-lg ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                {featureDescription}
              </p>
            </motion.div>

            {/* Badge PREMIUM */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              className="flex justify-center mt-6"
            >
              <div className="px-6 py-2 bg-gradient-to-r from-purple-600 to-amber-500 rounded-full flex items-center gap-2 shadow-lg">
                <Crown className="w-5 h-5 text-white" />
                <span className="text-white font-bold text-sm">SOLO PLAN PREMIUM</span>
              </div>
            </motion.div>
          </div>

          {/* Beneficios Grid */}
          <div className="px-8 pb-6">
            <h3
              className={`text-xl font-bold mb-4 text-center ${
                darkMode ? 'text-white' : 'text-gray-900'
              }`}
            >
              🎁 Al actualizar obtienes:
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {beneficiosPremium.map((beneficio, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + index * 0.1 }}
                  className={`p-4 rounded-2xl border-2 ${
                    darkMode
                      ? 'bg-slate-800/50 border-slate-700'
                      : 'bg-white border-gray-200'
                  } hover:shadow-lg transition-all`}
                >
                  <beneficio.icon className={`w-10 h-10 ${beneficio.color} mb-3`} />
                  <h4
                    className={`font-bold text-sm mb-1 ${
                      darkMode ? 'text-white' : 'text-gray-900'
                    }`}
                  >
                    {beneficio.titulo}
                  </h4>
                  <p
                    className={`text-xs ${
                      darkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}
                  >
                    {beneficio.descripcion}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Comparación Planes */}
          <div className="px-8 pb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Plan BÁSICO */}
              <div
                className={`p-6 rounded-2xl border-2 ${
                  darkMode
                    ? 'bg-slate-800/30 border-slate-700'
                    : 'bg-gray-50 border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="w-6 h-6 text-blue-500" />
                  <h4
                    className={`text-lg font-bold ${
                      darkMode ? 'text-white' : 'text-gray-900'
                    }`}
                  >
                    Plan BÁSICO
                  </h4>
                  <span className="ml-auto px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs font-bold">
                    TU PLAN ACTUAL
                  </span>
                </div>
                <ul className={`space-y-2 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>5,000 productos máximo</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>3 meses de historial de ventas</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Hasta 5 usuarios simultáneos</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <X className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <span className="line-through opacity-50">Codec Verify</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <X className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <span className="line-through opacity-50">Dashboard avanzado</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <X className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <span className="line-through opacity-50">Personalización de tirillas</span>
                  </li>
                </ul>
              </div>

              {/* Plan PREMIUM */}
              <div
                className={`p-6 rounded-2xl border-2 relative overflow-hidden ${
                  darkMode
                    ? 'bg-gradient-to-br from-purple-900/40 to-amber-900/40 border-purple-500'
                    : 'bg-gradient-to-br from-purple-50 to-amber-50 border-purple-400'
                }`}
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-500/20 to-amber-500/20 rounded-full blur-3xl" />
                
                <div className="flex items-center gap-2 mb-4 relative z-10">
                  <Crown className="w-6 h-6 text-amber-500" />
                  <h4
                    className={`text-lg font-bold ${
                      darkMode ? 'text-white' : 'text-gray-900'
                    }`}
                  >
                    Plan PREMIUM
                  </h4>
                  <span className="ml-auto px-3 py-1 bg-gradient-to-r from-purple-600 to-amber-500 text-white rounded-full text-xs font-bold shadow-lg">
                    RECOMENDADO
                  </span>
                </div>
                <ul className={`space-y-2 text-sm ${darkMode ? 'text-gray-200' : 'text-gray-800'} relative z-10`}>
                  <li className="flex items-start gap-2">
                    <Infinity className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span className="font-semibold">Productos ilimitados ∞</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span className="font-semibold">12 meses de historial completo</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Infinity className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span className="font-semibold">Usuarios ilimitados ∞</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span className="font-semibold">Codec Verify PRO integrado</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span className="font-semibold">Dashboard ejecutivo completo</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span className="font-semibold">Personalización total</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Footer con CTA */}
          <div className={`px-8 py-6 border-t ${darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-gray-200 bg-gray-50'}`}>
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <p className={`text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  ¿Listo para llevar tu negocio al siguiente nivel?
                </p>
                <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                  Contacta al desarrollador para actualizar tu licencia
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={onClose}
                  variant="outline"
                  className={darkMode ? 'border-slate-600 hover:bg-slate-700' : ''}
                >
                  Cerrar
                </Button>
                <Button
                  onClick={() => {
                    // Aquí puedes agregar lógica para contactar al desarrollador
                    window.open('https://wa.me/573001234567?text=Quiero%20actualizar%20a%20Premium', '_blank');
                  }}
                  className="bg-gradient-to-r from-purple-600 to-amber-500 hover:from-purple-700 hover:to-amber-600 font-bold shadow-lg"
                >
                  <Crown className="w-4 h-4 mr-2" />
                  Actualizar Ahora
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}