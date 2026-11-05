/**
 * Detección del ancho de papel de la impresora de tirillas.
 *
 * Se lee el tamaño de papel que tiene configurado el driver de Windows (ver
 * 'printer:paper-info' en electron/main.js). Solo cuando ese dato es claro
 * (rollo de 57/58 mm o de 80 mm) se cambia «Papel angosto» solo, y nunca por
 * encima de lo que el usuario eligió a mano para esa misma impresora. Un
 * driver genérico que reporta Carta o A4 no dice nada del rollo: queda en
 * manos del usuario.
 */
import {
  getDefaultPrinterNameOrUndefined,
  getFacturasPrinterNameOrUndefined,
  getPapelAngostoManualPara,
  isPapelAngosto,
  setPapelAngosto,
} from './printerConfig';
import { getPrinterForSectionOrUndefined } from './sectionPrinterConfig';

export type ClasePapel = 'angosto' | 'normal' | 'incierto';

export interface PapelDelDriver {
  clase: ClasePapel;
  anchoMm?: number;
  papel?: string;
  printer?: string;
}

/** Misma impresora que usa el botón Imprimir de la factura de venta. */
export function impresoraDeTirillas(): string {
  return getPrinterForSectionOrUndefined('pos_tickets')
    || getFacturasPrinterNameOrUndefined()
    || getDefaultPrinterNameOrUndefined()
    || '';
}

/** 57/58 mm (área de 48 mm) o 80 mm (área de 72 mm). Cualquier otro ancho no es un rollo térmico conocido. */
export function clasificarAnchoPapel(anchoMm: number | undefined): ClasePapel {
  if (!anchoMm || !Number.isFinite(anchoMm)) return 'incierto';
  if (anchoMm >= 44 && anchoMm <= 62) return 'angosto';
  if (anchoMm >= 68 && anchoMm <= 84) return 'normal';
  return 'incierto';
}

/**
 * Cuando el driver es genérico (reporta Carta o A4), el nombre de la
 * impresora suele decir el rollo: «POS-58», «XP-58IIH», «GP-5890», «POS-80».
 */
export function clasificarPorNombre(nombre: string | undefined): ClasePapel {
  const n = String(nombre || '').toUpperCase();
  if (/(^|[^0-9])(57|58|5890)([^0-9]|$)/.test(n)) return 'angosto';
  if (/(^|[^0-9])(80|8250|8330)([^0-9]|$)/.test(n)) return 'normal';
  return 'incierto';
}

export async function leerPapelDelDriver(printerName = impresoraDeTirillas()): Promise<PapelDelDriver> {
  const paperInfo = (window as any).electron?.print?.paperInfo;
  if (!paperInfo) return { clase: clasificarPorNombre(printerName), printer: printerName || undefined };
  try {
    const res = await paperInfo(printerName);
    const nombre = res?.printer || printerName;
    if (!res?.ok) return { clase: clasificarPorNombre(nombre), printer: nombre };
    const clase = clasificarAnchoPapel(res.anchoMm);
    return {
      clase: clase === 'incierto' ? clasificarPorNombre(nombre) : clase,
      anchoMm: res.anchoMm, papel: res.papel, printer: nombre,
    };
  } catch {
    return { clase: clasificarPorNombre(printerName), printer: printerName || undefined };
  }
}

/**
 * Lee el driver y, si el dato es seguro y el usuario no eligió a mano para
 * esta impresora, ajusta «Papel angosto». Devuelve lo leído y si cambió algo.
 */
export async function detectarPapelAutomatico(): Promise<PapelDelDriver & { cambiado: boolean }> {
  const printerName = impresoraDeTirillas();
  const leido = await leerPapelDelDriver(printerName);
  const eligioAMano = getPapelAngostoManualPara() === printerName;
  if (leido.clase === 'incierto' || eligioAMano) return { ...leido, cambiado: false };
  const angosto = leido.clase === 'angosto';
  if (angosto === isPapelAngosto()) return { ...leido, cambiado: false };
  setPapelAngosto(angosto);
  return { ...leido, cambiado: true };
}
