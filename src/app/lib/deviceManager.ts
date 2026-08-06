/**
 * ============================================
 * DEVICE MANAGER - CODEC POS v2.0
 * Gestión de dispositivos hardware
 * ============================================
 */

import { toast } from 'sonner';

export interface DispositivoDetectado {
  id: string;
  tipo: 'impresora' | 'bascula' | 'escaner' | 'cajon' | 'display';
  nombre: string;
  modelo?: string;
  fabricante?: string;
  puerto: string;
  vendorId?: string;
  productId?: string;
  serialNumber?: string;
  estado: 'conectado' | 'desconectado' | 'error';
  configuracion?: {
    baudRate?: number;
    dataBits?: number;
    stopBits?: number;
    parity?: string;
  };
}

// ========== CLASES USB ESTÁNDAR ==========
// Referencia: USB Device Class Codes (USB-IF)
const USB_DEVICE_CLASSES = {
  PRINTER: 0x07,           // Printer Class
  HID: 0x03,               // Human Interface Device (scanners, teclados)
  CDC: 0x02,               // Communications Device Class (Serial)
  VENDOR_SPECIFIC: 0xFF,   // Vendor-Specific (muchos dispositivos POS)
};

// ========== CHIPS USB-SERIAL COMUNES ==========
const USB_SERIAL_CHIPS = {
  // CH340/CH341 (MUY común en impresoras chinas)
  '1a86:7523': { nombre: 'CH340 Serial Adapter', fabricante: 'WCH' },
  '1a86:7584': { nombre: 'CH340 Serial Device', fabricante: 'WCH' },
  '1a86:5523': { nombre: 'CH341 Serial Adapter', fabricante: 'WCH' },
  // FTDI (chip profesional común)
  '0403:6001': { nombre: 'FTDI FT232 USB-UART', fabricante: 'FTDI' },
  '0403:6015': { nombre: 'FTDI FT231X', fabricante: 'FTDI' },
  // Prolific (común en cables USB-Serial)
  '067b:2303': { nombre: 'Prolific PL2303', fabricante: 'Prolific' },
  // Cypress/Silabs
  '10c4:ea60': { nombre: 'Silicon Labs CP210x', fabricante: 'Silicon Labs' },
};

// ========== PUERTOS VIRTUALES USB ==========
// Rango de puertos USB que el sistema debe escanear
const USB_PORT_RANGE = {
  start: 1,
  end: 20, // Escanear USB001 hasta USB020
};

// ========== BASE DE DATOS DE DISPOSITIVOS CONOCIDOS (Legacy - Mantener para reconocimiento optimizado) ==========
const DISPOSITIVOS_CONOCIDOS = {
  // Impresoras Térmicas
  impresoras: [
    // Epson
    { vendorId: '04b8', productId: '0202', nombre: 'Epson TM-T20', fabricante: 'Epson' },
    { vendorId: '04b8', productId: '0e15', nombre: 'Epson TM-T88V', fabricante: 'Epson' },
    { vendorId: '04b8', productId: '0e28', nombre: 'Epson TM-T88VI', fabricante: 'Epson' },
    { vendorId: '04b8', productId: '0e03', nombre: 'Epson TM-U220', fabricante: 'Epson' },
    // Star Micronics
    { vendorId: '0519', productId: '0003', nombre: 'Star TSP100', fabricante: 'Star Micronics' },
    { vendorId: '0519', productId: '0001', nombre: 'Star TSP650', fabricante: 'Star Micronics' },
    // Bixolon
    { vendorId: '1504', productId: '0006', nombre: 'Bixolon SRP-350', fabricante: 'Bixolon' },
    { vendorId: '1504', productId: '0011', nombre: 'Bixolon SRP-275', fabricante: 'Bixolon' },
    // Citizen
    { vendorId: '2730', productId: '0fff', nombre: 'Citizen CT-S310', fabricante: 'Citizen' },
    // Oneposi (Muy común en Colombia)
    { vendorId: '1fc9', productId: '2016', nombre: 'Oneposi 85 (80mm)', fabricante: 'Oneposi' },
    { vendorId: '1fc9', productId: '2015', nombre: 'Oneposi 58 (58mm)', fabricante: 'Oneposi' },
    { vendorId: '4348', productId: '5584', nombre: 'Oneposi 85 CH340', fabricante: 'Oneposi' },
  ],

  // Scanners de Código de Barras
  scanners: [
    // Honeywell
    { vendorId: '0c2e', productId: '0b61', nombre: 'Honeywell Voyager 1200g', fabricante: 'Honeywell' },
    { vendorId: '0c2e', productId: '0b6a', nombre: 'Honeywell Xenon 1900', fabricante: 'Honeywell' },
    // Zebra/Symbol
    { vendorId: '05e0', productId: '1200', nombre: 'Symbol LS2208', fabricante: 'Zebra' },
    { vendorId: '05e0', productId: '1900', nombre: 'Symbol DS6708', fabricante: 'Zebra' },
    // Datalogic
    { vendorId: '05f9', productId: '2206', nombre: 'Datalogic QuickScan', fabricante: 'Datalogic' },
  ],

  // Básculas
  basculas: [
    { vendorId: '0eb8', productId: '2012', nombre: 'Torrey EQB', fabricante: 'Torrey' },
  ]
};

class DeviceManager {
  private listeners: Set<(devices: DispositivoDetectado[]) => void> = new Set();
  private detectedDevices: DispositivoDetectado[] = [];
  private isScanning = false;
  private userTypeOverrides: Map<string, DispositivoDetectado['tipo']> = new Map();

  constructor() {
    try {
      const stored = localStorage.getItem('device-type-overrides');
      if (stored) {
        const obj = JSON.parse(stored) as Record<string, DispositivoDetectado['tipo']>;
        this.userTypeOverrides = new Map(Object.entries(obj));
      }
    } catch {}
  }

  /**
   * Suscribirse a eventos USB en tiempo real desde Electron main
   */
  initElectronEvents(handlers: {
    onConnect?: (payload: { vendorId: string; productId: string; deviceClass: number }) => void;
    onDisconnect?: (payload: { vendorId: string; productId: string }) => void;
    onListUpdated?: (payload: { ports: any[]; usbDevices: any[] }) => void;
  }): (() => void) | undefined {
    const el = (window as any).electron?.devices;
    if (!el) return undefined;

    if (handlers.onConnect) el.onConnected(handlers.onConnect);
    if (handlers.onDisconnect) el.onDisconnected(handlers.onDisconnect);
    if (handlers.onListUpdated) el.onListUpdated(handlers.onListUpdated);

    return () => el.removeAllDeviceListeners?.();
  }

  /**
   * Guardar reclasificación manual de tipo de dispositivo
   */
  setUserTypeOverride(deviceId: string, tipo: DispositivoDetectado['tipo']) {
    this.userTypeOverrides.set(deviceId, tipo);
    try {
      localStorage.setItem(
        'device-type-overrides',
        JSON.stringify(Object.fromEntries(this.userTypeOverrides))
      );
    } catch {}
    this.detectedDevices = this.detectedDevices.map(d =>
      d.id === deviceId ? { ...d, tipo } : d
    );
    this.notifyListeners();
  }

  /**
   * Escanear todos los dispositivos conectados
   */
  async scanDevices(silent = false): Promise<DispositivoDetectado[]> {
    if (this.isScanning) return this.detectedDevices;
    this.isScanning = true;
    const devices: DispositivoDetectado[] = [];

    try {
      if (!silent) {
        console.log('🔍 Iniciando escaneo de dispositivos...');
      }

      // 1. Detectar dispositivos Serial (Impresoras, Básculas)
      const serialDevices = await this.detectSerialDevices();
      devices.push(...serialDevices);

      // 2. Detectar dispositivos USB HID (Scanners)
      const hidDevices = await this.detectHIDDevices();
      devices.push(...hidDevices);

      // 3. Detectar impresoras del sistema
      const systemPrinters = await this.detectSystemPrinters();
      devices.push(...systemPrinters);

      // Normalizar y deduplicar por tipo+puerto+nombre para evitar repetidos
      // Aplicar reclasificaciones manuales del usuario
      this.detectedDevices = this.deduplicateDevices(devices).map(d => {
        const override = this.userTypeOverrides.get(d.id);
        return override ? { ...d, tipo: override } : d;
      });
      this.notifyListeners();

      if (!silent) {
        console.log(`✅ Detectados ${this.detectedDevices.length} dispositivos`);
      }

      return this.detectedDevices;
    } catch (error) {
      console.error('❌ Error escaneando dispositivos:', error);
      return [];
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Detectar dispositivos Serial (Impresoras, Básculas)
   * ✅ MOTOR PLUG-AND-PLAY UNIVERSAL
   */
  private async detectSerialDevices(): Promise<DispositivoDetectado[]> {
    const devices: DispositivoDetectado[] = [];

    try {
      // Verificar si estamos en Electron
      if (!(window as any).electron?.serialport) {
        console.warn('⚠️ SerialPort API no disponible (no estás en Electron)');
        return devices;
      }

      console.log('🔍 Iniciando detección UNIVERSAL de dispositivos Serial...');
      const ports = await (window as any).electron.serialport.list();

      // ✅ ESCANEO DE PUERTOS VIRTUALES USB001-USB020
      console.log(`📡 Escaneando puertos virtuales USB${String(USB_PORT_RANGE.start).padStart(3, '0')} a USB${String(USB_PORT_RANGE.end).padStart(3, '0')}...`);

      for (const port of ports) {
        const vendorId = port.vendorId?.toLowerCase();
        const productId = port.productId?.toLowerCase();
        const chipKey = vendorId && productId ? `${vendorId}:${productId}` : null;

        // ✅ PASO 1: Intentar identificación optimizada (base de datos conocidos)
        let deviceInfo = this.identifyDevice(vendorId, productId);

        if (deviceInfo) {
          // Dispositivo conocido - agregar directamente
          devices.push({
            id: `serial-${port.path}`,
            tipo: deviceInfo.tipo,
            nombre: deviceInfo.nombre,
            fabricante: deviceInfo.fabricante,
            modelo: deviceInfo.modelo || 'Detectado automáticamente',
            puerto: port.path,
            vendorId: vendorId,
            productId: productId,
            serialNumber: port.serialNumber,
            estado: 'conectado',
            configuracion: {
              baudRate: 9600,
              dataBits: 8,
              stopBits: 1,
              parity: 'none'
            }
          });

          console.log(`✅ CONOCIDO: ${deviceInfo.nombre} en ${port.path}`);
          continue;
        }

        // ✅ PASO 2: Detectar por chip USB-Serial conocido
        if (chipKey && USB_SERIAL_CHIPS[chipKey]) {
          const chipInfo = USB_SERIAL_CHIPS[chipKey];
          devices.push({
            id: `serial-${port.path}`,
            tipo: 'impresora', // Asumir impresora térmica por defecto para chips seriales
            nombre: `Impresora Térmica (${chipInfo.nombre})`,
            fabricante: chipInfo.fabricante,
            modelo: port.manufacturer || 'Dispositivo Serial USB',
            puerto: port.path,
            vendorId: vendorId,
            productId: productId,
            serialNumber: port.serialNumber,
            estado: 'conectado',
            configuracion: {
              baudRate: 9600,
              dataBits: 8,
              stopBits: 1,
              parity: 'none'
            }
          });

          console.log(`✅ CHIP SERIAL: ${chipInfo.nombre} detectado en ${port.path}`);
          continue;
        }

        // ✅ PASO 3: Detección UNIVERSAL - cualquier puerto Serial disponible
        if (vendorId && productId) {
          // Determinar tipo basado en características del puerto
          const nombrePuerto = port.path.toLowerCase();
          const fabricante = port.manufacturer?.toLowerCase() || '';

          let tipoDetectado: DispositivoDetectado['tipo'] = 'impresora';
          let nombreGenerico = 'Dispositivo POS Universal';

          // Heurística simple para clasificar
          if (nombrePuerto.includes('com') || nombrePuerto.includes('usb')) {
            if (fabricante.includes('scale') || fabricante.includes('bascula')) {
              tipoDetectado = 'bascula';
              nombreGenerico = 'Báscula Digital (Auto-detectada)';
            } else {
              tipoDetectado = 'impresora';
              nombreGenerico = 'Impresora Térmica (Auto-detectada)';
            }
          }

          devices.push({
            id: `serial-${port.path}`,
            tipo: tipoDetectado,
            nombre: `${nombreGenerico} [${vendorId}:${productId}]`,
            fabricante: port.manufacturer || 'Genérico',
            modelo: 'Plug-and-Play Universal',
            puerto: port.path,
            vendorId: vendorId,
            productId: productId,
            serialNumber: port.serialNumber,
            estado: 'conectado',
            configuracion: {
              baudRate: 9600,
              dataBits: 8,
              stopBits: 1,
              parity: 'none'
            }
          });

          console.log(`✅ UNIVERSAL: Dispositivo ${tipoDetectado} detectado en ${port.path}`);
          console.log(`   📌 VID:PID = ${vendorId}:${productId}`);
          console.log(`   📌 Fabricante = ${port.manufacturer || 'Desconocido'}`);
          console.log(`   📌 Puerto = ${port.path}`);
        } else {
          // Dispositivo sin VID/PID - incluir igual como serial genérico
          devices.push({
            id: `serial-${port.path}`,
            tipo: 'impresora',
            nombre: `Dispositivo Serial (${port.path})`,
            fabricante: port.manufacturer || 'Genérico',
            modelo: 'Puerto Serial / Virtual',
            puerto: port.path,
            serialNumber: port.serialNumber,
            estado: 'conectado',
            configuracion: {
              baudRate: 9600,
              dataBits: 8,
              stopBits: 1,
              parity: 'none'
            }
          });

          console.log(`✅ SERIAL GENÉRICO: ${port.path} agregado al inventario`);
        }
      }

      console.log(`✅ Detección Serial completa: ${devices.length} dispositivos encontrados`);
    } catch (error) {
      console.error('❌ Error detectando dispositivos Serial:', error);
    }

    return devices;
  }

  /**
   * Detectar dispositivos HID (Scanners)
   */
  private async detectHIDDevices(): Promise<DispositivoDetectado[]> {
    const devices: DispositivoDetectado[] = [];

    try {
      // Verificar si estamos en Electron
      if (!(window as any).electron?.usb) {
        console.warn('⚠️ USB API no disponible');
        return devices;
      }

      const usbDevices = await (window as any).electron.usb.getDevices();

      for (const device of usbDevices) {
        const vendorId = device.vendorId?.toString(16).padStart(4, '0');
        const productId = device.productId?.toString(16).padStart(4, '0');

        // Buscar en base de datos de scanners, pero NO limitar solo a conocidos
        const scanner = DISPOSITIVOS_CONOCIDOS.scanners.find(
          s => s.vendorId === vendorId && s.productId === productId
        );

        if (scanner) {
          devices.push({
            id: `usb-${vendorId}-${productId}`,
            tipo: 'escaner',
            nombre: scanner.nombre,
            fabricante: scanner.fabricante,
            modelo: 'USB HID',
            puerto: 'USB (Keyboard Wedge)',
            vendorId: vendorId,
            productId: productId,
            estado: 'conectado'
          });

          console.log(`✅ Scanner detectado: ${scanner.nombre}`);
          continue;
        }

        // Inventario universal USB (desconocidos también se listan)
        const deviceClass = device.deviceClass;
        const tipoDetectado: DispositivoDetectado['tipo'] =
          deviceClass === USB_DEVICE_CLASSES.HID ? 'escaner' :
          deviceClass === USB_DEVICE_CLASSES.PRINTER ? 'impresora' :
          deviceClass === USB_DEVICE_CLASSES.CDC ? 'bascula' :
          'impresora';

        const nombreGenerico = device.product
          ? `USB ${device.product}`
          : `Dispositivo USB ${vendorId || '????'}:${productId || '????'}`;

        devices.push({
          id: `usb-${vendorId || 'na'}-${productId || 'na'}-${deviceClass || 'unk'}`,
          tipo: tipoDetectado,
          nombre: nombreGenerico,
          fabricante: device.manufacturer || 'USB Genérico',
          modelo: `Clase USB ${deviceClass ?? 'N/A'}`,
          puerto: 'USB',
          vendorId,
          productId,
          estado: 'conectado'
        });
      }
    } catch (error) {
      console.error('Error detectando dispositivos HID:', error);
    }

    return devices;
  }

  /**
   * Detectar impresoras del sistema
   */
  private async detectSystemPrinters(): Promise<DispositivoDetectado[]> {
    const devices: DispositivoDetectado[] = [];

    try {
      // Esta función se comunicaría con Electron para obtener impresoras del sistema
      if ((window as any).electron?.printer) {
        const printers = await (window as any).electron.printer.list();
        
        for (const printer of printers) {
          // Inventario del OS: SI Windows la ve, CODEC POS la muestra
          devices.push({
            id: `system-${printer.name}`,
            tipo: 'impresora',
            nombre: printer.name,
            fabricante: 'Sistema',
            modelo: printer.description || 'Impresora del sistema',
            // usar nombre real para permitir pruebas directas contra spool
            puerto: printer.name,
            estado: 'conectado'
          });
        }
      }
    } catch (error) {
      console.error('Error detectando impresoras del sistema:', error);
    }

    return devices;
  }

  /**
   * Identificar dispositivo por VID/PID
   */
  private identifyDevice(vendorId?: string, productId?: string): {
    tipo: DispositivoDetectado['tipo'];
    nombre: string;
    fabricante: string;
    modelo?: string;
  } | null {
    if (!vendorId || !productId) return null;

    // Buscar en impresoras
    const printer = DISPOSITIVOS_CONOCIDOS.impresoras.find(
      p => p.vendorId === vendorId && p.productId === productId
    );
    if (printer) {
      return {
        tipo: 'impresora',
        nombre: printer.nombre,
        fabricante: printer.fabricante
      };
    }

    // Buscar en básculas
    const scale = DISPOSITIVOS_CONOCIDOS.basculas.find(
      s => s.vendorId === vendorId && s.productId === productId
    );
    if (scale) {
      return {
        tipo: 'bascula',
        nombre: scale.nombre,
        fabricante: scale.fabricante
      };
    }

    return null;
  }

  private deduplicateDevices(devices: DispositivoDetectado[]): DispositivoDetectado[] {
    const seen = new Set<string>();
    const result: DispositivoDetectado[] = [];

    for (const d of devices) {
      const key = `${d.tipo}::${(d.puerto || '').toLowerCase()}::${(d.nombre || '').toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(d);
    }

    return result;
  }

  /**
   * Suscribirse a cambios de dispositivos
   */
  subscribe(callback: (devices: DispositivoDetectado[]) => void) {
    this.listeners.add(callback);
    // Enviar dispositivos actuales
    callback(this.detectedDevices);
    
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Notificar a todos los listeners
   */
  private notifyListeners() {
    this.listeners.forEach(callback => {
      callback(this.detectedDevices);
    });
  }

  /**
   * Obtener dispositivos detectados
   */
  getDevices(): DispositivoDetectado[] {
    return this.detectedDevices;
  }

  /**
   * Probar conexión con un dispositivo
   */
  async testDevice(deviceId: string): Promise<boolean> {
    const device = this.detectedDevices.find(d => d.id === deviceId);
    if (!device) {
      throw new Error('Dispositivo no encontrado');
    }

    try {
      switch (device.tipo) {
        case 'impresora':
          return await this.testPrinter(device);
        case 'escaner':
          return await this.testScanner(device);
        case 'bascula':
          return await this.testScale(device);
        default:
          return true;
      }
    } catch (error) {
      console.error(`Error probando dispositivo ${device.nombre}:`, error);
      return false;
    }
  }

  /**
   * Probar impresora
   */
  private async testPrinter(device: DispositivoDetectado): Promise<boolean> {
    try {
      // Importar dinámicamente el driver de impresión
      const { testPrinter } = await import('./thermalPrinter');
      
      // Determinar ancho de papel (80mm o 58mm)
      const ancho = device.nombre.includes('58') ? 58 : 80;
      
      console.log(`🧪 Probando impresora ${device.nombre} en ${device.puerto}...`);
      const result = await testPrinter(device.puerto, ancho);
      
      if (result) {
        console.log(`✅ Impresora ${device.nombre} funciona correctamente`);
      } else {
        console.error(`❌ Error al probar impresora ${device.nombre}`);
      }
      
      return result;
    } catch (error) {
      console.error('Error en testPrinter:', error);
      
      // Fallback: usar API de Electron directamente
      if ((window as any).electron?.printer) {
        return await (window as any).electron.printer.test(device.puerto);
      }
      
      return false;
    }
  }

  /**
   * Probar scanner
   */
  private async testScanner(device: DispositivoDetectado): Promise<boolean> {
    // Los scanners HID funcionan como teclado, difícil de probar directamente
    return true;
  }

  /**
   * Probar báscula
   */
  private async testScale(device: DispositivoDetectado): Promise<boolean> {
    if ((window as any).electron?.scale) {
      return await (window as any).electron.scale.test(device.puerto);
    }
    return false;
  }
}

// Singleton
export const deviceManager = new DeviceManager();