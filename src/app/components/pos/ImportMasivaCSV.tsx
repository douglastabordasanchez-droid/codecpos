/**
 * IMPORTACIÓN MASIVA CSV - CODEC POS v2.0
 * Sistema multi-negocio con plantillas dinámicas
 * VERSIÓN REFACTORIZADA - SIN ERRORES
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';
import {
  X, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2,
  Download, Info, Zap, ArrowRight, Check, FileCheck,
  ShoppingBag, ChevronDown, Palette, PartyPopper,
  Store, Shirt, Pill, Hammer, Pencil, ChefHat, Scissors,
  UtensilsCrossed, Wine, Laptop, Sparkles, PawPrint, Star, Trophy, BookOpen,
  type LucideIcon,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  Store, Shirt, Pill, Hammer, Pencil, ChefHat, Scissors,
  UtensilsCrossed, Wine, Laptop, Sparkles, PawPrint, Star, Trophy, BookOpen,
};
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { toast } from 'sonner';
import { usePOS } from '../../contexts/POSContext';
import { useBusinessContext } from '../../contexts/BusinessContext';
import { usePlanRestrictions } from '../../hooks/usePlanRestrictions';
import { TIPOS_NEGOCIO } from '../../../data/tipos-negocio';
import { descargarPlantillaExcelArtesGraficas } from '../../lib/supabase/artesGraficasService';
import { PLANTILLAS_PAPELERIA, descargarPlantillaPapeleria } from '../../lib/importers/papeleriaPinateriaTemplates';

/**
 * Artes Gráficas y Papelería y Piñatería son MÓDULOS (con sus propias
 * plantillas Excel multi-hoja, ya construidas en sus páginas dedicadas) —
 * no "tipos de negocio" con una plantilla CSV genérica como el resto de
 * este selector. Se listan aquí también, como pidió el dueño, para que
 * aparezcan a descargar desde el mismo lugar donde ya se gestiona todo el
 * inventario, pero la carga real (con chunking, progreso y tolerancia a
 * fallos) sigue viviendo en la página de cada módulo — duplicar ese motor
 * aquí sería repetir lógica ya probada, no ayudar al usuario.
 */
const MODULOS_CON_PLANTILLA_PROPIA = ['artes_graficas_modulo', 'papeleria_pinateria_modulo'] as const;
type ModuloConPlantillaPropia = typeof MODULOS_CON_PLANTILLA_PROPIA[number];

interface ImportMasivaCSVProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

// Plantillas CSV dinámicas por tipo de negocio
const PLANTILLAS_CSV: Record<string, { headers: string[]; ejemplos: string[][] }> = {
  minimercado: {
    headers: ['Código', 'Nombre', 'Stock', 'Costo', 'Precio', 'Categoría', 'MinStock', 'FechaVencimiento'],
    ejemplos: [
      ['7702001001', 'Arroz Diana x 500g', '150', '2500', '3500', 'Granos', '30', '2025-12-31'],
      ['7702002002', 'Leche Alquería x 1L', '120', '3800', '5200', 'Lácteos', '35', '2024-04-10'],
      ['7702003003', 'Aceite Premier x 900ml', '80', '8500', '12000', 'Aceites', '20', '2025-06-30'],
    ]
  },
  ropa: {
    headers: ['Código', 'Nombre', 'Stock', 'Costo', 'Precio', 'Categoría', 'MinStock', 'Talla', 'Color'],
    ejemplos: [
      ['CAM001', 'Camisa Casual Hombre', '25', '35000', '65000', 'Camisas', '5', 'M', 'Azul'],
      ['PAN002', 'Pantalón Jean Dama', '30', '45000', '85000', 'Pantalones', '8', 'L', 'Negro'],
      ['VES003', 'Vestido Casual', '15', '55000', '110000', 'Vestidos', '3', 'S', 'Rojo'],
    ]
  },
  drogueria: {
    headers: ['Código', 'Nombre', 'Stock', 'Costo', 'Precio', 'Categoría', 'MinStock', 'FechaVencimiento'],
    ejemplos: [
      ['MED001', 'Acetaminofén 500mg x 20 Tab', '200', '3500', '7000', 'Analgésicos', '50', '2026-08-15'],
      ['MED002', 'Ibuprofeno 400mg x 30 Tab', '150', '4200', '8500', 'Antiinflamatorios', '40', '2026-05-20'],
      ['VIT001', 'Vitamina C 1000mg x 30 Cap', '100', '12000', '22000', 'Vitaminas', '30', '2027-01-10'],
    ]

  },
  ferreteria: {
    headers: ['Código', 'Nombre', 'Stock', 'Costo', 'Precio', 'Categoría', 'MinStock', 'Marca'],
    ejemplos: [
      ['HER001', 'Martillo Carpintero', '35', '18000', '32000', 'Herramientas', '10', 'Stanley'],
      ['TOR001', 'Tornillos Acero 3/4', '500', '150', '400', 'Tornillería', '100', 'Truper'],
      ['PIN001', 'Pintura Blanca 1Gal', '40', '35000', '65000', 'Pinturas', '12', 'Pintuco'],
    ]
  },
  veterinaria: {
    headers: [
      'Código', 'Nombre', 'Stock', 'Costo', 'Precio', 'Categoría', 'MinStock', 'FechaVencimiento',
      'TipoProducto', 'EsBulto', 'PesoBultoKg', 'PrecioPorKilo', 'RendimientoRaciones', 'Lote', 'Especie', 'RequiereReceta',
    ],
    ejemplos: [
      ['ALI001', 'Concentrado Perro Adulto', '20', '95000', '145000', 'Alimentos para Perros', '5', '', 'Granel-Alimento', 'SI', '25', '6200', '80', '', 'Perro', 'NO'],
      ['MED010', 'Ivermectina Inyectable 50ml', '15', '18000', '32000', 'Medicamentos Veterinarios', '5', '2027-03-15', 'Físico', 'NO', '', '', '', 'L4521', 'Generales', 'SI'],
      ['SRV001', 'Consulta General', '999', '0', '45000', 'Otros Animales', '0', '', 'Servicio', 'NO', '', '', '', '', 'Generales', 'NO'],
    ]
  },
};

export function ImportMasivaCSV({ isOpen, onClose, onImportComplete }: ImportMasivaCSVProps) {
  const navigate = useNavigate();
  const { darkMode } = usePOS();
  const { tipoNegocio: tipoNegocioGlobal } = useBusinessContext();
  const { planInfo } = usePlanRestrictions();

  // Estados
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<any[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [validRows, setValidRows] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState('');
  const [selectedTipoNegocio, setSelectedTipoNegocio] = useState(tipoNegocioGlobal);
  const [showPlantillas, setShowPlantillas] = useState(true);
  const [productosParsed, setProductosParsed] = useState<any[]>([]);

  /**
   * PARSEO DE CSV - ROBUSTO Y SIN ERRORES
   */
  const parseCSV = (text: string): any[] => {
    try {
      console.log('🔍 Iniciando parseo de CSV...');
      
      // Detectar delimitador automáticamente
      const delimiter = text.includes(';') ? ';' : text.includes('\t') ? '\t' : ',';
      console.log('📋 Delimitador detectado:', delimiter === ';' ? 'punto y coma' : delimiter === '\t' ? 'tab' : 'coma');
      
      // Dividir en líneas y limpiar
      const lines = text.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      if (lines.length < 2) {
        toast.error('El archivo CSV está vacío o no tiene datos');
        return [];
      }

      console.log(`📊 Total de líneas: ${lines.length}`);

      // Parsear headers
      const headerLine = lines[0];
      const headers = headerLine.split(delimiter).map(h => h.trim().replace(/["']/g, ''));
      console.log('📋 Headers detectados:', headers);

      // Mapeo de nombres de columnas (flexible)
      const headerMap: Record<string, number> = {};
      headers.forEach((header, index) => {
        const normalized = header.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        
        if (normalized.includes('codigo') || normalized.includes('code')) headerMap.codigo = index;
        // 🛡️ FIX: "TipoProducto" contiene "producto" y "PrecioPorKilo" contiene
        // "precio" -- sin el `&& !normalized.includes(...)` estas dos columnas
        // nuevas de Veterinaria pisaban headerMap.nombre/headerMap.precio (la
        // última columna que hace match gana, y ambas vienen DESPUÉS de
        // Nombre/Precio en esa plantilla), rompiendo el import completo.
        if ((normalized.includes('nombre') || normalized.includes('name') || normalized.includes('producto')) && !normalized.includes('tipo')) headerMap.nombre = index;
        if (normalized.includes('stock') || normalized.includes('cantidad') || normalized.includes('inventario')) headerMap.stock = index;
        if (normalized.includes('costo') || normalized.includes('cost')) headerMap.costo = index;
        if ((normalized.includes('precio') || normalized.includes('price') || normalized.includes('valor')) && !normalized.includes('porkilo') && !normalized.includes('porgramo')) headerMap.precio = index;
        if (normalized.includes('categoria') || normalized.includes('category')) headerMap.categoria = index;
        if (normalized.includes('minstock') || normalized.includes('min') || normalized.includes('minimo')) headerMap.minStock = index;
        if (normalized.includes('vencimiento') || normalized.includes('expira') || normalized.includes('expiry')) headerMap.fechaVencimiento = index;
        // 🐾 Veterinaria / Pet Shop
        if (normalized.includes('tipoproducto')) headerMap.tipoProducto = index;
        if (normalized.includes('esbulto')) headerMap.esBulto = index;
        if (normalized.includes('pesobulto')) headerMap.pesoBultoKg = index;
        if (normalized.includes('porkilo') || normalized.includes('porgramo')) headerMap.precioPorKilo = index;
        if (normalized.includes('rendimiento') || normalized.includes('raciones')) headerMap.rendimientoRaciones = index;
        if (normalized.includes('lote')) headerMap.lote = index;
        if (normalized.includes('especie')) headerMap.especie = index;
        if (normalized.includes('receta')) headerMap.requiereReceta = index;
      });

      console.log('📊 Índices de columnas:', headerMap);

      // Validar columnas obligatorias
      if (headerMap.codigo === undefined || headerMap.nombre === undefined || headerMap.precio === undefined) {
        toast.error('❌ El CSV debe tener las columnas: Código, Nombre y Precio');
        console.error('Columnas faltantes. Headers encontrados:', headers);
        return [];
      }

      // Parsear productos
      const productos: any[] = [];
      const parseErrors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        try {
          const line = lines[i];
          if (!line || line.trim() === '') continue;

          // Parsear valores
          const values = line.split(delimiter).map(v => v.trim().replace(/["']/g, ''));

          // Extraer datos con validación
          const codigo = values[headerMap.codigo]?.trim();
          const nombre = values[headerMap.nombre]?.trim();
          const precioStr = values[headerMap.precio]?.trim();

          // Validaciones básicas
          if (!codigo || !nombre || !precioStr) {
            parseErrors.push(`Fila ${i + 1}: Faltan datos obligatorios (Código, Nombre o Precio)`);
            continue;
          }

          // Parsear números de forma segura
          const precio = parseFloat(precioStr.replace(/[,$]/g, '')) || 0;
          if (precio <= 0) {
            parseErrors.push(`Fila ${i + 1}: Precio inválido (${precioStr})`);
            continue;
          }

          const stock = headerMap.stock !== undefined 
            ? parseInt(values[headerMap.stock]?.replace(/[,$]/g, '') || '0') 
            : 0;

          const costo = headerMap.costo !== undefined
            ? parseFloat(values[headerMap.costo]?.replace(/[,$]/g, '') || '0')
            : Math.round(precio * 0.65); // 65% del precio si no hay costo

          const minStock = headerMap.minStock !== undefined
            ? parseInt(values[headerMap.minStock]?.replace(/[,$]/g, '') || '10')
            : 10;

          const categoria = headerMap.categoria !== undefined
            ? values[headerMap.categoria]?.trim() || 'General'
            : 'General';

          const fechaVencimiento = headerMap.fechaVencimiento !== undefined
            ? values[headerMap.fechaVencimiento]?.trim() || undefined
            : undefined;

          // 🐾 Veterinaria / Pet Shop — solo se llenan si la plantilla trae esas
          // columnas (headerMap.* queda undefined para el resto de negocios).
          const esSiNo = (v: string | undefined) => /^(si|sí|s|yes|y|true|1)$/i.test((v || '').trim());
          const tipoProductoRaw = headerMap.tipoProducto !== undefined ? values[headerMap.tipoProducto]?.trim().toLowerCase() : undefined;
          const tipoProducto = tipoProductoRaw?.includes('granel') ? 'granel' as const
            : tipoProductoRaw?.includes('servicio') ? 'servicio' as const
            : tipoProductoRaw ? 'fisico' as const
            : undefined;
          const esBulto = headerMap.esBulto !== undefined ? esSiNo(values[headerMap.esBulto]) : undefined;
          const pesoBultoKg = headerMap.pesoBultoKg !== undefined && values[headerMap.pesoBultoKg]?.trim()
            ? parseFloat(values[headerMap.pesoBultoKg].replace(',', '.')) : undefined;
          const precioPorKilo = headerMap.precioPorKilo !== undefined && values[headerMap.precioPorKilo]?.trim()
            ? parseFloat(values[headerMap.precioPorKilo].replace(/[,$]/g, '')) : undefined;
          const rendimientoRaciones = headerMap.rendimientoRaciones !== undefined && values[headerMap.rendimientoRaciones]?.trim()
            ? parseFloat(values[headerMap.rendimientoRaciones].replace(',', '.')) : undefined;
          const lote = headerMap.lote !== undefined ? values[headerMap.lote]?.trim() || undefined : undefined;
          const especieRaw = headerMap.especie !== undefined ? values[headerMap.especie]?.trim().toLowerCase() : undefined;
          const especie = especieRaw?.includes('perro') ? 'perro' as const
            : especieRaw?.includes('gato') ? 'gato' as const
            : especieRaw?.includes('ave') ? 'aves' as const
            : especieRaw ? 'generales' as const
            : undefined;
          const requiereReceta = headerMap.requiereReceta !== undefined ? esSiNo(values[headerMap.requiereReceta]) : undefined;

          // 🐾 Un producto "Granel-Alimento" se conecta al mecanismo de venta
          // por peso QUE YA EXISTE en el POS (producto.pesable, ver
          // POSPageNew.tsx) -- ese mecanismo interpreta `precio` como precio
          // POR KILO directamente, así que para un bulto se usa PrecioPorKilo
          // como el precio real del producto, no el de la columna Precio
          // (pensada para el precio del bulto cerrado completo, informativo).
          const esGranel = tipoProducto === 'granel';
          const precioFinal = esGranel && precioPorKilo ? precioPorKilo : precio;

          // Crear producto
          const producto = {
            id: `${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
            codigo,
            nombre,
            precio: precioFinal,
            stock,
            costo,
            minStock,
            ...(esGranel && { pesable: true }),
            categoria,
            fechaVencimiento,
            tipoNegocio: tipoNegocioGlobal,
            ...(tipoProducto !== undefined && { tipoProducto }),
            ...(esBulto !== undefined && { esBulto }),
            ...(pesoBultoKg !== undefined && { pesoBultoKg }),
            ...(precioPorKilo !== undefined && { precioPorKilo }),
            ...(rendimientoRaciones !== undefined && { rendimientoRaciones }),
            ...(lote !== undefined && { lote }),
            ...(especie !== undefined && { especie }),
            ...(requiereReceta !== undefined && { requiereReceta }),
          };

          productos.push(producto);
        } catch (error) {
          console.error(`Error en fila ${i + 1}:`, error);
          parseErrors.push(`Fila ${i + 1}: Error al procesar`);
        }
      }

      console.log(`✅ ${productos.length} productos válidos de ${lines.length - 1} filas`);
      setErrors(parseErrors);
      
      if (parseErrors.length > 0) {
        console.warn('⚠️ Errores de parseo:', parseErrors);
      }

      return productos;
    } catch (error) {
      console.error('❌ Error crítico en parseCSV:', error);
      toast.error('Error al procesar el archivo CSV');
      return [];
    }
  };

  /**
   * MANEJO DE ARCHIVO - ROBUSTO
   */
  const handleFileSelect = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      toast.error('Solo se permiten archivos CSV (.csv)');
      return;
    }

    console.log('📁 Archivo seleccionado:', file.name, '- Tamaño:', file.size, 'bytes');
    
    setFileName(file.name);
    setUploading(true);
    setShowPlantillas(false);

    try {
      console.log('📖 Leyendo archivo...');
      const text = await file.text();
      console.log('✅ Archivo leído:', text.length, 'caracteres');
      
      const productos = parseCSV(text);

      if (productos.length === 0) {
        toast.error('No se encontraron productos válidos en el archivo');
        setUploading(false);
        return;
      }

      // Verificar límite del plan
      const productosActuales = JSON.parse(localStorage.getItem('pos-productos') || '[]');
      const totalDespues = productosActuales.length + productos.length;

      if (totalDespues > planInfo.maxProductos) {
        toast.error(`🚫 Límite de plan excedido`, {
          description: `Máximo: ${planInfo.maxProductos} | Actuales: ${productosActuales.length} | A importar: ${productos.length} | Total: ${totalDespues}`,
          duration: 8000,
        });
        setUploading(false);
        return;
      }

      // Guardar en estado
      setTotalRows(productos.length);
      setValidRows(productos.length);
      setPreview(productos.slice(0, 10));
      setProductosParsed(productos);

      toast.success(`✅ ${productos.length} productos listos para importar`, {
        description: errors.length > 0 ? `${errors.length} filas con errores fueron omitidas` : 'Todos los productos son válidos',
        duration: 3000,
      });
    } catch (error) {
      console.error('❌ Error al leer archivo:', error);
      toast.error('Error al leer el archivo');
    } finally {
      setUploading(false);
    }
  };

  /**
   * IMPORTACIÓN - ROBUSTO Y CON CHUNKS
   */
  const handleImport = async () => {
    if (productosParsed.length === 0) {
      toast.error('No hay productos para importar');
      return;
    }

    setUploading(true);

    try {
      console.log(`🚀 Iniciando importación de ${productosParsed.length} productos...`);
      
      // Leer productos actuales
      const productosLocal = localStorage.getItem('pos-productos');
      const productosActuales = productosLocal ? JSON.parse(productosLocal) : [];
      console.log(`📦 Productos actuales: ${productosActuales.length}`);

      // Filtrar duplicados por código
      const codigosExistentes = new Set(productosActuales.map((p: any) => p.codigo));
      const productosFiltrados = productosParsed.filter(p => !codigosExistentes.has(p.codigo));
      
      console.log(`📊 Productos nuevos (sin duplicados): ${productosFiltrados.length}`);

      if (productosFiltrados.length === 0) {
        toast.warning('⚠️ Todos los productos ya existen en el inventario', {
          description: `Se omitieron ${productosParsed.length} productos duplicados`,
          duration: 5000,
        });
        setUploading(false);
        return;
      }

      // Importar en chunks de 1000
      const CHUNK_SIZE = 1000;
      let importados = 0;

      for (let i = 0; i < productosFiltrados.length; i += CHUNK_SIZE) {
        const chunk = productosFiltrados.slice(i, i + CHUNK_SIZE);
        productosActuales.push(...chunk);
        importados += chunk.length;

        localStorage.setItem('pos-productos', JSON.stringify(productosActuales));
        console.log(`💾 Chunk guardado: ${importados}/${productosFiltrados.length}`);

        await new Promise(resolve => setTimeout(resolve, 10));

        toast.loading(`Importando... ${importados}/${productosFiltrados.length} productos`, {
          id: 'import-progress',
        });
      }

      toast.success(`✅ ${importados} productos importados exitosamente`, {
        id: 'import-progress',
        duration: 5000,
      });

      console.log('✅ Importación completada');
      
      // Limpiar estado
      setPreview([]);
      setTotalRows(0);
      setValidRows(0);
      setErrors([]);
      setFileName('');
      setProductosParsed([]);
      setShowPlantillas(true);
      
      onImportComplete();
      onClose();
    } catch (error) {
      console.error('❌ Error al importar:', error);
      toast.error('Error al importar productos', {
        id: 'import-progress',
        description: error instanceof Error ? error.message : 'Error desconocido',
      });
    } finally {
      setUploading(false);
    }
  };

  /**
   * DESCARGAR PLANTILLA
   */
  const descargarPlantilla = (tipo: string = selectedTipoNegocio) => {
    const plantilla = PLANTILLAS_CSV[tipo] || PLANTILLAS_CSV.minimercado;
    
    // Crear CSV con punto y coma
    let csv = plantilla.headers.join(';') + '\n';
    plantilla.ejemplos.forEach(fila => {
      csv += fila.join(';') + '\n';
    });

    // Crear archivo con BOM para Excel
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plantilla_${tipo}_codecpos.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast.success(`📥 Plantilla descargada: ${tipo}`, {
      description: 'Ábrela en Excel y agrega tus productos',
    });
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      handleFileSelect(e.target.files[0]);
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
          className={`max-w-5xl w-full max-h-[90vh] overflow-y-auto rounded-3xl ${
            darkMode ? 'bg-slate-900 border-2 border-slate-700' : 'bg-white'
          } shadow-2xl`}
        >
          {/* Header */}
          <div className={`sticky top-0 z-10 p-6 border-b ${
            darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center">
                  <FileSpreadsheet className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Importación Masiva de Productos
                  </h2>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Importa miles de productos desde Excel/CSV
                  </p>
                </div>
              </div>
              <Button
                onClick={onClose}
                variant="ghost"
                size="sm"
                className="rounded-full"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Selector de tipo de negocio */}
            {showPlantillas && (
              <Card className={`p-6 ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-blue-50 border-blue-200'}`}>
                <div className="flex items-start gap-3 mb-4">
                  <Info className="w-5 h-5 text-blue-500 mt-0.5" />
                  <div>
                    <h3 className={`font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      Selecciona tu tipo de negocio
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {Object.entries(TIPOS_NEGOCIO).map(([key, tipo]) => (
                        <button
                          key={key}
                          onClick={() => setSelectedTipoNegocio(key)}
                          className={`p-3 rounded-xl text-left transition-all ${
                            selectedTipoNegocio === key
                              ? 'bg-purple-500 text-white shadow-lg scale-105'
                              : darkMode
                              ? 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                              : 'bg-white text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          {(() => { const Icon = ICON_MAP[tipo.icono] ?? Store; return <Icon className="w-6 h-6 mb-1" />; })()}
                          <div className="text-xs font-semibold">{tipo.nombre}</div>
                        </button>
                      ))}
                      <button
                        onClick={() => setSelectedTipoNegocio('artes_graficas_modulo')}
                        className={`p-3 rounded-xl text-left transition-all ${
                          selectedTipoNegocio === 'artes_graficas_modulo'
                            ? 'bg-fuchsia-500 text-white shadow-lg scale-105'
                            : darkMode ? 'bg-slate-700 text-gray-300 hover:bg-slate-600' : 'bg-white text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <Palette className="w-6 h-6 mb-1" />
                        <div className="text-xs font-semibold">Artes Gráficas</div>
                      </button>
                      <button
                        onClick={() => setSelectedTipoNegocio('papeleria_pinateria_modulo')}
                        className={`p-3 rounded-xl text-left transition-all ${
                          selectedTipoNegocio === 'papeleria_pinateria_modulo'
                            ? 'bg-rose-500 text-white shadow-lg scale-105'
                            : darkMode ? 'bg-slate-700 text-gray-300 hover:bg-slate-600' : 'bg-white text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <PartyPopper className="w-6 h-6 mb-1" />
                        <div className="text-xs font-semibold">Papelería y Piñatería</div>
                      </button>
                    </div>
                  </div>
                </div>

                {(MODULOS_CON_PLANTILLA_PROPIA as readonly string[]).includes(selectedTipoNegocio) ? (
                  <div className="space-y-2">
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Este módulo tiene su propio catálogo con atributos especiales — descarga la(s) plantilla(s) aquí,
                      pero súbela desde su página dedicada (tiene barra de progreso y tolera archivos grandes).
                    </p>
                    {selectedTipoNegocio === 'artes_graficas_modulo' ? (
                      <Button onClick={() => descargarPlantillaExcelArtesGraficas()} className="w-full bg-gradient-to-r from-fuchsia-500 to-pink-600 rounded-xl">
                        <Download className="w-5 h-5 mr-2" /> Descargar Plantilla Artes Gráficas
                      </Button>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {PLANTILLAS_PAPELERIA.map((p) => (
                          <Button key={p.tipo} variant="outline" size="sm" onClick={() => descargarPlantillaPapeleria(p.tipo)} className="justify-start">
                            <Download className="w-4 h-4 mr-2 shrink-0" /> <span className="truncate">{p.titulo}</span>
                          </Button>
                        ))}
                      </div>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => { onClose(); navigate(selectedTipoNegocio === 'artes_graficas_modulo' ? '/artes-graficas' : '/papeleria-pinateria'); }}
                      className="w-full rounded-xl"
                    >
                      <ArrowRight className="w-4 h-4 mr-2" /> Ir al módulo para subir el archivo
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={() => descargarPlantilla(selectedTipoNegocio)}
                    className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 rounded-xl"
                  >
                    <Download className="w-5 h-5 mr-2" />
                    Descargar Plantilla {TIPOS_NEGOCIO[selectedTipoNegocio]?.nombre || 'Minimercado'}
                  </Button>
                )}
              </Card>
            )}

            {/* Zona de carga de archivos — oculta para los módulos con su propio motor de carga (ver arriba) */}
            {!(MODULOS_CON_PLANTILLA_PROPIA as readonly string[]).includes(selectedTipoNegocio) && (
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-3xl p-12 text-center transition-all ${
                  dragActive
                    ? 'border-purple-500 bg-purple-500/10 scale-105'
                    : darkMode
                    ? 'border-slate-600 bg-slate-800/30 hover:border-purple-500/50'
                    : 'border-gray-300 bg-gray-50 hover:border-purple-500/50'
                }`}
              >
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleInputChange}
                  className="hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <Upload className={`w-16 h-16 mx-auto mb-4 ${
                    dragActive ? 'text-purple-500' : darkMode ? 'text-gray-600' : 'text-gray-400'
                  }`} />
                  <p className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {fileName || 'Arrastra tu archivo CSV aquí'}
                  </p>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    o haz clic para seleccionar
                  </p>
                </label>
              </div>
            )}

            {/* Preview de productos */}
            {preview.length > 0 && (
              <Card className={`p-6 ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <FileCheck className="w-5 h-5 text-emerald-500" />
                    <h3 className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      Vista Previa ({preview.length} de {totalRows} productos)
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-emerald-500/20 text-emerald-500 rounded-full text-sm font-semibold">
                      {validRows} válidos
                    </span>
                    {errors.length > 0 && (
                      <span className="px-3 py-1 bg-red-500/20 text-red-500 rounded-full text-sm font-semibold">
                        {errors.length} errores
                      </span>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={darkMode ? 'bg-slate-700' : 'bg-gray-100'}>
                        <th className="px-4 py-2 text-left">Código</th>
                        <th className="px-4 py-2 text-left">Nombre</th>
                        <th className="px-4 py-2 text-right">Stock</th>
                        <th className="px-4 py-2 text-right">Precio</th>
                        <th className="px-4 py-2 text-left">Categoría</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((producto, index) => (
                        <tr
                          key={index}
                          className={darkMode ? 'border-b border-slate-700' : 'border-b border-gray-200'}
                        >
                          <td className="px-4 py-2 font-mono text-xs">{producto.codigo}</td>
                          <td className="px-4 py-2">{producto.nombre}</td>
                          <td className="px-4 py-2 text-right">{producto.stock}</td>
                          <td className="px-4 py-2 text-right font-semibold text-emerald-500">
                            ${producto.precio.toLocaleString('es-CO')}
                          </td>
                          <td className="px-4 py-2">
                            <span className="px-2 py-1 bg-blue-500/20 text-blue-500 rounded-full text-xs">
                              {producto.categoria}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Errores */}
            {errors.length > 0 && (
              <Card className={`p-4 ${darkMode ? 'bg-red-500/10 border-red-500/50' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-red-500 mb-2">
                      {errors.length} filas con errores (omitidas)
                    </h4>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {errors.slice(0, 5).map((error, index) => (
                        <p key={index} className="text-sm text-red-600">• {error}</p>
                      ))}
                      {errors.length > 5 && (
                        <p className="text-sm text-red-600">... y {errors.length - 5} más</p>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Botones de acción */}
            <div className="flex gap-3 pt-4">
              <Button
                onClick={onClose}
                variant="outline"
                className="flex-1 h-12 rounded-xl"
                disabled={uploading}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleImport}
                disabled={preview.length === 0 || uploading}
                className="flex-1 h-12 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5 mr-2" />
                    Importar {productosParsed.length} productos
                  </>
                )}
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
