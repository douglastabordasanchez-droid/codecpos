/**
 * Configuración del cajón monedero — CODEC POS v2.0
 *
 * El cajón puede estar conectado de dos formas:
 *  - via_impresora: conectado al puerto RJ11/DB9 de la impresora térmica (más común)
 *  - directo_pc: conectado directamente a un puerto COM/USB de la computadora
 *
 * En ambos casos el comando que abre el cajón es ESC/POS: \x1B\x70\x{pin}\x19\xFA
 * La diferencia es el destino (nombre de impresora vs nombre de dispositivo/puerto).
 */

export type DrawerMode = 'via_impresora' | 'directo_pc';

export interface DrawerConfig {
  /** Cajón habilitado en este sistema */
  habilitado: boolean;
  /** Cómo está conectado físicamente */
  modo: DrawerMode;
  /**
   * Si modo=via_impresora: sección de impresora que dispara el cajón.
   * Casi siempre es 'pos_tickets' (la impresora de ventas).
   */
  seccionImpresora: 'pos_tickets' | 'cierre_caja';
  /**
   * Si modo=directo_pc: nombre o puerto del dispositivo cajón
   * (ej: "COM3", "USB001", nombre de impresora de cajón).
   */
  puertoDirecto: string;
  /** Pin del cajón monedero. Pin 2 (0x00) es el más común; Pin 5 (0x01) en algunos modelos. */
  pin: 2 | 5;
}

const STORAGE_KEY = 'pos-drawer-config';

const DEFAULT_CONFIG: DrawerConfig = {
  habilitado: false,
  modo: 'via_impresora',
  seccionImpresora: 'pos_tickets',
  puertoDirecto: '',
  pin: 2,
};

export function getDrawerConfig(): DrawerConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function setDrawerConfig(config: Partial<DrawerConfig>): void {
  try {
    const current = getDrawerConfig();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...config }));
  } catch {}
}
