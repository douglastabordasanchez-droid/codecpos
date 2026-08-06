/**
 * CODEC POS v2.0 - Editor de Logo Profesional
 * Recorte, compresión y ajustes de imagen
 */

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Cropper from 'react-easy-crop';
import imageCompression from 'browser-image-compression';
import { 
  X, Check, Loader2, Download, RotateCw, ZoomIn, ZoomOut, 
  Maximize2, Image as ImageIcon, Scissors, Sparkles, Sun, Moon
} from 'lucide-react';
import { Button } from '../ui/button';
import { Slider } from '../ui/slider';
import { toast } from 'sonner';
import { usePOS } from '../../contexts/POSContext';

interface LogoEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (logoBase64: string) => void;
  initialImage?: string;
}

interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function LogoEditorModal({ isOpen, onClose, onSave, initialImage }: LogoEditorModalProps) {
  const { darkMode } = usePOS();
  const [imageSrc, setImageSrc] = useState<string>(initialImage || '');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.5);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [aspectRatio, setAspectRatio] = useState<number | undefined>(undefined); // Libre por defecto para poder seleccionar todo
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 📸 Cargar archivo
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo
    if (!file.type.match(/image\/(png|jpg|jpeg)/)) {
      toast.error('Solo se permiten archivos PNG, JPG o JPEG');
      return;
    }

    // Validar tamaño máximo antes de cargar (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('El archivo es muy grande. Máximo 5MB');
      return;
    }

    try {
      setIsProcessing(true);
      
      // Convertir a base64 para preview
      const reader = new FileReader();
      reader.onload = () => {
        setImageSrc(reader.result as string);
        setIsProcessing(false);
      };
      reader.onerror = () => {
        toast.error('Error al cargar la imagen');
        setIsProcessing(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error cargando imagen:', error);
      toast.error('Error al procesar la imagen');
      setIsProcessing(false);
    }
  };

  // ✂️ Callback cuando cambia el área de recorte
  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  // 🎨 Crear canvas con imagen recortada
  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      image.src = url;
    });

  // ✂️ Función para recortar la imagen
  const getCroppedImg = async (
    imageSrc: string,
    pixelCrop: Area,
    rotation = 0,
    brightness = 100,
    contrast = 100
  ): Promise<string> => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('No se pudo crear el contexto del canvas');
    }

    const maxSize = Math.max(image.width, image.height);
    const safeArea = 2 * ((maxSize / 2) * Math.sqrt(2));

    canvas.width = safeArea;
    canvas.height = safeArea;

    ctx.translate(safeArea / 2, safeArea / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-safeArea / 2, -safeArea / 2);

    // Aplicar filtros
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;

    ctx.drawImage(
      image,
      safeArea / 2 - image.width * 0.5,
      safeArea / 2 - image.height * 0.5
    );

    const data = ctx.getImageData(0, 0, safeArea, safeArea);

    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    ctx.putImageData(
      data,
      Math.round(0 - safeArea / 2 + image.width * 0.5 - pixelCrop.x),
      Math.round(0 - safeArea / 2 + image.height * 0.5 - pixelCrop.y)
    );

    return canvas.toDataURL('image/png', 0.95);
  };

  // 💾 Guardar logo procesado
  const handleSave = async () => {
    if (!croppedAreaPixels || !imageSrc) {
      toast.error('Primero debes cargar y ajustar una imagen');
      return;
    }

    try {
      setIsProcessing(true);

      // 1. Recortar imagen con filtros aplicados
      const croppedImage = await getCroppedImg(
        imageSrc,
        croppedAreaPixels,
        rotation,
        brightness,
        contrast
      );

      // 2. Convertir base64 a Blob para compresión
      const response = await fetch(croppedImage);
      const blob = await response.blob();

      // 3. Comprimir imagen (máximo 500KB, calidad óptima)
      const compressedBlob = await imageCompression(blob as File, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 800,
        useWebWorker: true,
        initialQuality: 0.8,
      });

      // 4. Convertir blob comprimido a base64
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        
        // Validar tamaño final
        const sizeInKB = Math.round((base64.length * 0.75) / 1024);
        
        toast.success(`Logo optimizado: ${sizeInKB}KB`, {
          description: 'Listo para usar en el sistema'
        });

        onSave(base64);
        setIsProcessing(false);
        handleClose();
      };
      reader.readAsDataURL(compressedBlob);

    } catch (error) {
      console.error('Error procesando imagen:', error);
      toast.error('Error al procesar la imagen');
      setIsProcessing(false);
    }
  };

  // 🔄 Reset valores
  const handleReset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(0.5);
    setRotation(0);
    setBrightness(100);
    setContrast(100);
  };

  // ❌ Cerrar modal
  const handleClose = () => {
    setImageSrc('');
    handleReset();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={`w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden ${
                darkMode 
                  ? 'bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700' 
                  : 'bg-white border border-gray-200'
              }`}
            >
              {/* Header */}
              <div className={`px-6 py-4 border-b ${
                darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-gray-200 bg-gray-50'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <Scissors className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        Editor de Logo
                      </h2>
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Recorta, ajusta y optimiza tu logo • Usado en tirillas y sistema
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleClose}
                    className={`p-2 rounded-lg transition-colors ${
                      darkMode 
                        ? 'hover:bg-slate-700 text-gray-400 hover:text-white' 
                        : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6 overflow-y-auto flex-1">
                {/* Área de recorte */}
                {!imageSrc ? (
                  <div className={`border-2 border-dashed rounded-xl p-12 text-center ${
                    darkMode ? 'border-slate-600 bg-slate-800/30' : 'border-gray-300 bg-gray-50'
                  }`}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <Sparkles className={`w-16 h-16 mx-auto mb-4 ${
                      darkMode ? 'text-purple-400' : 'text-purple-500'
                    }`} />
                    <h3 className={`text-lg font-semibold mb-2 ${
                      darkMode ? 'text-white' : 'text-gray-900'
                    }`}>
                      Selecciona tu logo
                    </h3>
                    <p className={`text-sm mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      PNG, JPG o JPEG • Máximo 5MB
                    </p>
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                    >
                      <ImageIcon className="w-4 h-4 mr-2" />
                      Cargar Imagen
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Instrucción de uso */}
                    <div className={`rounded-lg p-3 text-sm flex items-start gap-2 ${
                      darkMode ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-blue-50 border border-blue-200'
                    }`}>
                      <Sparkles className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                        darkMode ? 'text-blue-400' : 'text-blue-500'
                      }`} />
                      <div className={darkMode ? 'text-blue-300' : 'text-blue-700'}>
                        <strong>Tip:</strong> Arrastra el área de recorte (rectángulo) para mover, pellizca las esquinas para redimensionar, o usa la rueda del mouse para hacer zoom.
                      </div>
                    </div>

                    {/* Cropper */}
                    <div className={`relative rounded-xl overflow-hidden ${
                      darkMode ? 'bg-slate-800' : 'bg-gray-100'
                    }`} style={{ height: '400px' }}>
                      <Cropper
                        image={imageSrc}
                        crop={crop}
                        zoom={zoom}
                        rotation={rotation}
                        aspect={aspectRatio}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={onCropComplete}
                        style={{
                          containerStyle: {
                            backgroundColor: darkMode ? '#1e293b' : '#f1f5f9',
                          },
                        }}
                      />
                    </div>

                    {/* Controles */}
                    <div className={`rounded-xl p-4 space-y-4 ${
                      darkMode ? 'bg-slate-800/50' : 'bg-gray-50'
                    }`}>
                      {/* Relación de aspecto */}
                      <div>
                        <label className={`text-xs font-medium mb-2 block ${
                          darkMode ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                          <Maximize2 className="w-3 h-3 inline mr-1" />
                          Formato
                        </label>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={aspectRatio === 1 ? 'default' : 'outline'}
                            onClick={() => setAspectRatio(1)}
                          >
                            Cuadrado 1:1
                          </Button>
                          <Button
                            size="sm"
                            variant={aspectRatio === 16/9 ? 'default' : 'outline'}
                            onClick={() => setAspectRatio(16/9)}
                          >
                            Horizontal 16:9
                          </Button>
                          <Button
                            size="sm"
                            variant={aspectRatio === undefined ? 'default' : 'outline'}
                            onClick={() => setAspectRatio(undefined)}
                          >
                            Libre
                          </Button>
                        </div>
                      </div>

                      {/* Zoom */}
                      <div>
                        <label className={`text-xs font-medium mb-2 flex items-center justify-between ${
                          darkMode ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                          <span>
                            <ZoomIn className="w-3 h-3 inline mr-1" />
                            Zoom: {zoom.toFixed(1)}x
                          </span>
                        </label>
                        <Slider
                          value={[zoom]}
                          onValueChange={(value) => setZoom(value[0])}
                          min={0.1}
                          max={3}
                          step={0.1}
                          className="w-full"
                        />
                      </div>

                      {/* Rotación */}
                      <div>
                        <label className={`text-xs font-medium mb-2 flex items-center justify-between ${
                          darkMode ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                          <span>
                            <RotateCw className="w-3 h-3 inline mr-1" />
                            Rotación: {rotation}°
                          </span>
                        </label>
                        <Slider
                          value={[rotation]}
                          onValueChange={(value) => setRotation(value[0])}
                          min={0}
                          max={360}
                          step={1}
                          className="w-full"
                        />
                      </div>

                      {/* Brillo */}
                      <div>
                        <label className={`text-xs font-medium mb-2 flex items-center justify-between ${
                          darkMode ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                          <span>
                            <Sun className="w-3 h-3 inline mr-1" />
                            Brillo: {brightness}%
                          </span>
                        </label>
                        <Slider
                          value={[brightness]}
                          onValueChange={(value) => setBrightness(value[0])}
                          min={50}
                          max={150}
                          step={1}
                          className="w-full"
                        />
                      </div>

                      {/* Contraste */}
                      <div>
                        <label className={`text-xs font-medium mb-2 flex items-center justify-between ${
                          darkMode ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                          <span>
                            <Moon className="w-3 h-3 inline mr-1" />
                            Contraste: {contrast}%
                          </span>
                        </label>
                        <Slider
                          value={[contrast]}
                          onValueChange={(value) => setContrast(value[0])}
                          min={50}
                          max={150}
                          step={1}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className={`px-6 py-4 border-t flex items-center justify-between ${
                darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-gray-200 bg-gray-50'
              }`}>
                <div className="flex gap-2">
                  {imageSrc && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleReset}
                      >
                        <RotateCw className="w-4 h-4 mr-2" />
                        Resetear
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <ImageIcon className="w-4 h-4 mr-2" />
                        Cambiar Imagen
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                    </>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleClose}
                    disabled={isProcessing}
                  >
                    Cancelar
                  </Button>
                  {imageSrc && (
                    <Button
                      onClick={handleSave}
                      disabled={isProcessing || !croppedAreaPixels}
                      className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Procesando...
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Guardar Logo
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}