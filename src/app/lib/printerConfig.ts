const POS_DEFAULT_PRINTER_KEY = 'pos-default-printer-name';
const PRINTER_FACTURAS_KEY = 'pos-printer-facturas';
const PRINTER_ETIQUETAS_KEY = 'pos-printer-etiquetas';

export const PRINTER_STORAGE_KEYS = {
  ventas: 'printer_ventas',
  cierre: 'printer_cierre',
  gastos: 'printer_gastos',
  taller: 'printer_taller',
  reportes: 'printer_reportes',
  barras: 'printer_barras',
  devoluciones: 'printer_devoluciones',
  contabilidad: 'printer_contabilidad',
  comanda: 'printer_comanda',
  global: 'printer_global',
} as const;

export type PrinterScopeKey = keyof typeof PRINTER_STORAGE_KEYS;

function safeGet(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function safeSet(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // noop
  }
}

export function getPrinterByScope(scope: PrinterScopeKey): string {
  return safeGet(PRINTER_STORAGE_KEYS[scope]);
}

export function setPrinterByScope(scope: PrinterScopeKey, name: string): void {
  safeSet(PRINTER_STORAGE_KEYS[scope], name);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('codecpos:printers-updated', {
      detail: { scope, printerName: name || '' },
    }));
  }
}

export function getAllStandardPrinters(): Record<PrinterScopeKey, string> {
  return {
    ventas: getPrinterByScope('ventas'),
    cierre: getPrinterByScope('cierre'),
    gastos: getPrinterByScope('gastos'),
    taller: getPrinterByScope('taller'),
    reportes: getPrinterByScope('reportes'),
    barras: getPrinterByScope('barras'),
    devoluciones: getPrinterByScope('devoluciones'),
    contabilidad: getPrinterByScope('contabilidad'),
    comanda: getPrinterByScope('comanda'),
    global: getPrinterByScope('global'),
  };
}

export function isGlobalPrinterEnabled(): boolean {
  try {
    return localStorage.getItem('use_global_printer') === 'true';
  } catch {
    return false;
  }
}

export function setGlobalPrinterEnabled(enabled: boolean): void {
  try {
    localStorage.setItem('use_global_printer', enabled ? 'true' : 'false');
  } catch {
    // noop
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('codecpos:printers-updated', {
      detail: { scope: 'global-toggle', enabled },
    }));
  }
}

export function getDefaultPrinterName(): string {
  try {
    return localStorage.getItem(POS_DEFAULT_PRINTER_KEY) || '';
  } catch {
    return '';
  }
}

export function setDefaultPrinterName(printerName: string): void {
  try {
    localStorage.setItem(POS_DEFAULT_PRINTER_KEY, printerName);
  } catch {
    // noop
  }
}

export function getDefaultPrinterNameOrUndefined(): string | undefined {
  const name = getDefaultPrinterName();
  return name || undefined;
}

// ── Impresora de facturas / recibos de venta ──────────────────────────────────

export function getFacturasPrinterName(): string {
  return getPrinterByScope('ventas') || safeGet(PRINTER_FACTURAS_KEY);
}

export function setFacturasPrinterName(name: string): void {
  setPrinterByScope('ventas', name);
  safeSet(PRINTER_FACTURAS_KEY, name);
}

export function getFacturasPrinterNameOrUndefined(): string | undefined {
  const name = getFacturasPrinterName();
  return name || undefined;
}

// ── Impresora de etiquetas / códigos de barras ────────────────────────────────

export function getEtiquetasPrinterName(): string {
  return getPrinterByScope('barras') || safeGet(PRINTER_ETIQUETAS_KEY);
}

export function setEtiquetasPrinterName(name: string): void {
  setPrinterByScope('barras', name);
  safeSet(PRINTER_ETIQUETAS_KEY, name);
}

export function getEtiquetasPrinterNameOrUndefined(): string | undefined {
  const name = getEtiquetasPrinterName();
  return name || undefined;
}

// ── Ancho de papel configurado (58mm / 80mm) ──────────────────────────────────
// Usado por todos los flujos de impresión basados en HTML (Gastos, Factura,
// Cierre de Caja) para que el @page CSS y el pageSize dinámico de Electron
// coincidan con el ancho real del rollo térmico del cliente, en vez de
// asumir 80mm siempre.

// «Papel angosto» de Dispositivos: impresoras de rollo de 57/58 mm. Vive en
// su propia clave para que guardar Configuración no lo borre.
const PAPEL_ANGOSTO_KEY = 'codecpos_papel_angosto';
// Impresora para la que el usuario eligió el papel a mano. Mientras siga
// siendo la misma, la detección automática no toca su elección.
const PAPEL_ANGOSTO_MANUAL_KEY = 'codecpos_papel_angosto_manual_para';

export function isPapelAngosto(): boolean {
  return getConfiguredTicketWidthMm() === 58;
}

export function getPapelAngostoManualPara(): string | null {
  try {
    return localStorage.getItem(PAPEL_ANGOSTO_MANUAL_KEY);
  } catch {
    return null;
  }
}

/**
 * `manualPara`: nombre de la impresora de tirillas cuando lo elige el usuario
 * (cadena vacía = la predeterminada). Sin él, el cambio viene de la detección
 * automática y no se marca como manual.
 */
export function setPapelAngosto(activo: boolean, manualPara?: string): void {
  try {
    localStorage.setItem(PAPEL_ANGOSTO_KEY, activo ? 'true' : 'false');
    if (manualPara !== undefined) localStorage.setItem(PAPEL_ANGOSTO_MANUAL_KEY, manualPara);
  } catch {
    // noop
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('codecpos:printers-updated', { detail: { scope: 'papel-angosto', activo } }));
  }
}

export function getConfiguredTicketWidthMm(): 58 | 80 {
  try {
    const angosto = localStorage.getItem(PAPEL_ANGOSTO_KEY);
    if (angosto !== null) return angosto === 'true' ? 58 : 80;
    const raw = localStorage.getItem('codec_pos_config');
    if (!raw) return 80;
    const cfg = JSON.parse(raw);
    const possible = Number(cfg?.anchoPapel || cfg?.anchoImpresora || cfg?.ticketWidth || cfg?.printerWidth);
    return possible === 58 ? 58 : 80;
  } catch {
    return 80;
  }
}

export { POS_DEFAULT_PRINTER_KEY, PRINTER_FACTURAS_KEY, PRINTER_ETIQUETAS_KEY };
