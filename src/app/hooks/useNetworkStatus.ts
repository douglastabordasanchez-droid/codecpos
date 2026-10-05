/**
 * Hook para monitorear el estado de la conexión de red
 */

import { useState, useEffect } from 'react';
import { syncService, SyncStatus } from '../lib/syncService';
import { verificarYSubirBackupNube } from '../lib/supabase/backupCloudService';
import { electronStore } from '../lib/electronStore';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    status: 'offline',
    message: 'Iniciando...',
    lastSync: null
  });

  useEffect(() => {
    syncService.start().catch(() => {});
    // ☁️ Respaldo automático a la nube cada 15 días — mismo criterio "chequeo
    // al abrir la app" que el backup diario descargable (backupService.ts).
    verificarYSubirBackupNube().catch(() => {});

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

    // Una venta recién cobrada sube a la nube en segundos (el ciclo normal es cada minuto).
    const subirVenta = () => syncService.subirPendientesPronto();
    electronStore.onVentaNueva(subirVenta);

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
      electronStore.offVentaNueva(subirVenta);
      // 🚀 FIX rendimiento: cierra el canal de Supabase Realtime y el
      // polling de auto-sync — antes no se llamaba nunca a stop() y el
      // canal `productos-sync-*` quedaba abierto para siempre.
      syncService.stop();
    };
  }, []);

  return {
    isOnline,
    syncStatus,
    forceSync: () => syncService.forceSyncNow()
  };
}
