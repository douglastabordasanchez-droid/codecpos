import React, { useState, useEffect } from 'react';
import { AlertTriangle, Database, HardDrive, Zap, Clock, TrendingUp, CheckCircle, XCircle } from 'lucide-react';

interface SystemHealth {
  dbSize: number; // MB
  totalTransactions: number;
  daysActive: number;
  cacheSize: number; // MB
  performanceScore: number; // 0-100
  lastMaintenance: string | null;
  needsMaintenance: boolean;
  maintenanceReason: string[];
}

interface SystemHealthMonitorProps {
  onMaintenanceRequired?: (health: SystemHealth) => void;
}

export const SystemHealthMonitor: React.FC<SystemHealthMonitorProps> = ({ 
  onMaintenanceRequired 
}) => {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  // 🔍 Calcular salud del sistema
  const checkSystemHealth = (): SystemHealth => {
    // Obtener datos de localStorage
    const productos = JSON.parse(localStorage.getItem('codecpos_productos') || '[]');
    const ventas = JSON.parse(localStorage.getItem('codecpos_ventas') || '[]');
    const gastos = JSON.parse(localStorage.getItem('codecpos_gastos') || '[]');
    const devoluciones = JSON.parse(localStorage.getItem('codecpos_devoluciones') || '[]');
    const cierres = JSON.parse(localStorage.getItem('codecpos_cierres_caja') || '[]');
    const clientes = JSON.parse(localStorage.getItem('codecpos_dev_clientes') || '[]');
    const instalacion = localStorage.getItem('codecpos_instalacion_fecha');
    const lastMaintenance = localStorage.getItem('codecpos_last_maintenance');

    // Calcular tamaño aproximado de la base de datos
    let totalSize = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('codecpos_')) {
        const value = localStorage.getItem(key) || '';
        totalSize += (key.length + value.length) * 2; // 2 bytes por carácter
      }
    }
    const dbSizeMB = totalSize / (1024 * 1024);

    // Calcular días activos
    const instalacionDate = instalacion ? new Date(instalacion) : new Date();
    const daysActive = Math.floor((Date.now() - instalacionDate.getTime()) / (1000 * 60 * 60 * 24));

    // Calcular total de transacciones
    const totalTransactions = ventas.length + gastos.length + devoluciones.length + cierres.length;

    // Calcular tamaño de caché (archivos temporales, logs, etc.)
    const cacheKeys = ['codecpos_cache_', 'codecpos_temp_', 'codecpos_log_'];
    let cacheSize = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && cacheKeys.some(prefix => key.startsWith(prefix))) {
        const value = localStorage.getItem(key) || '';
        cacheSize += (key.length + value.length) * 2;
      }
    }
    const cacheSizeMB = cacheSize / (1024 * 1024);

    // 📊 Calcular puntuación de rendimiento (0-100)
    let performanceScore = 100;
    
    // Penalizar por tamaño de base de datos
    if (dbSizeMB > 50) performanceScore -= 15;
    if (dbSizeMB > 100) performanceScore -= 20;
    if (dbSizeMB > 200) performanceScore -= 25;
    
    // Penalizar por número de transacciones
    if (totalTransactions > 5000) performanceScore -= 10;
    if (totalTransactions > 10000) performanceScore -= 15;
    if (totalTransactions > 20000) performanceScore -= 20;
    
    // Penalizar por días sin mantenimiento
    const daysSinceMaintenance = lastMaintenance 
      ? Math.floor((Date.now() - new Date(lastMaintenance).getTime()) / (1000 * 60 * 60 * 24))
      : daysActive;
    
    if (daysSinceMaintenance > 180) performanceScore -= 15; // 6 meses
    if (daysSinceMaintenance > 240) performanceScore -= 25; // 8 meses
    if (daysSinceMaintenance > 300) performanceScore -= 35; // 10 meses
    
    // Penalizar por caché grande
    if (cacheSizeMB > 10) performanceScore -= 10;
    if (cacheSizeMB > 25) performanceScore -= 15;

    performanceScore = Math.max(0, performanceScore);

    // 🚨 Determinar si necesita mantenimiento
    const maintenanceReason: string[] = [];
    let needsMaintenance = false;

    if (daysSinceMaintenance >= 180) {
      needsMaintenance = true;
      maintenanceReason.push(`Hace ${Math.floor(daysSinceMaintenance / 30)} meses sin mantenimiento`);
    }
    
    if (dbSizeMB > 100) {
      needsMaintenance = true;
      maintenanceReason.push(`Base de datos grande (${dbSizeMB.toFixed(1)} MB)`);
    }
    
    if (totalTransactions > 10000) {
      needsMaintenance = true;
      maintenanceReason.push(`Más de ${(totalTransactions / 1000).toFixed(0)}k transacciones acumuladas`);
    }
    
    if (cacheSizeMB > 20) {
      needsMaintenance = true;
      maintenanceReason.push(`Caché grande (${cacheSizeMB.toFixed(1)} MB)`);
    }
    
    if (performanceScore < 60) {
      needsMaintenance = true;
      maintenanceReason.push('Rendimiento degradado del sistema');
    }

    return {
      dbSize: dbSizeMB,
      totalTransactions,
      daysActive,
      cacheSize: cacheSizeMB,
      performanceScore,
      lastMaintenance,
      needsMaintenance,
      maintenanceReason,
    };
  };

  // 🔄 Verificar salud al montar componente
  useEffect(() => {
    setIsChecking(true);
    const systemHealth = checkSystemHealth();
    setHealth(systemHealth);
    setIsChecking(false);

    // Notificar si necesita mantenimiento
    if (systemHealth.needsMaintenance && onMaintenanceRequired) {
      onMaintenanceRequired(systemHealth);
    }

    // Verificar cada 30 minutos
    const interval = setInterval(() => {
      const updatedHealth = checkSystemHealth();
      setHealth(updatedHealth);
      
      if (updatedHealth.needsMaintenance && onMaintenanceRequired) {
        onMaintenanceRequired(updatedHealth);
      }
    }, 30 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  if (!health) return null;

  return (
    <div className="hidden">
      {/* Componente silencioso que solo monitorea */}
    </div>
  );
};

// 🎯 Hook para usar el monitor de salud
export const useSystemHealth = () => {
  const [health, setHealth] = useState<SystemHealth | null>(null);

  useEffect(() => {
    const checkHealth = () => {
      // Copiar la lógica de checkSystemHealth
      const productos = JSON.parse(localStorage.getItem('codecpos_productos') || '[]');
      const ventas = JSON.parse(localStorage.getItem('codecpos_ventas') || '[]');
      const gastos = JSON.parse(localStorage.getItem('codecpos_gastos') || '[]');
      const devoluciones = JSON.parse(localStorage.getItem('codecpos_devoluciones') || '[]');
      const cierres = JSON.parse(localStorage.getItem('codecpos_cierres_caja') || '[]');
      const instalacion = localStorage.getItem('codecpos_instalacion_fecha');
      const lastMaintenance = localStorage.getItem('codecpos_last_maintenance');

      let totalSize = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('codecpos_')) {
          const value = localStorage.getItem(key) || '';
          totalSize += (key.length + value.length) * 2;
        }
      }
      const dbSizeMB = totalSize / (1024 * 1024);

      const instalacionDate = instalacion ? new Date(instalacion) : new Date();
      const daysActive = Math.floor((Date.now() - instalacionDate.getTime()) / (1000 * 60 * 60 * 24));
      const totalTransactions = ventas.length + gastos.length + devoluciones.length + cierres.length;

      const cacheKeys = ['codecpos_cache_', 'codecpos_temp_', 'codecpos_log_'];
      let cacheSize = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && cacheKeys.some(prefix => key.startsWith(prefix))) {
          const value = localStorage.getItem(key) || '';
          cacheSize += (key.length + value.length) * 2;
        }
      }
      const cacheSizeMB = cacheSize / (1024 * 1024);

      let performanceScore = 100;
      if (dbSizeMB > 50) performanceScore -= 15;
      if (dbSizeMB > 100) performanceScore -= 20;
      if (dbSizeMB > 200) performanceScore -= 25;
      if (totalTransactions > 5000) performanceScore -= 10;
      if (totalTransactions > 10000) performanceScore -= 15;
      if (totalTransactions > 20000) performanceScore -= 20;
      
      const daysSinceMaintenance = lastMaintenance 
        ? Math.floor((Date.now() - new Date(lastMaintenance).getTime()) / (1000 * 60 * 60 * 24))
        : daysActive;
      
      if (daysSinceMaintenance > 180) performanceScore -= 15;
      if (daysSinceMaintenance > 240) performanceScore -= 25;
      if (daysSinceMaintenance > 300) performanceScore -= 35;
      
      if (cacheSizeMB > 10) performanceScore -= 10;
      if (cacheSizeMB > 25) performanceScore -= 15;

      performanceScore = Math.max(0, performanceScore);

      const maintenanceReason: string[] = [];
      let needsMaintenance = false;

      if (daysSinceMaintenance >= 180) {
        needsMaintenance = true;
        maintenanceReason.push(`Hace ${Math.floor(daysSinceMaintenance / 30)} meses sin mantenimiento`);
      }
      
      if (dbSizeMB > 100) {
        needsMaintenance = true;
        maintenanceReason.push(`Base de datos grande (${dbSizeMB.toFixed(1)} MB)`);
      }
      
      if (totalTransactions > 10000) {
        needsMaintenance = true;
        maintenanceReason.push(`Más de ${(totalTransactions / 1000).toFixed(0)}k transacciones acumuladas`);
      }
      
      if (cacheSizeMB > 20) {
        needsMaintenance = true;
        maintenanceReason.push(`Caché grande (${cacheSizeMB.toFixed(1)} MB)`);
      }
      
      if (performanceScore < 60) {
        needsMaintenance = true;
        maintenanceReason.push('Rendimiento degradado del sistema');
      }

      setHealth({
        dbSize: dbSizeMB,
        totalTransactions,
        daysActive,
        cacheSize: cacheSizeMB,
        performanceScore,
        lastMaintenance,
        needsMaintenance,
        maintenanceReason,
      });
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5 * 60 * 1000); // Cada 5 minutos
    return () => clearInterval(interval);
  }, []);

  return health;
};

export type { SystemHealth };
