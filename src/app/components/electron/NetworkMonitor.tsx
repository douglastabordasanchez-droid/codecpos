/**
 * CODEC POS - Network Monitor
 * Monitorea conexión con Caja Maestra cada 30 segundos
 * Auto-sincroniza ventas pendientes cuando hay red
 */

import { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { usePOS } from '../../contexts/POSContext';

declare global {
  interface Window {
    electronAPI?: {
      checkNetwork: () => Promise<boolean>;
      syncData: () => Promise<{ success: boolean; message: string }>;
      isElectron: boolean;
    };
  }
}

export function NetworkMonitor() {
  const { darkMode } = usePOS();
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [pendingItems, setPendingItems] = useState(0);

  // Solo ejecutar en Electron
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

  // Verificar conexión cada 30 segundos
  useEffect(() => {
    if (!isElectron) return;

    const checkConnection = async () => {
      try {
        const online = await window.electronAPI!.checkNetwork();
        
        const wasOffline = !isOnline;
        setIsOnline(online);

        // Si se recuperó la conexión, sincronizar automáticamente
        if (online && wasOffline && pendingItems > 0) {
          console.log('🌐 Conexión recuperada - Iniciando sincronización automática');
          toast.success('Conexión restablecida', {
            description: 'Sincronizando datos pendientes...'
          });
          handleSync();
        }
      } catch (error) {
        console.error('Error al verificar red:', error);
        setIsOnline(false);
      }
    };

    // Verificar inmediatamente
    checkConnection();

    // Verificar cada 30 segundos
    const interval = setInterval(checkConnection, 30000);

    return () => clearInterval(interval);
  }, [isElectron, isOnline, pendingItems]);

  // Sincronizar datos
  const handleSync = async () => {
    if (!isElectron || !isOnline || isSyncing) return;

    setIsSyncing(true);

    try {
      const result = await window.electronAPI!.syncData();
      
      if (result.success) {
        setLastSync(new Date());
        setPendingItems(0);
        toast.success('Sincronización completada', {
          description: result.message
        });
      } else {
        toast.error('Error en sincronización');
      }
    } catch (error) {
      console.error('Error al sincronizar:', error);
      toast.error('Error al sincronizar datos');
    } finally {
      setIsSyncing(false);
    }
  };

  // Obtener ventas pendientes del backend
  useEffect(() => {
    if (!isElectron) return;

    const fetchPending = async () => {
      try {
        const response = await fetch('http://127.0.0.1:3969/api/sync/pending');
        const data = await response.json();
        setPendingItems(data.count || 0);
      } catch (error) {
        console.error('Error al obtener pendientes:', error);
      }
    };

    fetchPending();
    const interval = setInterval(fetchPending, 60000); // Cada minuto

    return () => clearInterval(interval);
  }, [isElectron]);

  // No mostrar en web
  if (!isElectron) return null;

  return (
    <div className={`fixed bottom-4 right-4 z-50 ${
      darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
    } border rounded-xl shadow-lg p-4 min-w-[280px]`}>
      {/* Estado de Red */}
      <div className="flex items-center gap-3 mb-3">
        {isOnline ? (
          <>
            <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
              <Wifi className="w-5 h-5 text-green-500" />
            </div>
            <div className="flex-1">
              <p className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                En línea
              </p>
              <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Conectado a Caja Maestra
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center animate-pulse">
              <WifiOff className="w-5 h-5 text-red-500" />
            </div>
            <div className="flex-1">
              <p className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Sin conexión
              </p>
              <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Modo offline activo
              </p>
            </div>
          </>
        )}
      </div>

      {/* Ventas Pendientes */}
      {pendingItems > 0 && (
        <div className={`p-3 rounded-lg mb-3 ${
          darkMode ? 'bg-amber-900/20 border border-amber-500/30' : 'bg-amber-50 border border-amber-200'
        }`}>
          <p className={`text-xs font-medium ${darkMode ? 'text-amber-400' : 'text-amber-800'}`}>
            ⚠️ {pendingItems} venta{pendingItems !== 1 ? 's' : ''} pendiente{pendingItems !== 1 ? 's' : ''} de sincronizar
          </p>
        </div>
      )}

      {/* Última Sincronización */}
      {lastSync && (
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle className="w-4 h-4 text-green-500" />
          <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Última sync: {lastSync.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      )}

      {/* Botón Sincronizar */}
      <button
        onClick={handleSync}
        disabled={!isOnline || isSyncing || pendingItems === 0}
        className={`w-full py-2 px-4 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
          isOnline && !isSyncing && pendingItems > 0
            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
            : darkMode
            ? 'bg-slate-700 text-gray-500 cursor-not-allowed'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
        }`}
      >
        <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
        {isSyncing ? 'Sincronizando...' : 'Sincronizar ahora'}
      </button>
    </div>
  );
}
