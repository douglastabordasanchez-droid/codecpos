import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Save, Settings, Zap } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from 'sonner';
import { Dispositivo } from './DispositivosPage';

interface DeviceConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  dispositivo: Dispositivo | null;
  darkMode: boolean;
  onSave: (dispositivo: Dispositivo) => void;
}

export function DeviceConfigModal({
  isOpen,
  onClose,
  dispositivo,
  darkMode,
  onSave
}: DeviceConfigModalProps) {
  const [formData, setFormData] = useState<Dispositivo | null>(null);

  useEffect(() => {
    if (dispositivo) {
      setFormData({ ...dispositivo });
    }
  }, [dispositivo]);

  if (!isOpen || !formData) return null;

  const handleSave = () => {
    if (!formData.nombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }

    onSave(formData);
  };

  const tipoNombre = {
    impresora: 'Impresora Térmica',
    bascula: 'Báscula Digital',
    escaner: 'Escáner de Códigos',
    cajon: 'Cajón Monedero',
    display: 'Display Cliente'
  }[formData.tipo];

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
          className={`max-w-2xl w-full rounded-3xl overflow-hidden ${
            darkMode ? 'bg-slate-900 border-2 border-slate-700' : 'bg-white'
          }`}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-500 to-purple-600 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                  <Settings className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Configurar Dispositivo</h2>
                  <p className="text-white/80 text-sm">{tipoNombre}</p>
                </div>
              </div>
              <Button
                onClick={onClose}
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/20 rounded-xl"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Contenido */}
          <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            
            {/* Información General */}
            <div className="space-y-4">
              <h3 className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Información General
              </h3>

              <div>
                <label className={`block text-sm font-semibold mb-2 ${
                  darkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Nombre del Dispositivo
                </label>
                <Input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej: Impresora Principal"
                  className={`h-12 rounded-2xl ${
                    darkMode 
                      ? 'bg-slate-800 border-slate-600 text-white' 
                      : 'bg-gray-50 border-gray-300'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-sm font-semibold mb-2 ${
                  darkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Modelo
                </label>
                <Input
                  type="text"
                  value={formData.modelo || ''}
                  onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                  placeholder="Ej: Epson TM-T20III"
                  className={`h-12 rounded-2xl ${
                    darkMode 
                      ? 'bg-slate-800 border-slate-600 text-white' 
                      : 'bg-gray-50 border-gray-300'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-sm font-semibold mb-2 ${
                  darkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Fabricante
                </label>
                <Input
                  type="text"
                  value={formData.fabricante || ''}
                  onChange={(e) => setFormData({ ...formData, fabricante: e.target.value })}
                  placeholder="Ej: Epson, Zebra, Star Micronics"
                  className={`h-12 rounded-2xl ${
                    darkMode 
                      ? 'bg-slate-800 border-slate-600 text-white' 
                      : 'bg-gray-50 border-gray-300'
                  }`}
                />
              </div>
            </div>

            {/* Configuración de Puerto Serial (si aplica) */}
            {(formData.tipo === 'impresora' || formData.tipo === 'bascula' || formData.tipo === 'display') && (
              <>
                <div className={`h-px ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />

                <div className="space-y-4">
                  <h3 className={`font-bold text-lg flex items-center gap-2 ${
                    darkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    <Zap className="w-5 h-5 text-purple-500" />
                    Configuración Serial
                  </h3>

                  {/* ✅ CONFIGURACIÓN MANUAL DE PUERTO */}
                  <div>
                    <label className={`block text-sm font-semibold mb-2 ${
                      darkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Puerto Manual (Force)
                    </label>
                    <Input
                      type="text"
                      value={formData.puerto || ''}
                      onChange={(e) => setFormData({ ...formData, puerto: e.target.value })}
                      placeholder="Ej: COM3, /dev/ttyUSB0, USB001"
                      className={`h-12 rounded-2xl ${
                        darkMode
                          ? 'bg-slate-800 border-slate-600 text-white'
                          : 'bg-gray-50 border-gray-300'
                      }`}
                    />
                    <p className={`text-xs mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      💡 Si el escaneo automático no detecta tu dispositivo, escribe manualmente el puerto (COM1-COM20, USB001-USB020, etc.)
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={`block text-sm font-semibold mb-2 ${
                        darkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        Velocidad (Baud Rate)
                      </label>
                      <select
                        value={formData.configuracion?.baudRate || 9600}
                        onChange={(e) => setFormData({
                          ...formData,
                          configuracion: {
                            ...formData.configuracion,
                            baudRate: parseInt(e.target.value)
                          }
                        })}
                        className={`w-full h-12 rounded-2xl px-4 ${
                          darkMode 
                            ? 'bg-slate-800 border-2 border-slate-600 text-white' 
                            : 'bg-gray-50 border-2 border-gray-300'
                        }`}
                      >
                        <option value="9600">9600 bps</option>
                        <option value="19200">19200 bps</option>
                        <option value="38400">38400 bps</option>
                        <option value="57600">57600 bps</option>
                        <option value="115200">115200 bps</option>
                      </select>
                    </div>

                    <div>
                      <label className={`block text-sm font-semibold mb-2 ${
                        darkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        Bits de Datos
                      </label>
                      <select
                        value={formData.configuracion?.dataBits || 8}
                        onChange={(e) => setFormData({
                          ...formData,
                          configuracion: {
                            ...formData.configuracion,
                            dataBits: parseInt(e.target.value)
                          }
                        })}
                        className={`w-full h-12 rounded-2xl px-4 ${
                          darkMode 
                            ? 'bg-slate-800 border-2 border-slate-600 text-white' 
                            : 'bg-gray-50 border-2 border-gray-300'
                        }`}
                      >
                        <option value="7">7 bits</option>
                        <option value="8">8 bits</option>
                      </select>
                    </div>

                    <div>
                      <label className={`block text-sm font-semibold mb-2 ${
                        darkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        Bits de Parada
                      </label>
                      <select
                        value={formData.configuracion?.stopBits || 1}
                        onChange={(e) => setFormData({
                          ...formData,
                          configuracion: {
                            ...formData.configuracion,
                            stopBits: parseInt(e.target.value)
                          }
                        })}
                        className={`w-full h-12 rounded-2xl px-4 ${
                          darkMode 
                            ? 'bg-slate-800 border-2 border-slate-600 text-white' 
                            : 'bg-gray-50 border-2 border-gray-300'
                        }`}
                      >
                        <option value="1">1 bit</option>
                        <option value="2">2 bits</option>
                      </select>
                    </div>

                    <div>
                      <label className={`block text-sm font-semibold mb-2 ${
                        darkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        Paridad
                      </label>
                      <select
                        value={formData.configuracion?.parity || 'none'}
                        onChange={(e) => setFormData({
                          ...formData,
                          configuracion: {
                            ...formData.configuracion,
                            parity: e.target.value
                          }
                        })}
                        className={`w-full h-12 rounded-2xl px-4 ${
                          darkMode 
                            ? 'bg-slate-800 border-2 border-slate-600 text-white' 
                            : 'bg-gray-50 border-2 border-gray-300'
                        }`}
                      >
                        <option value="none">Ninguna</option>
                        <option value="even">Par</option>
                        <option value="odd">Impar</option>
                      </select>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Información Técnica */}
            {formData.configuracion?.vendorId && (
              <>
                <div className={`h-px ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />

                <div className="space-y-2">
                  <h3 className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Información USB
                  </h3>
                  <div className={`p-4 rounded-2xl ${
                    darkMode ? 'bg-slate-800' : 'bg-gray-100'
                  }`}>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Vendor ID
                        </span>
                        <span className={`text-sm font-mono font-bold ${
                          darkMode ? 'text-white' : 'text-gray-900'
                        }`}>
                          0x{formData.configuracion.vendorId}
                        </span>
                      </div>
                      {formData.configuracion.productId && (
                        <div className="flex justify-between">
                          <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            Product ID
                          </span>
                          <span className={`text-sm font-mono font-bold ${
                            darkMode ? 'text-white' : 'text-gray-900'
                          }`}>
                            0x{formData.configuracion.productId}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className={`p-6 border-t-2 ${
            darkMode ? 'border-slate-700' : 'border-gray-200'
          }`}>
            <div className="flex gap-3">
              <Button
                onClick={onClose}
                variant="outline"
                className="flex-1 h-12 rounded-2xl"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                className="flex-1 h-12 rounded-2xl bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
              >
                <Save className="w-5 h-5 mr-2" />
                Guardar Configuración
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
