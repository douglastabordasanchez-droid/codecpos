/**
 * 🛍️ MODAL PARA CREAR NUEVO APARTADO
 */

import React, { useState, useEffect } from 'react';
import { X, ShoppingBag, User, Phone, Calendar, DollarSign, Package } from 'lucide-react';
import { crearApartado } from '../../lib/apartadosService';
import { obtenerProductos } from '../../lib/indexedDB';
import { toast } from 'sonner';

interface ModalNuevoApartadoProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ModalNuevoApartado({ isOpen, onClose, onSuccess }: ModalNuevoApartadoProps) {
  const [loading, setLoading] = useState(false);
  const [productos, setProductos] = useState<any[]>([]);
  const [form, setForm] = useState({
    clienteNombre: '',
    clienteTelefono: '',
    productosSeleccionados: [] as { productoId: string; cantidad: number; precioUnitario: number }[],
    montoTotal: 0,
    abono: 0,
    diasValidez: 15,
    notas: '',
  });

  useEffect(() => {
    if (isOpen) {
      cargarProductos();
    }
  }, [isOpen]);

  const cargarProductos = async () => {
    try {
      const prods = await obtenerProductos();
      setProductos(prods);
    } catch (error) {
      console.error('Error cargando productos:', error);
    }
  };

  const agregarProducto = (producto: any) => {
    const yaExiste = form.productosSeleccionados.find(p => p.productoId === producto.id);
    
    if (yaExiste) {
      setForm({
        ...form,
        productosSeleccionados: form.productosSeleccionados.map(p =>
          p.productoId === producto.id
            ? { ...p, cantidad: p.cantidad + 1 }
            : p
        ),
      });
    } else {
      setForm({
        ...form,
        productosSeleccionados: [
          ...form.productosSeleccionados,
          {
            productoId: producto.id,
            cantidad: 1,
            precioUnitario: producto.precio,
          },
        ],
      });
    }
  };

  const calcularTotal = () => {
    return form.productosSeleccionados.reduce(
      (sum, item) => sum + item.cantidad * item.precioUnitario,
      0
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (form.productosSeleccionados.length === 0) {
      toast.error('❌ Debes agregar al menos un producto');
      return;
    }

    const total = calcularTotal();
    
    if (form.abono > total) {
      toast.error('❌ El abono no puede ser mayor al total');
      return;
    }

    setLoading(true);

    try {
      await crearApartado({
        cliente: {
          nombre: form.clienteNombre,
          telefono: form.clienteTelefono,
        },
        productos: form.productosSeleccionados,
        montoTotal: total,
        abonos: form.abono > 0 ? [
          {
            monto: form.abono,
            fecha: new Date().toISOString(),
            metodoPago: 'efectivo',
          },
        ] : [],
        saldo: total - form.abono,
        diasValidez: form.diasValidez,
        notas: form.notas,
      });

      toast.success('✅ Apartado creado exitosamente');
      setForm({
        clienteNombre: '',
        clienteTelefono: '',
        productosSeleccionados: [],
        montoTotal: 0,
        abono: 0,
        diasValidez: 15,
        notas: '',
      });
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error creando apartado:', error);
      toast.error('❌ Error creando apartado');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const total = calcularTotal();
  const saldo = total - form.abono;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-500 to-cyan-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
              <ShoppingBag className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Nuevo Apartado</h2>
              <p className="text-cyan-100 text-sm">Registra una reserva con abono inicial</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          <div className="space-y-6">
            {/* Datos del Cliente */}
            <div>
              <h3 className="font-bold text-lg mb-3 text-gray-800 dark:text-white flex items-center gap-2">
                <User className="w-5 h-5 text-cyan-600" />
                Datos del Cliente
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
                    Nombre Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.clienteNombre}
                    onChange={(e) => setForm({ ...form, clienteNombre: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                    placeholder="Juan Pérez"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
                    <Phone className="w-4 h-4 inline mr-1" />
                    Teléfono *
                  </label>
                  <input
                    type="tel"
                    required
                    value={form.clienteTelefono}
                    onChange={(e) => setForm({ ...form, clienteTelefono: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                    placeholder="300 123 4567"
                  />
                </div>
              </div>
            </div>

            {/* Productos */}
            <div>
              <h3 className="font-bold text-lg mb-3 text-gray-800 dark:text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-cyan-600" />
                Productos
              </h3>
              
              {/* Selector de Productos */}
              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
                  Agregar Producto
                </label>
                <select
                  onChange={(e) => {
                    const producto = productos.find(p => p.id === e.target.value);
                    if (producto) agregarProducto(producto);
                    e.target.value = '';
                  }}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                >
                  <option value="">Selecciona un producto...</option>
                  {productos.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} - ${p.precio.toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>

              {/* Lista de Productos Seleccionados */}
              {form.productosSeleccionados.length > 0 && (
                <div className="space-y-2">
                  {form.productosSeleccionados.map((item, index) => {
                    const producto = productos.find(p => p.id === item.productoId);
                    return (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg"
                      >
                        <div className="flex-1">
                          <p className="font-semibold text-gray-800 dark:text-white">
                            {producto?.nombre}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            ${item.precioUnitario.toLocaleString()} x {item.cantidad}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-gray-800 dark:text-white">
                            ${(item.precioUnitario * item.cantidad).toLocaleString()}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setForm({
                                ...form,
                                productosSeleccionados: form.productosSeleccionados.filter((_, i) => i !== index),
                              });
                            }}
                            className="text-xs text-red-600 hover:text-red-700"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Detalles del Apartado */}
            <div>
              <h3 className="font-bold text-lg mb-3 text-gray-800 dark:text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-cyan-600" />
                Detalles del Apartado
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
                    Abono Inicial
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={total}
                    step="1000"
                    value={form.abono}
                    onChange={(e) => setForm({ ...form, abono: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    Días de Validez
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={form.diasValidez}
                    onChange={(e) => setForm({ ...form, diasValidez: parseInt(e.target.value) || 15 })}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Resumen */}
              <div className="mt-4 p-4 bg-cyan-50 dark:bg-cyan-900/20 rounded-xl border-2 border-cyan-200 dark:border-cyan-800">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-700 dark:text-gray-300">Total:</span>
                    <span className="font-bold text-gray-900 dark:text-white">
                      ${total.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700 dark:text-gray-300">Abono:</span>
                    <span className="font-bold text-cyan-600">
                      ${form.abono.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-cyan-300 dark:border-cyan-700">
                    <span className="text-gray-700 dark:text-gray-300 font-bold">Saldo Pendiente:</span>
                    <span className="font-bold text-xl text-gray-900 dark:text-white">
                      ${saldo.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notas */}
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
                Notas Adicionales
              </label>
              <textarea
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                rows={3}
                placeholder="Detalles adicionales del apartado..."
              />
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="bg-gray-50 dark:bg-slate-900/50 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-200 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 border-2 border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 font-semibold transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || form.productosSeleccionados.length === 0}
            className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 text-white rounded-xl hover:from-cyan-600 hover:to-cyan-700 font-semibold transition-all shadow-lg shadow-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Creando...
              </span>
            ) : (
              'Crear Apartado'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
