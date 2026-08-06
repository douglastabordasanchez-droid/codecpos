/**
 * Sistema de Notificaciones Anti-Fraude para CodecPOS v2.0
 * Componente de notificaciones visuales y sonoras
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, DollarSign, X } from 'lucide-react';
import { storeEvents } from '../../lib/electronStore';

interface Notificacion {
  id: string;
  tipo: 'success' | 'warning' | 'error' | 'info';
  titulo: string;
  mensaje: string;
  ventaId?: string;
  duracion?: number;
}

export function NotificacionesAntiFraude() {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);

  useEffect(() => {
    // Escuchar eventos de notificación
    const handleNotificacion = (data: Omit<Notificacion, 'id'>) => {
      const nuevaNotificacion: Notificacion = {
        ...data,
        id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        duracion: data.duracion || 5000
      };

      setNotificaciones(prev => [...prev, nuevaNotificacion]);

      // Auto-cerrar después de la duración
      setTimeout(() => {
        cerrarNotificacion(nuevaNotificacion.id);
      }, nuevaNotificacion.duracion);
    };

    storeEvents.on('notificacion:mostrar', handleNotificacion);

    return () => {
      storeEvents.off('notificacion:mostrar', handleNotificacion);
    };
  }, []);

  const cerrarNotificacion = (id: string) => {
    setNotificaciones(prev => prev.filter(n => n.id !== id));
  };

  const getIcono = (tipo: Notificacion['tipo']) => {
    switch (tipo) {
      case 'success':
        return <CheckCircle2 className="w-6 h-6 text-emerald-400" />;
      case 'warning':
        return <AlertCircle className="w-6 h-6 text-yellow-400" />;
      case 'error':
        return <AlertCircle className="w-6 h-6 text-red-400" />;
      case 'info':
        return <DollarSign className="w-6 h-6 text-blue-400" />;
    }
  };

  const getColorClasses = (tipo: Notificacion['tipo']) => {
    switch (tipo) {
      case 'success':
        return 'from-emerald-500/20 to-emerald-600/20 border-emerald-500/40';
      case 'warning':
        return 'from-yellow-500/20 to-yellow-600/20 border-yellow-500/40';
      case 'error':
        return 'from-red-500/20 to-red-600/20 border-red-500/40';
      case 'info':
        return 'from-blue-500/20 to-blue-600/20 border-blue-500/40';
    }
  };

  return (
    <div className="fixed top-4 right-4 z-[9999] space-y-3 max-w-md">
      <AnimatePresence>
        {notificaciones.map((notif) => (
          <motion.div
            key={notif.id}
            initial={{ opacity: 0, x: 100, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className={`
              relative overflow-hidden rounded-2xl border-2 backdrop-blur-xl shadow-2xl
              bg-gradient-to-br ${getColorClasses(notif.tipo)}
              p-4 pr-12
            `}
          >
            {/* Barra de progreso animada */}
            <motion.div
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: (notif.duracion || 5000) / 1000, ease: 'linear' }}
              className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-emerald-400 to-cyan-500"
            />

            {/* Contenido */}
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {getIcono(notif.tipo)}
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="text-lg font-bold text-white mb-1">
                  {notif.titulo}
                </h4>
                <p className="text-sm text-slate-200">
                  {notif.mensaje}
                </p>
                {notif.ventaId && (
                  <p className="text-xs text-slate-400 mt-2 font-mono">
                    Factura: {notif.ventaId}
                  </p>
                )}
              </div>

              {/* Botón cerrar */}
              <button
                onClick={() => cerrarNotificacion(notif.id)}
                className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* Efecto de brillo */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: '200%' }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12"
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
