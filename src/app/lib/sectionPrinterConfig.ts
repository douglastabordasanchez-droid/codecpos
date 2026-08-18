/**
 * Configuración de impresora por sección del sistema.
 * Permite asignar una impresora diferente para cada área que imprime.
 * Fallback chain: sección específica → facturas/etiquetas legacy → predeterminada global → USB008
 */

import {
  getFacturasPrinterName,
  getEtiquetasPrinterName,
  getDefaultPrinterName,
  getPrinterByScope,
  isGlobalPrinterEnabled,
  setPrinterByScope,
} from './printerConfig';

export type PrintSection =
  | 'pos_tickets'
  | 'cierre_caja'
  | 'taller'
  | 'reportes'
  | 'gastos'
  | 'codigos_barras'
  | 'devoluciones'
  | 'contabilidad'
  | 'comanda_cocina';

export interface SectionInfo {
  label: string;
  desc: string;
  emoji: string;
  fallbackKey: 'facturas' | 'etiquetas';
}

export const SECTION_INFO: Record<PrintSection, SectionInfo> = {
  pos_tickets:    { label: 'POS — Tickets de Venta',       desc: 'Comprobantes de ventas al cliente',      emoji: '🧾', fallbackKey: 'facturas'  },
  cierre_caja:    { label: 'Cierre de Caja',                desc: 'Informe de cierre y cuadre diario',      emoji: '💰', fallbackKey: 'facturas'  },
  taller:         { label: 'Taller de Reparaciones',        desc: 'Órdenes de trabajo y diagnóstico',       emoji: '🔧', fallbackKey: 'facturas'  },
  reportes:       { label: 'Reportes',                      desc: 'Informes de ventas y estadísticas',      emoji: '📊', fallbackKey: 'facturas'  },
  gastos:         { label: 'Gastos',                        desc: 'Comprobantes de egresos',                emoji: '💸', fallbackKey: 'facturas'  },
  codigos_barras: { label: 'Código de Barras / Etiquetas',  desc: 'Etiquetas e impresión de productos',     emoji: '🏷️', fallbackKey: 'etiquetas' },
  devoluciones:   { label: 'Devoluciones y Notas Crédito',  desc: 'Comprobantes de devoluciones y ajustes', emoji: '↩️', fallbackKey: 'facturas'  },
  contabilidad:   { label: 'Contabilidad',                  desc: 'Comprobantes de movimientos contables',  emoji: '🧾', fallbackKey: 'facturas'  },
  comanda_cocina: { label: 'Cocina / Bar',                  desc: 'Tiquetes de comanda para preparar pedidos', emoji: '🍳', fallbackKey: 'facturas' },
};

export const ALL_SECTIONS: PrintSection[] = [
  'pos_tickets',
  'cierre_caja',
  'taller',
  'reportes',
  'gastos',
  'codigos_barras',
  'devoluciones',
  'contabilidad',
  'comanda_cocina',
];

const STORAGE_KEY = 'pos-section-printers';

const SECTION_SCOPE_MAP: Record<PrintSection, 'ventas' | 'cierre' | 'gastos' | 'taller' | 'reportes' | 'barras' | 'devoluciones' | 'contabilidad' | 'comanda'> = {
  pos_tickets: 'ventas',
  cierre_caja: 'cierre',
  gastos: 'gastos',
  taller: 'taller',
  reportes: 'reportes',
  codigos_barras: 'barras',
  devoluciones: 'devoluciones',
  contabilidad: 'contabilidad',
  comanda_cocina: 'comanda',
};

function load(): Partial<Record<PrintSection, string>> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function save(data: Partial<Record<PrintSection, string>>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

/**
 * Obtiene la impresora asignada a una sección.
 * Fallback: sección → key legacy (facturas/etiquetas) → predeterminada global
 */
export function getPrinterForSection(section: PrintSection): string {
  const globalPrinter = getPrinterByScope('global');
  if (isGlobalPrinterEnabled() && globalPrinter) {
    return globalPrinter;
  }

  const standard = getPrinterByScope(SECTION_SCOPE_MAP[section]);
  if (standard) return standard;

  if (globalPrinter) return globalPrinter;

  const data = load();
  const specific = data[section];
  if (specific) return specific;
  const info = SECTION_INFO[section];
  if (info.fallbackKey === 'etiquetas') {
    return getEtiquetasPrinterName() || getDefaultPrinterName();
  }
  return getFacturasPrinterName() || getDefaultPrinterName();
}

export function getPrinterForSectionOrUndefined(section: PrintSection): string | undefined {
  return getPrinterForSection(section) || undefined;
}

/**
 * Asigna una impresora a una sección. Cadena vacía elimina la asignación (usa default).
 */
export function setPrinterForSection(section: PrintSection, printerName: string): void {
  setPrinterByScope(SECTION_SCOPE_MAP[section], printerName);

  const data = load();
  if (printerName) {
    data[section] = printerName;
  } else {
    delete data[section];
  }
  save(data);
}

export function getAllSectionPrinters(): Partial<Record<PrintSection, string>> {
  const data = load();
  const result: Partial<Record<PrintSection, string>> = { ...data };

  for (const section of ALL_SECTIONS) {
    const standard = getPrinterByScope(SECTION_SCOPE_MAP[section]);
    if (standard) result[section] = standard;
  }

  return result;
}
