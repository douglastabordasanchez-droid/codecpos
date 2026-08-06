/**
 * SISTEMA DE BACKUP AUTOMÁTICO - CODEC POS v2.0
 * Exportación automática de datos críticos con encriptación opcional
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Download, Shield, Clock, CheckCircle2 } from 'lucide-react';

interface BackupConfig {
  enabled: boolean;
  frequencyDays: number;
  lastBackup?: string;
  autoDownload: boolean;
  encrypt: boolean;
}

export function AutoBackupSystem() {
  const [config, setConfig] = useState<BackupConfig>({
    enabled: true,
    frequencyDays: 7, // Backup cada 7 días por defecto
    autoDownload: true,
    encrypt: true,
  });

  useEffect(() => {
    // Cargar configuración guardada
    const savedConfig = localStorage.getItem('codecpos_backup_config');
    if (savedConfig) {
      setConfig(JSON.parse(savedConfig));
    }

    // Verificar si toca hacer backup
    checkAndRunBackup();

    // Programar verificación cada hora
    const interval = setInterval(() => {
      checkAndRunBackup();
    }, 60 * 60 * 1000); // Cada hora

    return () => clearInterval(interval);
  }, []);

  const checkAndRunBackup = () => {
    const savedConfig = localStorage.getItem('codecpos_backup_config');
    const currentConfig: BackupConfig = savedConfig 
      ? JSON.parse(savedConfig) 
      : config;

    if (!currentConfig.enabled) return;

    const lastBackup = currentConfig.lastBackup;
    const now = new Date();

    if (!lastBackup) {
      // Primera vez, hacer backup inmediato
      performBackup(currentConfig);
      return;
    }

    const lastBackupDate = new Date(lastBackup);
    const daysSinceLastBackup = Math.floor(
      (now.getTime() - lastBackupDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceLastBackup >= currentConfig.frequencyDays) {
      performBackup(currentConfig);
    }
  };

  const performBackup = (currentConfig: BackupConfig) => {
    try {
      console.log('🔐 Iniciando backup automático...');

      // Recopilar todos los datos críticos
      const backupData = {
        timestamp: new Date().toISOString(),
        version: '2.0',
        machineId: localStorage.getItem('codecpos_machine_id'),
        data: {
          productos: JSON.parse(localStorage.getItem('pos-productos') || '[]'),
          ventas: JSON.parse(localStorage.getItem('pos-ventas') || '[]'),
          clientes: JSON.parse(localStorage.getItem('pos-clientes') || '[]'),
          usuarios: JSON.parse(localStorage.getItem('pos-usuarios') || '[]'),
          configuracion: {
            negocio: localStorage.getItem('pos-nombre-negocio'),
            nit: localStorage.getItem('pos-nit'),
            direccion: localStorage.getItem('pos-direccion'),
            telefono: localStorage.getItem('pos-telefono'),
          },
          estadisticas: {
            totalProductos: JSON.parse(localStorage.getItem('pos-productos') || '[]').length,
            totalVentas: JSON.parse(localStorage.getItem('pos-ventas') || '[]').length,
            fechaBackup: new Date().toISOString(),
          },
        },
      };

      let jsonString = JSON.stringify(backupData, null, 2);

      // Encriptar si está habilitado (simple base64 para demo, en producción usar crypto real)
      if (currentConfig.encrypt) {
        jsonString = btoa(unescape(encodeURIComponent(jsonString)));
        console.log('🔒 Datos encriptados');
      }

      // Guardar en localStorage como último backup
      localStorage.setItem('codecpos_last_backup', jsonString);

      // Auto-descargar si está habilitado
      if (currentConfig.autoDownload) {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const fecha = new Date().toISOString().split('T')[0];
        const extension = currentConfig.encrypt ? 'encrypted' : 'json';
        a.download = `codecpos_backup_${fecha}.${extension}`;
        a.click();
        window.URL.revokeObjectURL(url);
        console.log('💾 Backup descargado automáticamente');
      }

      // Actualizar última fecha de backup
      const updatedConfig = {
        ...currentConfig,
        lastBackup: new Date().toISOString(),
      };
      localStorage.setItem('codecpos_backup_config', JSON.stringify(updatedConfig));
      setConfig(updatedConfig);

      toast.success('Backup automático completado', {
        description: `${backupData.data.estadisticas.totalProductos} productos | ${backupData.data.estadisticas.totalVentas} ventas`,
        icon: <Shield className="w-5 h-5 text-green-500" />,
        duration: 5000,
      });

      console.log('✅ Backup completado exitosamente');
    } catch (error) {
      console.error('❌ Error en backup automático:', error);
      toast.error('Error al realizar backup automático');
    }
  };

  const manualBackup = () => {
    performBackup(config);
  };

  // Este componente no renderiza nada visualmente, solo ejecuta lógica en background
  return null;
}

/**
 * Hook para usar el sistema de backup manualmente
 */
export function useBackup() {
  const createManualBackup = () => {
    try {
      const backupData = {
        timestamp: new Date().toISOString(),
        version: '2.0',
        machineId: localStorage.getItem('codecpos_machine_id'),
        data: {
          productos: JSON.parse(localStorage.getItem('pos-productos') || '[]'),
          ventas: JSON.parse(localStorage.getItem('pos-ventas') || '[]'),
          clientes: JSON.parse(localStorage.getItem('pos-clientes') || '[]'),
          usuarios: JSON.parse(localStorage.getItem('pos-usuarios') || '[]'),
        },
      };

      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const fecha = new Date().toISOString().split('T')[0];
      a.download = `codecpos_backup_manual_${fecha}.json`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast.success('Backup manual creado exitosamente', {
        icon: <Download className="w-5 h-5 text-blue-500" />,
      });

      return true;
    } catch (error) {
      console.error('Error creando backup manual:', error);
      toast.error('Error al crear backup');
      return false;
    }
  };

  const restoreBackup = (file: File) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          let backupData;

          // Intentar desencriptar si está encriptado
          try {
            const decrypted = decodeURIComponent(escape(atob(content)));
            backupData = JSON.parse(decrypted);
          } catch {
            // Si falla, asumir que no está encriptado
            backupData = JSON.parse(content);
          }

          // Restaurar datos
          if (backupData.data) {
            if (backupData.data.productos) {
              localStorage.setItem('pos-productos', JSON.stringify(backupData.data.productos));
            }
            if (backupData.data.ventas) {
              localStorage.setItem('pos-ventas', JSON.stringify(backupData.data.ventas));
            }
            if (backupData.data.clientes) {
              localStorage.setItem('pos-clientes', JSON.stringify(backupData.data.clientes));
            }
            if (backupData.data.usuarios) {
              localStorage.setItem('pos-usuarios', JSON.stringify(backupData.data.usuarios));
            }

            toast.success('Backup restaurado exitosamente', {
              description: 'Todos los datos han sido recuperados',
              icon: <CheckCircle2 className="w-5 h-5 text-green-500" />,
              duration: 5000,
            });

            resolve(true);
          } else {
            throw new Error('Formato de backup inválido');
          }
        } catch (error) {
          console.error('Error restaurando backup:', error);
          toast.error('Error al restaurar backup', {
            description: 'Verifica que el archivo sea válido',
          });
          reject(error);
        }
      };

      reader.readAsText(file);
    });
  };

  return {
    createManualBackup,
    restoreBackup,
  };
}
