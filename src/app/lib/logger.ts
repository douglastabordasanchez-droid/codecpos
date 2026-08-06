/**
 * Sistema de Logging Estructurado
 * CODEC POS v2.0
 */

import { dbManager } from './indexedDB';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

interface LogEntry {
  nivel: LogLevel;
  timestamp: string;
  mensaje: string;
  contexto?: any;
  error?: {
    message: string;
    stack?: string;
    name?: string;
  };
  usuario?: string;
  version: string;
  ambiente: 'development' | 'production';
}

class Logger {
  private readonly APP_VERSION = '2.0.0';
  private readonly MAX_LOGS = 10000; // Máximo de logs en IndexedDB
  private logBuffer: LogEntry[] = [];
  private flushInterval: number | null = null;
  // 🚀 FIX rendimiento: antes cada log() disparaba de inmediato un IPC hacia
  // el proceso Main con una escritura síncrona a disco (fs.appendFileSync)
  // — en cada login/logout y cada "no crítico" registrado en cualquier parte
  // de la app. Se acumulan las líneas y se vuelcan cada 3s en un solo IPC;
  // CRITICAL sigue escribiéndose de inmediato porque es evidencia de auditoría.
  private fileLogBuffer: Array<{ nivel: LogLevel; linea: string; contexto?: any }> = [];
  private fileFlushInterval: number | null = null;

  constructor() {
    this.startAutoFlush();
    this.startFileLogAutoFlush();
    this.cleanOldLogs();
  }

  /**
   * Log de depuración (solo en desarrollo)
   */
  debug(mensaje: string, contexto?: any) {
    if (import.meta.env.DEV) {
      console.log(`🔍 [DEBUG] ${mensaje}`, contexto);
      this.log('DEBUG', mensaje, contexto);
    }
  }

  /**
   * Log de información general
   */
  info(mensaje: string, contexto?: any) {
    console.log(`ℹ️ [INFO] ${mensaje}`, contexto);
    this.log('INFO', mensaje, contexto);
  }

  /**
   * Log de advertencia
   */
  warn(mensaje: string, contexto?: any) {
    console.warn(`⚠️ [WARN] ${mensaje}`, contexto);
    this.log('WARN', mensaje, contexto);
  }

  /**
   * Log de error
   */
  error(mensaje: string, error?: Error, contexto?: any) {
    console.error(`❌ [ERROR] ${mensaje}`, error, contexto);
    
    const errorData = error ? {
      message: error.message,
      stack: error.stack,
      name: error.name,
    } : undefined;

    this.log('ERROR', mensaje, contexto, errorData);
  }

  /**
   * Log crítico (errores que afectan funcionalidad principal)
   */
  critical(mensaje: string, error?: Error, contexto?: any) {
    console.error(`🚨 [CRITICAL] ${mensaje}`, error, contexto);
    
    const errorData = error ? {
      message: error.message,
      stack: error.stack,
      name: error.name,
    } : undefined;

    this.log('CRITICAL', mensaje, contexto, errorData);

    // Notificar al usuario de errores críticos
    this.notifyUser(mensaje);
  }

  /**
   * Log interno
   */
  private log(nivel: LogLevel, mensaje: string, contexto?: any, error?: any) {
    const entry: LogEntry = {
      nivel,
      timestamp: new Date().toISOString(),
      mensaje,
      contexto,
      error,
      usuario: this.getCurrentUser(),
      version: this.APP_VERSION,
      ambiente: import.meta.env.DEV ? 'development' : 'production',
    };

    // Agregar a buffer
    this.logBuffer.push(entry);

    // Si el buffer es muy grande, hacer flush inmediatamente
    if (this.logBuffer.length >= 50) {
      this.flush();
    }

    // 🛡️ Caja negra: además de IndexedDB (que puede corromperse), cada entrada
    // también se escribe en el .log físico fuera de %AppData% a través del
    // proceso Main. Esto garantiza que quede evidencia aunque el propio
    // almacenamiento local de la app falle o sea borrado.
    //
    // 🚀 FIX rendimiento: antes esto era un IPC + escritura a disco síncrona
    // en CADA llamada a logger.info/warn/error — en cada login/logout y cada
    // "no crítico" de la app. Se difiere en un buffer y se vuelca cada 3s,
    // excepto CRITICAL que sigue escribiéndose de inmediato (es evidencia de
    // auditoría y no debe arriesgarse a perderse si la app crashea antes del
    // siguiente flush).
    const linea = `[${entry.usuario}] ${mensaje}`;
    if (nivel === 'CRITICAL') {
      try { window.electron?.logs?.write(nivel, linea, { ...contexto, error }); } catch { /* nunca debe romper el flujo */ }
    } else {
      this.fileLogBuffer.push({ nivel, linea, contexto: { ...contexto, error } });
      if (this.fileLogBuffer.length >= 50) this.flushFileLog();
    }
  }

  /**
   * Auto-flush del log físico (buffer de writeLog vía IPC) cada 3 segundos.
   */
  private startFileLogAutoFlush() {
    this.fileFlushInterval = window.setInterval(() => this.flushFileLog(), 3000);
  }

  private flushFileLog() {
    if (this.fileLogBuffer.length === 0) return;
    const pendientes = this.fileLogBuffer;
    this.fileLogBuffer = [];
    try {
      for (const entrada of pendientes) {
        window.electron?.logs?.write(entrada.nivel, entrada.linea, entrada.contexto);
      }
    } catch { /* nunca debe romper el flujo por un problema de logging */ }
  }

  /**
   * Guardar logs en IndexedDB
   */
  private async flush() {
    if (this.logBuffer.length === 0) return;

    const logsToSave = [...this.logBuffer];
    this.logBuffer = [];

    try {
      for (const log of logsToSave) {
        await dbManager.addLog(log.nivel, log.mensaje, {
          ...log.contexto,
          error: log.error,
          usuario: log.usuario,
          version: log.version,
          ambiente: log.ambiente,
        });
      }
    } catch (error) {
      console.error('Error guardando logs:', error);
    }
  }

  /**
   * Auto-flush cada 10 segundos
   */
  private startAutoFlush() {
    this.flushInterval = window.setInterval(() => {
      this.flush();
    }, 10000); // 10 segundos
  }

  /**
   * Limpiar logs antiguos (mantener solo últimos 10,000)
   */
  private async cleanOldLogs() {
    try {
      const logs = await dbManager.getAllLogs();
      
      if (logs.length > this.MAX_LOGS) {
        // Ordenar por timestamp (más antiguos primero)
        const sortedLogs = logs.sort((a, b) => {
          const timeA = new Date(a.timestamp).getTime();
          const timeB = new Date(b.timestamp).getTime();
          return timeA - timeB;
        });

        // Eliminar los más antiguos
        const logsToDelete = sortedLogs.slice(0, logs.length - this.MAX_LOGS);
        
        for (const log of logsToDelete) {
          await dbManager.deleteLog(log.id);
        }

        console.log(`🧹 ${logsToDelete.length} logs antiguos eliminados`);
      }
    } catch (error) {
      console.error('Error limpiando logs antiguos:', error);
    }
  }

  /**
   * Obtener usuario actual
   */
  private getCurrentUser(): string {
    try {
      const userStr = localStorage.getItem('pos-user');
      if (userStr) {
        const user = JSON.parse(userStr);
        return user.username || 'desconocido';
      }
    } catch (error) {
      // Ignorar
    }
    return 'sistema';
  }

  /**
   * Notificar al usuario de errores críticos
   */
  private notifyUser(mensaje: string) {
    // Si estamos en Electron, mostrar notificación del sistema
    if (window.electron?.showNotification) {
      window.electron.showNotification({
        title: 'Error Crítico - CODEC POS',
        body: mensaje,
        urgency: 'critical',
      });
    }

    // También mostrar toast
    if (window.showToast) {
      window.showToast({
        type: 'error',
        title: 'Error Crítico',
        message: mensaje,
      });
    }
  }

  /**
   * Obtener logs recientes para debugging
   */
  async getRecentLogs(limit: number = 100): Promise<any[]> {
    try {
      const logs = await dbManager.getAllLogs();
      return logs
        .sort((a, b) => {
          const timeA = new Date(a.timestamp).getTime();
          const timeB = new Date(b.timestamp).getTime();
          return timeB - timeA; // Más recientes primero
        })
        .slice(0, limit);
    } catch (error) {
      console.error('Error obteniendo logs:', error);
      return [];
    }
  }

  /**
   * Exportar logs para soporte técnico
   */
  async exportLogs(): Promise<string> {
    try {
      const logs = await this.getRecentLogs(1000);
      const exportData = {
        version: this.APP_VERSION,
        exportDate: new Date().toISOString(),
        logs,
      };
      
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('Error exportando logs:', error);
      return '{"error": "No se pudieron exportar los logs"}';
    }
  }

  /**
   * Detener auto-flush (al cerrar app)
   */
  destroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flush(); // Flush final
  }
}

// Singleton
export const logger = new Logger();

// Exportar para uso en window (debugging en consola)
if (typeof window !== 'undefined') {
  (window as any).logger = logger;
}

/**
 * logAction — Función helper exportada para los servicios avanzados.
 * Registra una acción en el log de la aplicación.
 * Si falla, no lanza error para no interrumpir el flujo principal.
 */
export async function logAction(
  modulo: string,
  accion: string,
  datos?: any
): Promise<void> {
  try {
    logger.info(`[${modulo}] ${accion}`, datos);
  } catch {
    // Silencioso: el logging nunca debe romper el flujo de negocio
  }
}