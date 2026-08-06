/**
 * CODECPOS v2.0 - Gestor de Puertos Seriales
 * Codec Studio © 2026
 * Manejo de comunicación serial para hardware (báscula, impresora, display)
 */

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

class SerialManager {
  constructor() {
    this.ports = new Map();
    this.parsers = new Map();
  }

  /**
   * Listar puertos seriales disponibles
   */
  async listPorts() {
    try {
      const ports = await SerialPort.list();
      return ports.map(port => ({
        path: port.path,
        manufacturer: port.manufacturer,
        serialNumber: port.serialNumber,
        pnpId: port.pnpId,
        vendorId: port.vendorId,
        productId: port.productId,
      }));
    } catch (error) {
      console.error('[SerialManager] Error listando puertos:', error);
      return [];
    }
  }

  /**
   * Conectar a un puerto serial
   */
  async connect(portName, options = {}) {
    try {
      if (this.ports.has(portName)) {
        console.warn(`[SerialManager] Puerto ${portName} ya está conectado`);
        return this.ports.get(portName);
      }

      const defaultOptions = {
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        ...options,
      };

      const port = new SerialPort({
        path: portName,
        ...defaultOptions,
        autoOpen: false,
      });

      await new Promise((resolve, reject) => {
        port.open((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      this.ports.set(portName, port);
      console.log(`[SerialManager] Conectado a ${portName}`);

      return port;
    } catch (error) {
      console.error(`[SerialManager] Error conectando a ${portName}:`, error);
      throw error;
    }
  }

  /**
   * Desconectar de un puerto serial
   */
  async disconnect(portName) {
    try {
      const port = this.ports.get(portName);
      if (!port) {
        console.warn(`[SerialManager] Puerto ${portName} no está conectado`);
        return;
      }

      await new Promise((resolve) => {
        port.close(() => {
          resolve();
        });
      });

      this.ports.delete(portName);
      this.parsers.delete(portName);

      console.log(`[SerialManager] Desconectado de ${portName}`);
    } catch (error) {
      console.error(`[SerialManager] Error desconectando de ${portName}:`, error);
      throw error;
    }
  }

  /**
   * Escribir datos a un puerto
   */
  async write(portName, data) {
    const port = this.ports.get(portName);
    if (!port || !port.isOpen) {
      throw new Error(`Puerto ${portName} no está conectado`);
    }

    return new Promise((resolve, reject) => {
      port.write(data, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Configurar parser para lectura de líneas
   */
  setupLineParser(portName, callback) {
    const port = this.ports.get(portName);
    if (!port) {
      throw new Error(`Puerto ${portName} no está conectado`);
    }

    const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
    this.parsers.set(portName, parser);

    parser.on('data', (line) => {
      callback(line.trim());
    });

    return parser;
  }

  /**
   * Cerrar todos los puertos
   */
  async disconnectAll() {
    const portNames = Array.from(this.ports.keys());
    await Promise.all(portNames.map(name => this.disconnect(name)));
  }

  /**
   * Verificar si un puerto está conectado
   */
  isConnected(portName) {
    const port = this.ports.get(portName);
    return port && port.isOpen;
  }

  /**
   * Obtener información de un puerto
   */
  getPortInfo(portName) {
    const port = this.ports.get(portName);
    if (!port) {
      return null;
    }

    return {
      path: port.path,
      baudRate: port.baudRate,
      isOpen: port.isOpen,
    };
  }
}

module.exports = new SerialManager();
