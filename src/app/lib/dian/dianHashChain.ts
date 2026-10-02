/**
 * Primitivas de formato y hash compartidas por CUFE (facturas), CUDE (notas
 * de ajuste y documento equivalente) y SoftwareSecurityCode — todas usan
 * SHA-384 sobre una concatenación de campos formateados EXACTAMENTE igual
 * (fecha YYYY-MM-DD, hora HH:MM:SS-05:00, montos con 2 decimales truncados
 * sin separadores). Un bug de formato corregido en un solo lugar y no en
 * los otros produciría hashes distintos y silenciosamente inválidos ante la
 * DIAN — por eso viven en un solo archivo en vez de repetirse tres veces.
 *
 * Fuente: Anexo Técnico de Factura Electrónica de Venta v1.9 (Resolución
 * DIAN 000165 de 2023) §11.4, y Anexo Técnico de Documento Equivalente
 * Electrónico v1.0 §14.1 — ambos descargados de dian.gov.co, vendorizados en
 * docs/electronic-invoicing/dian-sources/.
 */

import { fechaColombia, horaColombia } from './documentoFiscal';

export interface ImpuestoDian {
  /** '01' IVA, '04' INC (Impuesto Nacional al Consumo), '03' ICA/otros. */
  codigo: '01' | '04' | '03';
  valor: number;
}

/**
 * Fecha de emisión tal como va en cbc:IssueDate. Debe ser EXACTAMENTE el
 * mismo texto del XML o la DIAN rechaza por CUFE mal calculado (FAD06).
 *
 * 🛡️ FIX: antes, si llegaba un texto, se devolvía tal cual — y los
 * emisores pasan la fecha de la venta como instante ISO completo
 * ("2026-10-02T15:04:05.000Z"), así que al CUFE entraba ese texto entero
 * en vez de "2026-10-02". Ahora solo se respeta un texto que ya sea una
 * fecha sola; cualquier instante se convierte a la fecha de Colombia.
 */
export function formatoFechaDian(fecha: Date | string): string {
  if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;
  return fechaColombia(fecha);
}

/**
 * Hora de emisión tal como va en cbc:IssueTime (HH:MM:SS-05:00).
 *
 * 🛡️ FIX: antes se leía el reloj local del equipo (getHours) mientras el
 * XML escribía la hora UTC con el sufijo -05:00 — dos horas distintas para
 * el mismo documento, CUFE rechazado. Ahora las dos salen de horaColombia().
 */
export function formatoHoraDian(fecha: Date | string): string {
  return horaColombia(fecha);
}

/** Con punto decimal, 2 dígitos, TRUNCADOS (no redondeados) y sin separador de miles — así lo exige el anexo. */
export function formatoValorDian(n: number): string {
  const num = Number.isFinite(n) ? n : 0;
  // Se limpia primero el error binario: 19.99 * 100 da 1998.9999999999998 y
  // truncar eso a secas convertía $19,99 en $19,98.
  const truncado = Math.trunc(Math.round(num * 10000) / 100) / 100;
  return truncado.toFixed(2);
}

export function valorImpuestoDian(impuestos: ImpuestoDian[], codigo: ImpuestoDian['codigo']): number {
  return impuestos.filter((i) => i.codigo === codigo).reduce((acc, i) => acc + i.valor, 0);
}

export async function sha384Hex(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto);
  const hashBuffer = await crypto.subtle.digest('SHA-384', bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
