/**
 * ============================================
 * THERMAL PRINTER DRIVER - CODEC POS v2.0
 * Driver universal para impresoras térmicas ESC/POS
 * Compatible con: Epson, Star, Bixolon, Oneposi, Zjiang
 * ============================================
 */

export interface PrinterConfig {
  puerto: string;
  printerName?: string; // Windows printer name for rawEscPos (overrides default)
  baudRate?: number;
  ancho?: 58 | 80; // mm
  encoding?: 'UTF-8' | 'ISO-8859-1' | 'CP437' | 'CP850';
}

import {
  getDefaultPrinterNameOrUndefined,
  getFacturasPrinterNameOrUndefined,
  getEtiquetasPrinterNameOrUndefined,
  getConfiguredTicketWidthMm,
} from './printerConfig';
import { getPrinterForSectionOrUndefined, type PrintSection } from './sectionPrinterConfig';
import { getDrawerConfig } from './drawerConfig';

const PRINTER_WINDOWS_FALLBACK_PORT = 'USB008';

function resolveDefaultPrinterPort(): string {
  try {
    const printerName = getDefaultPrinterNameOrUndefined();
    if (!printerName) return PRINTER_WINDOWS_FALLBACK_PORT;

    const rawDevices = localStorage.getItem('pos-dispositivos');
    const devices = rawDevices ? JSON.parse(rawDevices) : [];
    if (!Array.isArray(devices)) return PRINTER_WINDOWS_FALLBACK_PORT;

    const printerDevice = devices.find((d: any) => d?.tipo === 'impresora' && String(d?.nombre || '').trim() === printerName);
    const mappedPort = String(printerDevice?.puerto || '').trim();
    return mappedPort || PRINTER_WINDOWS_FALLBACK_PORT;
  } catch {
    return PRINTER_WINDOWS_FALLBACK_PORT;
  }
}

export interface TicketData {
  header?: string;
  razonSocial?: string;
  nit?: string;
  direccion?: string;
  telefono?: string;
  numeroFactura?: string;
  fechaFactura?: string;
  regimenTributario?: string;
  resolucionDian?: string;
  rangoDesde?: string;
  rangoHasta?: string;
  prefijoFactura?: string;
  items: Array<{
    nombre: string;
    cantidad: number;
    precio: number;
    total: number;
  }>;
  subtotal: number;
  impuestos?: number;
  total: number;
  cajero?: string;
  metodoPago?: string;
  cambio?: number;
  footer?: string;
  referencia_mesa?: string;
}

export interface VentaTicketInput {
  numeroFactura: string;
  items: Array<{
    nombre: string;
    cantidad: number;
    precio: number;
    subtotal: number;
  }>;
  total: number;
  subtotal?: number;
  iva?: number;
  porcentajeIVA?: number;
  metodoPago?: string;
  cambio?: number;
  efectivoRecibido?: number;
  pagoMixto?: { metodo1: string; monto1: number; metodo2: string; monto2: number };
  cajero?: string;
  mesa?: string;
  referencia_mesa?: string;
  fecha?: string;
  facturaElectronica?: boolean;
  cufe?: string;
  folioElectronico?: string;
  qrData?: string;
  contingencia?: boolean;
}

export interface TallerTicketInput {
  numeroOrden: string;
  fechaRecepcion: string;
  cliente: {
    nombre: string;
    telefono?: string;
    cedula?: string;
  };
  dispositivo: {
    tipo?: string;
    marca?: string;
    modelo?: string;
    serial?: string;
    imei?: string;
  };
  problemaReportado: string;
  costoEstimado: number;
  anticipo: number;
  saldoPendiente: number;
  tecnicoAsignado?: string;
  accesorios?: string;
  condicionFisica?: string;
}

export interface CierreCajaTicketInput {
  cajero: string;
  fecha: string;
  baseInicial: number;
  totalVentas: number;
  totalSalidasDevolucion: number;
  totalGastos: number;
  gastosDetalle?: Array<{
    descripcion: string;
    concepto?: string;
    monto: number;
  }>;
  efectivoEsperado: number;
}

// Comandos ESC/POS estándar
const ESC = 0x1B;
const GS = 0x1D;

export class ThermalPrinter {
  private puerto: string;
  private printerName: string | undefined;
  private ancho: 58 | 80;
  private encoding: string;
  private maxChars: number;

  constructor(config: PrinterConfig) {
    this.puerto = config.puerto || PRINTER_WINDOWS_FALLBACK_PORT;
    this.printerName = config.printerName;
    this.ancho = config.ancho || 80;
    this.encoding = config.encoding || 'UTF-8';
    this.maxChars = this.ancho === 80 ? 48 : 32; // Caracteres por línea
  }

  /**
   * Comandos básicos ESC/POS
   */
  private commands = {
    // Inicialización
    init: () => [ESC, 0x40],
    
    // Alineación
    alignLeft: () => [ESC, 0x61, 0x00],
    alignCenter: () => [ESC, 0x61, 0x01],
    alignRight: () => [ESC, 0x61, 0x02],
    
    // Fuente
    fontNormal: () => [ESC, 0x21, 0x00],
    fontBold: () => [ESC, 0x21, 0x08],
    fontLarge: () => [ESC, 0x21, 0x30],
    fontXLarge: () => [ESC, 0x21, 0x38],
    
    // Énfasis
    boldOn: () => [ESC, 0x45, 0x01],
    boldOff: () => [ESC, 0x45, 0x00],
    
    // Líneas
    feed: (lines: number = 1) => [ESC, 0x64, lines],
    
    // Corte
    cut: () => [GS, 0x56, 0x41, 0x00], // Corte completo
    partialCut: () => [GS, 0x56, 0x42, 0x00], // Corte parcial
    
    // Apertura de cajón
    openDrawer: () => [ESC, 0x70, 0x00, 0x19, 0xFA],
    
    // Código de barras (Code128)
    barcode: (data: string) => {
      const bytes = [GS, 0x6B, 0x49, data.length, ...data.split('').map(c => c.charCodeAt(0))];
      return bytes;
    },
    
    // QR Code
    qrCode: (data: string) => {
      const bytes = [];
      // Configurar modelo QR
      bytes.push(GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
      // Configurar tamaño
      bytes.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x08);
      // Guardar datos
      const dataLength = data.length + 3;
      bytes.push(GS, 0x28, 0x6B, dataLength & 0xFF, (dataLength >> 8) & 0xFF, 0x31, 0x50, 0x30);
      bytes.push(...data.split('').map(c => c.charCodeAt(0)));
      // Imprimir
      bytes.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);
      return bytes;
    }
  };

  private textToBytes(text: string): number[] {
    const clean = text.replace(/ /g, ' ');
    const bytes: number[] = [];
    for (let i = 0; i < clean.length; i++) {
      bytes.push(clean.charCodeAt(i) & 0xFF);
    }
    return bytes;
  }

  /**
   * Agregar línea de texto
   */
  private addLine(text: string, align: 'left' | 'center' | 'right' = 'left'): number[] {
    const bytes: number[] = [];
    
    // Alineación
    if (align === 'center') bytes.push(...this.commands.alignCenter());
    else if (align === 'right') bytes.push(...this.commands.alignRight());
    else bytes.push(...this.commands.alignLeft());
    
    // Texto
    bytes.push(...this.textToBytes(text), 0x0A);
    
    return bytes;
  }

  /**
   * Agregar línea con columnas (producto - precio)
   */
  private addColumns(left: string, right: string): number[] {
    const bytes: number[] = [];
    bytes.push(...this.commands.alignLeft());

    const safeRight = String(right || '').slice(0, Math.max(8, Math.floor(this.maxChars * 0.45)));
    const leftMax = Math.max(1, this.maxChars - safeRight.length - 1);
    const leftPart = String(left || '').substring(0, leftMax);
    const spaceCount = Math.max(1, this.maxChars - leftPart.length - safeRight.length);
    const spaces = ' '.repeat(spaceCount);
    const line = leftPart + spaces + safeRight;
    
    bytes.push(...this.textToBytes(line), 0x0A);
    return bytes;
  }

  private wrapText(text: string, maxWidth: number = this.maxChars): string[] {
    const safe = (text || '').replace(/\s+/g, ' ').trim();
    if (!safe) return [''];

    const words = safe.split(' ');
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      if (!current) {
        if (word.length <= maxWidth) {
          current = word;
        } else {
          for (let i = 0; i < word.length; i += maxWidth) {
            lines.push(word.slice(i, i + maxWidth));
          }
        }
        continue;
      }

      const candidate = `${current} ${word}`;
      if (candidate.length <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        if (word.length <= maxWidth) {
          current = word;
        } else {
          for (let i = 0; i < word.length; i += maxWidth) {
            const chunk = word.slice(i, i + maxWidth);
            if (chunk.length === maxWidth || i + maxWidth < word.length) {
              lines.push(chunk);
            } else {
              current = chunk;
            }
          }
        }
      }
    }

    if (current) lines.push(current);
    return lines;
  }

  /**
   * Agregar línea separadora
   */
  private addSeparator(char: string = '-'): number[] {
    return this.addLine(char.repeat(this.maxChars));
  }

  /**
   * Imprimir ticket de venta
   */
  async printTicket(data: TicketData): Promise<boolean> {
    try {
      const bytes: number[] = [];
      
      // Inicializar
      bytes.push(...this.commands.init());
      
      // Header (centrado, negrita, grande)
      if (data.header) {
        bytes.push(...this.commands.fontLarge());
        bytes.push(...this.commands.boldOn());
        bytes.push(...this.addLine(data.header, 'center'));
        bytes.push(...this.commands.boldOff());
        bytes.push(...this.commands.fontNormal());
      }
      
      if (data.razonSocial) {
        bytes.push(...this.addLine(data.razonSocial, 'center'));
      }
      if (data.nit) {
        bytes.push(...this.addLine(`NIT: ${data.nit}`, 'center'));
      }
      if (data.direccion) {
        this.wrapText(data.direccion).forEach((line) => bytes.push(...this.addLine(line, 'center')));
      }
      if (data.telefono) {
        bytes.push(...this.addLine(`Tel: ${data.telefono}`, 'center'));
      }
      if (data.regimenTributario) {
        bytes.push(...this.addLine(`Régimen ${data.regimenTributario}`, 'center'));
      }
      if (data.numeroFactura) {
        bytes.push(...this.addLine(`FACTURA: ${data.numeroFactura}`, 'center'));
      }
      bytes.push(...this.addLine('CODEC POS v2.0', 'center'));
      bytes.push(...this.addLine(data.fechaFactura || new Date().toLocaleString('es-CO'), 'center'));
      if (data.cajero) {
        bytes.push(...this.addLine(`Cajero: ${data.cajero}`, 'center'));
      }
      // 🧾 Requisito DIAN: la resolución de facturación y su rango autorizado
      // ya se mostraban en pantalla y en el PDF, pero faltaban en la tirilla
      // térmica real — quedaba un recibo físico incompleto para el cliente.
      if (data.resolucionDian) {
        bytes.push(...this.addLine(`Resolución DIAN: ${data.resolucionDian}`, 'center'));
        if (data.rangoDesde && data.rangoHasta) {
          bytes.push(...this.addLine(
            `Rango: ${data.prefijoFactura || ''}${data.rangoDesde} al ${data.prefijoFactura || ''}${data.rangoHasta}`,
            'center'
          ));
        }
      }
      bytes.push(...this.addSeparator('='));

      if (data.referencia_mesa) {
        bytes.push(...this.commands.feed(1));
        bytes.push(...this.addSeparator());
        bytes.push(...this.commands.boldOn());
        bytes.push(...this.addLine(`UBICACIÓN: ${data.referencia_mesa}`, 'center'));
        bytes.push(...this.commands.boldOff());
        bytes.push(...this.addSeparator());
      }

      bytes.push(...this.commands.feed(1));

      // Items
      bytes.push(...this.commands.boldOn());
      bytes.push(...this.addColumns('PRODUCTO', 'TOTAL'));
      bytes.push(...this.commands.boldOff());
      bytes.push(...this.addSeparator());
      
      for (const item of data.items) {
        const itemNameLines = this.wrapText(item.nombre, this.maxChars);
        itemNameLines.forEach((line) => bytes.push(...this.addLine(line)));
        
        const cantidadPrecio = `${item.cantidad} x ${this.formatMoney(item.precio)}`;
        const total = this.formatMoney(item.total);
        bytes.push(...this.addColumns(cantidadPrecio, total));
      }
      
      bytes.push(...this.addSeparator('='));
      bytes.push(...this.commands.feed(1));
      
      // Totales
      bytes.push(...this.commands.fontBold());
      bytes.push(...this.addColumns('SUBTOTAL:', this.formatMoney(data.subtotal)));
      
      if (data.impuestos) {
        bytes.push(...this.addColumns('IVA:', this.formatMoney(data.impuestos)));
      }
      
      bytes.push(...this.commands.fontBold());
      bytes.push(...this.addColumns('TOTAL:', this.formatMoney(data.total)));
      bytes.push(...this.commands.fontNormal());
      
      if (data.metodoPago) {
        bytes.push(...this.commands.feed(1));
        // `metodoPago` puede traer varias líneas (p.ej. "EFECTIVO\n  Recibido: $X"
        // o "PAGO MIXTO\n  NEQUI: $X\n  TARJETA: $Y"). `addColumns` está pensado
        // para un único valor de línea — pasarle un string con \n embebidos
        // cortaba y desalineaba el texto en la impresora física. Cada línea
        // adicional ahora se imprime aparte, igual que en pantalla/PDF.
        const metodoPagoLineas = String(data.metodoPago).split('\n').map((l) => l.trim()).filter(Boolean);
        bytes.push(...this.addColumns('PAGO:', metodoPagoLineas[0] || data.metodoPago));
        metodoPagoLineas.slice(1).forEach((line) => bytes.push(...this.addLine(`  ${line}`)));

        if (data.cambio && data.cambio > 0) {
          bytes.push(...this.addColumns('CAMBIO:', this.formatMoney(data.cambio)));
        }
      }
      
      bytes.push(...this.addSeparator('='));
      bytes.push(...this.commands.feed(1));
      
      // Footer
      if (data.footer) {
        const footerLines = String(data.footer).split('\n');
        footerLines.forEach((line) => bytes.push(...this.addLine(line, 'center')));
      }
      
      bytes.push(...this.addLine('Gracias por su compra!', 'center'));
      bytes.push(...this.addLine('https://www.codecstudio.online/', 'center'));
      bytes.push(...this.addLine('Tel: 3238646844', 'center'));
      
      // QR Code (opcional)
      // bytes.push(...this.commands.qrCode(`TICKET-${Date.now()}`));
      
      bytes.push(...this.commands.feed(3));
      bytes.push(...this.commands.cut());
      
      // Enviar a la impresora
      return await this.sendToPrinter(bytes);
      
    } catch (error) {
      console.error('Error imprimiendo ticket:', error);
      return false;
    }
  }

  /**
   * Imprimir ticket de prueba
   */
  async printTestTicket(): Promise<boolean> {
    try {
      const bytes: number[] = [];
      
      bytes.push(...this.commands.init());
      bytes.push(...this.commands.fontXLarge());
      bytes.push(...this.commands.boldOn());
      bytes.push(...this.addLine('CODEC POS', 'center'));
      bytes.push(...this.commands.boldOff());
      bytes.push(...this.commands.fontNormal());
      
      bytes.push(...this.addSeparator('='));
      bytes.push(...this.addLine('PRUEBA DE IMPRESION', 'center'));
      bytes.push(...this.addSeparator('='));
      bytes.push(...this.commands.feed(1));
      
      bytes.push(...this.addLine('✓ Impresora conectada correctamente', 'center'));
      bytes.push(...this.addLine(`✓ Puerto: ${this.puerto}`, 'center'));
      bytes.push(...this.addLine(`✓ Ancho: ${this.ancho}mm`, 'center'));
      bytes.push(...this.addLine(`✓ Fecha: ${new Date().toLocaleString('es-CO')}`, 'center'));
      
      bytes.push(...this.commands.feed(1));
      bytes.push(...this.addSeparator());
      
      bytes.push(...this.addLine('Oneposi 85 Compatible ✓', 'center'));
      bytes.push(...this.addLine('ESC/POS estándar', 'center'));
      
      bytes.push(...this.commands.feed(3));
      bytes.push(...this.commands.cut());
      
      return await this.sendToPrinter(bytes);
      
    } catch (error) {
      console.error('Error imprimiendo prueba:', error);
      return false;
    }
  }

  async printWorkshopTicket(data: TallerTicketInput, cfg: Record<string, string> = {}): Promise<boolean> {
    try {
      const bytes: number[] = [];
      bytes.push(...this.commands.init());

      // ── Encabezado del negocio ─────────────────────────────────────────
      const nombreComercial = (cfg.nombreComercial || cfg.razonSocial || '').trim();
      if (nombreComercial) {
        bytes.push(...this.commands.fontBold());
        bytes.push(...this.addLine(nombreComercial, 'center'));
        bytes.push(...this.commands.fontNormal());
      }
      if (cfg.razonSocial && cfg.razonSocial !== nombreComercial) {
        bytes.push(...this.addLine(cfg.razonSocial, 'center'));
      }
      if (cfg.nit) {
        const nitStr = `NIT: ${cfg.nit}${cfg.digitoVerificacion ? `-${cfg.digitoVerificacion}` : ''}`;
        bytes.push(...this.addLine(nitStr, 'center'));
      }
      if (cfg.direccion) {
        this.wrapText(cfg.direccion).forEach((line) => bytes.push(...this.addLine(line, 'center')));
      }
      if (cfg.telefono) {
        bytes.push(...this.addLine(`Tel: ${cfg.telefono}`, 'center'));
      }
      if (cfg.mensajeTirillaArriba) {
        this.wrapText(cfg.mensajeTirillaArriba).forEach((line) => bytes.push(...this.addLine(line, 'center')));
      }

      bytes.push(...this.addSeparator('='));

      // ── Título ────────────────────────────────────────────────────────
      bytes.push(...this.commands.fontBold());
      bytes.push(...this.addLine('ORDEN DE SERVICIO', 'center'));
      bytes.push(...this.commands.fontNormal());
      bytes.push(...this.addSeparator());

      bytes.push(...this.addLine(`N Orden: ${data.numeroOrden}`));
      bytes.push(...this.addLine(`Fecha:   ${new Date(data.fechaRecepcion).toLocaleString('es-CO')}`));
      if (data.tecnicoAsignado) {
        bytes.push(...this.addLine(`Tecnico: ${data.tecnicoAsignado}`));
      }
      bytes.push(...this.addSeparator());

      // ── Cliente ───────────────────────────────────────────────────────
      bytes.push(...this.commands.boldOn());
      bytes.push(...this.addLine('CLIENTE'));
      bytes.push(...this.commands.boldOff());
      this.wrapText(`Nombre: ${data.cliente.nombre}`).forEach((line) => bytes.push(...this.addLine(line)));
      bytes.push(...this.addLine(`Tel:    ${data.cliente.telefono || '-'}`));
      bytes.push(...this.addLine(`CC/NIT: ${data.cliente.cedula || '-'}`));
      bytes.push(...this.addSeparator());

      // ── Dispositivo ───────────────────────────────────────────────────
      bytes.push(...this.commands.boldOn());
      bytes.push(...this.addLine('DISPOSITIVO'));
      bytes.push(...this.commands.boldOff());
      this.wrapText(`Tipo:   ${data.dispositivo.tipo || '-'}`).forEach((line) => bytes.push(...this.addLine(line)));
      this.wrapText(`Marca:  ${data.dispositivo.marca || '-'}`).forEach((line) => bytes.push(...this.addLine(line)));
      this.wrapText(`Modelo: ${data.dispositivo.modelo || '-'}`).forEach((line) => bytes.push(...this.addLine(line)));
      bytes.push(...this.addLine(`Serial: ${data.dispositivo.serial || data.dispositivo.imei || '-'}`));
      if (data.condicionFisica) {
        this.wrapText(`Estado: ${data.condicionFisica}`).forEach((line) => bytes.push(...this.addLine(line)));
      }
      if (data.accesorios) {
        this.wrapText(`Accesorios: ${data.accesorios}`).forEach((line) => bytes.push(...this.addLine(line)));
      }
      bytes.push(...this.addSeparator());

      // ── Falla reportada ───────────────────────────────────────────────
      bytes.push(...this.commands.boldOn());
      bytes.push(...this.addLine('FALLA REPORTADA'));
      bytes.push(...this.commands.boldOff());
      this.wrapText(data.problemaReportado || '-', this.maxChars).forEach((line) => bytes.push(...this.addLine(line)));
      bytes.push(...this.addSeparator());

      // ── Financiero ────────────────────────────────────────────────────
      bytes.push(...this.commands.boldOn());
      bytes.push(...this.addLine('INFORMACION FINANCIERA'));
      bytes.push(...this.commands.boldOff());
      bytes.push(...this.addColumns('Costo Estimado:', this.formatMoney(data.costoEstimado)));
      bytes.push(...this.addColumns('Anticipo:', this.formatMoney(data.anticipo)));
      bytes.push(...this.commands.fontBold());
      bytes.push(...this.addColumns('Saldo Pendiente:', this.formatMoney(data.saldoPendiente)));
      bytes.push(...this.commands.fontNormal());

      // ── Footer ────────────────────────────────────────────────────────
      bytes.push(...this.commands.feed(1));
      bytes.push(...this.addSeparator());

      const mensajePie = (cfg.mensajeTirillaBajo || '').trim();
      if (mensajePie) {
        this.wrapText(mensajePie).forEach((line) => bytes.push(...this.addLine(line, 'center')));
      } else {
        bytes.push(...this.addLine('Presente este comprobante al retirar el equipo.', 'center'));
        bytes.push(...this.addLine('Garantia valida sobre la reparacion realizada.', 'center'));
      }

      bytes.push(...this.commands.feed(1));
      bytes.push(...this.addLine('Firma Cliente:', 'left'));
      bytes.push(...this.addLine('______________________________', 'left'));
      bytes.push(...this.commands.feed(1));
      bytes.push(...this.addLine('https://www.codecstudio.online/', 'center'));
      bytes.push(...this.addLine('Tel: 3238646844', 'center'));
      bytes.push(...this.commands.feed(3));
      bytes.push(...this.commands.cut());

      return await this.sendToPrinter(bytes);
    } catch (error) {
      console.error('Error imprimiendo comprobante de taller:', error);
      return false;
    }
  }

  async printCashClosureTicket(data: CierreCajaTicketInput): Promise<boolean> {
    try {
      const bytes: number[] = [];

      bytes.push(...this.commands.init());
      bytes.push(...this.commands.boldOn());
      bytes.push(...this.addLine('CIERRE DE CAJA', 'center'));
      bytes.push(...this.commands.boldOff());
      bytes.push(...this.addSeparator('='));

      bytes.push(...this.addLine(`Cajero: ${data.cajero}`));
      bytes.push(...this.addLine(`Fecha/Hora: ${new Date(data.fecha).toLocaleString('es-CO')}`));
      bytes.push(...this.addSeparator());

      bytes.push(...this.addColumns('Base Inicial:', this.formatMoney(data.baseInicial)));
      bytes.push(...this.addColumns('Total Ventas:', this.formatMoney(data.totalVentas)));
      bytes.push(...this.addColumns('Dev. Efectivo:', this.formatMoney(data.totalSalidasDevolucion)));
      bytes.push(...this.addColumns('Gastos:', this.formatMoney(data.totalGastos)));

      if ((data.gastosDetalle || []).length > 0) {
        bytes.push(...this.addSeparator());
        bytes.push(...this.commands.boldOn());
        bytes.push(...this.addLine('DETALLE DE EGRESOS'));
        bytes.push(...this.commands.boldOff());

        (data.gastosDetalle || []).slice(0, 8).forEach((gasto, idx) => {
          const concepto = (gasto.concepto || '').trim();
          const descripcion = (gasto.descripcion || '').trim();
          const detalle = concepto && descripcion && concepto.toLowerCase() !== descripcion.toLowerCase()
            ? `${concepto} - ${descripcion}`
            : (concepto || descripcion);
          const titulo = `${idx + 1}. ${detalle}`;
          this.wrapText(titulo, this.maxChars).forEach((line) => bytes.push(...this.addLine(line)));
          bytes.push(...this.addColumns('   Valor:', this.formatMoney(Number(gasto.monto) || 0)));
        });
      }

      bytes.push(...this.addSeparator());
      bytes.push(...this.commands.boldOn());
      bytes.push(...this.addColumns('EFECTIVO ESPERADO:', this.formatMoney(data.efectivoEsperado)));
      bytes.push(...this.commands.boldOff());

      bytes.push(...this.commands.feed(2));
      bytes.push(...this.addLine('Ticket de auditoria', 'center'));
      bytes.push(...this.commands.feed(2));
      bytes.push(...this.commands.cut());

      return await this.sendToPrinter(bytes);
    } catch (error) {
      console.error('Error imprimiendo cierre de caja:', error);
      return false;
    }
  }

  /**
   * Abrir cajón monedero
   */
  async openDrawer(): Promise<boolean> {
    try {
      const bytes: number[] = [];
      bytes.push(...this.commands.init());
      bytes.push(...this.commands.openDrawer());
      
      return await this.sendToPrinter(bytes);
    } catch (error) {
      console.error('Error abriendo cajón:', error);
      return false;
    }
  }

  /**
   * Enviar bytes a la impresora
   */
  private async sendToPrinter(bytes: number[]): Promise<boolean> {
    try {
      if (!(window as any).electron) {
        console.error('❌ API de Electron no disponible');
        return false;
      }

      // Ruta preferida en Windows: spool RAW ESC/POS a impresora del sistema (POS-80)
      if ((window as any).electron?.printer?.rawEscPos) {
        const preferredPrinterName = this.printerName || getDefaultPrinterNameOrUndefined();
        const base64 = btoa(String.fromCharCode(...bytes));
        const rawResult = await (window as any).electron.printer.rawEscPos({
          base64,
          printerName: preferredPrinterName,
        });
        if (rawResult?.success) {
          console.log(`✅ ${bytes.length} bytes enviados por spool RAW a ${rawResult.printer}`);
          return true;
        }
        if (rawResult?.code === 'PRINTER_NOT_AVAILABLE') {
          throw new Error('La impresora predeterminada no está conectada. Por favor, verifícala en el área de Dispositivos');
        }
        console.warn('⚠️ RAW ESC/POS falló, usando fallback serial:', rawResult?.error || 'Error desconocido');
      }

      if (!(window as any).electron?.serialport) {
        console.error('❌ API de SerialPort no disponible');
        return false;
      }

      const puertoObjetivo = this.puerto || PRINTER_WINDOWS_FALLBACK_PORT;

      // Abrir puerto si no está abierto
      await (window as any).electron.serialport.open(puertoObjetivo, {
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none'
      });

      // Enviar datos
      const buffer = new Uint8Array(bytes);
      const result = await (window as any).electron.serialport.write(
        puertoObjetivo,
        buffer
      );

      console.log(`✅ ${bytes.length} bytes enviados a ${puertoObjetivo}`);
      
      // Cerrar puerto después de 1 segundo
      setTimeout(async () => {
        await (window as any).electron.serialport.close(puertoObjetivo);
      }, 1000);

      return result.success;
      
    } catch (error) {
      console.error('Error enviando a impresora:', error);
      return false;
    }
  }

  private formatMoney(amount: number): string {
    const n = Math.round(amount);
    return '$' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
}

// Traduce el código guardado en Configuración (`regimenFiscal`) a un texto
// legible para el cliente en la tirilla impresa.
const REGIMEN_FISCAL_LABEL: Record<string, string> = {
  simplificado: 'Simplificado',
  comun: 'Común',
  gran_contribuyente: 'Gran Contribuyente',
};

function readTirillaConfig(): Record<string, string> {
  try {
    const raw = localStorage.getItem('codec_pos_config');
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function resolveTicketWidthFromConfig(_defaultWidth: 58 | 80 = 80): 58 | 80 {
  return getConfiguredTicketWidthMm();
}

/**
 * Helper para crear instancia de impresora
 */
export function createPrinter(puerto: string, ancho: 58 | 80 = 80, printerName?: string): ThermalPrinter {
  return new ThermalPrinter({ puerto, ancho, printerName });
}

/**
 * Resuelve el nombre de la impresora para una sección específica.
 * Cadena de fallback: sección → facturas/etiquetas legacy → predeterminada → undefined
 */
function resolvePrinterForSection(section: PrintSection): string | undefined {
  return getPrinterForSectionOrUndefined(section);
}

/**
 * @deprecated — Usar resolvePrinterForSection('pos_tickets' | 'cierre_caja' | 'taller')
 */
function resolveFacturasPrinterName(): string | undefined {
  return getFacturasPrinterNameOrUndefined() || getDefaultPrinterNameOrUndefined();
}

/**
 * @deprecated — Usar resolvePrinterForSection('codigos_barras')
 */
function resolveEtiquetasPrinterName(): string | undefined {
  return getEtiquetasPrinterNameOrUndefined() || getDefaultPrinterNameOrUndefined();
}

/**
 * Imprimir ticket desde cualquier parte del sistema
 */
export async function printPOSTicket(
  puerto: string,
  ticketData: TicketData,
  ancho: 58 | 80 = 80
): Promise<boolean> {
  const printer = createPrinter(puerto, ancho);
  return await printer.printTicket(ticketData);
}

/**
 * Prueba rápida de impresora
 */
export async function testPrinter(puerto: string, ancho: 58 | 80 = 80): Promise<boolean> {
  const printer = createPrinter(puerto, ancho);
  return await printer.printTestTicket();
}

function resolveMetodoPagoLabel(key: string | undefined): string | undefined {
  if (!key) return undefined;
  try {
    const raw = localStorage.getItem('codecpos_metodos_pago_config');
    if (!raw) return key;
    const cfg: Array<{ id: string; label: string; tipo: string }> = JSON.parse(raw);
    const match = cfg.find(m => m.id === key || m.tipo === key);
    return match?.label ?? key;
  } catch { return key; }
}

export async function printSaleReceipt(
  venta: VentaTicketInput,
  config: {
    nombreComercial?: string;
    razonSocial?: string;
    nit?: string;
    digitoVerificacion?: string;
    mensajeTirillaBajo?: string;
    mensajeTirillaArriba?: string;
    eslogan?: string;
    email?: string;
    ciudad?: string;
  } = {},
  ancho: 58 | 80 = 80,
  section: PrintSection = 'pos_tickets'
): Promise<boolean> {
  const printer = createPrinter(resolveDefaultPrinterPort(), resolveTicketWidthFromConfig(ancho), resolvePrinterForSection(section) || resolveFacturasPrinterName());

  const cfg = readTirillaConfig();
  const nombreComercial = config.nombreComercial || cfg.nombreComercial || cfg.razonSocial || 'FACTURA DE VENTA';
  const razonSocial = config.razonSocial || cfg.razonSocial;
  const nit = config.nit || cfg.nit;
  const digitoVerificacion = config.digitoVerificacion || cfg.digitoVerificacion;
  const mensajeTirillaBajo = config.mensajeTirillaBajo || cfg.mensajeTirillaBajo;
  const mensajeTirillaArriba = config.mensajeTirillaArriba || cfg.mensajeTirillaArriba;
  const eslogan = config.eslogan || cfg.eslogan;

  const nitCompleto = nit
    ? `${nit}${digitoVerificacion ? `-${digitoVerificacion}` : ''}`
    : undefined;

  // Construir líneas de método de pago
  let metodoPagoLineas = resolveMetodoPagoLabel(venta.metodoPago);
  if (venta.metodoPago?.toLowerCase() === 'mixto' && venta.pagoMixto) {
    metodoPagoLineas = `PAGO MIXTO\n  ${venta.pagoMixto.metodo1.toUpperCase()}: $${venta.pagoMixto.monto1.toLocaleString('es-CO')}\n  ${venta.pagoMixto.metodo2.toUpperCase()}: $${venta.pagoMixto.monto2.toLocaleString('es-CO')}`;
  } else if (venta.metodoPago?.toLowerCase() === 'efectivo' && venta.efectivoRecibido) {
    // El cambio ya se imprime por separado como su propia línea "CAMBIO:"
    // (ver `cambio` más abajo) — no se repite aquí para evitar duplicarlo.
    metodoPagoLineas = `EFECTIVO\n  Recibido: $${venta.efectivoRecibido.toLocaleString('es-CO')}`;
  }

  // Construir footer
  const footerParts: string[] = [];
  if (mensajeTirillaArriba) footerParts.push(mensajeTirillaArriba);
  if (eslogan) footerParts.push(`"${eslogan}"`);
  footerParts.push(mensajeTirillaBajo || 'Gracias por su compra');
  if (venta.facturaElectronica) {
    footerParts.push('--------------------------------');
    if (venta.contingencia) {
      footerParts.push('CONTINGENCIA: Pendiente DIAN');
    } else {
      footerParts.push('Factura Electronica validada DIAN');
    }
    if (venta.folioElectronico) footerParts.push(`Folio: ${venta.folioElectronico}`);
    if (venta.cufe) footerParts.push(`CUFE:\n${venta.cufe}`);
  }

  const mesaDisplay = venta.referencia_mesa
    || (venta.mesa && venta.mesa !== 'General' && venta.mesa !== 'general' ? venta.mesa : undefined);

  return await printer.printTicket({
    header: nombreComercial,
    razonSocial,
    nit: nitCompleto,
    direccion: cfg.direccion,
    telefono: cfg.telefono,
    numeroFactura: venta.numeroFactura,
    fechaFactura: venta.fecha ? new Date(venta.fecha).toLocaleString('es-CO') : new Date().toLocaleString('es-CO'),
    cajero: venta.cajero,
    // Nombres reales guardados por ConfiguracionPage.tsx (no "regimenTributario"/
    // "resolucionDian" — esos nunca existieron en el config real, por lo que
    // esta sección jamás se imprimía aunque el usuario la configurara).
    regimenTributario: REGIMEN_FISCAL_LABEL[cfg.regimenFiscal || ''] || cfg.regimenFiscal,
    resolucionDian: cfg.claveResolucionDIAN,
    rangoDesde: cfg.rangoAutorizadoDesde,
    rangoHasta: cfg.rangoAutorizadoHasta,
    prefijoFactura: cfg.prefijoFactura,
    items: venta.items.map((item) => ({
      nombre: item.nombre,
      cantidad: item.cantidad,
      precio: item.precio,
      total: item.subtotal,
    })),
    subtotal: venta.subtotal ?? venta.total,
    impuestos: venta.iva ?? 0,
    total: venta.total,
    metodoPago: metodoPagoLineas,
    cambio: venta.metodoPago?.toLowerCase() === 'efectivo' ? (venta.cambio ?? 0) : undefined,
    footer: footerParts.filter(Boolean).join('\n'),
    referencia_mesa: mesaDisplay,
  });
}

export async function printWorkshopReceipt(
  data: TallerTicketInput,
  ancho: 58 | 80 = 80,
  section: PrintSection = 'taller'
): Promise<boolean> {
  const printer = createPrinter(resolveDefaultPrinterPort(), resolveTicketWidthFromConfig(ancho), resolvePrinterForSection(section) || resolveFacturasPrinterName());
  const cfg = readTirillaConfig();
  return printer.printWorkshopTicket(data, cfg);
}

export async function printCashClosureReceipt(
  data: CierreCajaTicketInput,
  ancho: 58 | 80 = 80,
  section: PrintSection = 'cierre_caja'
): Promise<boolean> {
  const printer = createPrinter(resolveDefaultPrinterPort(), resolveTicketWidthFromConfig(ancho), resolvePrinterForSection(section) || resolveFacturasPrinterName());
  return printer.printCashClosureTicket(data);
}

/**
 * Abrir cajón monedero via ESC/POS.
 * Respeta la configuración de DrawerConfig: via impresora (RJ11) o directo al PC (serial/COM).
 */
export async function openCashDrawer(): Promise<boolean> {
  try {
    const config = getDrawerConfig();
    if (!config.habilitado) return false;

    const ESC = 0x1B;
    // Pin 2 = 0x00 (más común), Pin 5 = 0x01
    const pinByte = config.pin === 5 ? 0x01 : 0x00;
    const bytes = [ESC, 0x70, pinByte, 0x19, 0xFA];

    if (config.modo === 'directo_pc' && config.puertoDirecto) {
      // Cajón conectado directamente a un puerto COM del PC
      if (!(window as any).electron?.serialport) return false;
      const port = config.puertoDirecto;
      try {
        await (window as any).electron.serialport.open(port, {
          baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none',
        });
      } catch {}
      const result = await (window as any).electron.serialport.write(port, new Uint8Array(bytes));
      setTimeout(() => { try { (window as any).electron.serialport.close(port); } catch {} }, 1000);
      return Boolean(result?.success);
    }

    // Cajón via impresora: la impresora envía el pulso ESC/POS por su puerto RJ11 al cajón
    const printerName = resolvePrinterForSection(config.seccionImpresora) || resolveFacturasPrinterName();
    if ((window as any).electron?.printer?.rawEscPos) {
      const base64 = btoa(String.fromCharCode(...bytes));
      const result = await (window as any).electron.printer.rawEscPos({ base64, printerName });
      if (result?.success) return true;
    }
    // Fallback serial para impresoras sin spool Windows (ej: Linux/COM)
    const printer = createPrinter(resolveDefaultPrinterPort(), 80, printerName);
    return await printer.openDrawer();
  } catch {
    return false;
  }
}

/**
 * Imprimir etiqueta/código de barras usando la impresora de etiquetas asignada.
 */
export async function printLabelRaw(
  base64Bytes: string,
  section: PrintSection = 'codigos_barras'
): Promise<boolean> {
  try {
    if (!(window as any).electron?.printer?.rawEscPos) return false;
    const printerName = resolvePrinterForSection(section) || resolveEtiquetasPrinterName();
    const result = await (window as any).electron.printer.rawEscPos({ base64: base64Bytes, printerName });
    return Boolean(result?.success);
  } catch {
    return false;
  }
}
