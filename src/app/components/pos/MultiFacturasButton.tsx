/**
 * 🧾 Botón discreto para gestionar múltiples facturas simultáneas
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, Plus, X, Check } from 'lucide-react';
import { usePOS } from '../../contexts/POSContext';

interface Factura {
  id: string;
  numero: number;
  itemsCount: number;
  total: number;
}

interface MultiFacturasButtonProps {
  currentItemsCount: number;
  currentTotal: number;
  onSwitchFactura: (facturaNumero: number) => void;
}

export function MultiFacturasButton({ 
  currentItemsCount, 
  currentTotal, 
  onSwitchFactura 
}: MultiFacturasButtonProps) {
  const { darkMode } = usePOS();
  const [showMenu, setShowMenu] = useState(false);
  const [facturas, setFacturas] = useState<Factura[]>([
    { id: 'f1', numero: 1, itemsCount: currentItemsCount, total: currentTotal }
  ]);
  const [facturaActiva, setFacturaActiva] = useState(1);

  const agregarFactura = () => {
    if (facturas.length >= 10) return;
    
    const nuevoNumero = Math.max(...facturas.map(f => f.numero)) + 1;
    setFacturas([...facturas, { 
      id: `f${nuevoNumero}`, 
      numero: nuevoNumero, 
      itemsCount: 0, 
      total: 0 
    }]);
    setFacturaActiva(nuevoNumero);
    onSwitchFactura(nuevoNumero);
    setShowMenu(false);
  };

  const cambiarFactura = (numero: number) => {
    setFacturaActiva(numero);
    onSwitchFactura(numero);
    setShowMenu(false);
  };

  const eliminarFactura = (numero: number) => {
    if (facturas.length === 1) return;
    
    const factura = facturas.find(f => f.numero === numero);
    if (factura && (factura.itemsCount > 0 || factura.total > 0)) {
      if (!window.confirm(`¿Eliminar factura #${numero}?\n\nTiene ${factura.itemsCount} productos por $${factura.total.toLocaleString('es-CO')}`)) {
        return;
      }
    }

    const nuevasFacturas = facturas.filter(f => f.numero !== numero);
    setFacturas(nuevasFacturas);
    
    if (facturaActiva === numero) {
      const nuevaActiva = nuevasFacturas[0].numero;
      setFacturaActiva(nuevaActiva);
      onSwitchFactura(nuevaActiva);
    }
  };

  return (
    <div className="relative">
      {/* BOTÓN DISCRETO */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        className={`
          group flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold
          transition-all duration-200 border
          ${darkMode 
            ? 'bg-slate-800/50 border-slate-600 text-gray-400 hover:bg-emerald-500/10 hover:border-emerald-500 hover:text-emerald-400' 
            : 'bg-gray-100/50 border-gray-300 text-gray-600 hover:bg-emerald-50 hover:border-emerald-500 hover:text-emerald-600'
          }
        `}
      >
        <FileText className="w-3.5 h-3.5" />
        <span>Factura #{facturaActiva}</span>
        {facturas.length > 1 && (
          <span className={`
            px-1.5 py-0.5 rounded-full text-[10px] font-bold
            ${darkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-600'}
          `}>
            {facturas.length}
          </span>
        )}
      </button>

      {/* MENÚ DROPDOWN */}
      <AnimatePresence>
        {showMenu && (
          <>
            {/* Overlay para cerrar */}
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setShowMenu(false)}
            />
            
            {/* Menú */}
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className={`
                absolute bottom-full mb-2 right-0 w-72 rounded-2xl shadow-2xl z-50
                border-2 overflow-hidden
                ${darkMode 
                  ? 'bg-slate-900 border-slate-700' 
                  : 'bg-white border-gray-200'
                }
              `}
            >
              {/* Header */}
              <div className={`px-4 py-3 border-b ${
                darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-gray-200 bg-gray-50'
              }`}>
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-bold ${
                    darkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Facturas Abiertas
                  </span>
                  <span className={`text-xs ${
                    darkMode ? 'text-gray-500' : 'text-gray-500'
                  }`}>
                    {facturas.length}/10
                  </span>
                </div>
              </div>

              {/* Lista de Facturas */}
              <div className="max-h-80 overflow-y-auto">
                {facturas.map((factura) => (
                  <div
                    key={factura.id}
                    className={`
                      group flex items-center gap-3 px-4 py-3 cursor-pointer
                      transition-colors border-b
                      ${darkMode ? 'border-slate-800' : 'border-gray-100'}
                      ${factura.numero === facturaActiva
                        ? darkMode
                          ? 'bg-emerald-500/10 hover:bg-emerald-500/15'
                          : 'bg-emerald-50 hover:bg-emerald-100'
                        : darkMode
                        ? 'hover:bg-slate-800/50'
                        : 'hover:bg-gray-50'
                      }
                    `}
                    onClick={() => cambiarFactura(factura.numero)}
                  >
                    {/* Icono y Check */}
                    <div className={`
                      w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0
                      ${factura.numero === facturaActiva
                        ? 'bg-gradient-to-br from-emerald-500 to-teal-500'
                        : darkMode
                        ? 'bg-slate-700'
                        : 'bg-gray-200'
                      }
                    `}>
                      {factura.numero === facturaActiva ? (
                        <Check className="w-4 h-4 text-white" />
                      ) : (
                        <FileText className="w-4 h-4 text-gray-500" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${
                          factura.numero === facturaActiva
                            ? 'text-emerald-500'
                            : darkMode
                            ? 'text-white'
                            : 'text-gray-900'
                        }`}>
                          Factura #{factura.numero}
                        </span>
                        {factura.itemsCount > 0 && (
                          <span className={`
                            px-1.5 py-0.5 rounded-full text-[10px] font-bold
                            ${factura.numero === facturaActiva
                              ? 'bg-emerald-500 text-white'
                              : darkMode
                              ? 'bg-slate-600 text-gray-300'
                              : 'bg-gray-300 text-gray-700'
                            }
                          `}>
                            {factura.itemsCount}
                          </span>
                        )}
                      </div>
                      {factura.total > 0 && (
                        <div className={`text-xs font-semibold ${
                          factura.numero === facturaActiva
                            ? 'text-emerald-600'
                            : darkMode
                            ? 'text-gray-500'
                            : 'text-gray-600'
                        }`}>
                          ${factura.total.toLocaleString('es-CO')}
                        </div>
                      )}
                    </div>

                    {/* Botón Eliminar */}
                    {facturas.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          eliminarFactura(factura.numero);
                        }}
                        className={`
                          w-6 h-6 rounded-full flex items-center justify-center
                          opacity-0 group-hover:opacity-100 transition-opacity
                          ${darkMode
                            ? 'hover:bg-red-500/20 text-red-400'
                            : 'hover:bg-red-100 text-red-500'
                          }
                        `}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Botón Agregar */}
              {facturas.length < 10 && (
                <button
                  onClick={agregarFactura}
                  className={`
                    w-full px-4 py-3 flex items-center justify-center gap-2
                    text-sm font-semibold transition-colors border-t
                    ${darkMode 
                      ? 'border-slate-700 bg-slate-800/50 text-emerald-400 hover:bg-emerald-500/10' 
                      : 'border-gray-200 bg-gray-50 text-emerald-600 hover:bg-emerald-50'
                    }
                  `}
                >
                  <Plus className="w-4 h-4" />
                  Nueva Factura
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
