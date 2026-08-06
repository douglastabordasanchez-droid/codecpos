/**
 * CODECPOS v2.0 - Controlador de Báscula
 * Codec Studio © 2026
 * Comunicación con báscula electrónica por puerto COM
 */

const serialManager = require('./serialManager');
const EventEmitter = require('events');

class ScaleController extends EventEmitter {
  constructor() {
    super();
    this.portName = null;
    this.currentWeight = 0;
    this.isStable = false;
    this.taredWeight = 0;
    this.connected = false;
  }

  /**
   * Conectar a la báscula
   */
  async connect(portName, options = {}) {
    try {
      const scaleOptions = {
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        ...options,
      };

      await serialManager.connect(portName, scaleOptions);
      this.portName = portName;
      this.connected = true;

      // Configurar parser para lectura continua
      serialManager.setupLineParser(portName, (data) => {
        this.parseWeightData(data);
      });

      console.log(`[ScaleController] Báscula conectada en ${portName}`);
      this.emit('connected', { port: portName });

      // Inicializar báscula
      await this.initialize();

      return { success: true, port: portName };
    } catch (error) {
      console.error('[ScaleController] Error conectando báscula:', error);
      this.connected = false;
      throw error;
    }
  }

  /**
   * Desconectar báscula
   */
  async disconnect() {
    if (!this.portName) return;

    try {
      await serialManager.disconnect(this.portName);
      this.portName = null;
      this.connected = false;
      this.currentWeight = 0;

      console.log('[ScaleController] Báscula desconectada');
      this.emit('disconnected');

      return { success: true };
    } catch (error) {
      console.error('[ScaleController] Error desconectando báscula:', error);
      throw error;
    }
  }

  /**
   * Inicializar báscula
   */
  async initialize() {
    // Enviar comandos de inicialización (depende del modelo)
    // Ejemplo para báscula con protocolo estándar
    await this.sendCommand('INIT\r\n');
  }

  /**
   * Parsear datos de peso recibidos
   * Formato típico: "ST,GS,+00000.000kg"
   */
  parseWeightData(data) {
    try {
      // Diferentes formatos según el modelo de báscula
      // Formato 1: "ST,GS,+00000.000kg"
      const match1 = data.match(/([+-]?\d+\.?\d*)\s*kg/i);
      
      // Formato 2: "W 00000.000"
      const match2 = data.match(/W\s+([+-]?\d+\.?\d*)/i);
      
      // Formato 3: Solo número "+00000.000"
      const match3 = data.match(/^([+-]?\d+\.?\d*)$/);

      let weight = 0;
      let stable = false;

      if (match1) {
        weight = parseFloat(match1[1]);
        stable = data.includes('ST');
      } else if (match2) {
        weight = parseFloat(match2[1]);
        stable = true;
      } else if (match3) {
        weight = parseFloat(match3[1]);
        stable = true;
      }

      // Aplicar tara
      weight = Math.max(0, weight - this.taredWeight);

      // Convertir a gramos (si viene en kg)
      if (weight < 100) {
        weight = weight * 1000;
      }

      // Actualizar solo si cambió
      if (Math.abs(this.currentWeight - weight) > 1) {
        this.currentWeight = weight;
        this.isStable = stable;

        this.emit('weight-changed', {
          weight: this.currentWeight,
          stable: this.isStable,
          unit: 'g',
        });
      }
    } catch (error) {
      console.error('[ScaleController] Error parseando peso:', data, error);
    }
  }

  /**
   * Tarar báscula (establecer cero)
   */
  async tare() {
    try {
      // Método 1: Comando de tara
      await this.sendCommand('TARE\r\n');
      
      // Método 2: Almacenar peso actual como tara
      this.taredWeight += (this.currentWeight / 1000);
      this.currentWeight = 0;

      console.log(`[ScaleController] Báscula tarada (${this.taredWeight} kg)`);
      this.emit('tared', { weight: this.taredWeight });

      return { success: true, taredWeight: this.taredWeight };
    } catch (error) {
      console.error('[ScaleController] Error tarando báscula:', error);
      throw error;
    }
  }

  /**
   * Obtener peso actual
   */
  getWeight() {
    return {
      weight: this.currentWeight,
      stable: this.isStable,
      unit: 'g',
      connected: this.connected,
    };
  }

  /**
   * Enviar comando a la báscula
   */
  async sendCommand(command) {
    if (!this.connected || !this.portName) {
      throw new Error('Báscula no conectada');
    }

    await serialManager.write(this.portName, command);
  }

  /**
   * Resetear tara
   */
  resetTare() {
    this.taredWeight = 0;
    console.log('[ScaleController] Tara reseteada');
    this.emit('tare-reset');
    return { success: true };
  }

  /**
   * Estado de la báscula
   */
  getStatus() {
    return {
      connected: this.connected,
      port: this.portName,
      currentWeight: this.currentWeight,
      stable: this.isStable,
      taredWeight: this.taredWeight,
    };
  }
}

module.exports = new ScaleController();
