/**
 * CODEC POS v2.0 - Hook para Detección Automática de Códigos de Barras
 * Detecta automáticamente cuando se escanea un código con lector USB
 * Compatible con EAN-13, UPC, Code128, Code39, etc.
 */

import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';

interface BarcodeScannerOptions {
  onScan: (barcode: string) => void;
  minLength?: number; // Longitud mínima del código (default: 3)
  maxLength?: number; // Longitud máxima del código (default: 20)
  scanTimeout?: number; // Tiempo máximo entre teclas en ms (default: 50)
  enabled?: boolean; // Si el scanner está habilitado (default: true)
  preventDefault?: boolean; // Prevenir comportamiento por defecto (default: true)
  playSound?: boolean; // Reproducir sonido al escanear (default: true)
  debug?: boolean; // Modo debug para logs (default: false)
}

/**
 * Hook personalizado para detectar códigos de barras escaneados
 * 
 * @example
 * useBarcodeScanner({
 *   onScan: (barcode) => {
 *     console.log('Código escaneado:', barcode);
 *     // Buscar producto y agregarlo al carrito
 *   },
 *   enabled: true
 * });
 */
export function useBarcodeScanner({
  onScan,
  minLength = 3,
  maxLength = 20,
  scanTimeout = 50,
  enabled = true,
  preventDefault = true,
  playSound = true,
  debug = false,
}: BarcodeScannerOptions) {
  const barcodeBuffer = useRef<string>('');
  const lastKeyTime = useRef<number>(0);
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Función para reproducir sonido de escaneo
  const playBeep = useCallback(() => {
    if (!playSound) return;
    
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 1000; // 1000 Hz
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
      if (debug) console.log('No se pudo reproducir sonido:', error);
    }
  }, [playSound, debug]);

  // Procesar el código escaneado
  const processBarcode = useCallback((barcode: string) => {
    const trimmedBarcode = barcode.trim();
    
    if (trimmedBarcode.length < minLength) {
      if (debug) console.log('❌ Código muy corto:', trimmedBarcode);
      return;
    }
    
    if (trimmedBarcode.length > maxLength) {
      if (debug) console.log('❌ Código muy largo:', trimmedBarcode);
      return;
    }
    
    if (debug) {
      console.log('✅ Código de barras detectado:', trimmedBarcode);
    }
    
    // Reproducir sonido
    playBeep();
    
    // Llamar al callback
    onScan(trimmedBarcode);
  }, [onScan, minLength, maxLength, playBeep, debug]);

  // Manejar eventos de teclado
  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;
    
    const currentTime = Date.now();
    const timeDiff = currentTime - lastKeyTime.current;
    
    // Si pasó mucho tiempo desde la última tecla, reiniciar buffer
    if (timeDiff > scanTimeout && barcodeBuffer.current.length > 0) {
      if (debug) console.log('⏱️ Timeout, reiniciando buffer');
      barcodeBuffer.current = '';
    }
    
    lastKeyTime.current = currentTime;
    
    // Detectar Enter (final del escaneo)
    if (event.key === 'Enter') {
      if (preventDefault) {
        event.preventDefault();
        event.stopPropagation();
      }
      
      if (barcodeBuffer.current.length > 0) {
        processBarcode(barcodeBuffer.current);
        barcodeBuffer.current = '';
      }
      
      // Limpiar timeout
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
      
      return;
    }
    
    // Ignorar teclas especiales
    if (event.key.length > 1 && event.key !== 'Enter') {
      return;
    }
    
    // Agregar carácter al buffer
    barcodeBuffer.current += event.key;
    
    if (debug) {
      console.log('📝 Buffer actual:', barcodeBuffer.current);
    }
    
    // Prevenir que el input se escriba en campos de texto
    // Solo si viene de un scanner (rápido)
    if (timeDiff < scanTimeout && preventDefault) {
      const target = event.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' || 
                          target.tagName === 'TEXTAREA' || 
                          target.isContentEditable;
      
      // Si NO es un campo de input, prevenir
      if (!isInputField) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    
    // Auto-reset después de timeout
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }
    
    scanTimeoutRef.current = setTimeout(() => {
      if (barcodeBuffer.current.length > 0) {
        if (debug) console.log('⏱️ Timeout automático, reiniciando buffer');
        barcodeBuffer.current = '';
      }
    }, scanTimeout * 10); // 10x el timeout entre teclas
    
  }, [enabled, scanTimeout, preventDefault, processBarcode, debug]);

  // Registrar listener de teclado
  useEffect(() => {
    if (!enabled) return;
    
    if (debug) {
      console.log('🔍 Scanner de códigos de barras activado');
    }
    
    window.addEventListener('keypress', handleKeyPress);
    
    return () => {
      window.removeEventListener('keypress', handleKeyPress);
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
      if (debug) {
        console.log('🔍 Scanner de códigos de barras desactivado');
      }
    };
  }, [enabled, handleKeyPress, debug]);

  // Función manual para simular escaneo (útil para testing)
  const simulateScan = useCallback((barcode: string) => {
    processBarcode(barcode);
  }, [processBarcode]);

  return {
    simulateScan,
  };
}

/**
 * Formatea un código de barras según su tipo
 */
export function formatBarcode(barcode: string): {
  formatted: string;
  type: string;
  valid: boolean;
} {
  const cleaned = barcode.replace(/\D/g, ''); // Solo dígitos
  
  // EAN-13 (13 dígitos)
  if (cleaned.length === 13) {
    return {
      formatted: cleaned,
      type: 'EAN-13',
      valid: validateEAN13(cleaned),
    };
  }
  
  // EAN-8 (8 dígitos)
  if (cleaned.length === 8) {
    return {
      formatted: cleaned,
      type: 'EAN-8',
      valid: validateEAN8(cleaned),
    };
  }
  
  // UPC-A (12 dígitos)
  if (cleaned.length === 12) {
    return {
      formatted: cleaned,
      type: 'UPC-A',
      valid: validateUPCA(cleaned),
    };
  }
  
  // Code128 u otros (alfanumérico)
  return {
    formatted: barcode.toUpperCase(),
    type: 'Code128/Other',
    valid: barcode.length >= 3 && barcode.length <= 20,
  };
}

/**
 * Valida un código EAN-13
 */
function validateEAN13(code: string): boolean {
  if (code.length !== 13) return false;
  
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(code[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(code[12]);
}

/**
 * Valida un código EAN-8
 */
function validateEAN8(code: string): boolean {
  if (code.length !== 8) return false;
  
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const digit = parseInt(code[i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(code[7]);
}

/**
 * Valida un código UPC-A
 */
function validateUPCA(code: string): boolean {
  if (code.length !== 12) return false;
  
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const digit = parseInt(code[i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(code[11]);
}

/**
 * Genera un código EAN-13 válido a partir de 12 dígitos
 */
export function generateEAN13(code12: string): string {
  const cleaned = code12.replace(/\D/g, '').slice(0, 12).padStart(12, '0');
  
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(cleaned[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  
  const checkDigit = (10 - (sum % 10)) % 10;
  return cleaned + checkDigit;
}
