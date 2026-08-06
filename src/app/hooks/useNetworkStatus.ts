/**
 * Hook para monitorear el estado de la conexión de red
 */

import { useState, useEffect } from 'react';
import { syncService, SyncStatus } from '../lib/syncService';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    status: 'offline',
    message: 'Iniciando...',
    lastSync: null
  });

  useEffect(() => {
    syncService.start().catch(() => {});

    const handleOnline = () => {
      console.log('🌐 Conexión restaurada');
      setIsOnline(true);
      // Forzar sincronización cuando se recupera la conexión
      syncService.forceSyncNow();
    };

    const handleOffline = () => {
      console.log('📡 Conexión perdida - modo offline activado');
      setIsOnline(false);
    };

    const handleSyncStatusChange = (status: SyncStatus) => {
      setSyncStatus(status);
    };

    // Agregar listeners de red
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Agregar listener de sincronización
    syncService.addListener(handleSyncStatusChange);

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      syncService.removeListener(handleSyncStatusChange);
    };
  }, []);

  return {
    isOnline,
    syncStatus,
    forceSync: () => syncService.forceSyncNow()
  };
}
