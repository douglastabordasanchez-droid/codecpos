/**
 * Indicador de Turno en Tiempo Real
 * Muestra el tiempo de sesión del cajero actual
 */

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Clock, User, TrendingUp } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { electronStore, TurnoEmpleado } from '../../lib/electronStore';
import { useAuth } from '../../contexts/AuthContext';

export function TurnoIndicator() {
  const { user } = useAuth();
  const [turno, setTurno] = useState<TurnoEmpleado | null>(null);
  const [duracion, setDuracion] = useState<string>('0h 0m');

  useEffect(() => {
    if (!user?.id) return;

    // Cargar turno actual
    const cargarTurno = async () => {
      const turnoActual = await electronStore.obtenerTurnoActual(user.id);
      setTurno(turnoActual);
    };

    cargarTurno();

    // Actualizar cada segundo
    const interval = setInterval(() => {
      if (turno) {
        const minutos = electronStore.calcularDuracionTurno(turno);
        setDuracion(electronStore.formatearDuracionTurno(minutos));
      }
    }, 1000);

    // Escuchar actualizaciones de turno
    const handleTurnoActualizado = (turnoActualizado: TurnoEmpleado) => {
      if (turnoActualizado.cajeroId === user.id) {
        setTurno(turnoActualizado);
      }
    };

    electronStore.onTurnoActualizado(handleTurnoActualizado);

    return () => {
      clearInterval(interval);
      electronStore.offTurnoActualizado(handleTurnoActualizado);
    };
  }, [user, turno]);

  if (!turno) return null;

  const horaInicio = new Date(turno.horaInicio).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-emerald-500/20 hover:bg-slate-700/50 transition-colors">
          <Clock className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span className="text-sm font-medium text-white">{duracion}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 bg-slate-900/95 border-emerald-500/20 backdrop-blur-xl">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Turno Activo</p>
              <p className="text-sm font-semibold text-white">{turno.cajeroNombre}</p>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Hora de Inicio:</span>
              <span className="font-medium text-white">{horaInicio}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Duración:</span>
              <span className="font-medium text-emerald-400">{duracion}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Ventas Realizadas:</span>
              <span className="font-medium text-white">{turno.ventasRealizadas}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Total Vendido:</span>
              <span className="font-medium text-emerald-400">
                ${turno.totalVendido.toLocaleString('es-CO')}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-700">
            <p className="text-xs text-slate-500">
              Punto de Venta: {turno.puntoVentaId}
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
