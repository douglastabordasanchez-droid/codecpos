/**
 * Widget de Turnos Activos - Dashboard Administrativo CodecPOS v2.0
 * Muestra cajeros conectados con horas trabajadas en tiempo real
 */

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Clock, User, DollarSign, TrendingUp, LogOut } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { electronStore, TurnoEmpleado, storeEvents } from '../../lib/electronStore';
import { Badge } from '../ui/badge';

interface TurnoConEstadisticas extends TurnoEmpleado {
  horasTrabajadasHoy: number;
  minutosEnLinea: number;
  ventasEnTurno: number;
  totalVendidoEnTurno: number;
}

export function WidgetTurnosActivos() {
  const [turnosActivos, setTurnosActivos] = useState<TurnoConEstadisticas[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarTurnos();

    // Actualizar cada minuto
    const interval = setInterval(cargarTurnos, 60000);

    // Escuchar eventos de turnos
    const handleTurnoInicio = () => cargarTurnos();
    const handleTurnoFin = () => cargarTurnos();
    const handleVentaNueva = () => cargarTurnos();

    storeEvents.on('turno:inicio', handleTurnoInicio);
    storeEvents.on('turno:fin', handleTurnoFin);
    storeEvents.on('venta:nueva', handleVentaNueva);

    return () => {
      clearInterval(interval);
      storeEvents.off('turno:inicio', handleTurnoInicio);
      storeEvents.off('turno:fin', handleTurnoFin);
      storeEvents.off('venta:nueva', handleVentaNueva);
    };
  }, []);

  const cargarTurnos = async () => {
    try {
      // Obtener todos los turnos activos del día
      const turnos = await electronStore.obtenerTurnosActivos();
      
      // Enriquecer con estadísticas
      const turnosConStats: TurnoConEstadisticas[] = await Promise.all(
        turnos.map(async (turno) => {
          const minutosEnLinea = calcularMinutosTranscurridos(turno.horaInicio);
          const horasTrabajadasHoy = Math.floor(minutosEnLinea / 60);
          
          // Obtener ventas del turno
          const ventas = await electronStore.obtenerVentasDelDia();
          const ventasDelCajero = ventas.filter(v => v.cajeroId === turno.cajeroId);
          
          return {
            ...turno,
            horasTrabajadasHoy,
            minutosEnLinea,
            ventasEnTurno: ventasDelCajero.length,
            totalVendidoEnTurno: ventasDelCajero.reduce((sum, v) => sum + Number(v.total), 0)
          };
        })
      );

      setTurnosActivos(turnosConStats);
    } catch (error) {
      console.error('Error cargando turnos:', error);
    } finally {
      setLoading(false);
    }
  };

  const calcularMinutosTranscurridos = (horaInicio: string): number => {
    const inicio = new Date(horaInicio);
    const ahora = new Date();
    return Math.floor((ahora.getTime() - inicio.getTime()) / 60000);
  };

  const formatearTiempo = (minutos: number): string => {
    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    return `${horas}h ${mins}m`;
  };

  const finalizarTurno = async (cajeroId: string) => {
    try {
      await electronStore.finalizarTurno(cajeroId);
      cargarTurnos();
    } catch (error) {
      console.error('Error finalizando turno:', error);
    }
  };

  if (loading) {
    return (
      <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-emerald-500/20">
        <CardContent className="p-6 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-emerald-500/20 overflow-hidden">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center">
            <Clock className="w-5 h-5 text-white" />
          </div>
          Turnos Activos
          <Badge className="ml-auto bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
            {turnosActivos.length} en línea
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {turnosActivos.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No hay turnos activos en este momento</p>
          </div>
        ) : (
          turnosActivos.map((turno, index) => (
            <motion.div
              key={turno.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 p-4"
            >
              {/* Indicador de estado activo */}
              <div className="absolute top-2 right-2 flex items-center gap-1">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="w-2 h-2 rounded-full bg-emerald-400"
                />
                <span className="text-xs text-emerald-400 font-semibold">ACTIVO</span>
              </div>

              {/* Información del cajero */}
              <div className="flex items-start gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center flex-shrink-0">
                  <User className="w-6 h-6 text-white" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <h4 className="text-lg font-bold text-white truncate">
                    {turno.cajeroNombre}
                  </h4>
                  <p className="text-sm text-slate-400">
                    Ingresó: {new Date(turno.horaInicio).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>

              {/* Estadísticas del turno */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-slate-900/50 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs text-slate-400">Tiempo</span>
                  </div>
                  <p className="text-lg font-bold text-white">
                    {formatearTiempo(turno.minutosEnLinea)}
                  </p>
                </div>

                <div className="bg-slate-900/50 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs text-slate-400">Ventas</span>
                  </div>
                  <p className="text-lg font-bold text-white">
                    {turno.ventasEnTurno}
                  </p>
                </div>
              </div>

              {/* Total vendido */}
              <div className="bg-gradient-to-r from-emerald-500/10 to-cyan-600/10 rounded-xl p-3 border border-emerald-500/20 mb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-emerald-400" />
                    <span className="text-sm text-slate-300">Total Vendido</span>
                  </div>
                  <span className="text-xl font-black text-emerald-400">
                    ${turno.totalVendidoEnTurno.toLocaleString('es-CO')}
                  </span>
                </div>
              </div>

              {/* Botón finalizar turno */}
              <Button
                onClick={() => finalizarTurno(turno.cajeroId)}
                variant="outline"
                size="sm"
                className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Finalizar Turno
              </Button>

              {/* Efecto de brillo animado */}
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: '200%' }}
                transition={{ duration: 3, repeat: Infinity, repeatDelay: 5 }}
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12 pointer-events-none"
              />
            </motion.div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
