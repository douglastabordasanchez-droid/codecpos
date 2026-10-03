/**
 * Valor en letras para facturas en pesos colombianos:
 *   468000 → "Cuatrocientos sesenta y ocho mil pesos m/cte"
 *   1000001 → "Un millón un pesos m/cte"
 * Los centavos (si los hay) se agregan como "con 50/100".
 */

const UNIDADES = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

/** 0..999 en letras ("uno" al final; se apocopa a "un" donde corresponde). */
function menorQueMil(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto) {
    if (resto < 30) partes.push(UNIDADES[resto]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u ? `${DECENAS[d]} y ${UNIDADES[u]}` : DECENAS[d]);
    }
  }
  return partes.join(' ');
}

/** "uno" → "un", "veintiuno" → "veintiún" (delante de mil, millones o pesos). */
const apocopar = (s: string) => s.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un');

export function enteroALetras(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'cero';
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (millones) {
    if (millones === 1) partes.push('un millón');
    else {
      // Millones de millones no se dan en una factura; se escribe igual con la misma regla.
      partes.push(`${apocopar(millones >= 1000 ? enteroALetras(millones) : menorQueMil(millones))} millones`);
    }
  }
  if (miles) partes.push(miles === 1 ? 'mil' : `${apocopar(menorQueMil(miles))} mil`);
  if (resto) partes.push(menorQueMil(resto));
  return partes.join(' ');
}

export function valorEnLetras(valor: number): string {
  const total = Math.round(Math.abs(Number(valor) || 0) * 100) / 100;
  const entero = Math.floor(total);
  const centavos = Math.round((total - entero) * 100);
  let letras = apocopar(enteroALetras(entero));
  // "un millón pesos" → "un millón de pesos" (igual con millones exactos).
  const conDe = entero >= 1_000_000 && entero % 1_000_000 === 0;
  letras += conDe ? ' de pesos' : ' pesos';
  if (centavos) letras += ` con ${String(centavos).padStart(2, '0')}/100`;
  letras += ' m/cte';
  return letras.charAt(0).toUpperCase() + letras.slice(1);
}
