import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Wifi,
  WifiOff,
  Cloud,
  AlertCircle,
  Smartphone,
  CheckCircle2,
  CircleDot,
} from 'lucide-react';
import { toast } from 'sonner';

type EstadoConexion = 'wifi' | 'nube' | 'desconectado';

interface CodecVerifyWidgetProps {
  className?: string;
}

export function CodecVerifyWidget({ className = '' }: CodecVerifyWidgetProps) {
  const [estado, setEstado] = useState<EstadoConexion>('desconectado');
  const [ultimaActividad, setUltimaActividad] = useState<string>('');

  // Simular cambios de estado
  useEffect(() => {
    const interval = setInterval(() => {
      const estados: EstadoConexion[] = ['wifi', 'nube', 'desconectado'];
      const random = estados[Math.floor(Math.random() * estados.length)];
      // setEstado(random);
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const getIconoYColor = () => {
    switch (estado) {
      case 'wifi':
        return {
          icon: Wifi,
          color: 'text-green-400',
          bg: 'bg-green-500/20',
          border: 'border-green-500/50',
          label: 'WiFi Directo',
          descripcion: 'Conectado al Emisor',
        };
      case 'nube':
        return {
          Icon: Cloud,
          color: 'text-blue-500',
          bg: 'bg-blue-500/20',
          border: 'border-blue-500/50',
          label: 'Nube/Datos',
          descripcion: 'Conexión remota activa',
        };
      case 'desconectado':
        return {
          Icon: AlertCircle,
          color: 'text-red-500',
          bg: 'bg-red-500/20',
          border: 'border-red-500/50',
          label: 'Desconectado',
          descripcion: '¡Alertar a Cajero!',
        };
    }
  };

  const { Icon, color, bg, border, label, descripcion } = getIconoYColor();

  const handleClick = () => {
    if (estado === 'desconectado') {
      toast.error('⚠️ Sin conexión con el Emisor', {
        description: 'Verifica que el celular esté activo',
        duration: 4000,
      });
    } else {
      toast.info(`📱 Estado: ${label}`, {
        description: descripcion,
      });
    }
  };

  return (
    <motion.button
      onClick={handleClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={`relative flex items-center gap-2 px-3 py-2 rounded-xl border ${bg} ${border} transition-all ${className}`}
    >
      {/* Indicador de pulso */}
      {estado !== 'desconectado' && (
        <motion.div
          className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${
            estado === 'wifi' ? 'bg-green-500' : 'bg-blue-500'
          }`}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [1, 0.7, 1],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
          }}
        />
      )}

      <Icon className={`w-5 h-5 ${color}`} />
      
      <div className="text-left">
        <p className={`text-xs font-semibold ${color}`}>{label}</p>
        <p className="text-[10px] text-slate-500 dark:text-slate-400">{descripcion}</p>
      </div>
    </motion.button>
  );
}