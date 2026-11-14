/**
 * Impresora térmica integrada de la terminal POS Android (APK con Capacitor).
 *
 * Los bytes ESC/POS los arma thermalPrinter.ts igual que en Electron; aquí
 * solo se entregan al plugin nativo ImpresoraPos (android/…/ImpresoraPosPlugin.java),
 * que los manda por USB interno, puerto serie o red (9100).
 *
 * La vía se guarda en este dispositivo (localStorage). Sin configurar, usa
 * USB y toma la primera impresora que encuentre.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

export type ViaImpresoraAndroid = 'usb' | 'serie' | 'red';

export interface ConfigImpresoraAndroid {
  via: ViaImpresoraAndroid;
  vendorId?: number;
  productId?: number;
  ruta?: string;
  ip?: string;
  puerto?: number;
}

interface ImpresoraPosPlugin {
  listar(): Promise<{
    modelo: string;
    usb: Array<{ vendorId: number; productId: number; nombre: string; esImpresora: boolean; permiso: boolean }>;
    serie: Array<{ ruta: string; escribible: boolean }>;
  }>;
  imprimir(opciones: ConfigImpresoraAndroid & { datos: string }): Promise<{ ok: boolean }>;
}

const ImpresoraPos = registerPlugin<ImpresoraPosPlugin>('ImpresoraPos');
const CLAVE = 'codecpos_impresora_android';

export function esAndroidNativo(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

export function leerConfigImpresoraAndroid(): ConfigImpresoraAndroid {
  try {
    const guardada = localStorage.getItem(CLAVE);
    if (guardada) return { via: 'usb', ...JSON.parse(guardada) };
  } catch { /* sin almacenamiento: valores por defecto */ }
  return { via: 'usb' };
}

export function guardarConfigImpresoraAndroid(config: ConfigImpresoraAndroid): void {
  try { localStorage.setItem(CLAVE, JSON.stringify(config)); } catch { /* ignorar */ }
}

export function listarImpresorasAndroid() {
  return ImpresoraPos.listar();
}

function aBase64(bytes: Uint8Array): string {
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binario);
}

/** Ticket corto de prueba en ESC/POS puro (sin logo ni tildes). */
function bytesDePrueba(descripcion: string): Uint8Array {
  const texto = (s: string) => Array.from(s.normalize('NFD').replace(/[̀-ͯ]/g, ''), (c) => c.charCodeAt(0) & 0x7f);
  const fecha = new Date().toLocaleString('es-CO');
  return new Uint8Array([
    0x1b, 0x40, // inicializar
    0x1b, 0x61, 0x01, // centrar
    0x1b, 0x45, 0x01, ...texto('CODEC POS\n'), 0x1b, 0x45, 0x00,
    ...texto('Prueba de impresora\n'),
    ...texto(`${descripcion}\n`),
    ...texto(`${fecha}\n`),
    ...texto('Si lees esto, esta es la buena.\n'),
    0x0a, 0x0a, 0x0a, 0x0a,
    0x1d, 0x56, 0x42, 0x00, // corte parcial (se ignora si no tiene cortador)
  ]);
}

/** Manda un ticket de prueba con la vía indicada. Lanza el error del plugin si falla. */
export async function probarImpresoraAndroid(config: ConfigImpresoraAndroid, descripcion: string): Promise<void> {
  await ImpresoraPos.imprimir({ ...config, datos: aBase64(bytesDePrueba(descripcion)) });
}

export async function imprimirBytesAndroid(bytes: Uint8Array): Promise<boolean> {
  try {
    await ImpresoraPos.imprimir({ ...leerConfigImpresoraAndroid(), datos: aBase64(bytes) });
    return true;
  } catch (error) {
    console.error('Impresora Android:', error);
    return false;
  }
}
