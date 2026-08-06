import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Save, Package } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import { TIPOS_NEGOCIO, obtenerCategoriasPorTipo, obtenerAtributosPorTipo, obtenerSugerenciaIVA } from '../../../data/tipos-negocio';
import { useBusinessContext } from '../../contexts/BusinessContext';

interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  precio: number;
  stock: number;
  minStock: number;
  categoria: string;
  costo: number;
  fechaVencimiento?: string;
  descripcion?: string;
  pesable?: boolean;
  tipoNegocio?: string;
  aplicaIVA?: boolean;
  atributosEspecificos?: Record<string, string>;
}

interface EditProductModalProps {
  darkMode: boolean;
  isOpen: boolean;
  product: Producto | null;
  onClose: () => void;
  onProductUpdated: () => void;
}

export function EditProductModal({ darkMode, isOpen, product, onClose, onProductUpdated }: EditProductModalProps) {
  const { tipoNegocio: tipoNegocioGlobal } = useBusinessContext();
  const [formData, setFormData] = useState<Producto | null>(null);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [atributos, setAtributos] = useState<string[]>([]);
  const [tipoNegocio, setTipoNegocio] = useState<string>('');

  useEffect(() => {
    if (product) {
      setFormData(product);
      const tipo = product.tipoNegocio || tipoNegocioGlobal;
      setTipoNegocio(tipo);
      setCategorias(obtenerCategoriasPorTipo(tipo));
      setAtributos(obtenerAtributosPorTipo(tipo));
    }
  }, [product, tipoNegocioGlobal]);

  if (!isOpen || !formData) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.codigo || !formData.nombre || !formData.precio || !formData.stock || !formData.costo) {
      toast.error('Complete todos los campos obligatorios');
      return;
    }

    try {
      // Actualizar en localStorage
      const productosLocal = localStorage.getItem('pos-productos');
      if (productosLocal) {
        const productos = JSON.parse(productosLocal);
        const index = productos.findIndex((p: Producto) => p.id === formData.id);
        if (index !== -1) {
          productos[index] = formData;
          localStorage.setItem('pos-productos', JSON.stringify(productos));
        }
      }

      toast.success('Producto actualizado exitosamente');
      onProductUpdated();
      onClose();
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al actualizar el producto');
    }
  };

  const handleChange = (field: keyof Producto, value: any) => {
    setFormData(prev => prev ? ({
      ...prev,
      [field]: value
    }) : null);
  };

  const handleTipoNegocioChange = (tipo: string) => {
    setTipoNegocio(tipo);
    setCategorias(obtenerCategoriasPorTipo(tipo));
    setAtributos(obtenerAtributosPorTipo(tipo));
    handleChange('tipoNegocio', tipo);
    handleChange('aplicaIVA', obtenerSugerenciaIVA(tipo));
  };

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
          className={`max-w-3xl w-full rounded-3xl p-8 max-h-[90vh] overflow-y-auto ${
            darkMode ? 'bg-slate-900 border-2 border-slate-700' : 'bg-white'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center">
                <Package className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Editar Producto
                </h2>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Modifica la información del producto
                </p>
              </div>
            </div>
            <Button
              onClick={onClose}
              size="icon"
              variant="ghost"
              className="rounded-xl"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Código de Barras */}
              <div>
                <label className={`block mb-2 font-semibold text-sm ${
                  darkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Código de Barras *
                </label>
                <Input
                  value={formData.codigo}
                  onChange={(e) => handleChange('codigo', e.target.value)}
                  placeholder="7702001001"
                  required
                  className={`rounded-xl ${
                    darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white'
                  }`}
                />
              </div>

              {/* Nombre */}
              <div>
                <label className={`block mb-2 font-semibold text-sm ${
                  darkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Nombre del Producto *
                </label>
                <Input
                  value={formData.nombre}
                  onChange={(e) => handleChange('nombre', e.target.value)}
                  placeholder="Tu producto"
                  required
                  className={`rounded-xl ${
                    darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white'
                  }`}
                />
              </div>

              {/* Tipo de Negocio */}
              <div>
                <label className={`block mb-2 font-semibold text-sm ${
                  darkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Tipo de Negocio
                </label>
                <select
                  value={tipoNegocio}
                  onChange={(e) => handleTipoNegocioChange(e.target.value)}
                  className={`w-full rounded-xl border px-3 py-2 ${
                    darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-gray-300'
                  }`}
                >
                  <option value="">Selecciona un tipo</option>
                  {Object.keys(TIPOS_NEGOCIO).map(key => {
                    const tipo = TIPOS_NEGOCIO[key];
                    return (
                      <option key={key} value={key}>
                        {tipo.icono} {tipo.nombre}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Categoría */}
              <div>
                <label className={`block mb-2 font-semibold text-sm ${
                  darkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Categoría *
                </label>
                <select
                  value={formData.categoria}
                  onChange={(e) => handleChange('categoria', e.target.value)}
                  required
                  className={`w-full rounded-xl border px-3 py-2 ${
                    darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-gray-300'
                  }`}
                >
                  <option value="">Selecciona categoría</option>
                  {categorias.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Stock */}
              <div>
                <label className={`block mb-2 font-semibold text-sm ${
                  darkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Stock Actual *
                </label>
                <Input
                  type="number"
                  value={formData.stock}
                  onChange={(e) => handleChange('stock', parseInt(e.target.value) || 0)}
                  placeholder="100"
                  required
                  min="0"
                  className={`rounded-xl ${
                    darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white'
                  }`}
                />
              </div>

              {/* Stock Mínimo */}
              <div>
                <label className={`block mb-2 font-semibold text-sm ${
                  darkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Stock Mínimo *
                </label>
                <Input
                  type="number"
                  value={formData.minStock}
                  onChange={(e) => handleChange('minStock', parseInt(e.target.value) || 0)}
                  placeholder="20"
                  required
                  min="0"
                  className={`rounded-xl ${
                    darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white'
                  }`}
                />
              </div>

              {/* Costo */}
              <div>
                <label className={`block mb-2 font-semibold text-sm ${
                  darkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Costo (COP) *
                </label>
                <Input
                  type="number"
                  value={formData.costo}
                  onChange={(e) => handleChange('costo', parseFloat(e.target.value) || 0)}
                  placeholder="2500"
                  required
                  min="0"
                  className={`rounded-xl ${
                    darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white'
                  }`}
                />
              </div>

              {/* Precio de Venta */}
              <div>
                <label className={`block mb-2 font-semibold text-sm ${
                  darkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Precio de Venta (COP) *
                </label>
                <Input
                  type="number"
                  value={formData.precio}
                  onChange={(e) => handleChange('precio', parseFloat(e.target.value) || 0)}
                  placeholder="3500"
                  required
                  min="0"
                  className={`rounded-xl ${
                    darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white'
                  }`}
                />
              </div>

              {/* Fecha de Vencimiento */}
              {atributos.includes('fechaVencimiento') && (
                <div className="col-span-2">
                  <label className={`block mb-2 font-semibold text-sm ${
                    darkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Fecha de Vencimiento
                  </label>
                  <Input
                    type="date"
                    value={formData.fechaVencimiento || ''}
                    onChange={(e) => handleChange('fechaVencimiento', e.target.value)}
                    className={`rounded-xl ${
                      darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white'
                    }`}
                  />
                </div>
              )}

              {/* Checkbox IVA */}
              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.aplicaIVA || false}
                    onChange={(e) => handleChange('aplicaIVA', e.target.checked)}
                    className="w-5 h-5 rounded"
                  />
                  <span className={`font-semibold text-sm ${
                    darkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Aplicar IVA (19%)
                  </span>
                </label>
              </div>

              {/* Atributos Específicos */}
              {atributos.filter(attr => attr !== 'fechaVencimiento').map(attr => (
                <div key={attr}>
                  <Label className={`block mb-2 font-semibold text-sm ${
                    darkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    {attr.charAt(0).toUpperCase() + attr.slice(1)}
                  </Label>
                  <Input
                    value={formData.atributosEspecificos?.[attr] || ''}
                    onChange={(e) => handleChange('atributosEspecificos', {
                      ...formData.atributosEspecificos,
                      [attr]: e.target.value
                    })}
                    className={`rounded-xl ${
                      darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white'
                    }`}
                  />
                </div>
              ))}
            </div>

            {/* Margen de Ganancia */}
            {formData.costo > 0 && formData.precio > 0 && (
              <Card className={`mb-6 ${
                darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-blue-50 border-blue-200'
              }`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className={`font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Margen de Ganancia:
                    </span>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-emerald-500">
                        {(((formData.precio - formData.costo) / formData.costo) * 100).toFixed(1)}%
                      </div>
                      <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        ${(formData.precio - formData.costo).toLocaleString('es-CO')} de ganancia
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Botones */}
            <div className="flex gap-3">
              <Button
                type="button"
                onClick={onClose}
                variant="outline"
                className="flex-1 rounded-2xl h-12"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1 rounded-2xl h-12 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
              >
                <Save className="w-5 h-5 mr-2" />
                Guardar Cambios
              </Button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
