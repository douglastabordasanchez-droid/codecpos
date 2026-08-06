/**
 * Sistema de Licencia y Anti-Piratería
 * MachineID único basado en UUID real del hardware
 * Trial de 7 días con bloqueo total
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { getRealMachineUUID } from '../utils/machineId';

export interface LicenseContextType {
  isLicensed: boolean;
  isTrialActive: boolean;
  daysRemaining: number;
  machineId: string;
  isLoadingMachineId: boolean;
  activateLicense: (key: string) => boolean;
  licenseInfo: {
    tipo: 'BASICO' | 'PREMIUM' | 'BLOQUEADO';
    fechaActivacion?: string;
    fechaExpiracion?: string;
    maxProductos: number;
    maxHistorialMeses: number;
    maxUsuarios: number;
    machineId: string;
    // Funcionalidades Premium
    features: {
      codecVerify: boolean;
      reportesAvanzados: boolean;
      exportarExcel: boolean;
      exportarPDF: boolean;
      facturacionElectronica: boolean;
      gestionGastos: boolean;
      alertasAvanzadas: boolean;
      backupNube: boolean;
      soportePrioritario: boolean;
      devoluciones: boolean;
      logoDeLaEmpresa: boolean;
      importarExportarInventario: boolean;
      inteligenciaDeNegocio: boolean;
    };
  };
}

const LicenseContext = createContext<LicenseContextType | undefined>(undefined);

export function LicenseProvider({ children }: { children: React.ReactNode }) {
  const [machineId, setMachineId] = useState('');
  const [isLoadingMachineId, setIsLoadingMachineId] = useState(true);
  const [isLicensed, setIsLicensed] = useState(false);
  const [isTrialActive, setIsTrialActive] = useState(true);
  const [daysRemaining, setDaysRemaining] = useState(7);

  // Generar MachineID único basado en UUID real del hardware
  const generateMachineId = async (): Promise<string> => {
    const uuid = await getRealMachineUUID();
    return uuid; // Retornar el UUID completo, no formateado
  };

  // Inicializar licencia
  useEffect(() => {
    const initializeLicense = async () => {
      console.log('🔐 Inicializando sistema de licencia...');
      
      const storedMachineId = localStorage.getItem('codecpos_machine_id');
      const storedLicense = localStorage.getItem('codecpos_license');
      const trialStartDate = localStorage.getItem('codecpos_trial_start');
      
      // Generar o recuperar MachineID
      let currentMachineId = storedMachineId;
      if (!currentMachineId) {
        console.log('⏳ Generando MachineID...');
        currentMachineId = await generateMachineId();
        localStorage.setItem('codecpos_machine_id', currentMachineId);
        console.log('✅ MachineID generado:', currentMachineId);
      } else {
        console.log('✅ MachineID recuperado:', currentMachineId);
      }
      
      setMachineId(currentMachineId);
      setIsLoadingMachineId(false);
      console.log('✅ MachineID listo');
      
      // Verificar licencia
      if (storedLicense) {
        try {
          const license = JSON.parse(storedLicense);
          // Validar que la licencia corresponda a este MachineID
          if (license.machineId === currentMachineId && license.key) {
            setIsLicensed(true);
            setIsTrialActive(false);
            setDaysRemaining(0);
            console.log('✅ Licencia PRO activada');
            return;
          }
        } catch (e) {
          console.error('❌ Error al verificar licencia:', e);
        }
      }
      
      // Modo TRIAL
      let startDate: number;
      if (trialStartDate) {
        startDate = parseInt(trialStartDate);
      } else {
        startDate = Date.now();
        localStorage.setItem('codecpos_trial_start', startDate.toString());
        console.log('🆓 Trial iniciado (7 días)');
      }
      
      // Calcular días restantes
      const daysPassed = Math.floor((Date.now() - startDate) / (1000 * 60 * 60 * 24));
      const remaining = Math.max(0, 7 - daysPassed);
      
      setDaysRemaining(remaining);
      setIsTrialActive(remaining > 0);
      setIsLicensed(false);
      
      if (remaining === 0) {
        console.log('🔒 SISTEMA BLOQUEADO - Trial expirado');
      } else {
        console.log(`⏰ Trial activo: ${remaining} días restantes`);
      }
      
      console.log('✅ Sistema de licencia inicializado completamente');
    };
    
    initializeLicense();
  }, []);

  // Activar licencia con clave
  const activateLicense = (key: string): boolean => {
    // Validar formato de clave: CODEC-PRO-XXXX-XXXX-XXXX
    const keyRegex = /^CODEC-PRO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    if (!keyRegex.test(key)) {
      return false;
    }
    
    // Generar clave válida basada en MachineID (algoritmo simple para demo)
    const expectedKey = generateLicenseKey(machineId);
    
    if (key === expectedKey) {
      const license = {
        key,
        machineId,
        activatedAt: new Date().toISOString(),
        type: 'PRO',
      };
      
      localStorage.setItem('codecpos_license', JSON.stringify(license));
      setIsLicensed(true);
      setIsTrialActive(false);
      setDaysRemaining(0);
      
      console.log('🎉 ¡Licencia PRO activada exitosamente!');
      return true;
    }
    
    return false;
  };

  // Generar clave de licencia válida para este MachineID
  const generateLicenseKey = (machineIdStr: string): string => {
    // Extraer números del MachineID
    const numbers = machineIdStr.replace(/[^0-9A-F]/g, '');
    
    // Algoritmo simple de generación (en producción usar encriptación real)
    let hash = 0;
    for (let i = 0; i < numbers.length; i++) {
      hash = ((hash << 5) - hash) + numbers.charCodeAt(i);
      hash = hash & hash;
    }
    
    const segment1 = Math.abs(hash).toString(16).toUpperCase().padStart(4, '0').substring(0, 4);
    const segment2 = Math.abs(hash * 2).toString(16).toUpperCase().padStart(4, '0').substring(0, 4);
    const segment3 = Math.abs(hash * 3).toString(16).toUpperCase().padStart(4, '0').substring(0, 4);
    
    return `CODEC-PRO-${segment1}-${segment2}-${segment3}`;
  };

  const licenseInfo = {
    tipo: isLicensed ? 'PREMIUM' : (isTrialActive ? 'BASICO' : 'BLOQUEADO') as 'BASICO' | 'PREMIUM' | 'BLOQUEADO',
    fechaActivacion: isLicensed ? localStorage.getItem('codecpos_trial_start') || undefined : undefined,
    maxProductos: isLicensed ? 20000 : (isTrialActive ? 100 : 0),
    maxHistorialMeses: isLicensed ? 3 : (isTrialActive ? 1 : 0),
    maxUsuarios: isLicensed ? 10 : (isTrialActive ? 1 : 0),
    machineId,
    // Funcionalidades Premium
    features: {
      codecVerify: isLicensed,
      reportesAvanzados: isLicensed,
      exportarExcel: isLicensed,
      exportarPDF: isLicensed,
      facturacionElectronica: isLicensed,
      gestionGastos: isLicensed,
      alertasAvanzadas: isLicensed,
      backupNube: isLicensed,
      soportePrioritario: isLicensed,
      devoluciones: isLicensed,
      logoDeLaEmpresa: isLicensed,
      importarExportarInventario: isLicensed,
      inteligenciaDeNegocio: isLicensed,
    },
  };

  return (
    <LicenseContext.Provider value={{
      isLicensed,
      isTrialActive,
      daysRemaining,
      machineId,
      isLoadingMachineId,
      activateLicense,
      licenseInfo,
    }}>
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense() {
  const context = useContext(LicenseContext);
  if (!context) {
    throw new Error('useLicense debe usarse dentro de LicenseProvider');
  }
  return context;
}

// Función helper para generar clave de activación (SOLO PARA DESARROLLO)
// En producción, estas claves se generarían en un servidor seguro
export function generarClaveDesarrollo(machineId: string): string {
  const numbers = machineId.replace(/[^0-9A-F]/g, '');
  let hash = 0;
  for (let i = 0; i < numbers.length; i++) {
    hash = ((hash << 5) - hash) + numbers.charCodeAt(i);
    hash = hash & hash;
  }
  
  const segment1 = Math.abs(hash).toString(16).toUpperCase().padStart(4, '0').substring(0, 4);
  const segment2 = Math.abs(hash * 2).toString(16).toUpperCase().padStart(4, '0').substring(0, 4);
  const segment3 = Math.abs(hash * 3).toString(16).toUpperCase().padStart(4, '0').substring(0, 4);
  
  return `CODEC-PRO-${segment1}-${segment2}-${segment3}`;
}

// Función exportada para generar MachineID único
export function generarMachineId(): string {
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