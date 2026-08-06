/**
 * CODEC POS v2.0 - Global Type Definitions
 */

// Extend Window interface para Electron APIs expuestas en preload.cjs
interface Window {
  electron?: {
    getMachineId:        () => Promise<string>;
    isAdmin:             () => Promise<boolean>;
    isSoftwareRendering?: () => Promise<boolean>;
    requestAdminRestart: () => Promise<void>;
    getOSInfo:           () => Promise<{
      platform: string;
      release:  string;
      version:  string;
      arch:     string;
      hostname: string;
      isAdmin:  boolean;
    }>;
    getAppVersion:       () => Promise<string>;
    saveBackup: (data: { fileName: string; data: string }) => Promise<{
      success: boolean;
      path?:   string;
      error?:  string;
    }>;
    showNotification: (data: {
      title:    string;
      body:     string;
      urgency?: 'normal' | 'critical' | 'low';
    }) => Promise<{ success: boolean; error?: string }>;
    toggleFullscreen: () => Promise<boolean>;
    isFullscreen:     () => Promise<boolean>;
    setFullscreen:    (value: boolean) => Promise<boolean>;
    relaunch:         () => Promise<void>;

    // 🛡️ BLINDAJE — Respaldo automático en ruta segura fuera de %AppData%
    backup?: {
      saveSafe: (jsonString: string) => Promise<{ success: boolean; fileName?: string; filePath?: string; bytes?: number; error?: string }>;
      list: () => Promise<{ success: boolean; backups: Array<{ fileName: string; fecha: string; size: number; integro: boolean | null }>; error?: string }>;
      read: (fileName: string) => Promise<{ success: boolean; data?: string; error?: string }>;
      getLastInfo: () => Promise<{ success: boolean; info: { fileName: string; fecha: string; size: number; integro: boolean | null } | null; error?: string }>;
      getDir: () => Promise<string>;
      repair: () => Promise<{ success: boolean; error?: string }>;
      onBeforeQuitBackup: (cb: () => void) => void;
      notifyQuitBackupComplete: () => void;
    };

    // 🛡️ BLINDAJE — Caja negra de auditoría física (.log en disco)
    logs?: {
      readRecent: (limit?: number) => Promise<{ success: boolean; lines: string[]; error?: string }>;
      write: (level: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL', message: string, meta?: any) => Promise<{ success: boolean }>;
      getDir: () => Promise<string>;
    };

    // 🛡️ BLINDAJE — Telemetría del sistema para la Sección de Desarrollador
    system?: {
      getTelemetry: () => Promise<{
        windowsUser: string;
        storagePath: string;
        userDataPath: string;
        dbSizeBytes: number;
        lastBackup: { fileName: string; fecha: string; size: number; integro: boolean | null } | null;
        backupsDir: string;
        logsDir: string;
      }>;
      getDiskSpace: () => Promise<{ freeBytes: number | null; usedBytes: number | null; drive: string }>;
    };
  };
  // ✅ NUEVO: API de persistencia de usuarios en Electron
  electronAPI?: {
    guardarUsuarios: (usuarios: any[]) => Promise<{
      success: boolean;
      path?: string;
      count?: number;
      error?: string;
    }>;
    cargarUsuarios: () => Promise<{
      success: boolean;
      usuarios: any[];
      source: 'main' | 'backup' | 'none';
      error?: string;
    }>;
    verificarUsuarios: () => Promise<{
      success: boolean;
      mainFileExists: boolean;
      backupFileExists: boolean;
      userDataPath?: string;
      usuariosFolder?: string;
      mainFileSize?: number;
      mainFileModified?: string;
      backupFileSize?: number;
      backupFileModified?: string;
      error?: string;
    }>;
  };
  showToast?: (data: { type: string; title: string; message: string }) => void;
  logger?: any;
}

// Declaración de módulos para assets
declare module 'figma:asset/*' {
  const content: string;
  export default content;
}

declare module '*.svg' {
  const content: any;
  export default content;
}

declare module '*.png' {
  const content: string;
  export default content;
}

declare module '*.jpg' {
  const content: string;
  export default content;
}

declare module '*.jpeg' {
  const content: string;
  export default content;
}

declare module '*.gif' {
  const content: string;
  export default content;
}

declare module '*.webp' {
  const content: string;
  export default content;
}