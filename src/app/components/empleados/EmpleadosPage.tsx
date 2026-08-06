/**
 * CODEC POS v2.0 - Página de Empleados
 * Vista dinámica según el rol:
 * - Cajero: Ve sus números personales (ventas, tiempo trabajado, etc.)
 * - Administrador: Panel de control de todos los cajeros activos
 */

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useAuth } from '../../contexts/AuthContext';
import { usePOS } from '../../contexts/POSContext';
import { electronStore } from '../../lib/electronStore';
import { toast } from 'sonner';
import { 
  User, 
  Clock, 
  DollarSign, 
  ShoppingCart, 
  TrendingUp,
  Calendar,
  Users,
  Activity,
  Target,
  Award,
  CheckCircle,
  LogOut,
  CreditCard,
  Wallet,
  RotateCcw,
  Package,
  AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { WidgetTurnosActivos } from '../dashboard/WidgetTurnosActivos';

interface EstadisticasCajero {
  totalVentas: number;
  montoVentas: number;
  devoluciones: number;
  montoDevoluciones: number;
  gastos: number;
  montoGastos: number;
  ventasPorMetodo: {
    efectivo: number;
    tarjeta: number;
    nequi: number;
    daviplata: number;
    transferencia: number;
  };
  baseInicial: number;
  horaInicio: string;
}

export default function EmpleadosPage() {
  const { usuarioActual, esSuperUsuario } = useAuth();
  const { darkMode } = usePOS();
  
  const [estadisticas, setEstadisticas] = useState<EstadisticasCajero>({
    totalVentas: 0,
    montoVentas: 0,
    devoluciones: 0,
    montoDevoluciones: 0,
    gastos: 0,
    montoGastos: 0,
    ventasPorMetodo: {
      efectivo: 0,
      tarjeta: 0,
      nequi: 0,
      daviplata: 0,
      transferencia: 0,
    },
    baseInicial: 0,
    horaInicio: '',
  });

  const [turnoActivo, setTurnoActivo] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarDatos();
    
    // Actualizar cada 10 segundos
    const interval = setInterval(cargarDatos, 10000);
    return () => clearInterval(interval);
  }, []);

  const cargarDatos = async () => {
    try {
      // Para cajeros: cargar sus estadísticas personales
      if (usuarioActual?.rol === 'cajero') {
        await cargarEstadisticasCajero();
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error cargando datos:', error);
      setLoading(false);
    }
  };

  const cargarEstadisticasCajero = async () => {
    try {
      // Verificar turno activo
      const aperturaGuardada = localStorage.getItem('pos-apertura-actual');
      
      if (aperturaGuardada) {
        const apertura = JSON.parse(aperturaGuardada);
        setTurnoActivo(true);

        // Obtener ventas del día
        const ventas = await electronStore.obtenerVentas();
        
        // Filtrar solo las ventas del cajero actual
        const ventasCajero = ventas.filter((v: any) => 
          v.cajeroId === usuarioActual?.id &&
          new Date(v.fecha).toDateString() === new Date().toDateString()
        );

        // Calcular estadísticas
        const totalVentas = ventasCajero.length;
        const montoVentas = ventasCajero.reduce((sum: number, v: any) => sum + v.total, 0);

        // Ventas por método de pago
        const ventasPorMetodo = {
          efectivo: 0,
          tarjeta: 0,
          nequi: 0,
          daviplata: 0,
          transferencia: 0,
        };

        ventasCajero.forEach((v: any) => {
          if (v.pagoMixto) {
            // 💰 Pago mixto - distribuir a cada método
            if (v.pagoMixto.efectivo) ventasPorMetodo.efectivo += Number(v.pagoMixto.efectivo);
            if (v.pagoMixto.tarjeta) ventasPorMetodo.tarjeta += Number(v.pagoMixto.tarjeta);
            if (v.pagoMixto.nequi) ventasPorMetodo.nequi += Number(v.pagoMixto.nequi);
            if (v.pagoMixto.daviplata) ventasPorMetodo.daviplata += Number(v.pagoMixto.daviplata);
            if (v.pagoMixto.transferencia) ventasPorMetodo.transferencia += Number(v.pagoMixto.transferencia);
          } else {
            // Pago simple
            const tipo = v.metodoPago.toLowerCase();
            if (tipo in ventasPorMetodo) {
              ventasPorMetodo[tipo as keyof typeof ventasPorMetodo] += v.total;
            }
          }
        });

        setEstadisticas({
          totalVentas,
          montoVentas,
          devoluciones: 0,
          montoDevoluciones: 0,
          gastos: 0,
          montoGastos: 0,
          ventasPorMetodo,
          baseInicial: apertura.baseInicial,
          horaInicio: apertura.fecha,
        });
      } else {
        setTurnoActivo(false);
      }
    } catch (error) {
      console.error('Error cargando estadísticas del cajero:', error);
    }
  };

  const formatCurrency = (value: number): string => {
    return `$${Number(value).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`;
  };

  const calcularTiempoTurno = (): string => {
    if (!estadisticas.horaInicio) return '0h 0m';
    
    const inicio = new Date(estadisticas.horaInicio);
    const ahora = new Date();
    const diff = ahora.getTime() - inicio.getTime();
    
    const horas = Math.floor(diff / (1000 * 60 * 60));
    const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${horas}h ${minutos}m`;
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${
        darkMode ? 'bg-slate-900' : 'bg-gray-50'
      }`}>
        <div className="text-center">
          <div className={`animate-spin w-16 h-16 border-4 border-t-transparent rounded-full mx-auto mb-4 ${
            darkMode ? 'border-emerald-500' : 'border-blue-600'
          }`}></div>
          <p className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Cargando...
          </p>
        </div>
      </div>
    );
  }

  // Vista para ADMINISTRADOR
  if (esSuperUsuario) {
    return (
      <div className={`h-screen overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-emerald-500 ${
        darkMode 
          ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 scrollbar-track-slate-800'
          : 'bg-gradient-to-br from-blue-50 via-white to-emerald-50 scrollbar-track-gray-200'
      }`}>
        {/* Header */}
        <div className="mb-8">
          <h1 className={`text-4xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Control de Empleados
          </h1>
          <p className={`flex items-center gap-2 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
            <Users className="w-4 h-4" />
            Panel de administración y monitoreo de cajeros
          </p>
        </div>

        {/* Widget de Turnos Activos */}
        <WidgetTurnosActivos />

        {/* Estadísticas Generales */}
        <div className="mt-8">
          <h2 className={`text-2xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Resumen del Día
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className={`${
              darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'
            }`}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    darkMode ? 'bg-blue-500/20' : 'bg-blue-100'
                  }`}>
                    <Users className="w-6 h-6 text-blue-500" />
                  </div>
                  <div>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                      Cajeros en Turno
                    </p>
                    <p className={`text-3xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {/* Este dato se actualiza desde el widget */}
                      Ver arriba
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className={`${
              darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'
            }`}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    darkMode ? 'bg-emerald-500/20' : 'bg-emerald-100'
                  }`}>
                    <Activity className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                      Estado del Sistema
                    </p>
                    <p className={`text-xl font-bold ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                      Operativo
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className={`${
              darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'
            }`}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    darkMode ? 'bg-purple-500/20' : 'bg-purple-100'
                  }`}>
                    <Calendar className="w-6 h-6 text-purple-500" />
                  </div>
                  <div>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                      Fecha Actual
                    </p>
                    <p className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {format(new Date(), "dd MMM", { locale: es })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Información adicional */}
        <Card className={`mt-8 ${
          darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'
        }`}>
          <CardHeader>
            <CardTitle className={darkMode ? 'text-white' : 'text-gray-900'}>
              💡 Funciones de Administrador
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`p-4 rounded-xl ${
                darkMode ? 'bg-slate-700/50' : 'bg-gray-50'
              }`}>
                <h4 className={`font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  🔍 Monitoreo en Tiempo Real
                </h4>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                  Observa la actividad de todos los cajeros en tiempo real, incluyendo ventas realizadas y tiempo trabajado.
                </p>
              </div>

              <div className={`p-4 rounded-xl ${
                darkMode ? 'bg-slate-700/50' : 'bg-gray-50'
              }`}>
                <h4 className={`font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  📊 Reportes por Cajero
                </h4>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                  Ve a la sección de <strong>Reportes</strong> y selecciona "Reporte por Cajero" para auditar actividades.
                </p>
              </div>

              <div className={`p-4 rounded-xl ${
                darkMode ? 'bg-slate-700/50' : 'bg-gray-50'
              }`}>
                <h4 className={`font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  ⚡ Control de Turnos
                </h4>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                  Puedes finalizar turnos manualmente si es necesario desde el widget de cajeros activos.
                </p>
              </div>

              <div className={`p-4 rounded-xl ${
                darkMode ? 'bg-slate-700/50' : 'bg-gray-50'
              }`}>
                <h4 className={`font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  👥 Gestión de Usuarios
                </h4>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                  Administra permisos y crea nuevos cajeros desde la sección de <strong>Usuarios</strong>.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Vista para CAJERO
  return (
    <div className={`h-screen overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-emerald-500 ${
      darkMode 
        ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 scrollbar-track-slate-800'
        : 'bg-gradient-to-br from-blue-50 via-white to-emerald-50 scrollbar-track-gray-200'
    }`}>
      {/* Header */}
      <div className="mb-8">
        <h1 className={`text-4xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Mi Área Personal
        </h1>
        <p className={`flex items-center gap-2 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
          <User className="w-4 h-4" />
          {usuarioActual?.nombre} • {usuarioActual?.rol}
        </p>
      </div>

      {!turnoActivo ? (
        <Card className={`${
          darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'
        }`}>
          <CardContent className="p-12 text-center">
            <AlertCircle className={`w-16 h-16 mx-auto mb-4 ${
              darkMode ? 'text-slate-500' : 'text-gray-400'
            }`} />
            <h3 className={`text-2xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Sin Turno Activo
            </h3>
            <p className={`mb-4 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
              No tienes un turno activo en este momento. Debes iniciar turno desde el módulo de Cierre de Caja.
            </p>
            <Button
              onClick={() => window.location.href = '/cierre-caja'}
              className="bg-gradient-to-r from-blue-500 to-blue-600"
            >
              Ir a Apertura de Caja
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Estado del Turno */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Base Inicial */}
            <Card className={`${
              darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'
            }`}>
              <CardContent className="p-6">
                <div className={`w-12 h-12 mb-4 rounded-xl flex items-center justify-center ${
                  darkMode ? 'bg-purple-500/20' : 'bg-purple-100'
                }`}>
                  <DollarSign className="w-6 h-6 text-purple-500" />
                </div>
                <p className={`text-sm mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                  Base Inicial
                </p>
                <p className={`text-3xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {formatCurrency(estadisticas.baseInicial)}
                </p>
              </CardContent>
            </Card>

            {/* Tiempo Trabajado */}
            <Card className={`${
              darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'
            }`}>
              <CardContent className="p-6">
                <div className={`w-12 h-12 mb-4 rounded-xl flex items-center justify-center ${
                  darkMode ? 'bg-blue-500/20' : 'bg-blue-100'
                }`}>
                  <Clock className="w-6 h-6 text-blue-500" />
                </div>
                <p className={`text-sm mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                  Tiempo Trabajado
                </p>
                <p className={`text-3xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {calcularTiempoTurno()}
                </p>
              </CardContent>
            </Card>

            {/* Estado */}
            <Card className={`${
              darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'
            }`}>
              <CardContent className="p-6">
                <div className={`w-12 h-12 mb-4 rounded-xl flex items-center justify-center ${
                  darkMode ? 'bg-emerald-500/20' : 'bg-emerald-100'
                }`}>
                  <CheckCircle className="w-6 h-6 text-emerald-500" />
                </div>
                <p className={`text-sm mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                  Estado
                </p>
                <Badge className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white">
                  Turno Activo
                </Badge>
              </CardContent>
            </Card>
          </div>

          {/* Métricas de Ventas */}
          <h2 className={`text-2xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Mis Ventas de Hoy
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Total Ventas */}
            <Card className={`${
              darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'
            }`}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    darkMode ? 'bg-emerald-500/20' : 'bg-emerald-100'
                  }`}>
                    <ShoppingCart className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                      Transacciones
                    </p>
                    <p className={`text-3xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {estadisticas.totalVentas}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Total Dinero */}
            <Card className={`${
              darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'
            }`}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    darkMode ? 'bg-blue-500/20' : 'bg-blue-100'
                  }`}>
                    <TrendingUp className="w-6 h-6 text-blue-500" />
                  </div>
                  <div>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                      Total Vendido
                    </p>
                    <p className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {formatCurrency(estadisticas.montoVentas)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Ticket Promedio */}
            <Card className={`${
              darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'
            }`}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    darkMode ? 'bg-purple-500/20' : 'bg-purple-100'
                  }`}>
                    <Target className="w-6 h-6 text-purple-500" />
                  </div>
                  <div>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                      Ticket Promedio
                    </p>
                    <p className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {formatCurrency(estadisticas.totalVentas > 0 ? estadisticas.montoVentas / estadisticas.totalVentas : 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Rendimiento */}
            <Card className={`${
              darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'
            }`}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    darkMode ? 'bg-amber-500/20' : 'bg-amber-100'
                  }`}>
                    <Award className="w-6 h-6 text-amber-500" />
                  </div>
                  <div>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                      Rendimiento
                    </p>
                    <Badge className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white">
                      Excelente
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Ventas por Método de Pago */}
          <Card className={`${
            darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'
          }`}>
            <CardHeader>
              <CardTitle className={darkMode ? 'text-white' : 'text-gray-900'}>
                Ventas por Método de Pago
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {/* Efectivo */}
                <div className={`p-4 rounded-xl ${
                  darkMode ? 'bg-green-500/10 border border-green-500/30' : 'bg-green-50 border border-green-200'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-green-500" />
                    <p className={`text-sm font-semibold ${darkMode ? 'text-green-300' : 'text-green-700'}`}>
                      Efectivo
                    </p>
                  </div>
                  <p className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {formatCurrency(estadisticas.ventasPorMetodo.efectivo)}
                  </p>
                </div>

                {/* Tarjeta */}
                <div className={`p-4 rounded-xl ${
                  darkMode ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <CreditCard className="w-4 h-4 text-blue-500" />
                    <p className={`text-sm font-semibold ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                      Tarjeta
                    </p>
                  </div>
                  <p className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {formatCurrency(estadisticas.ventasPorMetodo.tarjeta)}
                  </p>
                </div>

                {/* Nequi */}
                <div className={`p-4 rounded-xl ${
                  darkMode ? 'bg-purple-500/10 border border-purple-500/30' : 'bg-purple-50 border border-purple-200'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Wallet className="w-4 h-4 text-purple-500" />
                    <p className={`text-sm font-semibold ${darkMode ? 'text-purple-300' : 'text-purple-700'}`}>
                      Nequi
                    </p>
                  </div>
                  <p className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {formatCurrency(estadisticas.ventasPorMetodo.nequi)}
                  </p>
                </div>

                {/* Daviplata */}
                <div className={`p-4 rounded-xl ${
                  darkMode ? 'bg-red-500/10 border border-red-500/30' : 'bg-red-50 border border-red-200'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Wallet className="w-4 h-4 text-red-500" />
                    <p className={`text-sm font-semibold ${darkMode ? 'text-red-300' : 'text-red-700'}`}>
                      Daviplata
                    </p>
                  </div>
                  <p className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {formatCurrency(estadisticas.ventasPorMetodo.daviplata)}
                  </p>
                </div>

                {/* Transferencia */}
                <div className={`p-4 rounded-xl ${
                  darkMode ? 'bg-cyan-500/10 border border-cyan-500/30' : 'bg-cyan-50 border border-cyan-200'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <CreditCard className="w-4 h-4 text-cyan-500" />
                    <p className={`text-sm font-semibold ${darkMode ? 'text-cyan-300' : 'text-cyan-700'}`}>
                      Transferencia
                    </p>
                  </div>
                  <p className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {formatCurrency(estadisticas.ventasPorMetodo.transferencia)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}