/**
 * 🎯 MODAL NUEVO PRODUCTO - CON INTELIGENCIA DE NEGOCIO + MARGEN AUTOMÁTICO
 * 
 * Formulario inteligente que adapta los campos según el tipo de negocio seleccionado.
 * Incluye:
 * - Tipo de Negocio (selector principal)
 * - Categorías dinámicas (basadas en el tipo)
 * - Atributos específicos (talla/color para ropa, vencimiento para droguería, etc.)
 * - Sugerencias de IVA automáticas
 * - 💰 MARGEN DE GANANCIA AUTOMÁTICO (NUEVO)
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Plus,
  Barcode,
  Package,
  DollarSign,
  Calendar,
  Tag,
  AlertCircle,
  TrendingUp,
  Sparkles,
  Store,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { usePOS } from '../../contexts/POSContext';
import { useBusinessContext } from '../../contexts/BusinessContext';
import { toast } from 'sonner';
import { TIPOS_NEGOCIO, obtenerCategoriasPorTipo, obtenerAtributosPorTipo, obtenerSugerenciaIVA } from '../../../data/tipos-negocio';

interface ModalNuevoProductoProps {
  isOpen: boolean;
  onClose: () => void;
  onProductCreated: () => void;
}

export function ModalNuevoProducto({ isOpen, onClose, onProductCreated }: ModalNuevoProductoProps) {
  const { darkMode } = usePOS();
  const { tipoNegocio: tipoNegocioGlobal } = useBusinessContext();

  // Tipo de negocio sincronizado con el contexto global
  const [tipoNegocio, setTipoNegocio] = useState(tipoNegocioGlobal);
  
  // 📝 Campos básicos
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [stock, setStock] = useState('');
  const [costo, setCosto] = useState('');
  const [precio, setPrecio] = useState('');
  
  // 💰 NUEVO: Configuración de Margen de Ganancia Automático
  const [margenAutomaticoActivo, setMargenAutomaticoActivo] = useState(() => {
    const config = localStorage.getItem('pos-margen-automatico-config');
    return config ? JSON.parse(config).activo : false;
  });
  const [porcentajeMargen, setPorcentajeMargen] = useState(() => {
    const config = localStorage.getItem('pos-margen-automatico-config');
    return config ? JSON.parse(config).porcentaje : 30;
  });
  
  // 🎯 CAMPO B: Categoría Dinámica (basada en tipo de negocio)
  const [categoria, setCategoria] = useState('');
  const [categorias, setCategorias] = useState<string[]>([]);
  
  // ⚙️ Campos adicionales
  const [minStock, setMinStock] = useState('10');
  const [aplicaIVA, setAplicaIVA] = useState(false);
  
  // 🎨 Atributos específicos del tipo de negocio
  const [atributosEspecificos, setAtributosEspecificos] = useState<Record<string, string>>({});
  const [atributos, setAtributos] = useState<string[]>([]);
  
  const [saving, setSaving] = useState(false);

  // 🔄 Actualizar categorías cuando cambia el tipo de negocio
  useEffect(() => {
    const nuevasCategorias = obtenerCategoriasPorTipo(tipoNegocio);
    setCategorias(nuevasCategorias);
    setCategoria(nuevasCategorias[0] || '');
    
    // Actualizar atributos específicos
    const nuevosAtributos = obtenerAtributosPorTipo(tipoNegocio);
    setAtributos(nuevosAtributos);
    
    // Resetear atributos específicos
    const nuevosAtributosObj: Record<string, string> = {};
    nuevosAtributos.forEach(attr => {
      nuevosAtributosObj[attr] = '';
    });
    setAtributosEspecificos(nuevosAtributosObj);
    
    // Sugerencia automática de IVA
    const sugerenciaIVA = obtenerSugerenciaIVA(tipoNegocio);
    setAplicaIVA(sugerenciaIVA);
  }, [tipoNegocio]);

  // 🔄 Actualizar sugerencia de IVA cuando cambia la categoría
  useEffect(() => {
    const sugerenciaIVA = obtenerSugerenciaIVA(tipoNegocio, categoria);
    setAplicaIVA(sugerenciaIVA);
  }, [categoria, tipoNegocio]);

  // 💰 NUEVO: Efecto para calcular precio automáticamente cuando cambia el costo
  useEffect(() => {
    if (margenAutomaticoActivo && costo) {
      const costoNum = parseFloat(costo);
      if (!isNaN(costoNum) && costoNum > 0) {
        const precioCalculado = costoNum * (1 + porcentajeMargen / 100);
        setPrecio(precioCalculado.toFixed(0));
      }
    }
  }, [costo, margenAutomaticoActivo, porcentajeMargen]);

  // 💰 NUEVO: Guardar configuración de margen automático en localStorage
  useEffect(() => {
    const config = {
      activo: margenAutomaticoActivo,
      porcentaje: porcentajeMargen
    };
    localStorage.setItem('pos-margen-automatico-config', JSON.stringify(config));
  }, [margenAutomaticoActivo, porcentajeMargen]);

  // 💰 Cálculo automático de margen
  const calcularMargen = () => {
    const costoNum = parseFloat(costo) || 0;
    const precioNum = parseFloat(precio) || 0;
    if (costoNum === 0) return 0;
    return ((precioNum - costoNum) / costoNum * 100).toFixed(1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!codigo || !nombre || !stock || !costo || !precio || !categoria) {
      toast.error('Complete todos los campos obligatorios');
      return;
    }

    setSaving(true);
    
    try {
      const productosLocal = JSON.parse(localStorage.getItem('pos-productos') || '[]');
      
      // Verificar código duplicado
      if (productosLocal.some((p: any) => p.codigo === codigo)) {
        toast.error('Ya existe un producto con ese código');
        setSaving(false);
        return;
      }

      const nuevoProducto = {
        id: `prod-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        codigo,
        nombre,
        stock: parseInt(stock),
        costo: parseFloat(costo),
        precio: parseFloat(precio),
        categoria,
        minStock: parseInt(minStock) || 10,
        tipoNegocio,
        atributosEspecificos,
        aplicaIVA,
      };

      productosLocal.push(nuevoProducto);
      localStorage.setItem('pos-productos', JSON.stringify(productosLocal));
      
      toast.success(`Producto "${nombre}" creado exitosamente`);
      
      // Reset form
      setCodigo('');
      setNombre('');
      setStock('');
      setCosto('');
      setPrecio('');
      setMinStock('10');
      
      onProductCreated();
      onClose();
    } catch (error) {
      console.error('Error creando producto:', error);
      toast.error('Error al crear el producto');
    } finally {
      setSaving(false);
    }
  };

  const renderAtributoEspecifico = (atributo: string) => {
    const labels: Record<string, string> = {
      peso: '⚖️ Peso (Kg/Gr)',
      fechaVencimiento: '📅 Fecha de Vencimiento',
      lote: '🏷️ Lote',
      talla: '👔 Talla',
      color: '🎨 Color',
      material: '🧵 Material',
      marca: '🏭 Marca',
      registroInvima: '📋 Registro INVIMA',
      principioActivo: '💊 Principio Activo',
      garantia: '🛡️ Garantía',
      medida: '📏 Medida',
      fechaElaboracion: '📅 Fecha de Elaboración',
      ingredientes: '🥗 Ingredientes',
      corte: '🔪 Tipo de Corte',
      origen: '🌍 Origen',
      graduacionAlcoholica: '🍷 Graduación Alcohólica',
      añejamiento: '⏳ Añejamiento',
      modelo: '📱 Modelo',
      serial: '🔢 Serial',
      tono: '💄 Tono',
      especieAnimal: '🐾 Especie Animal',
      edadRecomendada: '👶 Edad Recomendada',
      autor: '✍️ Autor',
      editorial: '📚 Editorial',
      isbn: '📖 ISBN',
      idioma: '🌐 Idioma',
      porcion: '🍽️ Porción',
      tiempoPreparacion: '⏱️ Tiempo de Preparación (min)',
      deporte: '⚽ Deporte',
      tamaño: '📐 Tamaño',
    };

    const isDateField = atributo === 'fechaVencimiento' || atributo === 'fechaElaboracion';
    const isNumberField = atributo === 'graduacionAlcoholica' || atributo === 'tiempoPreparacion';

    return (
      <div key={atributo} className="space-y-2">
        <Label className={darkMode ? 'text-slate-300' : 'text-gray-700'}>
          {labels[atributo] || atributo}
        </Label>
        <Input
          type={isDateField ? 'date' : isNumberField ? 'number' : 'text'}
          value={atributosEspecificos[atributo] || ''}
          onChange={(e) => setAtributosEspecificos({
            ...atributosEspecificos,
            [atributo]: e.target.value
          })}
          className={darkMode 
            ? 'bg-slate-800/50 border-slate-600 text-white' 
            : 'bg-white border-gray-300'
          }
        />
      </div>
    );
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
          className={`max-w-4xl w-full rounded-3xl p-8 ${
            darkMode ? 'bg-slate-900 border-2 border-slate-700' : 'bg-white'
          } max-h-[90vh] overflow-y-auto`}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center">
                <Plus className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Nuevo Producto
                </h2>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Formulario inteligente con cálculo automático de precio
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

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 🎯 SECCIÓN 1: INTELIGENCIA DE NEGOCIO */}
            <div className={`p-6 rounded-2xl border-2 ${
              darkMode 
                ? 'bg-gradient-to-br from-purple-500/10 to-violet-500/10 border-purple-500/30' 
                : 'bg-gradient-to-br from-purple-50 to-violet-50 border-purple-200'
            }`}>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className={`w-5 h-5 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                <h3 className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Inteligencia de Negocio
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* CAMPO A: Tipo de Negocio */}
                <div className="space-y-2 col-span-2">
                  <Label className={darkMode ? 'text-slate-300' : 'text-gray-700'}>
                    <Store className="w-4 h-4 inline mr-2" />
                    Tipo de Negocio *
                  </Label>
                  <select
                    value={tipoNegocio}
                    onChange={(e) => setTipoNegocio(e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border-2 text-base font-medium ${
                      darkMode 
                        ? 'bg-slate-800 border-slate-600 text-white' 
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    {Object.entries(TIPOS_NEGOCIO).map(([key, tipo]) => (
                      <option key={key} value={key}>
                        {tipo.icono} {tipo.nombre}
                      </option>
                    ))}
                  </select>
                  <p className={`text-xs ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>
                    Las categorías y atributos se adaptarán según tu selección
                  </p>
                </div>

                {/* CAMPO B: Categoría Dinámica */}
                <div className="space-y-2 col-span-2">
                  <Label className={darkMode ? 'text-slate-300' : 'text-gray-700'}>
                    <Tag className="w-4 h-4 inline mr-2" />
                    Categoría *
                  </Label>
                  <select
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border-2 text-base ${
                      darkMode 
                        ? 'bg-slate-800 border-slate-600 text-white' 
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                    required
                  >
                    {categorias.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sugerencia de IVA */}
                <div className={`col-span-2 p-4 rounded-xl border ${
                  aplicaIVA
                    ? darkMode
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : 'bg-amber-50 border-amber-200'
                    : darkMode
                      ? 'bg-green-500/10 border-green-500/30'
                      : 'bg-green-50 border-green-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertCircle className={`w-4 h-4 ${
                        aplicaIVA 
                          ? darkMode ? 'text-amber-400' : 'text-amber-600'
                          : darkMode ? 'text-green-400' : 'text-green-600'
                      }`} />
                      <span className={`text-sm font-semibold ${
                        aplicaIVA
                          ? darkMode ? 'text-amber-300' : 'text-amber-700'
                          : darkMode ? 'text-green-300' : 'text-green-700'
                      }`}>
                        {aplicaIVA ? '📊 Este producto aplica IVA' : '✅ Producto exento de IVA'}
                      </span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Cambiar
                      </span>
                      <input
                        type="checkbox"
                        checked={aplicaIVA}
                        onChange={(e) => setAplicaIVA(e.target.checked)}
                        className="w-4 h-4 rounded"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* 💰 SECCIÓN 1.5: MARGEN DE GANANCIA AUTOMÁTICO - NUEVO */}
            <div className={`p-6 rounded-2xl border-2 ${
              margenAutomaticoActivo
                ? darkMode 
                  ? 'bg-gradient-to-br from-emerald-500/10 to-green-500/10 border-emerald-500/30' 
                  : 'bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-200'
                : darkMode
                  ? 'bg-slate-800/50 border-slate-600'
                  : 'bg-gray-50 border-gray-200'
            }`}>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className={`w-5 h-5 ${margenAutomaticoActivo ? (darkMode ? 'text-emerald-400' : 'text-emerald-600') : (darkMode ? 'text-gray-500' : 'text-gray-400')}`} />
                <h3 className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Margen de Ganancia Automático
                </h3>
                <div className="ml-auto">
                  <button
                    type="button"
                    onClick={() => setMargenAutomaticoActivo(!margenAutomaticoActivo)}
                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                      margenAutomaticoActivo 
                        ? 'bg-emerald-600' 
                        : darkMode ? 'bg-slate-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        margenAutomaticoActivo ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <p className={`text-sm mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                {margenAutomaticoActivo 
                  ? '✅ El precio de venta se calculará automáticamente basado en el costo + tu margen de ganancia' 
                  : '⚪ Activa esta opción para calcular automáticamente el precio de venta'}
              </p>

              {margenAutomaticoActivo && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className={darkMode ? 'text-slate-300' : 'text-gray-700'}>
                      💰 Porcentaje de Ganancia (%)
                    </Label>
                    <div className="flex gap-2 items-center">
                      <Input
                        type="number"
                        value={porcentajeMargen}
                        onChange={(e) => setPorcentajeMargen(parseFloat(e.target.value) || 0)}
                        placeholder="30"
                        min="0"
                        max="1000"
                        step="1"
                        className={`flex-1 ${darkMode 
                          ? 'bg-slate-800 border-slate-600 text-white' 
                          : 'bg-white border-gray-300'
                        }`}
                      />
                      <span className={`text-2xl font-bold ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>%</span>
                    </div>
                    <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                      Ejemplo: Con {porcentajeMargen}% de margen, un costo de $1,000 = precio de venta de ${(1000 * (1 + porcentajeMargen / 100)).toLocaleString('es-CO')}
                    </p>
                  </div>

                  {/* Calculadora Visual */}
                  {costo && (
                    <div className={`p-4 rounded-xl border ${darkMode ? 'bg-emerald-900/20 border-emerald-700/30' : 'bg-emerald-50 border-emerald-200'}`}>
                      <h4 className={`text-xs font-bold mb-2 ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                        🧮 Cálculo Automático:
                      </h4>
                      <div className="space-y-1 text-sm font-mono">
                        <div className="flex justify-between">
                          <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Costo:</span>
                          <span className={darkMode ? 'text-white' : 'text-gray-900'}>${parseFloat(costo).toLocaleString('es-CO')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Margen ({porcentajeMargen}%):</span>
                          <span className={darkMode ? 'text-emerald-400' : 'text-emerald-600'}>
                            +${(parseFloat(costo) * (porcentajeMargen / 100)).toLocaleString('es-CO')}
                          </span>
                        </div>
                        <div className={`flex justify-between pt-2 border-t ${darkMode ? 'border-slate-600' : 'border-emerald-300'}`}>
                          <span className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Precio de Venta:</span>
                          <span className={`font-bold ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                            ${(parseFloat(costo) * (1 + porcentajeMargen / 100)).toLocaleString('es-CO')}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 📦 SECCIÓN 2: INFORMACIÓN BÁSICA */}
            <div className="grid grid-cols-2 gap-4">
              {/* Código de Barras */}
              <div className="space-y-2">
                <Label className={darkMode ? 'text-slate-300' : 'text-gray-700'}>
                  <Barcode className="w-4 h-4 inline mr-2" />
                  Código de Barras *
                </Label>
                <Input
                  type="text"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  placeholder="7702001001"
                  className={darkMode 
                    ? 'bg-slate-800/50 border-slate-600 text-white' 
                    : 'bg-white border-gray-300'
                  }
                  required
                />
              </div>

              {/* Nombre */}
              <div className="space-y-2">
                <Label className={darkMode ? 'text-slate-300' : 'text-gray-700'}>
                  <Package className="w-4 h-4 inline mr-2" />
                  Nombre del Producto *
                </Label>
                <Input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: Arroz Diana x 500g"
                  className={darkMode 
                    ? 'bg-slate-800/50 border-slate-600 text-white' 
                    : 'bg-white border-gray-300'
                  }
                  required
                />
              </div>

              {/* Stock */}
              <div className="space-y-2">
                <Label className={darkMode ? 'text-slate-300' : 'text-gray-700'}>
                  📦 Stock Actual *
                </Label>
                <Input
                  type="number"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  placeholder="150"
                  min="0"
                  className={darkMode 
                    ? 'bg-slate-800/50 border-slate-600 text-white' 
                    : 'bg-white border-gray-300'
                  }
                  required
                />
              </div>

              {/* Stock Mínimo */}
              <div className="space-y-2">
                <Label className={darkMode ? 'text-slate-300' : 'text-gray-700'}>
                  ⚠️ Stock Mínimo
                </Label>
                <Input
                  type="number"
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value)}
                  placeholder="10"
                  min="1"
                  className={darkMode 
                    ? 'bg-slate-800/50 border-slate-600 text-white' 
                    : 'bg-white border-gray-300'
                  }
                />
              </div>

              {/* Costo */}
              <div className="space-y-2">
                <Label className={darkMode ? 'text-slate-300' : 'text-gray-700'}>
                  <DollarSign className="w-4 h-4 inline mr-2" />
                  Precio de Costo *
                </Label>
                <Input
                  type="number"
                  value={costo}
                  onChange={(e) => setCosto(e.target.value)}
                  placeholder="2500"
                  min="0"
                  step="0.01"
                  className={darkMode 
                    ? 'bg-slate-800/50 border-slate-600 text-white' 
                    : 'bg-white border-gray-300'
                  }
                  required
                />
              </div>

              {/* Precio de Venta */}
              <div className="space-y-2">
                <Label className={darkMode ? 'text-slate-300' : 'text-gray-700'}>
                  <TrendingUp className="w-4 h-4 inline mr-2" />
                  Precio de Venta *
                </Label>
                <Input
                  type="number"
                  value={precio}
                  onChange={(e) => setPrecio(e.target.value)}
                  placeholder="3500"
                  min="0"
                  step="0.01"
                  disabled={margenAutomaticoActivo}
                  className={darkMode 
                    ? 'bg-slate-800/50 border-slate-600 text-white' 
                    : 'bg-white border-gray-300'
                  }
                  required
                />
                {costo && precio && !margenAutomaticoActivo && (
                  <p className={`text-xs ${
                    parseFloat(calcularMargen()) > 0 ? 'text-green-500' : 'text-red-500'
                  }`}>
                    Margen: {calcularMargen()}%
                  </p>
                )}
              </div>
            </div>

            {/* 🎨 SECCIÓN 3: ATRIBUTOS ESPECÍFICOS */}
            {atributos.length > 0 && (
              <div className={`p-6 rounded-2xl border-2 ${
                darkMode 
                  ? 'bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/30' 
                  : 'bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200'
              }`}>
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className={`w-5 h-5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                  <h3 className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Atributos Específicos de {TIPOS_NEGOCIO[tipoNegocio].nombre}
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {atributos.map(renderAtributoEspecifico)}
                </div>
              </div>
            )}

            {/* Botones */}
            <div className="flex gap-3 pt-6 border-t border-slate-700">
              <Button
                type="button"
                onClick={onClose}
                variant="outline"
                className="flex-1 rounded-2xl"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700"
              >
                {saving ? (
                  <>
                    <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-2" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Plus className="w-5 h-5 mr-2" />
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
