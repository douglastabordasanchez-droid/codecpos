/**
 * 🧾 Botón discreto para gestionar múltiples facturas - Versión Simple Autónoma
 * Guarda y restaura carritos independientes sin modificar POSPageNew
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, Plus, X, Check, ShoppingCart } from 'lucide-react';
import { usePOS } from '../../contexts/POSContext';
import { toast } from 'sonner';

interface FacturaGuardada {
  id: string;
  numero: number;
  carrito: any[];
  searchTerm: string;
  timestamp: number;
}

interface Props {
  carritoActual: any[];
  searchTermActual: string;
  onRestaurarFactura: (carrito: any[], searchTerm: string) => void;
  onLimpiarCarrito: () => void;
}

const STORAGE_KEY = 'codecpos_facturas_multiples';

export function MultiFacturasButtonSimple({ 
  carritoActual, 
  searchTermActual,
  onRestaurarFactura,
  onLimpiarCarrito
}: Props) {
  const { darkMode } = usePOS();
  const [showMenu, setShowMenu] = useState(false);
  const [facturas, setFacturas] = useState<FacturaGuardada[]>([]);
  const [facturaActiva, setFacturaActiva] = useState(1);

  // Cargar facturas guardadas
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        setFacturas(data.facturas || []);
        setFacturaActiva(data.activa || 1);
      } catch (e) {
        inicializar();
      }
    } else {
      inicializar();
    }
  }, []);

  // Guardar facturas cuando cambian
  useEffect(() => {
    if (facturas.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        facturas,
        activa: facturaActiva
      }));
    }
  }, [facturas, facturaActiva]);

  const inicializar = () => {
    setFacturas([{
      id: 'f1',
      numero: 1,
      carrito: [],
      searchTerm: '',
      timestamp: Date.now()
    }]);
    setFacturaActiva(1);
  };

  // Guardar factura actual antes de cambiar
  const guardarFacturaActual = () => {
    setFacturas(prev => prev.map(f => 
      f.numero === facturaActiva
        ? { ...f, carrito: carritoActual, searchTerm: searchTermActual, timestamp: Date.now() }
        : f
    ));
  };

  const agregarFactura = () => {
    if (facturas.length >= 10) {
      toast.error('Máximo 10 facturas simultáneas');
      return;
    }

    // Guardar factura actual
    guardarFacturaActual();

    const nuevoNumero = Math.max(...facturas.map(f => f.numero)) + 1;
    const nuevaFactura: FacturaGuardada = {
      id: `f${nuevoNumero}`,
      numero: nuevoNumero,
      carrito: [],
      searchTerm: '',
      timestamp: Date.now()
    };

    setFacturas(prev => [...prev, nuevaFactura]);
    setFacturaActiva(nuevoNumero);
    
    // Limpiar carrito para nueva factura
    onLimpiarCarrito();
    setShowMenu(false);

    toast.success(`Factura #${nuevoNumero} creada`, {
      description: 'Ahora puedes atender a otro cliente'
    });
  };

  const cambiarFactura = (numero: number) => {
    if (numero === facturaActiva) {
      setShowMenu(false);
      return;
    }

    // Guardar factura actual
    guardarFacturaActual();

    // Restaurar factura seleccionada
    const factura = facturas.find(f => f.numero === numero);
    if (factura) {
      setFacturaActiva(numero);
      onRestaurarFactura(factura.carrito, factura.searchTerm);
      setShowMenu(false);

      toast.info(`Cambiado a Factura #${numero}`, {
        description: factura.carrito.length > 0 
          ? `${factura.carrito.length} productos en el carrito`
          : 'Carrito vacío'
      });
    }
  };

  const eliminarFactura = (numero: number) => {
    if (facturas.length === 1) {
      toast.error('No puedes eliminar la última factura');
      return;
    }

    const factura = facturas.find(f => f.numero === numero);
    if (!factura) return;

    const itemsCount = factura.carrito.length;
    const total = factura.carrito.reduce((sum: number, item: any) => {
      return sum + (item.producto.precio * item.cantidad);
    }, 0);

    // Confirmar si tiene productos
    if (itemsCount > 0) {
      const confirmar = window.confirm(
        `¿Eliminar Factura #${numero}?\n\n` +
        `Tiene ${itemsCount} productos por $${total.toLocaleString('es-CO')}\n\n` +
        `Esta acción no se puede deshacer.`
      );
      if (!confirmar) return;
    }

    const nuevasFacturas = facturas.filter(f => f.numero !== numero);
    setFacturas(nuevasFacturas);

    // Si eliminamos la activa, cambiar a otra
    if (facturaActiva === numero) {
      const nuevaActiva = nuevasFacturas[0];
      setFacturaActiva(nuevaActiva.numero);
      onRestaurarFactura(nuevaActiva.carrito, nuevaActiva.searchTerm);

      toast.success(`Factura #${numero} eliminada`, {
        description: `Cambiado a Factura #${nuevaActiva.numero}`
      });
    } else {
      toast.success(`Factura #${numero} eliminada`);
    }
  };

  const calcularTotal = (carrito: any[]) => {
    return carrito.reduce((sum, item) => {
      if (item.producto.pesable && item.peso) {
        return sum + (item.producto.precio * item.peso);
      }
      return sum + (item.producto.precio * item.cantidad);
    }, 0);
  };

  return (
    <div className="relative">
      {/* BOTÓN DISCRETO */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        className={`
          group flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold
          transition-all duration-200 border shadow-sm
          ${darkMode 
            ? 'bg-slate-800/80 border-slate-600 text-gray-300 hover:bg-emerald-500/10 hover:border-emerald-500 hover:text-emerald-400' 
            : 'bg-white border-gray-300 text-gray-700 hover:bg-emerald-50 hover:border-emerald-500 hover:text-emerald-600'
          }
        `}
      >
        <ShoppingCart className="w-3.5 h-3.5" />
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
            {/* Overlay */}
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
                absolute bottom-full mb-2 right-0 w-72 rounded-xl shadow-2xl z-50
                border overflow-hidden
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
                  <div>
                    <div className={`text-sm font-bold ${
                      darkMode ? 'text-white' : 'text-gray-900'
                    }`}>
                      Facturas Abiertas
                    </div>
                    <div className={`text-xs ${
                      darkMode ? 'text-gray-500' : 'text-gray-500'
                    }`}>
                      Gestiona múltiples clientes
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                    darkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-200 text-gray-700'
                  }`}>
                    {facturas.length}/10
                  </span>
                </div>
              </div>

              {/* Lista */}
              <div className="max-h-80 overflow-y-auto">
                {facturas.map((factura) => {
                  const isActive = factura.numero === facturaActiva;
                  const itemsCount = factura.carrito.length;
                  const total = calcularTotal(factura.carrito);

                  return (
                    <div
                      key={factura.id}
                      className={`
                        group flex items-center gap-3 px-4 py-3 cursor-pointer
                        transition-colors border-b
                        ${darkMode ? 'border-slate-800' : 'border-gray-100'}
                        ${isActive
                          ? darkMode
                            ? 'bg-emerald-500/10'
                            : 'bg-emerald-50'
                          : darkMode
                          ? 'hover:bg-slate-800/50'
                          : 'hover:bg-gray-50'
                        }
                      `}
                      onClick={() => cambiarFactura(factura.numero)}
                    >
                      {/* Icono */}
                      <div className={`
                        w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0
                        ${isActive
                          ? 'bg-gradient-to-br from-emerald-500 to-teal-500'
                          : darkMode
                          ? 'bg-slate-700'
                          : 'bg-gray-200'
                        }
                      `}>
                        {isActive ? (
                          <Check className="w-4 h-4 text-white" />
                        ) : (
                          <FileText className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold ${
                            isActive ? 'text-emerald-500' : darkMode ? 'text-white' : 'text-gray-900'
                          }`}>
                            Factura #{factura.numero}
                          </span>
                          {itemsCount > 0 && (
                            <span className={`
                              px-1.5 py-0.5 rounded-full text-[10px] font-bold
                              ${isActive
                                ? 'bg-emerald-500 text-white'
                                : darkMode
                                ? 'bg-slate-600 text-gray-300'
                                : 'bg-gray-300 text-gray-700'
                              }
                            `}>
                              {itemsCount}
                            </span>
                          )}
                        </div>
                        {total > 0 && (
                          <div className={`text-xs font-semibold ${
                            isActive ? 'text-emerald-600' : darkMode ? 'text-gray-500' : 'text-gray-600'
                          }`}>
                            ${total.toLocaleString('es-CO')}
                          </div>
                        )}
                      </div>

                      {/* Eliminar */}
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
                  );
                })}
              </div>

              {/* Agregar */}
              {facturas.length < 10 && (
                <button
                  onClick={agregarFactura}
                  className={`
                    w-full px-4 py-3 flex items-center justify-center gap-2
                    text-sm font-semibold transition-colors border-t
                    ${darkMode 
                      ? 'border-slate-700 bg-slate-800/30 text-emerald-400 hover:bg-emerald-500/10' 
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
