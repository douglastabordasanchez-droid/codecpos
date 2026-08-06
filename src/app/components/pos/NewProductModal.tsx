import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Package, Save, Crown } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent } from '../ui/card';
import { usePOS } from '../../contexts/POSContext';
import { usePlanRestrictions } from '../../hooks/usePlanRestrictions';
import { toast } from 'sonner';

interface NewProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProductCreated: () => void;
}

export function NewProductModal({ isOpen, onClose, onProductCreated }: NewProductModalProps) {
  const { darkMode } = usePOS();
  const { planInfo, canAddProduct } = usePlanRestrictions();
  const [formData, setFormData] = useState({
    codigo: '',
    nombre: '',
    precio: '',
    stock: '',
    minStock: '10',
    categoria: '',
    costo: '',
    fechaVencimiento: '',
  });
  const [saving, setSaving] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Categorías predefinidas para minimercados
  const categorias = [
    'Abarrotes',
    'Aceites',
    'Aseo Personal',
    'Aseo Hogar',
    'Bebidas',
    'Lácteos',
    'Carnes y Embutidos',
    'Panadería',
    'Fruver (Frutas y Verduras)',
    'Confitería y Dulces',
    'Snacks',
    'Enlatados',
    'Granos y Cereales',
    'Harinas',
    'Condimentos',
    'Licores',
    'Cigarrillos',
    'Productos Infantiles',
    'Mascotas',
    'Farmacia',
    'Otros',
  ];

  const resetForm = () => {
    setFormData({
      codigo: '',
      nombre: '',
      precio: '',
      stock: '',
      minStock: '10',
      categoria: '',
      costo: '',
      fechaVencimiento: '',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validaciones
    if (!formData.codigo || !formData.nombre || !formData.precio || !formData.stock || !formData.categoria || !formData.costo) {
      toast.error('Por favor completa todos los campos requeridos');
      return;
    }

    // ✅ VERIFICAR LÍMITE DE PRODUCTOS SEGÚN PLAN
    const productosLocal = JSON.parse(localStorage.getItem('pos-productos') || '[]');
    const cantidadActual = productosLocal.length;

    if (!canAddProduct(cantidadActual)) {
      toast.error(`Límite alcanzado: ${planInfo.maxProductos} productos`, {
        description: planInfo.plan === 'BASICO' 
          ? `Actualiza a Premium para gestionar hasta 20,000 productos` 
          : 'Has alcanzado el límite de productos para tu plan',
        duration: 5000,
        icon: <Crown className="w-5 h-5 text-amber-500" />,
      });
      return;
    }

    setSaving(true);

    try {
      const producto = {
        id: Date.now().toString(),
        codigo: formData.codigo,
        nombre: formData.nombre,
        precio: parseFloat(formData.precio),
        stock: parseInt(formData.stock),
        minStock: parseInt(formData.minStock) || 10,
        categoria: formData.categoria,
        costo: parseFloat(formData.costo),
        fechaVencimiento: formData.fechaVencimiento || undefined,
      };

      // Intentar guardar en el servidor
      try {
        const response = await fetch('http://localhost:3001/productos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(producto),
        });

        if (response.ok) {
          toast.success('Producto creado exitosamente', {
            description: formData.nombre,
          });
        } else {
          throw new Error('Server error');
        }
      } catch (error) {
        // Si no hay servidor, guardar en localStorage
        productosLocal.push(producto);
        localStorage.setItem('pos-productos', JSON.stringify(productosLocal));
        
        toast.success(`Producto creado exitosamente (${cantidadActual + 1}/${planInfo.maxProductos})`, {
          description: formData.nombre,
        });
      }

      resetForm();
      onProductCreated();
      onClose();
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al crear el producto');
    } finally {
      setSaving(false);
    }
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
          className={`max-w-2xl w-full rounded-3xl p-8 ${
            darkMode ? 'bg-slate-900 border-2 border-slate-700' : 'bg-white'
          } max-h-[90vh] overflow-y-auto`}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center">
                <Package className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Nuevo Producto
                </h2>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Crear producto manualmente
                </p>
              </div>
            </div>
            <Button
              onClick={() => {
                resetForm();
                onClose();
              }}
              size="icon"
              variant="ghost"
              className="rounded-xl"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <Card className={`border-2 ${
              darkMode 
                ? 'bg-slate-800/50 border-slate-700' 
                : 'bg-gray-50 border-gray-200'
            } rounded-2xl`}>
              <CardContent className="p-6 space-y-4">
                {/* Información Básica */}
                <div>
                  <h3 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Información Básica
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="codigo" className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                        Código de Barras *
                      </Label>
                      <Input
                        id="codigo"
                        name="codigo"
                        type="text"
                        value={formData.codigo}
                        onChange={handleChange}
                        placeholder="7702001001"
                        className={`mt-2 rounded-xl ${
                          darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white'
                        }`}
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="nombre" className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                        Nombre del Producto *
                      </Label>
                      <Input
                        id="nombre"
                        name="nombre"
                        type="text"
                        value={formData.nombre}
                        onChange={handleChange}
                        placeholder="Nombre del producto"
                        className={`mt-2 rounded-xl ${
                          darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white'
                        }`}
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="categoria" className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                        Categoría *
                      </Label>
                      <select
                        id="categoria"
                        name="categoria"
                        value={formData.categoria}
                        onChange={handleSelectChange}
                        className={`w-full mt-2 px-3 py-2 rounded-xl border-2 font-medium transition-all ${
                          darkMode 
                            ? 'bg-slate-700 border-slate-600 text-white focus:border-emerald-500' 
                            : 'bg-white border-gray-300 text-gray-900 focus:border-emerald-500'
                        } focus:outline-none focus:ring-2 focus:ring-emerald-500/20`}
                        required
                      >
                        <option value="">Selecciona una categoría</option>
                        {categorias.map(categoria => (
                          <option key={categoria} value={categoria}>
                            {categoria}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <Label htmlFor="fechaVencimiento" className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                        Fecha de Vencimiento (Opcional)
                      </Label>
                      <Input
                        id="fechaVencimiento"
                        name="fechaVencimiento"
                        type="date"
                        value={formData.fechaVencimiento}
                        onChange={handleChange}
                        className={`mt-2 rounded-xl ${
                          darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white'
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {/* Inventario */}
                <div className="pt-4 border-t border-slate-700">
                  <h3 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Inventario
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="stock" className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                        Stock Inicial *
                      </Label>
                      <Input
                        id="stock"
                        name="stock"
                        type="number"
                        value={formData.stock}
                        onChange={handleChange}
                        placeholder="100"
                        className={`mt-2 rounded-xl ${
                          darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white'
                        }`}
                        required
                        min="0"
                      />
                    </div>

                    <div>
                      <Label htmlFor="minStock" className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                        Stock Mínimo
                      </Label>
                      <Input
                        id="minStock"
                        name="minStock"
                        type="number"
                        value={formData.minStock}
                        onChange={handleChange}
                        placeholder="10"
                        className={`mt-2 rounded-xl ${
                          darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white'
                        }`}
                        min="0"
                      />
                    </div>
                  </div>
                </div>

                {/* Precios */}
                <div className="pt-4 border-t border-slate-700">
                  <h3 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Precios
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="costo" className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                        Costo (Compra) *
                      </Label>
                      <Input
                        id="costo"
                        name="costo"
                        type="number"
                        value={formData.costo}
                        onChange={handleChange}
                        placeholder="5000"
                        className={`mt-2 rounded-xl ${
                          darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white'
                        }`}
                        required
                        min="0"
                        step="0.01"
                      />
                    </div>

                    <div>
                      <Label htmlFor="precio" className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                        Precio (Venta) *
                      </Label>
                      <Input
                        id="precio"
                        name="precio"
                        type="number"
                        value={formData.precio}
                        onChange={handleChange}
                        placeholder="7500"
                        className={`mt-2 rounded-xl ${
                          darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white'
                        }`}
                        required
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>

                  {/* Margen de ganancia */}
                  {formData.costo && formData.precio && (
                    <div className={`mt-4 p-4 rounded-2xl ${
                      darkMode ? 'bg-slate-700/50' : 'bg-white border border-gray-200'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Margen de Ganancia:
                        </span>
                        <span className="text-lg font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 bg-clip-text text-transparent">
                          {(((parseFloat(formData.precio) - parseFloat(formData.costo)) / parseFloat(formData.costo)) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Ganancia por Unidad:
                        </span>
                        <span className={`text-lg font-bold ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                          ${(parseFloat(formData.precio) - parseFloat(formData.costo)).toLocaleString('es-CO')}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                type="button"
                onClick={() => {
                  resetForm();
                  onClose();
                }}
                variant="outline"
                className="flex-1 rounded-2xl h-12"
              >
                Cancelar
              </Button>
              
              <Button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-2xl h-12 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700"
              >
                {saving ? (
                  <>
                    <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-2" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5 mr-2" />
                    Crear Producto
                  </>
                )}
              </Button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}