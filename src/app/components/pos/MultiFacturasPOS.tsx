/**
 * 🧾 CODEC POS v2.0 - Sistema de Múltiples Facturas Simultáneas
 * Permite atender varios clientes al mismo tiempo con facturas independientes
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, X, ShoppingCart, Users, DollarSign } from 'lucide-react';
import { usePOS } from '../../contexts/POSContext';
import { Button } from '../ui/button';
import POSPageNew from './POSPageNew';
import { toast } from 'sonner';

interface Factura {
  id: string;
  numero: number;
  nombreCliente?: string;
  createdAt: number;
  totalItems?: number;
  total?: number;
}

export default function MultiFacturasPOS() {
  const { darkMode } = usePOS();
  const [facturas, setFacturas] = useState<Factura[]>([
    {
      id: 'factura-1',
      numero: 1,
      createdAt: Date.now(),
    }
  ]);
  const [facturaActivaId, setFacturaActivaId] = useState<string>('factura-1');
  const [contadorFacturas, setContadorFacturas] = useState(1);

  // 🆕 AGREGAR NUEVA FACTURA
  const agregarFactura = () => {
    if (facturas.length >= 10) {
      // Máximo 10 facturas abiertas
      return;
    }

    const nuevoNumero = contadorFacturas + 1;
    const nuevaFactura: Factura = {
      id: `factura-${nuevoNumero}`,
      numero: nuevoNumero,
      createdAt: Date.now(),
    };

    setFacturas(prev => [...prev, nuevaFactura]);
    setFacturaActivaId(nuevaFactura.id);
    setContadorFacturas(nuevoNumero);
  };

  // 🗑️ CERRAR FACTURA
  const cerrarFactura = (id: string) => {
    if (facturas.length === 1) {
      // No permitir cerrar la última factura
      return;
    }

    const factura = facturas.find(f => f.id === id);
    
    // 🔔 Confirmar si tiene items
    if (factura && (factura.totalItems || 0) > 0) {
      const confirmar = window.confirm(
        `¿Cerrar factura #${factura.numero}?\n\n` +
        `Tiene ${factura.totalItems} productos por valor de $${(factura.total || 0).toLocaleString('es-CO')}.\n\n` +
        `Esta acción eliminará todos los productos del carrito.`
      );
      
      if (!confirmar) return;
    }

    const index = facturas.findIndex(f => f.id === id);
    const nuevasFacturas = facturas.filter(f => f.id !== id);
    setFacturas(nuevasFacturas);

    // Si cerramos la factura activa, activar otra
    if (id === facturaActivaId) {
      const nuevaActiva = nuevasFacturas[Math.max(0, index - 1)];
      setFacturaActivaId(nuevaActiva.id);
    }
  };

  // 📊 ACTUALIZAR INFO DE FACTURA (desde el hijo)
  const actualizarInfoFactura = (id: string, info: Partial<Factura>) => {
    setFacturas(prev => prev.map(f => 
      f.id === id ? { ...f, ...info } : f
    ));
  };

  return (
    <div className="h-screen flex flex-col">
      {/* 🔝 BARRA DE TABS - FACTURAS */}
      <div className={`flex-shrink-0 border-b ${
        darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'
      }`}>
        <div className="flex items-center gap-1 p-2 overflow-x-auto">
          {/* TABS DE FACTURAS */}
          <AnimatePresence mode="popLayout">
            {facturas.map((factura, index) => {
              const isActive = factura.id === facturaActivaId;
              const tieneItems = (factura.totalItems || 0) > 0;
              
              return (
                <motion.div
                  key={factura.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9, x: -20 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.9, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="flex-shrink-0"
                >
                  <button
                    onClick={() => setFacturaActivaId(factura.id)}
                    className={`
                      group relative flex items-center gap-2 px-4 py-2.5 rounded-t-xl
                      transition-all duration-200 min-w-[180px] max-w-[240px]
                      ${isActive
                        ? darkMode
                          ? 'bg-slate-800 text-white shadow-lg border-b-2 border-emerald-500'
                          : 'bg-gray-50 text-gray-900 shadow-lg border-b-2 border-emerald-500'
                        : darkMode
                        ? 'bg-slate-800/50 text-gray-400 hover:bg-slate-800/80 hover:text-white'
                        : 'bg-gray-100/50 text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }
                    `}
                  >
                    {/* ICONO */}
                    <div className={`
                      w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                      ${isActive
                        ? 'bg-gradient-to-br from-emerald-500 to-teal-500'
                        : darkMode
                        ? 'bg-slate-700'
                        : 'bg-gray-200'
                      }
                    `}>
                      <ShoppingCart className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                    </div>

                    {/* INFO */}
                    <div className="flex-1 text-left min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${isActive ? 'text-emerald-500' : ''}`}>
                          #{factura.numero}
                        </span>
                        {tieneItems && (
                          <span className={`
                            px-1.5 py-0.5 rounded-full text-[10px] font-bold
                            ${isActive
                              ? 'bg-emerald-500 text-white'
                              : darkMode
                              ? 'bg-slate-600 text-gray-300'
                              : 'bg-gray-300 text-gray-700'
                            }
                          `}>
                            {factura.totalItems}
                          </span>
                        )}
                      </div>
                      <div className="text-xs truncate">
                        {factura.nombreCliente || 'Cliente'}
                      </div>
                      {factura.total && factura.total > 0 && (
                        <div className={`text-xs font-semibold ${
                          isActive ? 'text-emerald-500' : 'text-gray-500'
                        }`}>
                          ${factura.total.toLocaleString('es-CO')}
                        </div>
                      )}
                    </div>

                    {/* BOTÓN CERRAR */}
                    {facturas.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          cerrarFactura(factura.id);
                        }}
                        className={`
                          w-6 h-6 rounded-full flex items-center justify-center
                          opacity-0 group-hover:opacity-100 transition-opacity
                          ${darkMode
                            ? 'hover:bg-red-500/20 text-red-400 hover:text-red-300'
                            : 'hover:bg-red-100 text-red-500 hover:text-red-600'
                          }
                        `}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* BOTÓN AGREGAR FACTURA */}
          {facturas.length < 10 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex-shrink-0"
            >
              <Button
                onClick={agregarFactura}
                size="sm"
                variant="outline"
                className={`
                  rounded-xl h-[48px] px-3
                  ${darkMode
                    ? 'border-slate-600 hover:bg-emerald-500/10 hover:border-emerald-500 hover:text-emerald-400'
                    : 'border-gray-300 hover:bg-emerald-50 hover:border-emerald-500 hover:text-emerald-600'
                  }
                `}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </motion.div>
          )}

          {/* INDICADOR DE CAPACIDAD */}
          <div className={`ml-auto flex-shrink-0 px-3 py-1 rounded-xl text-xs font-semibold ${
            darkMode ? 'bg-slate-800 text-gray-400' : 'bg-gray-100 text-gray-600'
          }`}>
            {facturas.length}/10 facturas
          </div>
        </div>
      </div>

      {/* 📄 CONTENIDO DE LA FACTURA ACTIVA */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {facturas.map(factura => (
            factura.id === facturaActivaId && (
              <motion.div
                key={factura.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                <POSPageNew
                  facturaId={factura.id}
                  numeroFactura={factura.numero}
                  onUpdateInfo={(info) => actualizarInfoFactura(factura.id, info)}
                />
              </motion.div>
            )
          ))}
        </AnimatePresence>
      </div>

      {/* 💡 TOOLTIP DE AYUDA (aparece solo al inicio) */}
      {facturas.length === 1 && facturas[0].totalItems === 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
          className={`
            absolute top-20 left-1/2 transform -translate-x-1/2
            px-4 py-2 rounded-xl shadow-lg pointer-events-none z-50
            ${darkMode ? 'bg-emerald-500 text-white' : 'bg-emerald-500 text-white'}
          `}
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            <span className="text-sm font-semibold">
              💡 Tip: Usa el botón + para atender varios clientes simultáneamente
            </span>
          </div>
        </motion.div>
      )}
    </div>
  );
}