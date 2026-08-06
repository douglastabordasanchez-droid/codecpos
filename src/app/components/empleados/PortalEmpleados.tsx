/**
 * CODEC POS v2.0 - Portal de Empleados
 * Panel completo para cajeros: inicio de turno, métricas y cierre
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
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
  AlertCircle,
  CheckCircle,
  PlayCircle,
  StopCircle,
  LogOut,
  CreditCard,
  Wallet,
  RotateCcw,
  Package,
  Calendar
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router';

interface AperturaCaja {
  id: string;
  fecha: string;
  cajero: string;
  cajeroId: string;
  baseInicial: number;
}

interface EstadisticasTurno {
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
}

export function PortalEmpleados() {
  const { usuarioActual, cerrarSesion } = useAuth();
  const { darkMode } = usePOS();
  const navigate = useNavigate();
  
  const [turnoActivo, setTurnoActivo] = useState(false);
  const [aperturaPendiente, setAperturaPendiente] = useState(false);
  const [aperturaActual, setAperturaActual] = useState<AperturaCaja | null>(null);
  const [estadisticas, setEstadisticas] = useState<EstadisticasTurno>({
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
    }
  });

  useEffect(() => {
    cargarEstadoTurno();
    
    // Actualizar cada 10 segundos
    const interval = setInterval(cargarEstadoTurno, 10000);
    return () => clearInterval(interval);
  }, []);

  const cargarEstadoTurno = async () => {
    try {
      // Verificar si hay apertura guardada
      const aperturaGuardada = localStorage.getItem('pos-apertura-actual');
      
      if (aperturaGuardada) {
        const apertura = JSON.parse(aperturaGuardada);
        setAperturaActual(apertura);
        setTurnoActivo(true);
        setAperturaPendiente(false);
        
        // Cargar estadísticas del turno
        await cargarEstadisticas();
      } else {
        setTurnoActivo(false);
        setAperturaPendiente(false);
      }
    } catch (error) {
      console.error('Error cargando estado del turno:', error);
    }
  };

  const cargarEstadisticas = async () => {
    try {
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

      const hoyStr = new Date().toDateString();
      const todasDevoluciones: any[] = JSON.parse(localStorage.getItem('codecpos_devoluciones') || '[]');
      const devHoy = todasDevoluciones.filter((d: any) =>
        new Date(d.fecha).toDateString() === hoyStr &&
        (d.cajeroId === usuarioActual?.id || d.cajero === usuarioActual?.username)
      );
      const todosGastos: any[] = JSON.parse(localStorage.getItem('pos-gastos') || '[]');
      const gastosHoy = todosGastos.filter((g: any) =>
        new Date(g.fecha).toDateString() === hoyStr &&
        g.registradoPor === (usuarioActual?.nombreCompleto || usuarioActual?.username)
      );

      setEstadisticas({
        totalVentas,
        montoVentas,
        devoluciones: devHoy.length,
        montoDevoluciones: devHoy.reduce((s: number, d: any) => s + (d.montoTotal || 0), 0),
        gastos: gastosHoy.length,
        montoGastos: gastosHoy.reduce((s: number, g: any) => s + (g.monto || 0), 0),
        ventasPorMetodo,
      });
    } catch (error) {
      console.error('Error cargando estadísticas:', error);
    }
  };

  const handleIniciarTurno = () => {
    // Marcar que el usuario quiere iniciar turno
    setAperturaPendiente(true);
    
    toast.info('Acción requerida', {
      description: 'Debes realizar la apertura de caja para comenzar',
      icon: '⚠️'
    });

    // Redirigir a apertura de caja
    setTimeout(() => {
      navigate('/cierre-caja');
    }, 1000);
  };

  const handleCerrarSesion = async () => {
    if (turnoActivo) {
      const confirmar = window.confirm(
        '⚠️ Tienes un turno activo.\n\n' +
        'Debes cerrar la caja antes de salir.\n\n' +
        '¿Ir a Cierre de Caja?'
      );
      
      if (confirmar) {
        navigate('/cierre-caja');
      }
      return;
    }

    await cerrarSesion();
    toast.success('Sesión cerrada');
  };

  const formatCurrency = (value: number): string => {
    return `$${Number(value).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`;
  };

  const calcularTiempoTurno = (): string => {
    if (!aperturaActual) return '0h 0m';
    
    const inicio = new Date(aperturaActual.fecha);
    const ahora = new Date();
    const diff = ahora.getTime() - inicio.getTime();
    
    const horas = Math.floor(diff / (1000 * 60 * 60));
    const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${horas}h ${minutos}m`;
  };

  if (!usuarioActual) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${
        darkMode ? 'bg-slate-900' : 'bg-gray-50'
      }`}>
        <Card className={darkMode ? 'bg-slate-800 border-slate-700' : ''}>
          <CardContent className="p-8 text-center">
            <User className="w-16 h-16 mx-auto mb-4 text-slate-400" />
            <p className={`text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Debes iniciar sesión primero
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={`min-h-screen p-6 ${
      darkMode 
        ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900' 
        : 'bg-gradient-to-br from-gray-50 via-white to-gray-100'
    }`}>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className={`text-4xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Mi Área de Trabajo
            </h1>
            <p className={`flex items-center gap-2 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
              <User className="w-4 h-4" />
              {usuarioActual.nombre} • {usuarioActual.rol}
            </p>
          </div>
          <Button
            onClick={handleCerrarSesion}
            variant="outline"
            className={darkMode ? 'border-slate-700 text-white' : ''}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Cerrar Sesión
          </Button>
        </div>
      </div>

      {/* Estado del Turno */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Card: Estado del Turno */}
        <Card className={`${
          darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'
        }`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              <Clock className="w-5 h-5" />
              Estado del Turno
            </CardTitle>
          </CardHeader>
          <CardContent>
            {turnoActivo ? (
              <div className="space-y-4">
                <Badge className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 text-lg">
                  <CheckCircle className="w-5 h-5 mr-2" />
                  Turno Activo
                </Badge>
                
                <div className={`p-4 rounded-xl ${
                  darkMode ? 'bg-slate-700/50' : 'bg-gray-50'
                }`}>
                  <p className={`text-sm mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                    Inicio del turno
                  </p>
                  <p className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {aperturaActual && format(new Date(aperturaActual.fecha), "HH:mm", { locale: es })}
                  </p>
                </div>

                <div className={`p-4 rounded-xl ${
                  darkMode ? 'bg-slate-700/50' : 'bg-gray-50'
                }`}>
                  <p className={`text-sm mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                    Tiempo trabajado
                  </p>
                  <p className={`font-bold text-2xl ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {calcularTiempoTurno()}
                  </p>
                </div>

                <Button
                  onClick={() => navigate('/cierre-caja')}
                  className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700"
                >
                  <StopCircle className="w-4 h-4 mr-2" />
                  Ir a Cierre de Caja
                </Button>
              </div>
            ) : aperturaPendiente ? (
              <div className="space-y-4">
                <Badge className="bg-gradient-to-r from-amber-500 to-amber-600 text-white px-4 py-2 text-lg">
                  <AlertCircle className="w-5 h-5 mr-2" />
                  Pendiente
                </Badge>
                
                <div className={`p-4 rounded-xl border-2 ${
                  darkMode 
                    ? 'bg-amber-500/10 border-amber-500/50' 
                    : 'bg-amber-50 border-amber-200'
                }`}>
                  <p className={`text-sm font-bold mb-2 ${
                    darkMode ? 'text-amber-300' : 'text-amber-900'
                  }`}>
                    ⚠️ Acción Requerida
                  </p>
                  <p className={`text-sm ${
                    darkMode ? 'text-amber-200' : 'text-amber-800'
                  }`}>
                    Debes realizar la apertura de caja para comenzar tu turno
                  </p>
                </div>

                <Button
                  onClick={() => navigate('/cierre-caja')}
                  className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700"
                >
                  Ir a Apertura de Caja
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <Badge className="bg-gradient-to-r from-slate-500 to-slate-600 text-white px-4 py-2 text-lg">
                  <StopCircle className="w-5 h-5 mr-2" />
                  Sin Turno
                </Badge>
                
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                  No tienes un turno activo. Inicia uno para comenzar a trabajar.
                </p>

                <Button
                  onClick={handleIniciarTurno}
                  className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                >
                  <PlayCircle className="w-4 h-4 mr-2" />
                  Iniciar Turno
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card: Base Inicial */}
        <Card className={`${
          darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'
        }`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              <DollarSign className="w-5 h-5 text-purple-400" />
              Base Inicial
            </CardTitle>
          </CardHeader>
          <CardContent>
            {aperturaActual ? (
              <div className="space-y-4">
                <div className={`p-6 rounded-xl ${
                  darkMode 
                    ? 'bg-gradient-to-br from-purple-500/10 to-purple-600/10 border border-purple-500/30' 
                    : 'bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200'
                }`}>
                  <p className={`text-sm mb-2 ${
                    darkMode ? 'text-purple-300' : 'text-purple-700'
                  }`}>
                    Con lo que iniciaste
                  </p>
                  <p className={`text-4xl font-black ${
                    darkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    {formatCurrency(aperturaActual.baseInicial)}
                  </p>
                </div>
              </div>
            ) : (
              <p className={`text-center py-8 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                Sin base registrada
              </p>
            )}
          </CardContent>
        </Card>

        {/* Card: Fecha */}
        <Card className={`${
          darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'
        }`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              <Calendar className="w-5 h-5 text-blue-400" />
              Fecha de Hoy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`p-6 rounded-xl ${
              darkMode 
                ? 'bg-gradient-to-br from-blue-500/10 to-blue-600/10 border border-blue-500/30' 
                : 'bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200'
            }`}>
              <p className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {format(new Date(), "EEEE", { locale: es }).toUpperCase()}
              </p>
              <p className={`text-3xl font-black mt-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {format(new Date(), "dd MMM yyyy", { locale: es })}
              </p>
              <p className={`text-sm mt-2 ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                {format(new Date(), "HH:mm:ss", { locale: es })}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Métricas del Turno */}
      {turnoActivo && (
        <>
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

            {/* Devoluciones */}
            <Card className={`${
              darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'
            }`}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    darkMode ? 'bg-red-500/20' : 'bg-red-100'
                  }`}>
                    <RotateCcw className="w-6 h-6 text-red-500" />
                  </div>
                  <div>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                      Devoluciones
                    </p>
                    <p className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {estadisticas.devoluciones}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Gastos */}
            <Card className={`${
              darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'
            }`}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    darkMode ? 'bg-amber-500/20' : 'bg-amber-100'
                  }`}>
                    <Package className="w-6 h-6 text-amber-500" />
                  </div>
                  <div>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                      Gastos
                    </p>
                    <p className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {estadisticas.gastos}
                    </p>
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
