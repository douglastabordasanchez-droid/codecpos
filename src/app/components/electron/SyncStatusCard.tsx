/**
 * CODEC POS - Card de Estado de Sincronización
 * Muestra el estado de sincronización en la página de configuración
 */

import { useEffect, useState } from 'react';
import { RefreshCw, Wifi, WifiOff, Package, ShoppingCart } from 'lucide-react';
import { motion } from 'motion/react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { usePOS } from '../../contexts/POSContext';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { syncService, SyncStats } from '../../lib/syncService';
import { toast } from 'sonner';

export function SyncStatusCard() {
  const { darkMode } = usePOS();
  const { isOnline, syncStatus, forceSync } = useNetworkStatus();
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const updateStats = async () => {
      const newStats = await syncService.getSyncStats();
      const lastSync = await syncService.getLastSyncTime();
      setStats(newStats);
      setLastSyncTime(lastSync);
    };

    updateStats();
    const interval = setInterval(updateStats, 5000); // Actualizar cada 5 segundos

    return () => clearInterval(interval);
  }, []);

  const formatTime = (isoString: string | null) => {
    if (!isoString) return 'Nunca';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Hace un momento';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Hace ${diffHours}h`;
    
    return date.toLocaleDateString('es-CO', { 
      day: '2-digit',
      month: 'short',
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const handleSyncClick = async () => {
    if (!isOnline || syncing) return;

    setSyncing(true);
    
    try {
      await forceSync();
      
      // Actualizar estadísticas inmediatamente
      const newStats = await syncService.getSyncStats();
      const lastSync = await syncService.getLastSyncTime();
      setStats(newStats);
      setLastSyncTime(lastSync);
      
      toast.success('Sincronización completada', {
        description: 'Todos los datos están actualizados'
      });
    } catch (error) {
      toast.error('Error en la sincronización');
    } finally {
      setSyncing(false);
    }
  };

  const totalPendientes = (stats?.productosPendientes || 0) + (stats?.ventasPendientes || 0);

  return (
    <Card className={`shadow-xl ${
      darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-gray-200'
    }`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className={`flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            <Wifi className="w-6 h-6 text-blue-500" />
            Estado de Sincronización
          </CardTitle>
          <Button
            onClick={handleSyncClick}
            disabled={!isOnline || syncing}
            size="sm"
            className={`${
              isOnline && !syncing
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-slate-600 cursor-not-allowed'
            }`}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            Sincronizar
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Estado de Red */}
        <div className={`p-4 rounded-xl border-2 ${
          isOnline
            ? darkMode
              ? 'bg-emerald-900/20 border-emerald-500/30'
              : 'bg-emerald-50 border-emerald-300'
            : darkMode
            ? 'bg-orange-900/20 border-orange-500/30'
            : 'bg-orange-50 border-orange-300'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm font-medium ${
              darkMode ? 'text-slate-300' : 'text-gray-700'
            }`}>
              Estado de Red
            </span>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className={`px-3 py-1 rounded-full font-bold text-sm ${
                isOnline
                  ? 'bg-emerald-500 text-white'
                  : 'bg-orange-500 text-white'
              }`}
            >
              {isOnline ? 'En línea' : 'Sin conexión'}
            </motion.div>
          </div>

          <div className="flex items-center justify-between">
            <span className={`text-sm ${
              darkMode ? 'text-slate-400' : 'text-gray-600'
            }`}>
              Última sincronización
            </span>
            <span className={`text-sm font-medium ${
              darkMode ? 'text-white' : 'text-gray-900'
            }`}>
              {formatTime(lastSyncTime)}
            </span>
          </div>
        </div>

        {/* Estadísticas */}
        <div>
          <h4 className={`text-sm font-semibold mb-3 ${
            darkMode ? 'text-slate-300' : 'text-gray-700'
          }`}>
            Estadísticas
          </h4>

          <div className="grid grid-cols-2 gap-4">
            {/* Productos */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className={`p-4 rounded-xl border-2 ${
                darkMode
                  ? 'bg-slate-700/30 border-slate-600'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
                  <Package className="w-4 h-4 text-purple-500" />
                </div>
                <span className={`text-xs font-medium ${
                  darkMode ? 'text-slate-400' : 'text-gray-600'
                }`}>
                  Productos
                </span>
              </div>
              
              <div className="flex items-end justify-between">
                <span className={`text-3xl font-black ${
                  darkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  {stats?.totalProductos || 0}
                </span>
                
                {stats && stats.productosPendientes > 0 && (
                  <span className="text-xs font-bold text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded-full">
                    {stats.productosPendientes} pendientes
                  </span>
                )}
              </div>
            </motion.div>

            {/* Ventas */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className={`p-4 rounded-xl border-2 ${
                darkMode
                  ? 'bg-slate-700/30 border-slate-600'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4 text-emerald-500" />
                </div>
                <span className={`text-xs font-medium ${
                  darkMode ? 'text-slate-400' : 'text-gray-600'
                }`}>
                  Ventas
                </span>
              </div>
              
              <div className="flex items-end justify-between">
                <span className={`text-3xl font-black ${
                  darkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  {stats?.totalVentas || 0}
                </span>
                
                {stats && stats.ventasPendientes > 0 && (
                  <span className="text-xs font-bold text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded-full">
                    {stats.ventasPendientes} pendientes
                  </span>
                )}
              </div>
            </motion.div>
          </div>
        </div>

        {/* Alerta de pendientes */}
        {totalPendientes > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-3 rounded-lg border-2 ${
              darkMode
                ? 'bg-yellow-900/20 border-yellow-500/30'
                : 'bg-yellow-50 border-yellow-300'
            }`}
          >
            <p className={`text-sm font-medium ${
              darkMode ? 'text-yellow-400' : 'text-yellow-800'
            }`}>
              ⚠️ {totalPendientes} elemento{totalPendientes !== 1 ? 's' : ''} pendiente{totalPendientes !== 1 ? 's' : ''} de sincronizar
            </p>
          </motion.div>
        )}

        {/* Estado de sincronización en progreso */}
        {syncing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30"
          >
            <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
            <span className="text-sm font-medium text-blue-500">
              Sincronizando datos...
            </span>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
