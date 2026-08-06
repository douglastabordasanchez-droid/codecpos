import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Download,
  ArrowRight,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { usePOS } from '../../contexts/POSContext';
import { toast } from 'sonner';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
}

type Step = 1 | 2 | 3;

export function ImportModal({ isOpen, onClose, onImportSuccess }: ImportModalProps) {
  const { darkMode } = usePOS();
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  const resetModal = () => {
    setStep(1);
    setFile(null);
    setValidationErrors([]);
    setImporting(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== 'text/csv' && !selectedFile.name.endsWith('.csv')) {
        toast.error('Solo se permiten archivos CSV');
        return;
      }
      setFile(selectedFile);
      validateFile(selectedFile);
    }
  };

  const validateFile = async (file: File) => {
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    const errors: string[] = [];

    if (lines.length < 2) {
      errors.push('El archivo debe contener al menos una fila de datos');
    }

    const header = lines[0].toLowerCase();
    // ✅ COLUMNAS REQUERIDAS ACTUALIZADAS con Tipo de Negocio
    const requiredColumns = ['código', 'nombre', 'stock', 'costo', 'precio', 'categoría'];
    
    requiredColumns.forEach(col => {
      if (!header.includes(col)) {
        errors.push(`Falta la columna requerida: ${col}`);
      }
    });

    // Detectar separador (punto y coma o coma)
    const separator = lines[0].includes(';') ? ';' : ',';

    // Validar datos de muestra
    if (lines.length > 1) {
      const sampleLine = lines[1].split(separator);
      if (sampleLine.length < 6) {
        errors.push('Las filas deben tener al menos 6 columnas (Código, Nombre, Stock, Costo, Precio, Categoría)');
      }
    }

    setValidationErrors(errors);
    
    if (errors.length === 0) {
      toast.success('✅ Archivo válido. Listo para importar.');
      setStep(3);
    } else {
      toast.error(`⚠️ Se encontraron ${errors.length} errores de validación`);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setImporting(true);
    
    try {
      console.log('📂 Procesando archivo de importación...');
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      const productos = [];

      // Detectar separador (punto y coma o coma)
      const separator = lines[0].includes(';') ? ';' : ',';
      console.log(`🔍 Separador detectado: "${separator}"`);
      console.log(`📊 Líneas encontradas: ${lines.length - 1} productos`);

      for (let i = 1; i < lines.length; i++) {
        const [codigo, nombre, stock, costo, precio, categoria, minStock, fechaVencimiento] = 
          lines[i].split(separator).map(v => v.trim());
        
        // Generar ID único para cada producto
        const id = `prod-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`;
        
        productos.push({
          id,
          codigo,
          nombre,
          stock: parseInt(stock) || 0,
          costo: parseFloat(costo) || 0,
          precio: parseFloat(precio) || 0,
          categoria: categoria || 'Sin categoría',
          minStock: parseInt(minStock) || 10,
          fechaVencimiento: fechaVencimiento || undefined,
        });
      }

      console.log(`✅ ${productos.length} productos procesados correctamente`);
      
      // Guardar en localStorage (sin límite)
      localStorage.setItem('pos-productos', JSON.stringify(productos));
      console.log('💾 Productos guardados en localStorage');
      console.log(`📦 Capacidad: ${productos.length} productos importados`);
      
      toast.success(`✅ ${productos.length} productos importados exitosamente`, {
        description: 'Los productos están ahora disponibles en el inventario',
        duration: 5000,
      });
      
      resetModal();
      onImportSuccess();
      onClose();
    } catch (error) {
      console.error('❌ Error procesando el archivo:', error);
      toast.error('Error procesando el archivo. Verifica el formato.');
    } finally {
      setImporting(false);
    }
  };

  const descargarPlantilla = () => {
    // Plantilla mejorada con productos colombianos reales - usando PUNTO Y COMA para Excel en español
    const csv = `Código;Nombre;Stock;Costo;Precio;Categoría;MinStock;FechaVencimiento
7702001001;Arroz Diana x 500g;150;2500;3500;Granos;30;2025-12-31
7702002002;Aceite Girasol Premier x 900ml;80;8500;12000;Aceites;20;2025-06-30
7702003003;Azúcar Incauca x 1kg;200;3200;4500;Endulzantes;40;2026-01-15
7702004004;Café Águila Roja x 250g;60;9500;13500;Bebidas;15;2025-08-20
7702005005;Leche Alquería Deslactosada x 1L;120;3800;5200;Lácteos;35;2024-04-10
7702006006;Huevos AA x 30 unidades;90;12000;16500;Huevos;25;2024-03-25
7702007007;Panela Doña Panela x 500g;110;2800;4000;Endulzantes;30;2026-06-15
7702008008;Sal Refisal x 500g;180;1200;1800;Condimentos;45;2027-12-31
7702009009;Atún Van Camps en aceite x 170g;95;4500;6500;Enlatados;20;2026-09-30
7702010010;Pasta Doria Caracol x 500g;140;2200;3200;Pastas;35;2025-11-20
7702011011;Chocolate Corona x 250g;70;6500;9000;Bebidas;15;2025-07-15
7702012012;Avena Quaker Hojuelas x 500g;100;5200;7500;Cereales;25;2025-10-30
7702013013;Salsa de Tomate Fruco x 200g;130;2800;4200;Salsas;30;2025-05-25
7702014014;Mayonesa Fruco x 445g;85;5500;8000;Salsas;20;2025-04-20
7702015015;Pan Tajado Bimbo x 450g;75;4200;6000;Panadería;18;2024-03-15
7702016016;Salchichas Zenú x 500g;65;8500;12000;Embutidos;15;2024-04-05
7702017017;Jamón Pietran x 250g;55;11000;15500;Embutidos;12;2024-03-30
7702018018;Queso Campesino Alpina x 500g;45;13500;18000;Lácteos;10;2024-04-08
7702019019;Yogurt Alpina Yox Fresa x 1L;90;5800;8500;Lácteos;22;2024-03-28
7702020020;Agua Brisa x 600ml;250;1200;2000;Bebidas;60;2026-12-31`;
    
    // Crear blob con codificación UTF-8 y BOM para compatibilidad perfecta con Excel
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_productos_pos_colombia.csv';
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Plantilla descargada - Ábrela con Excel');
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
          className={`max-w-3xl w-full rounded-3xl p-8 ${
            darkMode ? 'bg-slate-900 border-2 border-slate-700' : 'bg-white'
          } max-h-[90vh] overflow-y-auto`}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center">
                <FileSpreadsheet className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Importar Productos
                </h2>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Carga masiva desde archivo CSV
                </p>
              </div>
            </div>
            <Button
              onClick={() => {
                resetModal();
                onClose();
              }}
              size="icon"
              variant="ghost"
              className="rounded-xl"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-between mb-8">
            {[1, 2, 3].map((s, index) => (
              <div key={s} className="flex items-center flex-1">
                <div className="flex items-center flex-col">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg transition-all ${
                    step >= s
                      ? 'bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/30'
                      : darkMode
                        ? 'bg-slate-800 text-gray-500'
                        : 'bg-gray-200 text-gray-400'
                  }`}>
                    {s}
                  </div>
                  <p className={`text-xs mt-2 font-semibold ${
                    step >= s
                      ? darkMode ? 'text-purple-400' : 'text-purple-600'
                      : darkMode ? 'text-gray-600' : 'text-gray-400'
                  }`}>
                    {s === 1 ? 'Descarga' : s === 2 ? 'Preparación' : 'Carga'}
                  </p>
                </div>
                
                {index < 2 && (
                  <div className={`flex-1 h-1 mx-4 rounded-full ${
                    step > s
                      ? 'bg-gradient-to-r from-purple-500 to-purple-600'
                      : darkMode ? 'bg-slate-800' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>

          {/* Step Content */}
          <div className="space-y-6">
            {/* Step 1: Descarga */}
            {step === 1 && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <Card className={`border-2 ${
                  darkMode 
                    ? 'bg-slate-800/50 border-slate-700' 
                    : 'bg-gray-50 border-gray-200'
                } rounded-2xl`}>
                  <CardContent className="p-6">
                    <div className="text-center">
                      <Download className={`w-16 h-16 mx-auto mb-4 ${
                        darkMode ? 'text-purple-400' : 'text-purple-600'
                      }`} />
                      <h3 className={`text-xl font-bold mb-2 ${
                        darkMode ? 'text-white' : 'text-gray-900'
                      }`}>
                        Descarga la Plantilla
                      </h3>
                      <p className={`mb-6 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Utiliza nuestra plantilla CSV con el formato correcto
                      </p>
                      
                      <Button
                        onClick={descargarPlantilla}
                        className="rounded-2xl bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
                      >
                        <Download className="w-5 h-5 mr-2" />
                        Descargar Plantilla CSV
                      </Button>
                    </div>

                    <div className={`mt-6 p-4 rounded-2xl ${
                      darkMode ? 'bg-slate-700/50' : 'bg-white border border-gray-200'
                    }`}>
                      <p className={`text-sm font-semibold mb-2 ${
                        darkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        📋 Columnas requeridas:
                      </p>
                      <ul className={`text-sm space-y-1 ${
                        darkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        <li>• <strong>Código:</strong> Código único del producto (ej: PROD001 o 7702001001)</li>
                        <li>• <strong>Nombre:</strong> Nombre completo del producto (ej: Producto Premium x Unidad)</li>
                        <li>• <strong>Stock:</strong> Cantidad disponible en números enteros (ej: 150)</li>
                        <li>• <strong>Costo:</strong> Precio de compra SIN puntos ni comas (ej: 2500)</li>
                        <li>• <strong>Precio:</strong> Precio de venta SIN puntos ni comas (ej: 3500)</li>
                        <li>• <strong>Categoría:</strong> Categoría del producto según tu negocio</li>
                        <li>• <strong>MinStock:</strong> Stock mínimo antes de alerta (ej: 30)</li>
                        <li>• <strong>FechaVencimiento:</strong> Formato YYYY-MM-DD (ej: 2025-12-31 o dejar vacío)</li>
                      </ul>
                    </div>

                    <div className={`mt-4 p-4 rounded-2xl border-2 ${
                      darkMode 
                        ? 'bg-emerald-500/10 border-emerald-500/50' 
                        : 'bg-emerald-50 border-emerald-200'
                    }`}>
                      <p className={`text-sm font-semibold mb-2 ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
                        ✅ La plantilla incluye 20 productos colombianos reales listos para usar
                      </p>
                      <p className={`text-xs ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                        Puedes modificarlos, eliminarlos o agregar los tuyos siguiendo el mismo formato
                      </p>
                    </div>

                    <div className={`mt-4 p-4 rounded-2xl border-2 ${
                      darkMode 
                        ? 'bg-blue-500/10 border-blue-500/50' 
                        : 'bg-blue-50 border-blue-200'
                    }`}>
                      <p className={`text-sm font-semibold ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                        💾 Capacidad: Hasta 5000 productos
                      </p>
                      <p className={`text-xs mt-1 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                        El sistema puede manejar archivos grandes sin problema (1000+ referencias)
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end mt-6">
                  <Button
                    onClick={() => setStep(2)}
                    className="rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700"
                  >
                    Siguiente: Preparar Archivo
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 2: Preparación */}
            {step === 2 && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <Card className={`border-2 ${
                  darkMode 
                    ? 'bg-slate-800/50 border-slate-700' 
                    : 'bg-gray-50 border-gray-200'
                } rounded-2xl`}>
                  <CardContent className="p-6">
                    <div className="text-center">
                      <FileSpreadsheet className={`w-16 h-16 mx-auto mb-4 ${
                        darkMode ? 'text-blue-400' : 'text-blue-600'
                      }`} />
                      <h3 className={`text-xl font-bold mb-2 ${
                        darkMode ? 'text-white' : 'text-gray-900'
                      }`}>
                        Prepara tu Archivo
                      </h3>
                      <p className={`mb-6 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Completa la plantilla con tus productos y guárdala como CSV
                      </p>

                      <div className={`p-6 rounded-2xl border-2 border-dashed ${
                        darkMode 
                          ? 'bg-slate-700/50 border-slate-600' 
                          : 'bg-white border-gray-300'
                      }`}>
                        <p className={`text-sm font-semibold mb-4 ${
                          darkMode ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                          Tips importantes:
                        </p>
                        <ul className={`text-sm space-y-2 text-left ${
                          darkMode ? 'text-gray-400' : 'text-gray-600'
                        }`}>
                          <li>✓ No modifiques los nombres de las columnas</li>
                          <li>✓ Usa comas (,) como separador</li>
                          <li>✓ No uses puntos en los números, solo dígitos</li>
                          <li>✓ Verifica que todos los códigos sean únicos</li>
                          <li>✓ Guarda el archivo como CSV UTF-8</li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-between mt-6">
                  <Button
                    onClick={() => setStep(1)}
                    variant="outline"
                    className="rounded-2xl"
                  >
                    Volver
                  </Button>
                  <Button
                    onClick={() => setStep(3)}
                    className="rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700"
                  >
                    Siguiente: Cargar Archivo
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Carga */}
            {step === 3 && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <Card className={`border-2 ${
                  darkMode 
                    ? 'bg-slate-800/50 border-slate-700' 
                    : 'bg-gray-50 border-gray-200'
                } rounded-2xl`}>
                  <CardContent className="p-6">
                    {!file ? (
                      <div className="text-center">
                        <Upload className={`w-16 h-16 mx-auto mb-4 ${
                          darkMode ? 'text-emerald-400' : 'text-emerald-600'
                        }`} />
                        <h3 className={`text-xl font-bold mb-2 ${
                          darkMode ? 'text-white' : 'text-gray-900'
                        }`}>
                          Sube tu Archivo
                        </h3>
                        <p className={`mb-6 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Selecciona el archivo CSV preparado
                        </p>

                        <input
                          type="file"
                          accept=".csv"
                          onChange={handleFileSelect}
                          className="hidden"
                          id="file-upload"
                        />
                        <label htmlFor="file-upload">
                          <Button
                            asChild
                            className="rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 cursor-pointer"
                          >
                            <span>
                              <Upload className="w-5 h-5 mr-2" />
                              Seleccionar Archivo CSV
                            </span>
                          </Button>
                        </label>
                      </div>
                    ) : (
                      <div>
                        <div className={`p-4 rounded-2xl mb-4 ${
                          validationErrors.length === 0
                            ? darkMode 
                              ? 'bg-emerald-500/20 border-2 border-emerald-500/50'
                              : 'bg-emerald-50 border-2 border-emerald-200'
                            : darkMode
                              ? 'bg-red-500/20 border-2 border-red-500/50'
                              : 'bg-red-50 border-2 border-red-200'
                        }`}>
                          <div className="flex items-center gap-3">
                            {validationErrors.length === 0 ? (
                              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                            ) : (
                              <AlertCircle className="w-8 h-8 text-red-500" />
                            )}
                            <div className="flex-1">
                              <p className={`font-semibold ${
                                validationErrors.length === 0
                                  ? 'text-emerald-600'
                                  : 'text-red-600'
                              }`}>
                                {file.name}
                              </p>
                              <p className={`text-sm ${
                                validationErrors.length === 0
                                  ? 'text-emerald-600'
                                  : 'text-red-600'
                              }`}>
                                {validationErrors.length === 0
                                  ? '✓ Archivo válido y listo para importar'
                                  : `✗ ${validationErrors.length} errores encontrados`
                                }
                              </p>
                            </div>
                          </div>
                        </div>

                        {validationErrors.length > 0 && (
                          <div className={`p-4 rounded-2xl mb-4 ${
                            darkMode ? 'bg-slate-700/50' : 'bg-white border border-gray-200'
                          }`}>
                            <p className={`font-semibold mb-2 ${
                              darkMode ? 'text-red-400' : 'text-red-600'
                            }`}>
                              Errores de validación:
                            </p>
                            <ul className="space-y-1">
                              {validationErrors.map((error, index) => (
                                <li key={index} className={`text-sm ${
                                  darkMode ? 'text-gray-400' : 'text-gray-600'
                                }`}>
                                  • {error}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="flex gap-3">
                          <input
                            type="file"
                            accept=".csv"
                            onChange={handleFileSelect}
                            className="hidden"
                            id="file-reupload"
                          />
                          <label htmlFor="file-reupload" className="flex-1">
                            <Button
                              asChild
                              variant="outline"
                              className="w-full rounded-2xl cursor-pointer"
                            >
                              <span>Cambiar Archivo</span>
                            </Button>
                          </label>

                          <Button
                            onClick={handleImport}
                            disabled={validationErrors.length > 0 || importing}
                            className="flex-1 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50"
                          >
                            {importing ? (
                              <>
                                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-2" />
                                Importando...
                              </>
                            ) : (
                              <>
                                <Upload className="w-5 h-5 mr-2" />
                                Importar Productos
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {!file && (
                  <div className="flex justify-start mt-6">
                    <Button
                      onClick={() => setStep(2)}
                      variant="outline"
                      className="rounded-2xl"
                    >
                      Volver
                    </Button>
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}