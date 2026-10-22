/**
 * Retenciones que le practica al negocio un cliente agente de retención:
 * retención en la fuente (tributo 06, ReteRenta) y ReteICA (tributo 07).
 *
 * Las informa la factura (cac:WithholdingTaxTotal) pero no cambian su total
 * ni el CUFE: el comprador las descuenta al pagar y se las declara a la DIAN.
 * Se calculan sobre el valor antes de impuestos y solo si se alcanza la base
 * mínima que el negocio configuró en su perfil fiscal.
 */
import type { ConfiguracionRetenciones } from './types';

export interface RetencionDocumento {
  /** 06 retención en la fuente (ReteRenta), 07 ReteICA. */
  codigo: '06' | '07';
  /** Porcentaje tal como va en el XML: ReteICA 11,04 por mil = 1,104 %. */
  porcentaje: number;
  base: number;
  valor: number;
}

export const NOMBRE_RETENCION: Record<RetencionDocumento['codigo'], string> = {
  '06': 'ReteRenta',
  '07': 'ReteICA',
};

// Mitad hacia arriba sin que el binario la tumbe (6338,235 -> 6338,24).
const redondear2 = (n: number) => Math.round(n * 100 * (1 + Number.EPSILON)) / 100;

export function calcularRetenciones(
  config: ConfiguracionRetenciones | undefined,
  cliente: { agenteRetencionFuente?: boolean; agenteRetencionIca?: boolean } | null | undefined,
  baseAntesDeImpuestos: number,
): RetencionDocumento[] {
  if (!config || !cliente) return [];
  const base = redondear2(Number(baseAntesDeImpuestos) || 0);
  if (base <= 0) return [];
  const retenciones: RetencionDocumento[] = [];

  const pctFuente = Number(config.retefuentePorcentaje) || 0;
  if (config.retefuenteActiva && cliente.agenteRetencionFuente && pctFuente > 0 && base >= (Number(config.retefuenteBaseMinima) || 0)) {
    retenciones.push({ codigo: '06', porcentaje: pctFuente, base, valor: redondear2(base * pctFuente / 100) });
  }

  const porMil = Number(config.reteicaTarifaPorMil) || 0;
  if (config.reteicaActiva && cliente.agenteRetencionIca && porMil > 0 && base >= (Number(config.reteicaBaseMinima) || 0)) {
    retenciones.push({ codigo: '07', porcentaje: Math.round(porMil * 100) / 1000, base, valor: redondear2(base * porMil / 1000) });
  }

  return retenciones;
}

/**
 * Retenciones que el cajero activó en el cobro (botones ReteFuente y
 * ReteICA). Un campo sin valor = esa retención no aplica. Cuando el cajero
 * las activa a mano mandan sobre la configuración automática y no se mira la
 * base mínima: el comprador ya dijo que va a retener.
 */
export interface RetencionesElegidas {
  /** Porcentaje de retención en la fuente (2,5 = 2,5 %). */
  retefuentePorcentaje?: number;
  /** Tarifa de ReteICA por mil (11,04 = 11,04 por mil). */
  reteicaTarifaPorMil?: number;
}

export function calcularRetencionesElegidas(elegidas: RetencionesElegidas, baseAntesDeImpuestos: number): RetencionDocumento[] {
  const base = redondear2(Number(baseAntesDeImpuestos) || 0);
  if (base <= 0) return [];
  const retenciones: RetencionDocumento[] = [];
  const pctFuente = Number(elegidas.retefuentePorcentaje) || 0;
  if (pctFuente > 0) retenciones.push({ codigo: '06', porcentaje: pctFuente, base, valor: redondear2(base * pctFuente / 100) });
  const porMil = Number(elegidas.reteicaTarifaPorMil) || 0;
  if (porMil > 0) retenciones.push({ codigo: '07', porcentaje: Math.round(porMil * 100) / 1000, base, valor: redondear2(base * porMil / 1000) });
  return retenciones;
}
