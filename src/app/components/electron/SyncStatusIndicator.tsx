/**
 * Indicador de Estado de Sincronización
 * Muestra el estado de la conexión y sincronización
 */

import { useEffect, useState } from 'react';
import { Cloud, CloudOff, RefreshCw, Check, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { syncService, SyncStats } from '../../lib/syncService';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from '../ui/popover';

export function SyncStatusIndicator() {
  const { isOnline, syncStatus, forceSync } = useNetworkStatus();
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // ⚡ Antes esto sondeaba IndexedDB completo (productos + ventas) cada 5s de
  // forma independiente, sin importar si algo cambió — ruido constante en la
  // pantalla de venta activa. syncService ya corre su propio ciclo cada 30s
  // y avisa por listener (useNetworkStatus → syncStatus) cada vez que
  // termina — las estadísticas solo pueden cambiar cuando eso ocurre, así
  // que basta con releer ahí en vez de un intervalo aparte.
  useEffect(() => {
    const updateStats = async () => {
      const newStats = await syncService.getSyncStats();
      const lastSync = await syncService.getLastSyncTime();
      setStats(newStats);
      setLastSyncTime(lastSync);
    };
    updateStats();
  }, [syncStatus.status, syncStatus.lastSync]);

  const getStatusIcon = () => {
    if (!isOnline) {
      return <WifiOff className="w-4 h-4" />;
    }

    switch (syncStatus.status) {
      case 'syncing':
        return <RefreshCw className="w-4 h-4 animate-spin" />;
      case 'success':
        return <Check className="w-4 h-4" />;
      case 'error':
        return <AlertCircle className="w-4 h-4" />;
      case 'unlinked':
        return <CloudOff className="w-4 h-4" />;
      default:
        return <Wifi className="w-4 h-4" />;
    }
  };

  const getStatusColor = () => {
    if (!isOnline) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';

    switch (syncStatus.status) {
      case 'syncing':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'success':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'error':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'unlinked':
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return 'Nunca';
    const date = new Date(isoString);
    return date.toLocaleTimeString('es-CO', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <Popover open={showDetails} onOpenChange={setShowDetails}>
      <PopoverTrigger asChild>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative cursor-pointer"
        >
          <div className={`
            flex items-center gap-2 px-3 py-2 rounded-lg border
            backdrop-blur-sm transition-all
            ${getStatusColor()}
            hover:scale-105
          `}>
            {getStatusIcon()}
            <span className="text-xs font-medium hidden sm:inline">
              {isOnline ? syncStatus.message : 'Sin conexión'}
            </span>
            
            {/* Badge de items pendientes */}
            {stats && (stats.productosPendientes > 0 || stats.ventasPendientes > 0) && (
              <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1.5">
                {stats.productosPendientes + stats.ventasPendientes}
              </Badge>
            )}
          </div>
        </motion.div>
      </PopoverTrigger>

      <PopoverContent className="w-80 bg-slate-900/95 backdrop-blur-xl border-slate-700/50">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white flex items-center gap-2">
              {isOnline ? <Cloud className="w-4 h-4" /> : <CloudOff className="w-4 h-4" />}
              Estado de Sincronización
            </h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => forceSync()}
              disabled={!isOnline || syncStatus.status === 'syncing'}
              className="h-7"
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${syncStatus.status === 'syncing' ? 'animate-spin' : ''}`} />
              Sincronizar
            </Button>
          </div>

          {/* Estado de conexión */}
          <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-300">Estado de Red</span>
              <Badge className={isOnline ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400'}>
                {isOnline ? 'En línea' : 'Fuera de línea'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-300">Última sincronización</span>
              <span className="text-xs text-slate-400">{formatTime(lastSyncTime)}</span>
            </div>
          </div>

          {/* Estadísticas */}
          {stats && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-slate-300">Estadísticas</h4>
              
              <div className="grid grid-cols-2 gap-2">
                {/* Productos */}
                <div className="p-2 rounded-lg bg-slate-800/30 border border-slate-700/20">
                  <div className="text-xs text-slate-400 mb-1">Productos</div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-white">{stats.totalProductos}</span>
                    {stats.productosPendientes > 0 && (
                      <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-400">
                        {stats.productosPendientes} pendientes
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Ventas */}
                <div className="p-2 rounded-lg bg-slate-800/30 border border-slate-700/20">
                  <div className="text-xs text-slate-400 mb-1">Ventas</div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-white">{stats.totalVentas}</span>
                    {stats.ventasPendientes > 0 && (
                      <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-400">
                        {stats.ventasPendientes} pendientes
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Cola de sincronización */}
                {stats.colaLength > 0 && (
                  <div className="col-span-2 p-2 rounded-lg bg-slate-800/30 border border-slate-700/20">
                    <div className="text-xs text-slate-400 mb-1">Cola de Sincronización</div>
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-medium text-white">
                        {stats.colaLength} elementos esperando
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Modo Offline Notice */}
          <AnimatePresence>
            {!isOnline && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-orange-200">
                    <p className="font-medium mb-1">Modo Offline Activado</p>
                    <p className="text-orange-300/80">
                      El sistema funciona normalmente. Los datos se sincronizarán automáticamente cuando se restaure la conexión.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error Notice */}
          <AnimatePresence>
            {syncStatus.status === 'error' && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-3 rounded-lg bg-red-500/10 border border-red-500/30"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-red-200">
                    <p className="font-medium mb-1">Error de Sincronización</p>
                    <p className="text-red-300/80">{syncStatus.message}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sin vincular — estado normal, no es un error */}
          <AnimatePresence>
            {syncStatus.status === 'unlinked' && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/30"
              >
                <div className="flex items-start gap-2">
                  <CloudOff className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-slate-300">
                    <p className="font-medium mb-1">Esperando conexión con app</p>
                    <p className="text-slate-400">
                      Esta caja aún no está vinculada a la app móvil. Si tu negocio tiene ese plan, actívalo en
                      Configuración → Sincronización con la Nube.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </PopoverContent>
    </Popover>
  );
}
