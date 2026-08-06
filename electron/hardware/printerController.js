/**
 * CODECPOS v2.0 - Controlador de Impresora Térmica
 * Codec Studio © 2026
 * Comandos ESC/POS para impresión de tickets y apertura de cajón
 */

const serialManager = require('./serialManager');
const EventEmitter = require('events');

class PrinterController extends EventEmitter {
  constructor() {
    super();
    this.portName = null;
    this.connected = false;

    // Comandos ESC/POS estándar
    this.ESC = '\x1B';
    this.GS = '\x1D';
    this.COMMANDS = {
      INIT: '\x1B\x40',                    // Inicializar impresora
      CUT: '\x1D\x56\x41',                 // Cortar papel
      OPEN_DRAWER: '\x1B\x70\x00\x19\xFA', // Abrir cajón
      BOLD_ON: '\x1B\x45\x01',             // Negrita ON
      BOLD_OFF: '\x1B\x45\x00',            // Negrita OFF
      ALIGN_LEFT: '\x1B\x61\x00',          // Alinear izquierda
      ALIGN_CENTER: '\x1B\x61\x01',        // Alinear centro
      ALIGN_RIGHT: '\x1B\x61\x02',         // Alinear derecha
      FONT_A: '\x1B\x4D\x00',              // Fuente A (normal)
      FONT_B: '\x1B\x4D\x01',              // Fuente B (pequeña)
      SIZE_NORMAL: '\x1D\x21\x00',         // Tamaño normal
      SIZE_DOUBLE: '\x1D\x21\x11',         // Tamaño doble
      SIZE_TRIPLE: '\x1D\x21\x22',         // Tamaño triple
      LINE_FEED: '\x0A',                   // Salto de línea
    };
  }

  /**
   * Conectar a la impresora
   */
  async connect(portName, options = {}) {
    try {
      const printerOptions = {
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        ...options,
      };

      await serialManager.connect(portName, printerOptions);
      this.portName = portName;
      this.connected = true;

      console.log(`[PrinterController] Impresora conectada en ${portName}`);
      this.emit('connected', { port: portName });

      // Inicializar impresora
      await this.initialize();

      return { success: true, port: portName };
    } catch (error) {
      console.error('[PrinterController] Error conectando impresora:', error);
      this.connected = false;
      throw error;
    }
  }

  /**
   * Desconectar impresora
   */
  async disconnect() {
    if (!this.portName) return;

    try {
      await serialManager.disconnect(this.portName);
      this.portName = null;
      this.connected = false;

      console.log('[PrinterController] Impresora desconectada');
      this.emit('disconnected');

      return { success: true };
    } catch (error) {
      console.error('[PrinterController] Error desconectando impresora:', error);
      throw error;
    }
  }

  /**
   * Inicializar impresora
   */
  async initialize() {
    await this.sendRaw(this.COMMANDS.INIT);
  }

  /**
   * Imprimir factura/ticket
   */
  async printReceipt(receiptData) {
    try {
      if (!this.connected) {
        throw new Error('Impresora no conectada');
      }

      console.log('[PrinterController] Imprimiendo factura:', receiptData.numeroFactura);

      // Construir ticket
      let ticket = '';

      // Inicializar
      ticket += this.COMMANDS.INIT;

      // ENCABEZADO
      ticket += this.COMMANDS.ALIGN_CENTER;
      ticket += this.COMMANDS.SIZE_DOUBLE;
      ticket += this.COMMANDS.BOLD_ON;
      ticket += receiptData.empresa?.nombre || 'CODECPOS';
      ticket += this.COMMANDS.LINE_FEED;
      ticket += this.COMMANDS.SIZE_NORMAL;
      ticket += this.COMMANDS.BOLD_OFF;

      if (receiptData.empresa?.nit) {
        ticket += `NIT: ${receiptData.empresa.nit}`;
        ticket += this.COMMANDS.LINE_FEED;
      }

      if (receiptData.empresa?.direccion) {
        ticket += receiptData.empresa.direccion;
        ticket += this.COMMANDS.LINE_FEED;
      }

      if (receiptData.empresa?.telefono) {
        ticket += `Tel: ${receiptData.empresa.telefono}`;
        ticket += this.COMMANDS.LINE_FEED;
      }

      ticket += this.line(48);

      // NÚMERO DE FACTURA
      ticket += this.COMMANDS.ALIGN_CENTER;
      ticket += this.COMMANDS.BOLD_ON;
      ticket += `FACTURA: ${receiptData.numeroFactura}`;
      ticket += this.COMMANDS.LINE_FEED;
      ticket += this.COMMANDS.BOLD_OFF;

      // FECHA Y HORA
      const fecha = new Date(receiptData.fecha);
      ticket += fecha.toLocaleDateString('es-CO');
      ticket += ' ';
      ticket += fecha.toLocaleTimeString('es-CO');
      ticket += this.COMMANDS.LINE_FEED;

      ticket += this.line(48);

      // PRODUCTOS
      ticket += this.COMMANDS.ALIGN_LEFT;
      ticket += this.COMMANDS.FONT_B;

      for (const item of receiptData.items) {
        // Nombre del producto
        ticket += this.truncate(item.nombre, 32);
        ticket += this.COMMANDS.LINE_FEED;

        // Cantidad x Precio = Subtotal
        const cantidadStr = `${item.cantidad} x $${this.formatMoney(item.precio)}`;
        const subtotalStr = `$${this.formatMoney(item.subtotal)}`;
        ticket += this.formatLine(cantidadStr, subtotalStr, 48);
        ticket += this.COMMANDS.LINE_FEED;
      }

      ticket += this.COMMANDS.FONT_A;
      ticket += this.line(48);

      // TOTALES
      ticket += this.COMMANDS.ALIGN_RIGHT;
      ticket += this.COMMANDS.SIZE_DOUBLE;
      ticket += this.COMMANDS.BOLD_ON;
      ticket += `TOTAL: $${this.formatMoney(receiptData.total)}`;
      ticket += this.COMMANDS.LINE_FEED;
      ticket += this.COMMANDS.SIZE_NORMAL;
      ticket += this.COMMANDS.BOLD_OFF;

      // MÉTODO DE PAGO
      ticket += this.COMMANDS.ALIGN_LEFT;
      ticket += this.line(48);
      ticket += `Método de pago: ${this.formatPaymentMethod(receiptData.metodoPago)}`;
      ticket += this.COMMANDS.LINE_FEED;

      if (receiptData.metodoPago === 'efectivo') {
        ticket += `Efectivo recibido: $${this.formatMoney(receiptData.efectivoRecibido)}`;
        ticket += this.COMMANDS.LINE_FEED;
        ticket += `Cambio: $${this.formatMoney(receiptData.cambio)}`;
        ticket += this.COMMANDS.LINE_FEED;
      }

      ticket += this.line(48);

      // PIE DE PÁGINA
      ticket += this.COMMANDS.ALIGN_CENTER;
      ticket += this.COMMANDS.FONT_B;
      ticket += '¡Gracias por su compra!';
      ticket += this.COMMANDS.LINE_FEED;
      ticket += 'CODECPOS v2.0 - Codec Studio';
      ticket += this.COMMANDS.LINE_FEED;
      ticket += this.COMMANDS.FONT_A;

      // Espacios finales
      ticket += this.COMMANDS.LINE_FEED;
      ticket += this.COMMANDS.LINE_FEED;
      ticket += this.COMMANDS.LINE_FEED;

      // Cortar papel
      ticket += this.COMMANDS.CUT;

      // Enviar a impresora
      await this.sendRaw(ticket);

      console.log('[PrinterController] Factura impresa correctamente');
      this.emit('printed', { invoice: receiptData.numeroFactura });

      return { success: true };
    } catch (error) {
      console.error('[PrinterController] Error imprimiendo factura:', error);
      throw error;
    }
  }

  /**
   * Abrir cajón de dinero
   */
  async openCashDrawer() {
    try {
      if (!this.connected) {
        console.warn('[PrinterController] Impresora no conectada, no se puede abrir cajón');
        return { success: false, message: 'Impresora no conectada' };
      }

      await this.sendRaw(this.COMMANDS.OPEN_DRAWER);

      console.log('[PrinterController] Cajón de dinero abierto');
      this.emit('drawer-opened');

      return { success: true };
    } catch (error) {
      console.error('[PrinterController] Error abriendo cajón:', error);
      throw error;
    }
  }

  /**
   * Enviar datos raw a la impresora
   */
  async sendRaw(data) {
    if (!this.connected || !this.portName) {
      throw new Error('Impresora no conectada');
    }

    await serialManager.write(this.portName, data);
  }

  /**
   * Estado de la impresora
   */
  getStatus() {
    return {
      connected: this.connected,
      port: this.portName,
    };
  }

  // HELPERS DE FORMATO

  line(length) {
    return '-'.repeat(length) + this.COMMANDS.LINE_FEED;
  }

  truncate(text, maxLength) {
    return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
  }

  formatMoney(amount) {
    return amount.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  formatPaymentMethod(method) {
    const methods = {
      efectivo: 'Efectivo',
      tarjeta: 'Tarjeta',
      transferencia: 'Transferencia',
      nequi: 'Nequi',
      daviplata: 'Daviplata',
    };
    return methods[method] || method;
  }

  formatLine(left, right, width) {
    const spaces = width - left.length - right.length;
    return left + ' '.repeat(Math.max(0, spaces)) + right;
  }
}

module.exports = new PrinterController();
