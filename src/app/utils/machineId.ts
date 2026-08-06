/**
 * CODEC POS - Sistema de MachineID Real
 * Obtiene el UUID de hardware real del sistema operativo
 * Requiere Electron para acceso a APIs de Node.js
 */

/**
 * Obtiene el UUID real de la máquina usando comandos nativos del SO
 * Windows: wmic csproduct get uuid
 * macOS: system_profiler SPHardwareDataType | grep "Hardware UUID"
 * Linux: cat /etc/machine-id o dmidecode
 */
export async function getRealMachineUUID(): Promise<string> {
  try {
    // Verificar si estamos en Electron
    const isElectron = navigator.userAgent.includes('Electron');
    
    if (!isElectron) {
      console.warn('⚠️ No se detectó Electron. Usando fallback de MachineID.');
      return generateFallbackMachineId();
    }

    // Acceder a la API de Electron a través del window
    const electron = (window as any).electron;
    
    if (!electron || !electron.getMachineId) {
      console.warn('⚠️ API de Electron no disponible. Usando fallback.');
      return generateFallbackMachineId();
    }

    // Obtener el UUID real del sistema
    const realUUID = await electron.getMachineId();
    
    if (!realUUID || realUUID === 'CODEC-0000-0000-0000') {
      console.warn('⚠️ No se pudo obtener UUID real. Usando fallback.');
      return generateFallbackMachineId();
    }

    console.log('✅ UUID real obtenido:', realUUID);
    return realUUID;
    
  } catch (error) {
    console.error('❌ Error obteniendo UUID real:', error);
    return generateFallbackMachineId();
  }
}

/**
 * Genera un MachineID de respaldo basado en fingerprinting del navegador
 * Se usa cuando no se puede obtener el UUID real
 */
function generateFallbackMachineId(): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // Canvas fingerprint
  if (ctx) {
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('CODEC-POS-2025', 2, 2);
  }
  const canvasData = canvas.toDataURL();
  
  // Combinar datos del sistema
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.colorDepth,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset(),
    !!window.sessionStorage,
    !!window.localStorage,
    canvasData.substring(0, 100),
    navigator.hardwareConcurrency || 0,
    navigator.deviceMemory || 0,
  ].join('|');
  
  // Hash simple para generar ID único
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  const uniqueId = Math.abs(hash).toString(16).toUpperCase().padStart(12, '0');
  return `CODEC-${uniqueId.substring(0, 4)}-${uniqueId.substring(4, 8)}-${uniqueId.substring(8, 12)}`;
}

/**
 * Formatea un UUID para que tenga el formato estándar
 * Ejemplo: 053AB44C-3059-11B2-A85C-C55A8EBA4E8B
 */
export function formatUUID(uuid: string): string {
  // Eliminar guiones y espacios
  const cleaned = uuid.replace(/[-\s]/g, '');
  
  // Verificar longitud
  if (cleaned.length !== 32) {
    console.warn('⚠️ UUID con formato inválido:', uuid);
    return uuid;
  }
  
  // Formatear como UUID estándar: 8-4-4-4-12
  return `${cleaned.substring(0, 8)}-${cleaned.substring(8, 12)}-${cleaned.substring(12, 16)}-${cleaned.substring(16, 20)}-${cleaned.substring(20, 32)}`.toUpperCase();
}
