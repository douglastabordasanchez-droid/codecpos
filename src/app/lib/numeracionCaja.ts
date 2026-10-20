/**
 * Número de venta corto y único por caja.
 *
 *   FE + A + 000123   →  FEA000123
 *   │    │   └ consecutivo de esa caja
 *   │    └ letra de la caja (A = caja 1, B = caja 2, …)
 *   └ prefijo del negocio (Configuración), igual en todas sus cajas
 *
 * La letra sale del número de caja que el servidor asigna a cada computador
 * al registrarse (instalaciones.codigo_caja, migración 0059): no se repite
 * dentro del negocio y no cambia aunque cambie la red. No se usa la IP:
 * cambia al reiniciar el router y dos sucursales pueden tener la misma.
 *
 * Las ventas de la web y el celular llevan la letra W, reservada para ellas,
 * con su propio contador en el servidor.
 */

/** Letras de caja: sin W, que es de la web y el celular. */
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVXYZ';
export const LETRA_WEB = 'W';

const CLAVE_CODIGO_CAJA = 'codec_pos_codigo_caja';
const CLAVE_PREFIJO_AUTO = 'codec_pos_prefijo_auto';

/** 1 → A, 2 → B, …, 25 → Z, 26 → AA, 27 → AB… */
export function letraDeCaja(codigoCaja: number): string {
  let n = Math.floor(codigoCaja);
  if (!(n >= 1)) return '';
  let letra = '';
  while (n > 0) {
    n -= 1;
    letra = LETRAS[n % LETRAS.length] + letra;
    n = Math.floor(n / LETRAS.length);
  }
  return letra;
}

function leer(clave: string): string {
  try { return localStorage.getItem(clave) || ''; } catch { return ''; }
}

export function guardarCodigoCaja(codigoCaja: number): void {
  try { localStorage.setItem(CLAVE_CODIGO_CAJA, String(codigoCaja)); } catch { /* sin almacenamiento */ }
}

/** Letra de esta caja, o '' si todavía no se ha registrado en el servidor. */
export function letraDeEstaCaja(): string {
  return letraDeCaja(Number(leer(CLAVE_CODIGO_CAJA)));
}

/**
 * Prefijo del negocio. El prefijo automático viejo (código del negocio más
 * número de caja, como «2S01») ya no hace falta: la caja la dice la letra.
 */
export function prefijoDelNegocio(prefijoConfigurado?: string): string {
  const propio = (prefijoConfigurado || '').trim().toUpperCase();
  if (propio && propio !== leer(CLAVE_PREFIJO_AUTO).toUpperCase()) return propio;
  return 'FE';
}

/** Número completo de una venta de esta caja. */
export function armarNumeroFactura(consecutivo: number, prefijoConfigurado?: string): string {
  return `${prefijoDelNegocio(prefijoConfigurado)}${letraDeEstaCaja()}${String(consecutivo).padStart(6, '0')}`;
}

/** Número de una venta hecha en la web o el celular. */
export function numeroVentaWeb(consecutivo: number): string {
  return `${LETRA_WEB}${String(consecutivo).padStart(6, '0')}`;
}

/**
 * Número que se muestra para una venta guardada en la nube: el que imprimió
 * la caja de escritorio (local_id, como FEA000123) o, si se hizo en la web o
 * el celular, W más su consecutivo.
 */
export function numeroVisibleVenta(venta: { local_id?: string | null; numero?: number | null; id?: string }): string {
  if (typeof venta.local_id === 'string' && /^[A-Za-z]*\d+$/.test(venta.local_id)) return venta.local_id;
  if (venta.numero) return numeroVentaWeb(Number(venta.numero));
  return (venta.id || '').slice(0, 8).toUpperCase();
}
