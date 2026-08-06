/**
 * CODEC POS - Tarjeta de Estadísticas de Devoluciones
 * Componente para mostrar estadísticas de devoluciones en el Dashboard
 */

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { RotateCcw, TrendingDown, DollarSign, Package, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { usePOS } from '../../contexts/POSContext';

interface Devolucion {
  id: string;
  fecha: string;
  totalDevolucion: number;
  items: any[];
  estado: string;
}

export function DevolucionesStatsCard() {
  const { darkMode, refreshTrigger } = usePOS();
  const [devoluciones, setDevoluciones] = useState<Devolucion[]>([]);

  useEffect(() => {
    cargarDevoluciones();
  }, [refreshTrigger]);

  const cargarDevoluciones = () => {
    const saved = localStorage.getItem('codecpos_devoluciones');
    if (saved) {
      setDevoluciones(JSON.parse(saved));
    }
  };

  // Calcular estadísticas
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const devolucionesHoy = devoluciones.filter(d => {
    const fecha = new Date(d.fecha);
    fecha.setHours(0, 0, 0, 0);
    return fecha.getTime() === hoy.getTime();
  });

  const totalDevolucionesHoy = devolucionesHoy.length;
  const montoDevolucionesHoy = devolucionesHoy.reduce((sum, d) => sum + d.totalDevolucion, 0);
  const productosDevueltosHoy = devolucionesHoy.reduce(
    (sum, d) => sum + d.items.reduce((itemSum, item) => itemSum + item.cantidadDevuelta, 0),
    0
  );

  // Estadísticas del mes actual
  const mesActual = hoy.getMonth();
  const añoActual = hoy.getFullYear();

  const devolucionesMes = devoluciones.filter(d => {
    const fecha = new Date(d.fecha);
    return fecha.getMonth() === mesActual && fecha.getFullYear() === añoActual;
  });

  const totalDevolucionesMes = devolucionesMes.length;
  const montoDevolucionesMes = devolucionesMes.reduce((sum, d) => sum + d.totalDevolucion, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card
        className={`shadow-xl border-2 ${
          darkMode
            ? 'bg-gradient-to-br from-orange-900/30 to-red-900/30 border-orange-700/50'
            : 'bg-gradient-to-br from-orange-50 to-red-50 border-orange-300'
        }`}
      >
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center">
              <RotateCcw className="w-5 h-5 text-white" />
            </div>
            Devoluciones
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Estadísticas de Hoy */}
          <div className="grid grid-cols-3 gap-3">
            <div
              className={`p-4 rounded-xl ${
                darkMode ? 'bg-slate-800/50 border border-slate-700' : 'bg-white border border-gray-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-4 h-4 text-orange-500" />
                <p className={`text-xs font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Hoy
                </p>
              </div>
              <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {totalDevolucionesHoy}
              </p>
              <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                Devoluciones
              </p>
            </div>

            <div
              className={`p-4 rounded-xl ${
                darkMode ? 'bg-slate-800/50 border border-slate-700' : 'bg-white border border-gray-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-red-500" />
                <p className={`text-xs font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Monto
                </p>
              </div>
              <p className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                ${montoDevolucionesHoy.toLocaleString('es-CO')}
              </p>
              <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                Devuelto hoy
              </p>
            </div>

            <div
              className={`p-4 rounded-xl ${
                darkMode ? 'bg-slate-800/50 border border-slate-700' : 'bg-white border border-gray-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-4 h-4 text-purple-500" />
                <p className={`text-xs font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Items
                </p>
              </div>
              <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {productosDevueltosHoy}
              </p>
              <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                Productos
              </p>
            </div>
          </div>

          {/* Resumen del Mes */}
          <div
            className={`p-4 rounded-xl ${
              darkMode
                ? 'bg-gradient-to-br from-slate-800/70 to-slate-700/70 border border-slate-600'
                : 'bg-gradient-to-br from-white to-gray-50 border border-gray-200'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <p className={`text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Este Mes
              </p>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold ${
                  darkMode
                    ? 'bg-orange-900/50 text-orange-400 border border-orange-700/50'
                    : 'bg-orange-100 text-orange-700 border border-orange-300'
                }`}
              >
                {totalDevolucionesMes} devoluciones
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Total devuelto:
                </span>
                <span className={`text-lg font-bold text-orange-500`}>
                  ${montoDevolucionesMes.toLocaleString('es-CO')}
                </span>
              </div>
              {totalDevolucionesMes > 0 && (
                <div className="flex justify-between items-center pt-2 border-t border-gray-300 dark:border-slate-600">
                  <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                    Promedio por devolución:
                  </span>
                  <span className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    ${Math.round(montoDevolucionesMes / totalDevolucionesMes).toLocaleString('es-CO')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Últimas Devoluciones */}
          {devolucionesHoy.length > 0 && (
            <div className="space-y-2">
              <p className={`text-xs font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Últimas devoluciones
              </p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {devolucionesHoy.slice(0, 3).map((dev) => (
                  <div
                    key={dev.id}
                    className={`p-3 rounded-lg ${darkMode ? 'bg-slate-800/50' : 'bg-white border border-gray-200'}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          {new Date(dev.fecha).toLocaleTimeString('es-CO', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                        <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {dev.items.length} {dev.items.length === 1 ? 'producto' : 'productos'}
                        </p>
                      </div>
                      <span className={`text-sm font-bold text-orange-500`}>
                        ${dev.totalDevolucion.toLocaleString('es-CO')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mensaje cuando no hay devoluciones */}
          {totalDevolucionesHoy === 0 && (
            <div
              className={`p-4 rounded-xl text-center ${
                darkMode
                  ? 'bg-emerald-900/20 border border-emerald-700/30'
                  : 'bg-emerald-50 border border-emerald-200'
              }`}
            >
              <p className={`text-sm font-semibold ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                ✓ Sin devoluciones hoy
              </p>
              <p className={`text-xs mt-1 ${darkMode ? 'text-emerald-300' : 'text-emerald-600'}`}>
                ¡Excelente gestión de ventas!
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
