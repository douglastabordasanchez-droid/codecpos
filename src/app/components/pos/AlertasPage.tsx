import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, TrendingDown, Calendar, Tag, ShoppingCart, X, Copy, Check } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { usePOS } from '../../contexts/POSContext';
import { toast } from 'sonner';
import { electronStore } from '../../lib/electronStore';
import { onStockBajo, onProductoVencido } from '../../lib/integracionesService';

interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  precio: number;
  stock: number;
  minStock: number;
  categoria: string;
  fechaVencimiento?: string;
}

export default function AlertasPage() {
  const { darkMode } = usePOS();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordenModal, setOrdenModal] = useState<{ producto: Producto; cantidad: number } | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    loadProductos();

    // Escuchar eventos de actualización de inventario en tiempo real
    const handleInventarioActualizado = () => {
      loadProductos();
    };

    const handleAlertaStockBajo = (producto: any) => {
      toast.warning(`Stock bajo: ${producto.nombre} (${producto.stock} unidades)`, {
        duration: 5000,
      });
      loadProductos();
    };

    electronStore.onInventarioActualizado(handleInventarioActualizado);
    electronStore.onAlertaStockBajo(handleAlertaStockBajo);

    return () => {
      electronStore.offInventarioActualizado(handleInventarioActualizado);
      electronStore.offAlertaStockBajo(handleAlertaStockBajo);
    };
  }, []);

  const loadProductos = () => {
    try {
      setLoading(true);
      
      // Cargar productos reales desde localStorage
      const productosLocal = localStorage.getItem('pos-productos');
      if (productosLocal) {
        const parsed = JSON.parse(productosLocal);
        setProductos(parsed);

        // 🔔 Notificar a integraciones los productos con stock crítico (solo 1 vez por sesión)
        const yaNotificadosKey = 'codecpos_stock_notificado_' + new Date().toDateString();
        if (!sessionStorage.getItem(yaNotificadosKey)) {
          const criticos = parsed.filter((p: Producto) => p.stock <= (p.minStock || 5) && p.stock <= 3);
          criticos.slice(0, 3).forEach((p: Producto) => {
            onStockBajo({ nombre: p.nombre, stock: p.stock, minimo: p.minStock || 5 }).catch(() => {});
          });
          const vencidos = parsed.filter((p: Producto) => {
            const dias = p.fechaVencimiento ? Math.ceil((new Date(p.fechaVencimiento).getTime() - Date.now()) / 86400000) : null;
            return dias !== null && dias <= 7;
          });
          vencidos.slice(0, 3).forEach((p: Producto) => {
            const dias = Math.ceil((new Date(p.fechaVencimiento!).getTime() - Date.now()) / 86400000);
            onProductoVencido({ producto: p.nombre, diasParaVencer: dias, fechaVencimiento: p.fechaVencimiento }).catch(() => {});
          });
          if (criticos.length > 0 || vencidos.length > 0) sessionStorage.setItem(yaNotificadosKey, '1');
        }
      } else {
        setProductos([]);
      }
    } catch (error) {
      console.error('Error cargando productos para alertas:', error);
      toast.error('Error al cargar alertas');
    } finally {
      setLoading(false);
    }
  };

  const diasHastaVencimiento = (fecha?: string) => {
    if (!fecha) return null;
    const hoy = new Date();
    const vencimiento = new Date(fecha);
    const diff = Math.ceil((vencimiento.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const productosStockBajo = productos.filter(p => p.stock <= p.minStock);
  const productosPorVencer = productos.filter(p => {
    const dias = diasHastaVencimiento(p.fechaVencimiento);
    return dias !== null && dias <= 7 && dias > 0;
  });
  const productosVencidos = productos.filter(p => {
    const dias = diasHastaVencimiento(p.fechaVencimiento);
    return dias !== null && dias <= 0;
  });

  const aplicarOfertaRelampago = (producto: Producto) => {
    const descuento = 30;
    const precioOferta = producto.precio * (1 - descuento / 100);
    // Actualizar precio en localStorage
    const productosLocal = localStorage.getItem('pos-productos');
    if (productosLocal) {
      const parsed = JSON.parse(productosLocal);
      const actualizado = parsed.map((p: any) =>
        p.id === producto.id ? { ...p, precio: Math.round(precioOferta), enOferta: true, descuento } : p
      );
      localStorage.setItem('pos-productos', JSON.stringify(actualizado));
      loadProductos();
    }
    toast.success(`¡Oferta relámpago aplicada!`, {
      description: `${producto.nombre}: $${producto.precio.toLocaleString()} → $${Math.round(precioOferta).toLocaleString()} (${descuento}% OFF)`,
    });
  };

  const generarOrdenCompra = async (producto: Producto, cantidad: number) => {
    const fecha = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
    const ordenTexto = `ORDEN DE COMPRA — CODEC POS\n${'─'.repeat(40)}\nFecha: ${fecha}\nProducto: ${producto.nombre}\nCódigo: ${producto.codigo}\nCategoría: ${producto.categoria}\nCantidad solicitada: ${cantidad} unidades\nStock actual: ${producto.stock}\nStock mínimo: ${producto.minStock}\n${'─'.repeat(40)}\nGenerada por CODEC POS v2.0`;

    // Guardar orden en localStorage como pendiente
    const ordenes = JSON.parse(localStorage.getItem('pos-ordenes-compra') || '[]');
    ordenes.push({
      id: `OC-${Date.now()}`,
      fecha: new Date().toISOString(),
      producto: producto.nombre,
      productoId: producto.id,
      cantidad,
      estado: 'pendiente',
    });
    localStorage.setItem('pos-ordenes-compra', JSON.stringify(ordenes));

    try {
      await navigator.clipboard.writeText(ordenTexto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
      toast.success('Orden de compra generada y copiada', {
        description: `${cantidad} unidades de ${producto.nombre} — lista para enviar a proveedor`,
      });
    } catch {
      toast.success('Orden de compra registrada como pendiente', {
        description: `${cantidad} unidades de ${producto.nombre}`,
      });
    }
    setOrdenModal(null);
  };

  return (
    <div className={`h-screen overflow-y-auto scrollbar-thin ${darkMode ? 'scrollbar-thumb-emerald-500 scrollbar-track-slate-800' : 'scrollbar-thumb-emerald-400 scrollbar-track-gray-200'}`}>
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-14 h-14 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg animate-pulse">
            <AlertTriangle className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Alertas Críticas
            </h1>
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin inline-block" />
                  Analizando inventario...
                </span>
              ) : (
                <>
                  {productosStockBajo.length + productosPorVencer.length + productosVencidos.length} alertas activas
                  {productosVencidos.length > 0 && (
                    <span className="ml-2 text-red-500 font-bold">
                      ({productosVencidos.length} vencidos)
                    </span>
                  )}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Stock Bajo */}
          <Card className={`backdrop-blur-xl border-2 border-red-500/50 ${
            darkMode ? 'bg-red-500/10' : 'bg-red-50'
          } rounded-3xl`}>
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <TrendingDown className="w-6 h-6 text-red-500" />
                <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Stock Bajo ({productosStockBajo.length})
                </h2>
              </div>
              
              {productosStockBajo.length === 0 ? (
                <div className={`text-center py-8 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <p className="text-lg mb-2">✅ No hay productos con stock bajo</p>
                  <p className="text-sm">Todos los productos tienen stock suficiente</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {productosStockBajo.map((producto) => (
                    <motion.div
                      key={producto.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`p-4 rounded-2xl border-2 ${
                        darkMode 
                          ? 'bg-slate-900/50 border-red-500/30' 
                          : 'bg-white border-red-200'
                      } animate-pulse`}
                    >
                      <h3 className={`font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {producto.nombre}
                      </h3>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-red-500 text-sm font-bold">
                            Stock: {producto.stock} / Min: {producto.minStock}
                          </p>
                          <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {producto.categoria}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          className="rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 flex items-center gap-1"
                          onClick={() => setOrdenModal({ producto, cantidad: Math.max(1, (producto.minStock || 5) - producto.stock + 10) })}
                        >
                          <ShoppingCart className="w-3 h-3" />
                          Ordenar
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Próximos a Vencer */}
          <Card className={`backdrop-blur-xl border-2 border-amber-500/50 ${
            darkMode ? 'bg-amber-500/10' : 'bg-amber-50'
          } rounded-3xl`}>
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <Calendar className="w-6 h-6 text-amber-500" />
                <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Próximos a Vencer ({productosPorVencer.length})
                </h2>
              </div>
              
              {productosPorVencer.length === 0 ? (
                <div className={`text-center py-8 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <p className="text-lg mb-2">✅ No hay productos próximos a vencer</p>
                  <p className="text-sm">Todos los productos tienen fechas de vencimiento lejanas</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {productosPorVencer.map((producto) => {
                    const dias = diasHastaVencimiento(producto.fechaVencimiento);
                    return (
                      <motion.div
                        key={producto.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`p-4 rounded-2xl border-2 ${
                          darkMode 
                            ? 'bg-slate-900/50 border-amber-500/30' 
                            : 'bg-white border-amber-200'
                        } ${dias! <= 3 ? 'animate-pulse' : ''}`}
                      >
                        <h3 className={`font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          {producto.nombre}
                        </h3>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-amber-600 text-sm font-bold">
                              ⚠️ Vence en {dias} días
                            </p>
                            <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                              {new Date(producto.fechaVencimiento!).toLocaleDateString()}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            className="rounded-xl bg-gradient-to-r from-orange-500 to-orange-600"
                            onClick={() => aplicarOfertaRelampago(producto)}
                          >
                            <Tag className="w-4 h-4 mr-1" />
                            Oferta
                          </Button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal Orden de Compra */}
      <AnimatePresence>
        {ordenModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setOrdenModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-md rounded-2xl shadow-2xl p-6 ${
                darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
                    <ShoppingCart className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      Orden de Compra
                    </h3>
                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {ordenModal.producto.nombre}
                    </p>
                  </div>
                </div>
                <button onClick={() => setOrdenModal(null)} className={`${darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-900'}`}>
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className={`p-4 rounded-xl mb-4 ${darkMode ? 'bg-slate-700' : 'bg-gray-50'}`}>
                <div className="flex justify-between text-sm mb-1">
                  <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Stock actual</span>
                  <span className="text-red-500 font-bold">{ordenModal.producto.stock} uds.</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Stock mínimo</span>
                  <span className={`font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{ordenModal.producto.minStock} uds.</span>
                </div>
              </div>

              <div className="mb-5">
                <label className={`block text-sm font-semibold mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Cantidad a pedir
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setOrdenModal(prev => prev ? { ...prev, cantidad: Math.max(1, prev.cantidad - 1) } : null)}
                    className={`w-10 h-10 rounded-xl border-2 font-bold text-lg transition-colors ${darkMode ? 'border-slate-600 text-white hover:bg-slate-700' : 'border-gray-300 hover:bg-gray-100'}`}
                  >−</button>
                  <input
                    type="number"
                    min="1"
                    value={ordenModal.cantidad}
                    onChange={(e) => setOrdenModal(prev => prev ? { ...prev, cantidad: Math.max(1, parseInt(e.target.value) || 1) } : null)}
                    className={`flex-1 text-center text-xl font-bold py-2 rounded-xl border-2 ${
                      darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />
                  <button
                    onClick={() => setOrdenModal(prev => prev ? { ...prev, cantidad: prev.cantidad + 1 } : null)}
                    className={`w-10 h-10 rounded-xl border-2 font-bold text-lg transition-colors ${darkMode ? 'border-slate-600 text-white hover:bg-slate-700' : 'border-gray-300 hover:bg-gray-100'}`}
                  >+</button>
                </div>
              </div>

              <Button
                onClick={() => generarOrdenCompra(ordenModal.producto, ordenModal.cantidad)}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 flex items-center justify-center gap-2"
              >
                {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copiado ? 'Copiado al portapapeles' : 'Generar y copiar orden'}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}