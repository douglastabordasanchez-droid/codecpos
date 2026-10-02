/**
 * Cola LOCAL de emisiones DIAN que no se pudieron ni empezar por falta de
 * internet. Emitir necesita la nube desde el primer paso (perfil fiscal,
 * numeración y consecutivo viven en Supabase), así que sin conexión no hay
 * documento que dejar «en contingencia»: lo único que existe es la venta.
 * Aquí se guardan sus datos para emitirla apenas vuelva la red — ver
 * colaDian.ts, que es quien la vacía.
 *
 * Solo datos de la venta, nada sensible: ni certificado ni PIN pasan por
 * aquí. Vive en localStorage para sobrevivir a un cierre de la aplicación.
 *
 * Archivo aparte (sin importar el orquestador) para no crear un ciclo:
 * emitirFacturaDian.ts encola aquí y colaDian.ts vuelve a llamar al emisor.
 */
import type { DatosVentaParaDian } from './emitirFacturaDian';

const CLAVE = 'codecpos_dian_emisiones_pendientes';

export interface EmisionPendiente {
  datos: DatosVentaParaDian;
  encoladaEn: string;
  intentos: number;
}

function leer(): EmisionPendiente[] {
  try {
    const crudo = JSON.parse(localStorage.getItem(CLAVE) || '[]');
    return Array.isArray(crudo) ? crudo : [];
  } catch {
    return [];
  }
}

function guardar(cola: EmisionPendiente[]): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(cola));
  } catch (e) {
    console.error('[DIAN] No se pudo guardar la cola local de emisiones pendientes:', e);
  }
}

export function encolarEmisionPendiente(datos: DatosVentaParaDian): void {
  const cola = leer();
  // Una venta, una emisión: reintentar el cobro no debe duplicarla.
  if (cola.some((e) => e.datos.ventaReferencia === datos.ventaReferencia)) return;
  cola.push({ datos, encoladaEn: new Date().toISOString(), intentos: 0 });
  guardar(cola);
}

export function listarEmisionesPendientes(): EmisionPendiente[] {
  return leer();
}

export function quitarEmisionPendiente(ventaReferencia: string): void {
  guardar(leer().filter((e) => e.datos.ventaReferencia !== ventaReferencia));
}

export function registrarIntentoEmision(ventaReferencia: string): void {
  guardar(leer().map((e) => (e.datos.ventaReferencia === ventaReferencia ? { ...e, intentos: e.intentos + 1 } : e)));
}
