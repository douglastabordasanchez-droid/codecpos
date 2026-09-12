matches: 0
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
  /** Logo del negocio (data URL o URL http) — se imprime como imagen ESC/POS antes del nombre comercial, igual que en la vista previa/PDF (TicketReceipt.tsx). */
  logoUrl?: string;
  header?: string; // nombre comercial
  razonSocial?: string;
  nit?: string;
  eslogan?: string;
  direccion?: string;
  ciudad?: string;
  telefono?: string;
  email?: string;
  regimenTributario?: string;
  facturaElectronica?: boolean;
  numeroFactura?: string;
  /** Fecha/hora de la venta — se formatea en dos líneas (Fecha:/Hora:) igual que la vista previa. */
  fecha?: string;
  resolucionDian?: string;
  rangoDesde?: string;
  rangoHasta?: string;
  prefijoFactura?: string;
  items: Array<{
    nombre: string;
    cantidad: number;
    precio: number;
    total: number;
    talla?: string;
    color?: string;
  }>;
  subtotal: number;
  impuestos?: number;
  porcentajeIVA?: number;
  descuento?: number;
  propina?: number;
  porcentajePropinaSugerido?: number;
  total: number;
  cajero?: string;
  metodoPago?: string;
  cambio?: number;
  /** Mensajes personalizados del pie — se imprimen en el mismo orden que la vista previa (Arriba → Eslogan → Bajo). */
  mensajeTirillaArriba?: string;
  mensajeTirillaBajo?: string;
  contingencia?: boolean;
  facturaEstado?: 'SINCRONIZADA' | 'PENDIENTE_SINCRONIZAR' | 'LOCAL';
  folioElectronico?: string;
  cufe?: string;
  referencia_mesa?: string;
}

export interface VentaTicketInput {
  numeroFactura: string;
  items: Array<{
    nombre: string;
    cantidad: number;
    precio: number;
    subtotal: number;
    talla?: string;
    color?: string;
  }>;
  total: number;
  subtotal?: number;
  iva?: number;
  porcentajeIVA?: number;
  descuento?: number;
  propina?: number;
  porcentajePropinaSugerido?: number;
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
  facturaEstado?: 'SINCRONIZADA' | 'PENDIENTE_SINCRONIZAR' | 'LOCAL';
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

export interface ComandaTicketInput {
  mesaNombre: string;
  meseroNombre?: string;
  nota?: string;
  hora: string;
  items: { nombre: string; cantidad: number; nota?: string }[];
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

// 🛡️ FIX CODIFICACIÓN: las impresoras térmicas ESC/POS no hablan UTF-8 — usan
// una tabla de un solo byte por carácter (codepage), seleccionable con el
// comando `ESC t n`. Sin seleccionar ninguna, la mayoría arranca en PC437
// (USA), que NO tiene tildes ni ñ en las mismas posiciones que Latin-1/UTF-8.
// Antes `textToBytes` tomaba el código Unicode de cada carácter y se quedaba
// con el byte bajo (`& 0xFF`) — para 'á' (U+00E1) eso da 0xE1, que en UTF-8/
// Latin-1 SÍ es 'á', pero en la tabla PC437 que la impresora realmente usa,
// 0xE1 es 'ß' — de ahí "Bogotá" saliendo como "Bogotß" en el ticket físico.
// La tabla PC850 (Multilingüe) sí incluye los caracteres del español en las
// posiciones de abajo — n=2 en `ESC t n` la selecciona en prácticamente
// cualquier clon ESC/POS (Epson, Star, Bixolon, Oneposi, Zjiang siguen la
// misma tabla de codepages de Epson). Ver `commands.init()` más abajo.
const CP850_MAP: Record<string, number> = {
  'á': 0xA0, 'é': 0x82, 'í': 0xA1, 'ó': 0xA2, 'ú': 0xA3,
  'ñ': 0xA4, 'Ñ': 0xA5, 'ü': 0x81, 'Ü': 0x9A,
  'Á': 0xB5, 'É': 0x90, 'Í': 0xD6, 'Ó': 0xE0, 'Ú': 0xE9,
  '¿': 0xA8, '¡': 0xAD, '°': 0xF8, 'ª': 0xA6, 'º': 0xA7,
  'Ç': 0x80, 'ç': 0x87,
};

// 🛡️ FIX COMPATIBILIDAD: algunos clones ESC/POS (comunes en impresoras chinas
// genéricas) ignoran `ESC t 2` y se quedan en una tabla de caracteres propia
// (con frecuencia una tabla china) donde los bytes altos de CP850_MAP no caen
// en tildes/ñ sino en glifos CJK — la tirilla sale con símbolos como "郎"/"依"
// en vez de "Ó"/"É". Como no hay forma confiable de detectar el firmware real
// del clon desde software, se ofrece este mapa de reemplazo plano (sin
// tildes) que activa el usuario en Configuración cuando ve el problema —
// funciona en CUALQUIER impresora porque nunca emite un byte fuera de ASCII.
const SIN_TILDES_MAP: Record<string, string> = {
  'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
  'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U',
  'ñ': 'n', 'Ñ': 'N', 'ü': 'u', 'Ü': 'U',
  '¿': '?', '¡': '!', 'ª': 'a', 'º': 'o', '°': ' ',
  'Ç': 'C', 'ç': 'c',
};

function imprimirSinTildesActivo(): boolean {
  try {
    const raw = localStorage.getItem('codec_pos_config');
    if (!raw) return false;
    return JSON.parse(raw)?.imprimirSinTildes === true;
  } catch {
    return false;
  }
}

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
    // Inicialización + selección de codepage PC850 (multilingüe, incluye
    // tildes/ñ) — sin esto la impresora se queda en su tabla por defecto
    // (típicamente PC437, sin caracteres del español).
    init: () => [ESC, 0x40, ESC, 0x74, 0x02],
    
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
    let clean = String(text ?? '').replace(/ /g, ' ');
    if (imprimirSinTildesActivo()) {
      clean = clean.replace(/[áéíóúÁÉÍÓÚñÑüÜ¿¡ªº°Çç]/g, (ch) => SIN_TILDES_MAP[ch] ?? ch);
    }
    const bytes: number[] = [];
    // Recorre por punto de codigo (no por unidad UTF-16) para no partir un
    // caracter fuera del BMP en dos bytes basura.
    for (const ch of clean) {
      const mapeado = CP850_MAP[ch];
      if (mapeado !== undefined) { bytes.push(mapeado); continue; }
      const code = ch.codePointAt(0) || 0;
      bytes.push(code <= 0xFF ? code : 0x3F);
    }
    return bytes;
  }

  /**
   * 🖼️ Logo del negocio como imagen ESC/POS (comando GS v 0 — raster bit
   * image). La tirilla física no tiene forma de mostrar un <img> como la
   * vista previa/PDF (TicketReceipt.tsx): hay que convertir el logo a un
   * mapa de bits blanco/negro y enviarlo como datos crudos. Se decodifica
   * con <canvas> (disponible aquí porque este driver corre en el renderer de
   * Electron, no en Node) y se reduce a 1 bit por píxel con un umbral simple
   * de luminosidad — suficiente para un logo simple; no se usa dithering
   * para no complicar un caso que ya funciona bien en la mayoría de logos.
   * Nunca lanza: si el logo no carga o el navegador no puede decodificarlo,
   * se omite en silencio y el resto del ticket se imprime igual.
   */
  private async logoToRasterBytes(logoUrl: string): Promise<number[]> {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('No se pudo cargar el logo'));
        image.src = logoUrl;
      });

      // Ancho del área imprimible en píxeles — convención estándar ESC/POS
      // (203dpi ≈ 8 dots/mm): 58mm → 384px, 80mm → 576px.
      const targetWidth = this.ancho === 80 ? 576 : 384;
      const scale = targetWidth / img.width;
      const targetHeight = Math.max(1, Math.round(img.height * scale));
      // GS v 0 exige que el ancho en bytes sea entero — se redondea el ancho
      // en píxeles al múltiplo de 8 más cercano por arriba (padding blanco).
      const widthBytes = Math.ceil(targetWidth / 8);
      const paddedWidth = widthBytes * 8;

      const canvas = document.createElement('canvas');
      canvas.width = paddedWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return [];
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, paddedWidth, targetHeight);
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      const { data } = ctx.getImageData(0, 0, paddedWidth, targetHeight);
      const raster: number[] = [];
      for (let y = 0; y < targetHeight; y++) {
        for (let byteX = 0; byteX < widthBytes; byteX++) {
          let byte = 0;
          for (let bit = 0; bit < 8; bit++) {
            const x = byteX * 8 + bit;
            const i = (y * paddedWidth + x) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
            // Luminosidad estándar; fondo transparente cuenta como blanco.
            const luminosidad = a < 128 ? 255 : 0.299 * r + 0.587 * g + 0.114 * b;
            const esNegro = luminosidad < 200;
            if (esNegro) byte |= (0x80 >> bit);
          }
          raster.push(byte);
        }
      }

      const bytes: number[] = [];
      bytes.push(GS, 0x76, 0x30, 0x00, widthBytes & 0xFF, (widthBytes >> 8) & 0xFF, targetHeight & 0xFF, (targetHeight >> 8) & 0xFF);
      bytes.push(...raster);
      return bytes;
    } catch {
      return [];
    }
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

  /**
   * Línea de 3 columnas (CANT / DESCRIPCIÓN / VALOR) — igual a la tabla de
   * ítems de la vista previa. `cant` y `valor` son campos cortos fijos;
   * `desc` toma el espacio restante y se trunca si no cabe (el nombre del
   * ítem ya se imprime completo, envuelto, en una línea propia antes de
   * esta — ver printTicket).
   */
  // 🛡️ FIX: sin un espacio de separación GARANTIZADO entre columnas, un valor
  // que ocupa exactamente el ancho de su columna (p. ej. "CANT", 4 caracteres,
  // en una columna de 4) queda pegado al siguiente texto — se vio literalmente
  // "CANTDESCRIPCIÓN" en el encabezado de la tabla. Los anchos reservan
  // explícitamente 1 espacio de separación a cada lado de la columna central.
  // Centralizado en un método propio (no solo constantes dentro de
  // addColumns3) porque el llamador también necesita `descWidth`/`cantWidth`
  // para envolver nombres largos en vez de truncarlos — ver printTicket.
  private anchosColumnas3() {
    const GAP = 1;
    const cantWidth = 4;
    const valorWidth = Math.max(8, Math.floor(this.maxChars * 0.30));
    const descWidth = Math.max(1, this.maxChars - cantWidth - valorWidth - GAP * 2);
    return { GAP, cantWidth, descWidth, valorWidth };
  }

  private addColumns3(cant: string, desc: string, valor: string): number[] {
    const bytes: number[] = [];
    bytes.push(...this.commands.alignLeft());

    const { GAP, cantWidth, descWidth, valorWidth } = this.anchosColumnas3();
    const cantPart = String(cant || '').slice(0, cantWidth).padEnd(cantWidth, ' ');
    const descPart = String(desc || '').slice(0, descWidth).padEnd(descWidth, ' ');
    const valorPart = String(valor || '').slice(0, valorWidth).padStart(valorWidth, ' ');

    const linea = cantPart + ' '.repeat(GAP) + descPart + ' '.repeat(GAP) + valorPart;
    bytes.push(...this.textToBytes(linea), 0x0A);
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
  // 🧾 REESTRUCTURADO: el orden, los rótulos y los saltos de línea de este
  // método ahora replican EXACTAMENTE `TicketReceipt.tsx` (la vista previa
  // en pantalla) — encabezado (nombre → razón social → NIT → eslogan →
  // dirección/ciudad/tel/email → régimen), título FACTURA DE VENTA/N°/
  // cajero/fecha/hora, tabla CANT/DESCRIPCIÓN/VALOR, totales, y el mismo pie
  // de mensajes personalizados + créditos. Antes el ticket físico omitía por
  // completo el título "FACTURA DE VENTA", el eslogan del encabezado y el
  // mensaje superior, e imprimía "CODEC POS v2.0" suelto en medio del
  // encabezado — ninguna de esas líneas existe en la vista previa.
  async printTicket(data: TicketData): Promise<boolean> {
    try {
      const bytes: number[] = [];

      // Inicializar (incluye selección de codepage — ver commands.init())
      bytes.push(...this.commands.init());

      // 🖼️ Logo — igual que la vista previa/PDF, antes del nombre comercial.
      if (data.logoUrl) {
        const logoBytes = await this.logoToRasterBytes(data.logoUrl);
        if (logoBytes.length > 0) {
          bytes.push(...this.commands.alignCenter());
          bytes.push(...logoBytes);
          bytes.push(...this.commands.feed(1));
          bytes.push(...this.commands.alignLeft());
        }
      }

      // ── Encabezado del negocio ──────────────────────────────────────
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
      // 🧾 FIX: "Mensaje Superior de la Tirilla" (mensajeTirillaArriba) nunca
      // se imprimía arriba pese a su nombre — solo aparecía en el pie, junto
      // al eslogan repetido. Ahora va aquí, antes del eslogan, y ya no se
      // repite en el pie (ver más abajo).
      if (data.mensajeTirillaArriba) {
        bytes.push(...this.commands.boldOn());
        this.wrapText(data.mensajeTirillaArriba).forEach((line) => bytes.push(...this.addLine(line, 'center')));
        bytes.push(...this.commands.boldOff());
      }
      if (data.eslogan) {
        bytes.push(...this.addLine(data.eslogan, 'center'));
      }

      bytes.push(...this.addSeparator());

      if (data.direccion) {
        this.wrapText(data.direccion).forEach((line) => bytes.push(...this.addLine(line, 'center')));
      }
      if (data.ciudad) {
        bytes.push(...this.addLine(data.ciudad, 'center'));
      }
      if (data.telefono) {
        bytes.push(...this.addLine(`Tel: ${data.telefono}`, 'center'));
      }
      if (data.email) {
        bytes.push(...this.addLine(data.email, 'center'));
      }

      if (data.regimenTributario) {
        bytes.push(...this.addSeparator());
        bytes.push(...this.addLine(`Régimen ${data.regimenTributario}`, 'center'));
      }

      bytes.push(...this.addSeparator('='));

      // ── Datos de la transacción ──────────────────────────────────────
      bytes.push(...this.commands.boldOn());
      bytes.push(...this.addLine(data.facturaElectronica ? 'FACTURA ELECTRÓNICA' : 'FACTURA DE VENTA', 'center'));
      bytes.push(...this.commands.boldOff());
      if (data.numeroFactura) {
        bytes.push(...this.commands.boldOn());
        bytes.push(...this.addLine(`N° ${data.numeroFactura}`, 'center'));
        bytes.push(...this.commands.boldOff());
      }
      if (data.referencia_mesa) {
        bytes.push(...this.commands.boldOn());
        bytes.push(...this.addLine(`UBICACIÓN: ${data.referencia_mesa}`, 'center'));
        bytes.push(...this.commands.boldOff());
      }
      if (data.cajero) {
        bytes.push(...this.addLine(`Cajero: ${data.cajero}`));
      }
      const fechaVenta = data.fecha ? new Date(data.fecha) : new Date();
      bytes.push(...this.addLine(`Fecha: ${fechaVenta.toLocaleDateString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' })}`));
      bytes.push(...this.addLine(`Hora: ${fechaVenta.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`));

      // 🧾 Requisito DIAN: la resolución de facturación y su rango autorizado.
      if (data.resolucionDian) {
        bytes.push(...this.addLine(`Resolución DIAN: ${data.resolucionDian}`));
        if (data.rangoDesde && data.rangoHasta) {
          bytes.push(...this.addLine(
            `Rango: ${data.prefijoFactura || ''}${data.rangoDesde} al ${data.prefijoFactura || ''}${data.rangoHasta}`
          ));
        }
      }

      bytes.push(...this.addSeparator('='));

      // ── Cuerpo del detalle ────────────────────────────────────────────
      bytes.push(...this.commands.boldOn());
      bytes.push(...this.addColumns3('CANT', 'DESCRIPCIÓN', 'VALOR'));
      bytes.push(...this.commands.boldOff());
      bytes.push(...this.addSeparator());

      // 🛡️ FIX: `addColumns3` trunca lo que no cabe en su columna — pasarle
      // el nombre completo de un producto largo lo cortaba en silencio (p.
      // ej. "Croissant de Almendra y Miel Artesanal" perdía "Artesanal" sin
      // ningún indicio). La vista previa en pantalla nunca pierde texto,
      // solo lo envuelve en más líneas — aquí se hace lo mismo: la columna
      // CANT/VALOR solo va en la PRIMERA línea del nombre; el resto del
      // nombre envuelto queda indentado debajo, alineado bajo DESCRIPCIÓN.
      const { cantWidth, GAP, descWidth } = this.anchosColumnas3();
      const indent = ' '.repeat(cantWidth + GAP);
      for (const item of data.items) {
        const nombreLineas = this.wrapText(item.nombre, descWidth);
        bytes.push(...this.addColumns3(String(item.cantidad), nombreLineas[0] || '', this.formatMoney(item.total)));
        nombreLineas.slice(1).forEach((line) => bytes.push(...this.addLine(`${indent}${line}`)));
        if (item.talla || item.color) {
          const variante = `VARIANTE: ${item.talla ? `Talla ${item.talla}` : ''}${item.talla && item.color ? ' | ' : ''}${item.color ? `Color ${item.color}` : ''}`;
          this.wrapText(variante, this.maxChars - indent.length).forEach((line) => bytes.push(...this.addLine(`${indent}${line}`)));
        }
        bytes.push(...this.addLine(`${indent}${this.formatMoney(item.precio)} c/u`));
      }

      bytes.push(...this.addSeparator('='));

      // ── Totales y pago ────────────────────────────────────────────────
      bytes.push(...this.addColumns('Subtotal:', this.formatMoney(data.subtotal)));

      if (data.impuestos) {
        bytes.push(...this.addColumns(`IVA (${data.porcentajeIVA || 19}%):`, this.formatMoney(data.impuestos)));
      }
      if (data.descuento) {
        bytes.push(...this.addColumns('Descuento:', '-' + this.formatMoney(data.descuento)));
      }
      if (data.propina !== undefined) {
        bytes.push(...this.addColumns(data.porcentajePropinaSugerido ? `Propina (${data.porcentajePropinaSugerido}%):` : 'Propina:', this.formatMoney(data.propina)));
      }

      bytes.push(...this.commands.boldOn());
      bytes.push(...this.addColumns('TOTAL:', this.formatMoney(data.total)));
      bytes.push(...this.commands.boldOff());

      if (data.metodoPago) {
        // `metodoPago` puede traer varias líneas (p.ej. "EFECTIVO\n  Recibido: $X"
        // o "PAGO MIXTO\n  NEQUI: $X\n  TARJETA: $Y"). `addColumns` está pensado
        // para un único valor de línea — pasarle un string con \n embebidos
        // cortaba y desalineaba el texto en la impresora física. Cada línea
        // adicional ahora se imprime aparte, igual que en pantalla/PDF.
        const metodoPagoLineas = String(data.metodoPago).split('\n').map((l) => l.trim()).filter(Boolean);
        bytes.push(...this.addColumns('Método de Pago:', metodoPagoLineas[0] || data.metodoPago));
        metodoPagoLineas.slice(1).forEach((line) => bytes.push(...this.addLine(`  ${line}`)));

        if (data.cambio && data.cambio > 0) {
          bytes.push(...this.commands.boldOn());
          bytes.push(...this.addColumns('Cambio:', this.formatMoney(data.cambio)));
          bytes.push(...this.commands.boldOff());
        }
      }

      bytes.push(...this.addSeparator('='));

      // ── Pie de página: mensajes personalizados ──────────────────────────
      // 🧾 FIX: mensajeTirillaArriba y eslogan ya se imprimieron en el
      // encabezado (arriba) — repetirlos aquí duplicaba el texto en el pie
      // ("Se me come todo!!! / Espera todo menos el hambre / Vuelva Pronto!"
      // en vez de solo "Vuelva Pronto!"). El pie ahora muestra únicamente el
      // mensaje inferior configurado.
      if (data.mensajeTirillaBajo) {
        bytes.push(...this.commands.boldOn());
        this.wrapText(data.mensajeTirillaBajo).forEach((line) => bytes.push(...this.addLine(line, 'center')));
        bytes.push(...this.commands.boldOff());
      }

      if (data.facturaElectronica) {
        // 🧾 FIX: faltaba el mismo aviso de estado que muestra la vista
        // previa (contingencia / sincronizada) — se omiten los emojis (⚠️/✓)
        // porque la tabla de caracteres de la impresora no los tiene.
        if (data.contingencia) {
          bytes.push(...this.commands.boldOn());
          bytes.push(...this.addLine('[CONTINGENCIA] Pendiente de sincronización DIAN', 'center'));
          bytes.push(...this.commands.boldOff());
        } else if (data.facturaEstado === 'SINCRONIZADA') {
          bytes.push(...this.addLine('Factura Electrónica Válida - Sincronizada con DIAN', 'center'));
        }
        bytes.push(...this.addLine('Este documento es una representación', 'center'));
        bytes.push(...this.addLine('impresa de una factura electrónica', 'center'));
        bytes.push(...this.addLine('generada y validada por la DIAN', 'center'));
        if (data.folioElectronico) {
          bytes.push(...this.addLine(`Folio: ${data.folioElectronico}`, 'center'));
        }
        if (data.cufe) {
          bytes.push(...this.commands.boldOn());
          bytes.push(...this.addLine('CUFE:', 'center'));
          bytes.push(...this.commands.boldOff());
          this.wrapText(data.cufe).forEach((line) => bytes.push(...this.addLine(line, 'center')));
        }
      }

      // ── Créditos del software — igual al bloque final en pantalla ──────
      bytes.push(...this.addSeparator());
      bytes.push(...this.commands.boldOn());
      bytes.push(...this.addLine('CODEC POS v2.0', 'center'));
      bytes.push(...this.commands.boldOff());
      bytes.push(...this.addLine(`Software POS - Facturación ${data.facturaElectronica ? 'Electrónica' : 'Tradicional'}`, 'center'));
      bytes.push(...this.addLine('Desarrollado por Codec Studio', 'center'));
      bytes.push(...this.addLine('Diseño de software personalizado', 'center'));
      bytes.push(...this.addLine('Bogotá, Colombia', 'center'));
      bytes.push(...this.commands.boldOn());
      bytes.push(...this.addLine('Tel: 3238646844', 'center'));
      bytes.push(...this.commands.boldOff());

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
      
      // 🛡️ FIX: '✓' no existe en la tabla de caracteres de la impresora
      // (PC850) — se imprimía como un carácter basura, justo en el ticket
      // pensado para CONFIRMAR que la codificación funciona bien.
      bytes.push(...this.addLine('OK Impresora conectada correctamente', 'center'));
      bytes.push(...this.addLine(`OK Puerto: ${this.puerto}`, 'center'));
      bytes.push(...this.addLine(`OK Ancho: ${this.ancho}mm`, 'center'));
      bytes.push(...this.addLine(`OK Fecha: ${new Date().toLocaleString('es-CO')}`, 'center'));

      bytes.push(...this.commands.feed(1));
      bytes.push(...this.addSeparator());

      bytes.push(...this.addLine('Oneposi 85 Compatible OK', 'center'));
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

  /** Tiquete de comanda para cocina/bar — solo ítems + mesa, sin precios. */
  async printComandaTicket(data: ComandaTicketInput): Promise<boolean> {
    try {
      const bytes: number[] = [];
      bytes.push(...this.commands.init());

      bytes.push(...this.commands.fontBold());
      bytes.push(...this.addLine('COMANDA', 'center'));
      bytes.push(...this.commands.fontNormal());
      bytes.push(...this.addSeparator('='));

      bytes.push(...this.commands.boldOn());
      bytes.push(...this.addLine(`MESA: ${data.mesaNombre}`, 'center'));
      bytes.push(...this.commands.boldOff());
      bytes.push(...this.addLine(`Hora: ${data.hora}`));
      if (data.meseroNombre) {
        bytes.push(...this.addLine(`Mesero: ${data.meseroNombre}`));
      }
      bytes.push(...this.addSeparator());

      bytes.push(...this.commands.fontBold());
      data.items.forEach((item) => {
        this.wrapText(`${item.cantidad}x ${item.nombre}`, this.maxChars).forEach((line) => bytes.push(...this.addLine(line)));
        if (item.nota) {
          bytes.push(...this.commands.fontNormal());
          this.wrapText(`  Nota: ${item.nota}`, this.maxChars).forEach((line) => bytes.push(...this.addLine(line)));
          bytes.push(...this.commands.fontBold());
        }
      });
      bytes.push(...this.commands.fontNormal());
      bytes.push(...this.addSeparator());

      if (data.nota) {
        bytes.push(...this.commands.boldOn());
        bytes.push(...this.addLine('NOTA GENERAL'));
        bytes.push(...this.commands.boldOff());
        this.wrapText(data.nota, this.maxChars).forEach((line) => bytes.push(...this.addLine(line)));
      }

      bytes.push(...this.commands.feed(3));
      bytes.push(...this.commands.cut());

      return await this.sendToPrinter(bytes);
    } catch (error) {
      console.error('Error imprimiendo comanda:', error);
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

// 🧾 FIX: replicaba una lógica de etiquetas personalizadas
// (`codecpos_metodos_pago_config`) que la vista previa (TicketReceipt.tsx,
// función `labelMetodoPagoTirilla`) NUNCA usa — ese modal simplemente pone
// el método en MAYÚSCULA (con el caso especial "BRE-B"). Con la config por
// defecto (sin personalizar), esto hacía que el ticket físico mostrara
// "nequi" en minúscula mientras la pantalla mostraba "NEQUI". Ahora es
// exactamente la misma función que usa la vista previa.
function resolveMetodoPagoLabel(key: string | undefined): string | undefined {
  if (!key) return undefined;
  return key.toLowerCase() === 'bre_b' ? 'BRE-B' : key.toUpperCase();
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
  const logoUrl = cfg.logoUrl || undefined;

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

  const mesaDisplay = venta.referencia_mesa
    || (venta.mesa && venta.mesa !== 'General' && venta.mesa !== 'general' ? venta.mesa : undefined);

  return await printer.printTicket({
    logoUrl,
    header: nombreComercial,
    razonSocial,
    nit: nitCompleto,
    // 🧾 FIX: el eslogan y el mensaje superior nunca se imprimían en el
    // encabezado del ticket físico (solo se metían al pie) — la vista previa
    // (TicketReceipt.tsx) SÍ muestra el eslogan justo debajo del NIT. Ahora
    // se pasan como campos propios y `printTicket` los ubica en el mismo
    // lugar que la pantalla (eslogan en el encabezado; mensajeTirillaArriba/
    // eslogan/mensajeTirillaBajo, en ese orden, en el pie — igual que el modal).
    eslogan,
    direccion: cfg.direccion,
    ciudad: cfg.ciudad ? `${cfg.ciudad}${cfg.departamento ? ` - ${cfg.departamento}` : ''}` : undefined,
    telefono: cfg.telefono,
    email: config.email || cfg.email,
    facturaElectronica: !!venta.facturaElectronica,
    numeroFactura: venta.numeroFactura,
    fecha: venta.fecha,
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
      talla: item.talla,
      color: item.color,
    })),
    subtotal: venta.subtotal ?? venta.total,
    impuestos: venta.iva ?? 0,
    porcentajeIVA: venta.porcentajeIVA,
    descuento: venta.descuento ?? 0,
    // 🧾 FIX: antes forzaba `?? 0`, así que TODA venta (incluso sin propina
    // habilitada) imprimía una línea "Propina: $0" que la vista previa nunca
    // muestra (esta solo aparece cuando `venta.propina` viene definido). Se
    // deja pasar tal cual, igual que ya hace TicketReceipt.tsx.
    propina: venta.propina,
    porcentajePropinaSugerido: venta.porcentajePropinaSugerido,
    total: venta.total,
    metodoPago: metodoPagoLineas,
    cambio: venta.metodoPago?.toLowerCase() === 'efectivo' ? (venta.cambio ?? 0) : undefined,
    mensajeTirillaArriba,
    // 🧾 FIX: la vista previa (TicketReceipt.tsx) SOLO imprime este mensaje si
    // el negocio lo configuró — no tiene ningún texto de respaldo. El ticket
    // físico antes forzaba "Gracias por su compra" cuando el campo estaba
    // vacío, una línea que la vista previa nunca mostraba.
    mensajeTirillaBajo,
    contingencia: venta.contingencia,
    facturaEstado: venta.facturaEstado,
    folioElectronico: venta.folioElectronico,
    cufe: venta.cufe,
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

export async function printComandaReceipt(
  data: ComandaTicketInput,
  ancho: 58 | 80 = 80,
  section: PrintSection = 'comanda_cocina'
): Promise<boolean> {
  const printer = createPrinter(resolveDefaultPrinterPort(), resolveTicketWidthFromConfig(ancho), resolvePrinterForSection(section) || resolveFacturasPrinterName());
  return printer.printComandaTicket(data);
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
