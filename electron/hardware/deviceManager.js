/**
 * ============================================
 * DEVICE MANAGER - ELECTRON MAIN PROCESS
 * Gestión de hardware POS
 * ============================================
 */

import { SerialPort } from 'serialport';
import { ipcMain, BrowserWindow } from 'electron';
// La librería 'usb' v2.x expone el emisor de eventos (on/removeListener) y
// getDeviceList() en el export NOMBRADO `usb`, no en el export por defecto
// del módulo — importarlo como default dejaba `usb.on`/`usb.removeListener`
// undefined. Esto causaba un TypeError NO CAPTURADO en cleanup() durante el
// cierre de la app ("usb.removeListener is not a function"), que tumbaba el
// proceso principal de Electron dejando la pantalla en negro / bloqueando
// el siguiente inicio.
import { usb } from 'usb';

class DeviceManagerElectron {
  constructor() {
    this.serialPorts = new Map();
    this.initialized = false;
    this.usbAttachListener = null;
    this.usbDetachListener = null;
  }

  initialize() {
    if (this.initialized) {
      console.log('ℹ️ DeviceManager ya estaba inicializado, se omite reinicialización');
      return;
    }

    this.setupIPCHandlers();
    this.monitorUSBEvents();
    this.initialized = true;
    console.log('✅ DeviceManager inicializado correctamente');
  }

  /**
   * Configurar manejadores IPC
   */
  setupIPCHandlers() {
    const registerHandle = (channel, handler) => {
      try {
        ipcMain.removeHandler(channel);
      } catch {
        // No había handler previo registrado
      }
      ipcMain.handle(channel, handler);
    };

    // ========== SERIAL PORT ==========
    registerHandle('serialport:list', async () => {
      try {
        const ports = await SerialPort.list();
        console.log(`📋 Puertos seriales encontrados: ${ports.length}`);
        return ports.map(port => ({
          path: port.path,
          manufacturer: port.manufacturer,
          serialNumber: port.serialNumber,
          vendorId: port.vendorId,
          productId: port.productId,
          locationId: port.locationId,
          pnpId: port.pnpId,
        }));
      } catch (error) {
        console.error('❌ Error listando puertos seriales:', error);
        return [];
      }
    });

    registerHandle('serialport:open', async (event, path, options = {}) => {
      try {
        if (this.serialPorts.has(path)) {
          console.log(`⚠️ Puerto ${path} ya está abierto`);
          return { success: true };
        }

        const port = new SerialPort({
          path,
          baudRate: options.baudRate || 9600,
          dataBits: options.dataBits || 8,
          stopBits: options.stopBits || 1,
          parity: options.parity || 'none',
          autoOpen: false,
        });

        return new Promise((resolve, reject) => {
          port.open((error) => {
            if (error) {
              console.error(`❌ Error abriendo puerto ${path}:`, error);
              reject({ success: false, error: error.message });
            } else {
              this.serialPorts.set(path, port);
              console.log(`✅ Puerto ${path} abierto correctamente`);
              
              // Configurar listeners
              port.on('data', (data) => {
                event.sender.send('serialport:data', { path, data: data.toString() });
              });
              
              port.on('error', (error) => {
                console.error(`❌ Error en puerto ${path}:`, error);
                event.sender.send('device:error', { path, error: error.message });
              });

              resolve({ success: true });
            }
          });
        });
      } catch (error) {
        console.error('❌ Error en serialport:open:', error);
        return { success: false, error: error.message };
      }
    });

    registerHandle('serialport:close', async (event, path) => {
      try {
        const port = this.serialPorts.get(path);
        if (!port) {
          return { success: false, error: 'Puerto no encontrado' };
        }

        return new Promise((resolve) => {
          port.close((error) => {
            if (error) {
              console.error(`❌ Error cerrando puerto ${path}:`, error);
              resolve({ success: false, error: error.message });
            } else {
              this.serialPorts.delete(path);
              console.log(`✅ Puerto ${path} cerrado`);
              resolve({ success: true });
            }
          });
        });
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    registerHandle('serialport:write', async (event, path, data) => {
      try {
        const port = this.serialPorts.get(path);
        if (!port) {
          return { success: false, error: 'Puerto no abierto' };
        }

        return new Promise((resolve) => {
          port.write(data, (error) => {
            if (error) {
              console.error(`❌ Error escribiendo en ${path}:`, error);
              resolve({ success: false, error: error.message });
            } else {
              console.log(`✅ Datos enviados a ${path}`);
              resolve({ success: true });
            }
          });
        });
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // ========== USB ==========
    registerHandle('usb:getDevices', async () => {
      try {
        const devices = usb.getDeviceList();
        console.log(`📋 Dispositivos USB encontrados: ${devices.length}`);
        
        return devices.map(device => ({
          vendorId: device.deviceDescriptor.idVendor,
          productId: device.deviceDescriptor.idProduct,
          deviceClass: device.deviceDescriptor.bDeviceClass,
          manufacturer: device.deviceDescriptor.iManufacturer,
          product: device.deviceDescriptor.iProduct,
          serialNumber: device.deviceDescriptor.iSerialNumber,
        }));
      } catch (error) {
        console.error('❌ Error listando dispositivos USB:', error);
        return [];
      }
    });

    // ========== SCALE ==========
    registerHandle('scale:read', async (event, port) => {
      try {
        console.log(`📊 Leyendo báscula en ${port}...`);
        // Implementar lectura de báscula específica
        return { success: true, weight: 0 };
      } catch (error) {
        console.error('❌ Error leyendo báscula:', error);
        return { success: false, error: error.message };
      }
    });

    registerHandle('scale:test', async (event, port) => {
      try {
        console.log(`🧪 Probando báscula en ${port}...`);
        // Implementar prueba de báscula
        return { success: true };
      } catch (error) {
        console.error('❌ Error probando báscula:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Emitir evento a todas las ventanas renderer activas
   */
  _broadcast(channel, payload) {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, payload);
      }
    });
  }

  /**
   * Monitorear eventos USB en tiempo real
   */
  monitorUSBEvents() {
    try {
      this.usbAttachListener = (device) => {
        const vendorId  = device.deviceDescriptor.idVendor.toString(16).padStart(4, '0');
        const productId = device.deviceDescriptor.idProduct.toString(16).padStart(4, '0');
        const deviceClass = device.deviceDescriptor.bDeviceClass;

        console.log(`🔌 USB conectado: VID=${vendorId} PID=${productId} Class=${deviceClass}`);

        // Notificar al renderer inmediatamente
        this._broadcast('device:connected', { vendorId, productId, deviceClass });

        // Rescán completo después de 800 ms (OS instala drivers)
        setTimeout(async () => {
          try {
            const ports = await SerialPort.list();
            const usbDevices = usb.getDeviceList().map(d => ({
              vendorId:    d.deviceDescriptor.idVendor,
              productId:   d.deviceDescriptor.idProduct,
              deviceClass: d.deviceDescriptor.bDeviceClass,
            }));
            this._broadcast('device:list-updated', { ports, usbDevices });
            console.log(`📋 Rescan post-USB: ${ports.length} seriales, ${usbDevices.length} USB`);
          } catch (err) {
            console.error('❌ Error en rescan post-USB:', err);
          }
        }, 800);
      };

      this.usbDetachListener = (device) => {
        const vendorId  = device.deviceDescriptor.idVendor.toString(16).padStart(4, '0');
        const productId = device.deviceDescriptor.idProduct.toString(16).padStart(4, '0');

        console.log(`🔌 USB desconectado: VID=${vendorId} PID=${productId}`);
        this._broadcast('device:disconnected', { vendorId, productId });
      };

      usb.on('attach', this.usbAttachListener);
      usb.on('detach', this.usbDetachListener);

      console.log('✅ Monitor de eventos USB iniciado');
    } catch (error) {
      console.error('❌ Error configurando monitor USB:', error);
    }
  }

  /**
   * Limpiar recursos al cerrar
   */
  cleanup() {
    console.log('🧹 Limpiando recursos de dispositivos...');

    try {
      if (this.usbAttachListener) {
        usb.removeListener('attach', this.usbAttachListener);
        this.usbAttachListener = null;
      }
      if (this.usbDetachListener) {
        usb.removeListener('detach', this.usbDetachListener);
        this.usbDetachListener = null;
      }
    } catch (error) {
      console.error('❌ Error quitando listeners USB:', error);
    }
    
    // Cerrar todos los puertos seriales
    for (const [path, port] of this.serialPorts) {
      try {
        port.close();
        console.log(`✅ Puerto ${path} cerrado`);
      } catch (error) {
        console.error(`❌ Error cerrando puerto ${path}:`, error);
      }
    }
    
    this.serialPorts.clear();
    this.initialized = false;
  }
}

// Exportar singleton
export const deviceManager = new DeviceManagerElectron();

// Limpiar al cerrar aplicación. Un error aquí NO puede quedar sin capturar:
// 'exit' es la última fase del proceso y una excepción no atrapada en este
// handler tumba el proceso principal (esto fue justo la causa de la pantalla
// en negro: "usb.removeListener is not a function" no capturado aquí).
process.on('exit', () => {
  try {
    deviceManager.cleanup();
  } catch (error) {
    console.error('⚠️ Error durante cleanup de deviceManager en exit:', error);
  }
});
