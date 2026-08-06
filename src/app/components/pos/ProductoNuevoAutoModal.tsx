/**
 * CODEC POS v2.0 - Modal de Producto Nuevo con Auto-Completado
 * Se abre automáticamente cuando se escanea un código no registrado
 * Consulta APIs externas y llena campos automáticamente
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Barcode, Package, DollarSign, Loader2, Check, Edit, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import { usePOS } from '../../contexts/POSContext';
import {
  buscarProductoConCache,
  ProductoExternoInfo,
  categorizarAutomaticamente,
  inferirTalla,
  inferirColor,
} from '../../services/barcodeProductService';

interface ProductoNuevoAutoModalProps {
  codigoBarras: string;
  onClose: () => void;
  onSave: (producto: any) => void;
}

export default function ProductoNuevoAutoModal({ 
  codigoBarras, 
  onClose, 
  onSave 
}: ProductoNuevoAutoModalProps) {
  const { darkMode } = usePOS();
  const [loading, setLoading] = useState(true);
  const [infoExterna, setInfoExterna] = useState<ProductoExternoInfo | null>(null);
  const [formData, setFormData] = useState({
    codigo: codigoBarras,
    nombre: '',
    marca: '',
    descripcion: '',
    categoria: '',
    precio: '',
    costo: '',
    stock: '',
    stockMinimo: '',
    // Campos adicionales para ropa/textiles
    talla: '',
    color: '',
    material: '',
    genero: '',
    // Campos adicionales
    peso: '',
    proveedor: '',
    aplicaIVA: false,
    pesable: false,
  });

  // Buscar información automáticamente al montar
  useEffect(() => {
    buscarInformacion();
  }, [codigoBarras]);

  const buscarInformacion = async () => {
    setLoading(true);
    
    try {
      const info = await buscarProductoConCache(codigoBarras);
      
      if (info) {
        setInfoExterna(info);
        
        // Auto-completar campos
        const categoria = categorizarAutomaticamente(info.nombre || '', info.categoria);
        const talla = inferirTalla(info.nombre || '');
        const color = inferirColor(info.nombre || '');
        
        setFormData(prev => ({
          ...prev,
          nombre: info.nombre || '',
          marca: info.marca || '',
          descripcion: info.descripcion || '',
          categoria,
          peso: info.peso || '',
          proveedor: info.proveedor || info.marca || '',
          talla: talla || '',
          color: color || '',
        }));
        
        toast.success('Información cargada automáticamente', {
          icon: '✨',
          description: 'Revisa y completa los campos faltantes',
          duration: 3000,
        });
      } else {
        toast.info('Producto no encontrado en bases de datos', {
          icon: '✏️',
          description: 'Completa la información manualmente',
          duration: 3000,
        });
      }
    } catch (error) {
      console.error('Error buscando información:', error);
      toast.error('Error al buscar información del producto');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    // Validaciones básicas
    if (!formData.nombre.trim()) {
      toast.error('El nombre del producto es requerido');
      return;
    }
    
    if (!formData.precio || parseFloat(formData.precio) <= 0) {
      toast.error('El precio debe ser mayor a 0');
      return;
    }
    
    if (!formData.stock || parseInt(formData.stock) < 0) {
      toast.error('El stock debe ser un número válido');
      return;
    }
    
    // Construir objeto producto
    const nuevoProducto = {
      id: `PROD-${Date.now()}`,
      codigo: formData.codigo,
      nombre: formData.nombre.trim(),
      marca: formData.marca.trim(),
      descripcion: formData.descripcion.trim(),
      categoria: formData.categoria || 'General',
      precio: parseFloat(formData.precio),
      costo: formData.costo ? parseFloat(formData.costo) : 0,
      stock: parseInt(formData.stock),
      stockMinimo: formData.stockMinimo ? parseInt(formData.stockMinimo) : 5,
      // Campos adicionales
      talla: formData.talla.trim(),
      color: formData.color.trim(),
      material: formData.material.trim(),
      genero: formData.genero.trim(),
      peso: formData.peso.trim(),
      proveedor: formData.proveedor.trim(),
      aplicaIVA: formData.aplicaIVA,
      pesable: formData.pesable,
      // Metadata
      imagenUrl: infoExterna?.imagenUrl || '',
      fechaCreacion: new Date().toISOString(),
      creadoPorEscaneo: true,
    };
    
    onSave(nuevoProducto);
    
    toast.success('Producto creado exitosamente', {
      icon: '✅',
      description: `${formData.nombre} ha sido agregado al inventario`,
      duration: 3000,
    });
    
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-4xl max-h-[90vh] overflow-hidden"
        >
          <Card className={`${
            darkMode ? 'bg-slate-800 border-2 border-purple-600/30' : 'bg-white border-2 border-purple-200'
          } shadow-2xl`}>
            <CardHeader className="border-b border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-xl flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className={`flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      Nuevo Producto Detectado
                    </CardTitle>
                    <CardDescription className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                      Código: {codigoBarras} • Auto-completado inteligente
                    </CardDescription>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                    darkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-100'
                  }`}
                >
                  <X className={`w-5 h-5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                </button>
              </div>
            </CardHeader>

            <CardContent className="p-6 max-h-[70vh] overflow-y-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-16 h-16 text-purple-500 animate-spin mb-4" />
                  <p className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Buscando información del producto...
                  </p>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Consultando bases de datos internacionales
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  
                  {/* Vista previa si hay imagen */}
                  {infoExterna?.imagenUrl && (
                    <div className="flex justify-center">
                      <div className={`w-40 h-40 rounded-xl border-2 overflow-hidden ${
                        darkMode ? 'border-slate-600' : 'border-gray-300'
                      }`}>
                        <img 
                          src={infoExterna.imagenUrl} 
                          alt={formData.nombre}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Información Básica */}
                  <div className={`p-4 rounded-xl border-2 ${
                    darkMode ? 'bg-indigo-900/20 border-indigo-700/30' : 'bg-indigo-50 border-indigo-200'
                  }`}>
                    <h3 className={`font-bold mb-3 flex items-center gap-2 ${
                      darkMode ? 'text-indigo-400' : 'text-indigo-900'
                    }`}>
                      <Package className="w-5 h-5" />
                      Información Básica {infoExterna && '(Auto-completado ✨)'}
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2 space-y-2">
                        <Label className={darkMode ? 'text-gray-300' : ''}>
                          Nombre del Producto *
                        </Label>
                        <Input
                          value={formData.nombre}
                          onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                          placeholder="Ej: Camisa Polo Negra Talla M"
                          className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className={darkMode ? 'text-gray-300' : ''}>
                          Marca
                        </Label>
                        <Input
                          value={formData.marca}
                          onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                          placeholder="Ej: Nike, Adidas, etc."
                          className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className={darkMode ? 'text-gray-300' : ''}>
                          Categoría
                        </Label>
                        <select
                          value={formData.categoria}
                          onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                          className={`w-full px-3 py-2 rounded-md border ${
                            darkMode 
                              ? 'bg-slate-700 border-slate-600 text-white' 
                              : 'bg-white border-gray-300'
                          }`}
                        >
                          <option value="">Seleccionar...</option>
                          <option value="Ropa">Ropa</option>
                          <option value="Alimentos">Alimentos</option>
                          <option value="Bebidas">Bebidas</option>
                          <option value="Aseo y Limpieza">Aseo y Limpieza</option>
                          <option value="Cuidado Personal">Cuidado Personal</option>
                          <option value="Electrónicos">Electrónicos</option>
                          <option value="General">General</option>
                        </select>
                      </div>

                      <div className="md:col-span-2 space-y-2">
                        <Label className={darkMode ? 'text-gray-300' : ''}>
                          Descripción
                        </Label>
                        <textarea
                          value={formData.descripcion}
                          onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                          placeholder="Descripción detallada del producto..."
                          rows={2}
                          className={`w-full px-3 py-2 rounded-md border ${
                            darkMode 
                              ? 'bg-slate-700 border-slate-600 text-white' 
                              : 'bg-white border-gray-300'
                          }`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Atributos de Ropa/Textiles */}
                  {formData.categoria === 'Ropa' && (
                    <div className={`p-4 rounded-xl border-2 ${
                      darkMode ? 'bg-purple-900/20 border-purple-700/30' : 'bg-purple-50 border-purple-200'
                    }`}>
                      <h3 className={`font-bold mb-3 ${darkMode ? 'text-purple-400' : 'text-purple-900'}`}>
                        👕 Atributos de Ropa
                      </h3>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="space-y-2">
                          <Label className={darkMode ? 'text-gray-300' : ''}>Talla</Label>
                          <Input
                            value={formData.talla}
                            onChange={(e) => setFormData({ ...formData, talla: e.target.value })}
                            placeholder="XS, S, M, L, XL"
                            className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className={darkMode ? 'text-gray-300' : ''}>Color</Label>
                          <Input
                            value={formData.color}
                            onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                            placeholder="Negro, Azul, etc."
                            className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className={darkMode ? 'text-gray-300' : ''}>Material</Label>
                          <Input
                            value={formData.material}
                            onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                            placeholder="Algodón, Poliéster"
                            className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className={darkMode ? 'text-gray-300' : ''}>Género</Label>
                          <select
                            value={formData.genero}
                            onChange={(e) => setFormData({ ...formData, genero: e.target.value })}
                            className={`w-full px-3 py-2 rounded-md border ${
                              darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300'
                            }`}
                          >
                            <option value="">Seleccionar...</option>
                            <option value="Hombre">Hombre</option>
                            <option value="Mujer">Mujer</option>
                            <option value="Niño">Niño</option>
                            <option value="Niña">Niña</option>
                            <option value="Unisex">Unisex</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Precios y Stock */}
                  <div className={`p-4 rounded-xl border-2 ${
                    darkMode ? 'bg-green-900/20 border-green-700/30' : 'bg-green-50 border-green-200'
                  }`}>
                    <h3 className={`font-bold mb-3 flex items-center gap-2 ${
                      darkMode ? 'text-green-400' : 'text-green-900'
                    }`}>
                      <DollarSign className="w-5 h-5" />
                      Precios e Inventario
                    </h3>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label className={darkMode ? 'text-gray-300' : ''}>
                          Precio Venta * (COP)
                        </Label>
                        <Input
                          type="number"
                          value={formData.precio}
                          onChange={(e) => setFormData({ ...formData, precio: e.target.value })}
                          placeholder="15000"
                          className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className={darkMode ? 'text-gray-300' : ''}>
                          Costo (COP)
                        </Label>
                        <Input
                          type="number"
                          value={formData.costo}
                          onChange={(e) => setFormData({ ...formData, costo: e.target.value })}
                          placeholder="10000"
                          className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className={darkMode ? 'text-gray-300' : ''}>
                          Stock Inicial *
                        </Label>
                        <Input
                          type="number"
                          value={formData.stock}
                          onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                          placeholder="50"
                          className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className={darkMode ? 'text-gray-300' : ''}>
                          Stock Mínimo
                        </Label>
                        <Input
                          type="number"
                          value={formData.stockMinimo}
                          onChange={(e) => setFormData({ ...formData, stockMinimo: e.target.value })}
                          placeholder="5"
                          className={darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}
                        />
                      </div>
                    </div>

                    {/* Margen de ganancia calculado */}
                    {formData.precio && formData.costo && (
                      <div className="mt-3 p-3 bg-gradient-to-r from-emerald-500/10 to-green-500/10 rounded-lg border border-emerald-500/30">
                        <p className={`text-sm ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                          <span className="font-bold">Margen de Ganancia:</span> $
                          {(parseFloat(formData.precio) - parseFloat(formData.costo)).toLocaleString('es-CO')} (
                          {((parseFloat(formData.precio) - parseFloat(formData.costo)) / parseFloat(formData.precio) * 100).toFixed(1)}%)
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Botones */}
                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-600">
                    <Button
                      onClick={onClose}
                      variant="outline"
                      className={darkMode ? 'border-slate-600 hover:bg-slate-700' : ''}
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleSave}
                      className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 font-bold"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Guardar Producto
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
