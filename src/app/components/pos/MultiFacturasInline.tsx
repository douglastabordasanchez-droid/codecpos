/**
 * 🧾 Botones de Facturas en Línea Horizontal
 * Diseño: [Factura #1] [Factura #2] [+]
 * Los números son POSICIONALES (1, 2, 3...) y se renumeran automáticamente
 */

import { useState, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, X, ShoppingCart, Pencil } from 'lucide-react';
import { usePOS } from '../../contexts/POSContext';
import { toast } from 'sonner';

interface FacturaGuardada {
  id: string;
  carrito: any[];
  searchTerm: string;
  timestamp: number;
  alias?: string;
}

interface Props {
  carritoActual: any[];
  searchTermActual: string;
  onRestaurarFactura: (carrito: any[], searchTerm: string) => void;
  onLimpiarCarrito: () => void;
  carritosMesas?: CarritoMesaResumen[];
  onAbrirCarritoMesa?: (mesaId: string) => void;
}

export interface CarritoMesaResumen {
  id: string;
  nombre: string;
  itemsCount: number;
  total: number;
  listo: boolean;
}

const STORAGE_KEY = 'codecpos_facturas_inline';

// 🚀 FIX FLUIDEZ: envuelto en memo — con las props ahora estables
// (POSPageNew.tsx pasa callbacks vía useCallback), esto evita re-renderizar
// todo este bloque (con sus animaciones framer-motion) cuando POSPageNew se
// re-renderiza por razones ajenas al carrito/búsqueda de facturas.
export const MultiFacturasInline = memo(function MultiFacturasInline({
  carritoActual,
  searchTermActual,
  onRestaurarFactura,
  onLimpiarCarrito,
  carritosMesas = [],
  onAbrirCarritoMesa,
}: Props) {
  const { darkMode } = usePOS();
  const [facturas, setFacturas] = useState<FacturaGuardada[]>([]);
  const [indiceActivo, setIndiceActivo] = useState(0); // 🆕 Usamos índice (0-based)
  const [indiceEditando, setIndiceEditando] = useState<number | null>(null);
  const [aliasEditando, setAliasEditando] = useState('');

  // Cargar facturas guardadas
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        setFacturas(data.facturas || []);
        setIndiceActivo(data.indiceActivo || 0);
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
        indiceActivo
      }));
    }
  }, [facturas, indiceActivo]);

  const inicializar = () => {
    setFacturas([{
      id: `f${Date.now()}`,
      carrito: [],
      searchTerm: '',
      timestamp: Date.now()
    }]);
    setIndiceActivo(0);
  };

  // Guardar factura actual antes de cambiar
  const guardarFacturaActual = () => {
    setFacturas(prev => prev.map((f, idx) => 
      idx === indiceActivo
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

    const nuevaFactura: FacturaGuardada = {
      id: `f${Date.now()}`,
      carrito: [],
      searchTerm: '',
      timestamp: Date.now()
    };

    setFacturas(prev => [...prev, nuevaFactura]);
    setIndiceActivo(facturas.length); // El nuevo índice es el último
    
    // Limpiar carrito para nueva factura
    onLimpiarCarrito();

    const numeroMostrado = facturas.length + 1;
    toast.success(`Factura #${numeroMostrado} creada`);
  };

  const cambiarFactura = (indice: number) => {
    if (indice === indiceActivo) return;

    // Guardar factura actual
    guardarFacturaActual();

    // Restaurar factura seleccionada
    const factura = facturas[indice];
    if (factura) {
      setIndiceActivo(indice);
      onRestaurarFactura(factura.carrito, factura.searchTerm);

      const itemsCount = factura.carrito.reduce((sum: number, item: any) => sum + item.cantidad, 0);
      const numeroMostrado = indice + 1;
      toast.info(`Factura #${numeroMostrado}`, {
        description: itemsCount > 0 ? `${itemsCount} productos` : 'Carrito vacío'
      });
    }
  };

  const eliminarFactura = (indice: number, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (facturas.length === 1) {
      toast.error('No puedes eliminar la última factura');
      return;
    }

    const factura = facturas[indice];
    if (!factura) return;

    const itemsCount = factura.carrito.reduce((sum: number, item: any) => sum + item.cantidad, 0);
    const total = factura.carrito.reduce((sum: number, item: any) => {
      return sum + (item.producto.precio * item.cantidad);
    }, 0);

    const numeroMostrado = indice + 1;

    // Confirmar si tiene productos
    if (itemsCount > 0) {
      const confirmar = window.confirm(
        `¿Eliminar Factura #${numeroMostrado}?\n\n` +
        `${itemsCount} productos por $${total.toLocaleString('es-CO')}`
      );
      if (!confirmar) return;
    }

    // Eliminar factura
    const nuevasFacturas = facturas.filter((_, idx) => idx !== indice);
    setFacturas(nuevasFacturas);

    // Ajustar índice activo después de eliminar
    if (indiceActivo === indice) {
      // Si eliminamos la activa, ir a la primera
      const nuevaActiva = nuevasFacturas[0];
      setIndiceActivo(0);
      onRestaurarFactura(nuevaActiva.carrito, nuevaActiva.searchTerm);
      toast.success(`Factura #${numeroMostrado} eliminada - Cambiando a Factura #1`);
    } else if (indiceActivo > indice) {
      // Si eliminamos una anterior, ajustar el índice
      setIndiceActivo(indiceActivo - 1);
      toast.success(`Factura #${numeroMostrado} eliminada`);
    } else {
      toast.success(`Factura #${numeroMostrado} eliminada`);
    }
  };

  const getItemsCount = (carrito: any[]) => {
    return carrito.reduce((sum, item) => sum + item.cantidad, 0);
  };

  const comenzarRenombrado = (indice: number, event: React.SyntheticEvent) => {
    event?.stopPropagation();
    const actual = facturas[indice];
    if (!actual) return;
    setIndiceEditando(indice);
    setAliasEditando(actual.alias || `#${indice + 1}`);
  };

  const guardarAlias = (indice: number) => {
    const alias = aliasEditando.trim();
    setFacturas((prev) => prev.map((factura, i) => i === indice ? { ...factura, alias: alias || undefined, timestamp: Date.now() } : factura));
    setIndiceEditando(null);
  };

  // 🆕 Función para eliminar factura activa (después de cobrar)
  const eliminarFacturaActiva = () => {
    if (facturas.length === 1) {
      // Si es la única, solo limpiarla
      onLimpiarCarrito();
      setFacturas([{
        id: `f${Date.now()}`,
        carrito: [],
        searchTerm: '',
        timestamp: Date.now()
      }]);
      setIndiceActivo(0);
      toast.success('Factura cobrada y limpiada');
      return;
    }

    // Eliminar factura activa
    const nuevasFacturas = facturas.filter((_, idx) => idx !== indiceActivo);
    setFacturas(nuevasFacturas);

    // Ajustar índice: si era la última, ir a la anterior; sino quedarse en el mismo índice
    const nuevoIndice = indiceActivo >= nuevasFacturas.length ? nuevasFacturas.length - 1 : indiceActivo;
    setIndiceActivo(nuevoIndice);
    
    const nuevaActiva = nuevasFacturas[nuevoIndice];
    onRestaurarFactura(nuevaActiva.carrito, nuevaActiva.searchTerm);

    const numeroMostrado = nuevoIndice + 1;
    toast.success(`Factura cobrada - Ahora en Factura #${numeroMostrado}`);
  };

  // Exponer función vía callback cuando se monta
  useEffect(() => {
    // Guardamos la referencia a la función para que POSPageNew pueda llamarla
    (window as any).__eliminarFacturaActual = eliminarFacturaActiva;
    
    return () => {
      delete (window as any).__eliminarFacturaActual;
    };
  }, [facturas, indiceActivo, carritoActual, searchTermActual]);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {carritosMesas.map((mesa) => (
        <motion.button
          key={`mesa-${mesa.id}`}
          layout
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={() => onAbrirCarritoMesa?.(mesa.id)}
          title={mesa.listo ? `${mesa.nombre}: pedido listo para facturar` : `${mesa.nombre}: abrir pedido`}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold transition-all ${
            mesa.listo
              ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/30 animate-pulse'
              : darkMode
                ? 'bg-amber-500/15 border-amber-500/60 text-amber-300 hover:bg-amber-500/25'
                : 'bg-amber-50 border-amber-400 text-amber-700 hover:bg-amber-100'
          }`}
        >
          <ShoppingCart className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="max-w-28 truncate">{mesa.nombre}</span>
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${mesa.listo ? 'bg-white/25' : darkMode ? 'bg-slate-900/40' : 'bg-amber-200/70'}`}>
            {mesa.itemsCount}
          </span>
          {mesa.listo && <span className="text-[10px] uppercase tracking-wide">Listo</span>}
        </motion.button>
      ))}
      <AnimatePresence mode="popLayout">
        {facturas.map((factura, indice) => {
          const isActive = indice === indiceActivo;
          const itemsCount = getItemsCount(factura.carrito);
          const numeroMostrado = indice + 1; // 🆕 Número posicional (1, 2, 3...)

          return (
            <motion.button
              key={factura.id}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
              onClick={() => cambiarFactura(indice)}
              onDoubleClick={(event) => comenzarRenombrado(indice, event)}
              title="Doble clic para renombrar esta venta"
              className={`
                group relative flex items-center gap-2 px-3 py-1.5 rounded-full
                transition-all duration-200 border text-xs font-semibold
                ${isActive
                  ? darkMode
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-lg shadow-emerald-500/20'
                    : 'bg-emerald-50 border-emerald-500 text-emerald-600 shadow-lg shadow-emerald-500/20'
                  : darkMode
                  ? 'bg-slate-800/80 border-slate-600 text-gray-400 hover:border-emerald-500/50 hover:text-emerald-400'
                  : 'bg-white border-gray-300 text-gray-600 hover:border-emerald-500/50 hover:text-emerald-600'
                }
              `}
            >
              <ShoppingCart className="w-3.5 h-3.5 flex-shrink-0" />
              {indiceEditando === indice ? (
                <input
                  type="text"
                  value={aliasEditando}
                  autoFocus
                  maxLength={40}
                  onChange={(event) => setAliasEditando(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                  onBlur={() => guardarAlias(indice)}
                  className="w-24 min-w-0 bg-transparent border-b border-current outline-none text-xs font-semibold"
                  aria-label="Nombre de la venta"
                />
              ) : (
                <>
                  <span className="max-w-28 truncate">{factura.alias || `#${numeroMostrado}`}</span>
                  <span role="button" tabIndex={0} aria-label="Renombrar venta" onClick={(event) => comenzarRenombrado(indice, event)} onTouchEnd={(event) => comenzarRenombrado(indice, event)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') comenzarRenombrado(indice, event); }} className="p-1 -m-1 text-current opacity-70 hover:opacity-100"><Pencil className="w-3 h-3" /></span>
                </>
              )}
              {itemsCount > 0 && (
                <span className={`
                  px-1.5 py-0.5 rounded-full text-[10px] font-bold
                  ${isActive
                    ? 'bg-emerald-500 text-white'
                    : darkMode
                    ? 'bg-slate-700 text-gray-300'
                    : 'bg-gray-200 text-gray-700'
                  }
                `}>
                  {itemsCount}
                </span>
              )}
              
              {/* Botón Eliminar */}
              {facturas.length > 1 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`
                    w-4 h-4 rounded-full flex items-center justify-center
                    opacity-0 group-hover:opacity-100 transition-opacity
                    ${darkMode ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-500'}
                  `}
                  onClick={(e) => eliminarFactura(indice, e)}
                >
                  <X className="w-3 h-3" />
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </AnimatePresence>

      {/* Botón Agregar */}
      {facturas.length < 10 && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={agregarFactura}
          className={`
            flex items-center justify-center w-7 h-7 rounded-full
            transition-all duration-200 border
            ${darkMode
              ? 'bg-slate-800/80 border-slate-600 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500'
              : 'bg-white border-gray-300 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-500'
            }
          `}
          title="Nueva factura"
        >
          <Plus className="w-4 h-4" />
        </motion.button>
      )}
    </div>
  );
});
