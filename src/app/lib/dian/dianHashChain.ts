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

export interface ImpuestoDian {
  /** '01' IVA, '04' INC (Impuesto Nacional al Consumo), '03' ICA/otros. */
  codigo: '01' | '04' | '03';
  valor: number;
}

export function formatoFechaDian(fecha: Date | string): string {
  if (typeof fecha === 'string') return fecha;
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatoHoraDian(fecha: Date | string): string {
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  // Colombia es UTC-05:00 todo el año (sin horario de verano).
  return `${hh}:${mm}:${ss}-05:00`;
}

/** Con punto decimal, 2 dígitos, TRUNCADOS (no redondeados) y sin separador de miles — así lo exige el anexo. */
export function formatoValorDian(n: number): string {
  const num = Number.isFinite(n) ? n : 0;
  const truncado = Math.trunc(num * 100) / 100;
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
