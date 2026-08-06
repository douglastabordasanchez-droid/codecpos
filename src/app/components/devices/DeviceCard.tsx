import { motion } from 'motion/react';
import {
  Printer,
  Scale,
  Barcode,
  Vault,
  Monitor,
  Settings,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Play,
  Wifi,
  WifiOff
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Dispositivo } from './DispositivosPage';

const ICONOS = {
  impresora: Printer,
  bascula: Scale,
  escaner: Barcode,
  cajon: Vault,
  display: Monitor
};

const COLORES = {
  impresora: 'blue',
  bascula: 'purple',
  escaner: 'green',
  cajon: 'amber',
  display: 'cyan'
};

interface DeviceCardProps {
  dispositivo: Dispositivo;
  darkMode: boolean;
  onEliminar: () => void;
  onConfigurar: () => void;
  onProbar: () => void;
}

export function DeviceCard({
  dispositivo,
  darkMode,
  onEliminar,
  onConfigurar,
  onProbar
}: DeviceCardProps) {
  const Icono = ICONOS[dispositivo.tipo];
  const color = COLORES[dispositivo.tipo];
  
  const EstadoIcono = 
    dispositivo.estado === 'conectado' ? CheckCircle2 :
    dispositivo.estado === 'error' ? AlertCircle :
    XCircle;

  const estadoColor =
    dispositivo.estado === 'conectado' ? 'green' :
    dispositivo.estado === 'error' ? 'red' :
    'gray';

  const estadoTexto =
    dispositivo.estado === 'conectado' ? 'Conectado' :
    dispositivo.estado === 'error' ? 'Error' :
    'Desconectado';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }}
    >
      <Card className={`${
        darkMode ? 'bg-slate-900/50 border-slate-700/50' : 'bg-white border-gray-200'
      } rounded-3xl border-2 overflow-hidden hover:shadow-lg transition-all`}>
        <CardContent className="p-0">
          {/* Header con gradiente */}
          <div className={`bg-gradient-to-br from-${color}-500 to-${color}-600 p-6 relative overflow-hidden`}>
            {/* Patrón de fondo */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute inset-0" style={{
                backgroundImage: `radial-gradient(circle, white 1px, transparent 1px)`,
                backgroundSize: '20px 20px'
              }} />
            </div>

            {/* Contenido */}
            <div className="relative flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                  <Icono className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">{dispositivo.nombre}</h3>
                  <p className="text-white/80 text-sm">{dispositivo.modelo || 'Sin modelo'}</p>
                </div>
              </div>

              {/* Badge de estado */}
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${
                dispositivo.estado === 'conectado' ? 'bg-green-500/20' :
                dispositivo.estado === 'error' ? 'bg-red-500/20' :
                'bg-gray-500/20'
              } backdrop-blur-sm`}>
                <EstadoIcono className={`w-4 h-4 text-white ${
                  dispositivo.estado === 'conectado' ? 'animate-pulse' : ''
                }`} />
                <span className="text-white text-xs font-semibold">{estadoTexto}</span>
              </div>
            </div>
          </div>

          {/* Información */}
          <div className="p-6 space-y-4">
            {/* Detalles técnicos */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Puerto
                </span>
                <span className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {dispositivo.puerto || 'N/A'}
                </span>
              </div>

              {dispositivo.configuracion?.baudRate && (
                <div className="flex items-center justify-between">
                  <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Velocidad
                  </span>
                  <span className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {dispositivo.configuracion.baudRate} bps
                  </span>
                </div>
              )}

              {dispositivo.fabricante && (
                <div className="flex items-center justify-between">
                  <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Fabricante
                  </span>
                  <span className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {dispositivo.fabricante}
                  </span>
                </div>
              )}

              {dispositivo.ultimaConexion && (
                <div className="flex items-center justify-between">
                  <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Última conexión
                  </span>
                  <span className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {new Date(dispositivo.ultimaConexion).toLocaleDateString('es-CO')}
                  </span>
                </div>
              )}
            </div>

            {/* Divisor */}
            <div className={`h-px ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />

            {/* Botones de acción */}
            <div className="grid grid-cols-3 gap-2">
              <Button
                onClick={onProbar}
                size="sm"
                variant="outline"
                className={`rounded-xl ${
                  darkMode 
                    ? 'border-green-500/50 text-green-400 hover:bg-green-500/20' 
                    : 'border-green-300 text-green-600 hover:bg-green-50'
                }`}
                disabled={dispositivo.estado !== 'conectado' && dispositivo.estado !== 'desconectado'}
              >
                <Play className="w-4 h-4" />
              </Button>

              <Button
                onClick={onConfigurar}
                size="sm"
                variant="outline"
                className="rounded-xl"
              >
                <Settings className="w-4 h-4" />
              </Button>

              <Button
                onClick={onEliminar}
                size="sm"
                variant="outline"
                className={`rounded-xl ${
                  darkMode 
                    ? 'border-red-500/50 text-red-400 hover:bg-red-500/20' 
                    : 'border-red-300 text-red-500 hover:bg-red-50'
                }`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
