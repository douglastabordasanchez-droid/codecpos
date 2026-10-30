/**
 * Tirilla de venta para rollo térmico de 57/58 mm.
 *
 * Plantilla propia, no una reducción de la factura de 80 mm: se arma a 240 px
 * CSS de ancho, que es el ancho en que Electron diseña las tirillas de 58 mm
 * antes de pasarlas a 384 puntos (48 mm imprimibles a 203 ppp, ver
 * renderHtmlToEscPosRaster en electron/main.js). Letra, márgenes y renglones
 * pensados para ese ancho, y lo justo de alto para que el papel avance poco.
 *
 * La vista previa del cobro y la impresión usan este mismo HTML, armado
 * directo con los datos de la venta.
 */

export const ANCHO_TIRILLA_58_PX = 240;

export interface ItemTirilla58 {
  nombre: string;
  cantidad: number;
  precio: number;
  subtotal: number;
  talla?: string;
  color?: string;
}

export interface VentaTirilla58 {
  numeroFactura: string;
  fecha: string;
  items: ItemTirilla58[];
  total: number;
  subtotal?: number;
  descuento?: number;
  iva?: number;
  porcentajeIVA?: number;
  propina?: number;
  porcentajePropinaSugerido?: number;
  metodoPago: string;
  efectivoRecibido?: number;
  cambio?: number;
  pagoMixto?: { metodo1: string; monto1: number; metodo2: string; monto2: number };
  cajero: string;
  ubicacion?: string | null;
  cufe?: string;
  folioElectronico?: string;
  facturaEstado?: string;
  contingencia?: boolean;
}

export interface ConfigTirilla58 {
  nombreComercial?: string;
  razonSocial?: string;
  nit?: string;
  digitoVerificacion?: string;
  mensajeTirillaArriba?: string;
  mensajeTirillaBajo?: string;
  eslogan?: string;
  direccion?: string;
  ciudad?: string;
  telefono?: string;
  regimenFiscal?: string;
  facturaElectronica?: boolean;
  claveResolucionDIAN?: string;
  prefijoFactura?: string;
  rangoAutorizadoDesde?: string | number;
  rangoAutorizadoHasta?: string | number;
}

const REGIMEN: Record<string, string> = {
  simplificado: 'Simplificado',
  comun: 'Común',
  gran_contribuyente: 'Gran Contribuyente',
};

export const CSS_TIRILLA_58 = `
  .t58 { width: 100%; max-width: ${ANCHO_TIRILLA_58_PX}px; margin: 0 auto; padding: 2px 2px 6px; box-sizing: border-box;
    background: #fff; font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 1.28; color: #000; }
  .t58 * { color: #000 !important; box-sizing: border-box; }
  .t58 .c { text-align: center; }
  .t58 .b { font-weight: 700; }
  .t58 .p { font-size: 10px; }
  .t58 .pp { font-size: 9px; }
  .t58 .g { font-size: 13px; }
  .t58 .fila { display: flex; justify-content: space-between; gap: 6px; }
  .t58 .fila > span:last-child { white-space: nowrap; text-align: right; }
  .t58 .linea { border-top: 1px dashed #000; margin: 4px 0; height: 0; }
  .t58 .doble { border-top: 2px solid #000; margin: 5px 0; height: 0; }
  .t58 .item { margin: 2px 0 3px; }
  .t58 .total { font-size: 15px; font-weight: 700; margin: 2px 0; }
  .t58 .logo { display: block; margin: 0 auto 3px; max-width: 150px; max-height: 56px; object-fit: contain; }
  .t58 .cufe { word-break: break-all; font-size: 8px; }
`;

function esc(texto: unknown): string {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const pesos = (n: number | undefined) => `$${Number(n || 0).toLocaleString('es-CO')}`;

function cantidad(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString('es-CO', { maximumFractionDigits: 3 });
}

function metodo(m: string): string {
  return m.toLowerCase() === 'bre_b' ? 'BRE-B' : m.toUpperCase();
}

const fila = (izq: string, der: string, clase = '') => `<div class="fila ${clase}"><span>${izq}</span><span>${der}</span></div>`;

/** Contenido de la tirilla (sin <html>), para la vista previa y para imprimir. */
export function htmlTirilla58(venta: VentaTirilla58, cfg: ConfigTirilla58, logoSrc?: string | null): string {
  const partes: string[] = [];
  const fecha = new Date(venta.fecha);
  const fechaTxt = `${fecha.toLocaleDateString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' })} ${fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`;

  if (logoSrc) partes.push(`<img class="logo" src="${esc(logoSrc)}" alt="">`);
  partes.push(`<div class="c b g">${esc(cfg.nombreComercial || 'MI NEGOCIO')}</div>`);
  if (cfg.razonSocial && cfg.razonSocial !== cfg.nombreComercial) partes.push(`<div class="c p">${esc(cfg.razonSocial)}</div>`);
  if (cfg.nit) partes.push(`<div class="c p">NIT ${esc(cfg.nit)}${cfg.digitoVerificacion ? `-${esc(cfg.digitoVerificacion)}` : ''}${cfg.regimenFiscal ? ` · Rég. ${esc(REGIMEN[cfg.regimenFiscal] || cfg.regimenFiscal)}` : ''}</div>`);
  if (cfg.mensajeTirillaArriba) partes.push(`<div class="c b p">${esc(cfg.mensajeTirillaArriba)}</div>`);
  if (cfg.eslogan) partes.push(`<div class="c p">${esc(cfg.eslogan)}</div>`);
  const ubicacionNegocio = [cfg.direccion, cfg.ciudad].filter(Boolean).map(esc).join(', ');
  if (ubicacionNegocio) partes.push(`<div class="c p">${ubicacionNegocio}</div>`);
  if (cfg.telefono) partes.push(`<div class="c p">Tel ${esc(cfg.telefono)}</div>`);

  partes.push('<div class="doble"></div>');
  partes.push(`<div class="c b">${cfg.facturaElectronica ? 'FACTURA ELECTRÓNICA DE VENTA' : 'FACTURA DE VENTA'}</div>`);
  partes.push(`<div class="c b g">N° ${esc(venta.numeroFactura)}</div>`);
  if (cfg.claveResolucionDIAN) {
    const rango = cfg.rangoAutorizadoDesde && cfg.rangoAutorizadoHasta
      ? ` del ${esc(cfg.prefijoFactura || '')}${esc(cfg.rangoAutorizadoDesde)} al ${esc(cfg.prefijoFactura || '')}${esc(cfg.rangoAutorizadoHasta)}`
      : '';
    partes.push(`<div class="c pp">Resolución DIAN ${esc(cfg.claveResolucionDIAN)}${rango}</div>`);
  }
  partes.push(fila(esc(fechaTxt), `Cajero: ${esc(venta.cajero)}`, 'p'));
  if (venta.ubicacion) partes.push(`<div class="b">Ubicación: ${esc(venta.ubicacion)}</div>`);

  partes.push('<div class="linea"></div>');
  for (const it of venta.items) {
    const variante = [it.talla && `Talla ${esc(it.talla)}`, it.color && `Color ${esc(it.color)}`].filter(Boolean).join(' · ');
    partes.push(
      `<div class="item"><div>${esc(it.nombre)}</div>` +
      (variante ? `<div class="pp">${variante}</div>` : '') +
      fila(`${cantidad(Number(it.cantidad) || 0)} x ${pesos(it.precio)}`, pesos(it.subtotal), 'p') +
      '</div>'
    );
  }
  partes.push('<div class="linea"></div>');

  if (venta.subtotal && venta.iva) {
    partes.push(fila('Subtotal', pesos(venta.subtotal)));
    partes.push(fila(`IVA (${venta.porcentajeIVA || 19}%)`, pesos(venta.iva)));
  }
  if (venta.descuento) partes.push(fila('Descuento', `-${pesos(venta.descuento)}`));
  if (venta.propina !== undefined) {
    partes.push(fila(venta.porcentajePropinaSugerido ? `Propina (${venta.porcentajePropinaSugerido}%)` : 'Propina', pesos(venta.propina)));
  }
  partes.push(fila('TOTAL', pesos(venta.total), 'total'));
  partes.push(fila('Pago', esc(metodo(venta.metodoPago))));
  const m = venta.metodoPago.toLowerCase();
  if (m === 'efectivo') {
    partes.push(fila('Recibido', pesos(venta.efectivoRecibido)));
    partes.push(fila('Cambio', pesos(venta.cambio), 'b'));
  } else if (m === 'mixto' && venta.pagoMixto) {
    partes.push(fila(esc(venta.pagoMixto.metodo1), pesos(venta.pagoMixto.monto1)));
    partes.push(fila(esc(venta.pagoMixto.metodo2), pesos(venta.pagoMixto.monto2)));
    if ((venta.cambio || 0) > 0) partes.push(fila('Cambio', pesos(venta.cambio), 'b'));
  }

  if (cfg.mensajeTirillaBajo) {
    partes.push('<div class="linea"></div>');
    partes.push(`<div class="c b p">${esc(cfg.mensajeTirillaBajo)}</div>`);
  }

  if (cfg.facturaElectronica) {
    partes.push('<div class="linea"></div>');
    if (venta.contingencia) partes.push('<div class="c b pp">DOCUMENTO EN CONTINGENCIA. Pendiente de envío a la DIAN</div>');
    else if (venta.facturaEstado === 'SINCRONIZADA') partes.push('<div class="c b pp">Factura electrónica validada por la DIAN</div>');
    partes.push('<div class="c pp">Representación impresa de una factura electrónica</div>');
    if (venta.folioElectronico) partes.push(`<div class="c pp">Folio ${esc(venta.folioElectronico)}</div>`);
    if (venta.cufe) partes.push(`<div class="cufe"><b>CUFE:</b> ${esc(venta.cufe)}</div>`);
  }

  partes.push('<div class="linea"></div>');
  partes.push('<div class="c pp">CODEC POS · Codec Studio · 3238646844</div>');

  return `<div class="t58">${partes.join('')}</div>`;
}

/** Documento completo para enviar a la impresora (Electron lo pasa a imagen de 384 puntos). */
export function documentoTirilla58(contenido: string, titulo: string): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>${esc(titulo)}</title>
<style>@page{size:58mm auto;margin:0;} html,body{margin:0;padding:0;background:#fff;} ${CSS_TIRILLA_58}</style>
</head><body>${contenido}</body></html>`;
}

/**
 * El logo guardado en Configuración puede ser una foto de varios MB en base64.
 * En la tirilla de 58 mm se dibuja a lo sumo a 150×56 px CSS (240×90 puntos),
 * así que se reduce una sola vez y se reutiliza en cada venta: el HTML que va
 * a la impresora pasa de megas a unos pocos KB.
 */
let logoCache: { origen: string; reducido: string } | null = null;

export function logoReducidoEnCache(origen: string | undefined): string | null {
  return origen && logoCache?.origen === origen ? logoCache.reducido : null;
}

export async function reducirLogoTirilla(origen: string | undefined): Promise<string | null> {
  if (!origen) return null;
  const enCache = logoReducidoEnCache(origen);
  if (enCache) return enCache;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = origen;
  try {
    await img.decode();
  } catch {
    return null;
  }
  const escala = Math.min(1, 300 / img.naturalWidth, 112 / img.naturalHeight);
  const w = Math.max(1, Math.round(img.naturalWidth * escala));
  const h = Math.max(1, Math.round(img.naturalHeight * escala));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  try {
    const reducido = canvas.toDataURL('image/png');
    logoCache = { origen, reducido };
    return reducido;
  } catch {
    // Logo remoto sin permiso de lectura (CORS): se usa el original.
    return null;
  }
}
