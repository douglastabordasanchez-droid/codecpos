/**
 * Orden de una torta por encargo para el panadero: imprimir, enviar por
 * WhatsApp o descargar en PDF. Lleva lo que necesita para hacerla (tipo,
 * cómo la quiere, día y hora) y abajo el pago, para quien la entrega.
 */
import { abonado, saldo, type Encargo } from './supabase/encargosService';
import { abrirEnlaceExterno } from './externalLink';

const pesos = (v: number) => `$${Math.round(v || 0).toLocaleString('es-CO')}`;
const numeroOrden = (e: Encargo) => e.id.replace(/-/g, '').slice(0, 6).toUpperCase();

function fechaLarga(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number);
  if (!a || !m || !d) return fecha;
  const t = new Date(a, m - 1, d).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function hora(h?: string): string {
  if (!h) return 'Sin hora';
  const [hh, mm] = h.split(':').map(Number);
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'p. m.' : 'a. m.'}`;
}

/** Texto de la orden (WhatsApp). */
export function textoOrdenTorta(e: Encargo): string {
  const falta = saldo(e);
  return [
    `🎂 *ORDEN DE TORTA N.º ${numeroOrden(e)}*`,
    '',
    `*Torta:* ${e.tipo}`,
    e.detalle ? `*Cómo la quiere:*\n${e.detalle}` : '',
    '',
    `📅 *Entrega:* ${fechaLarga(e.fechaEntrega)}`,
    `🕐 *Hora:* ${hora(e.horaEntrega)}`,
    '',
    `👤 *Cliente:* ${e.clienteNombre}${e.clienteTelefono ? ` · ${e.clienteTelefono}` : ''}`,
    `💰 Total ${pesos(e.total)} · Abonado ${pesos(abonado(e))} · ${falta > 0 ? `Saldo ${pesos(falta)}` : 'Pagada'}`,
  ].filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n');
}

/** Abre WhatsApp con la orden escrita; se elige el contacto del panadero. */
export function enviarOrdenTortaWhatsApp(e: Encargo) {
  abrirEnlaceExterno(`https://wa.me/?text=${encodeURIComponent(textoOrdenTorta(e))}`);
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Imprime la orden (sirve en impresora térmica de 80 mm o en hoja carta). */
export function imprimirOrdenTorta(e: Encargo) {
  const falta = saldo(e);
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Orden de torta ${numeroOrden(e)}</title>
<style>
  @page { margin: 6mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; max-width: 76mm; margin: 0 auto; font-size: 13px; }
  h1 { font-size: 18px; text-align: center; margin: 0 0 2px; }
  .num { text-align: center; font-size: 12px; margin-bottom: 8px; }
  .caja { border: 2px solid #000; border-radius: 6px; padding: 8px; margin: 8px 0; }
  .eti { font-size: 11px; font-weight: bold; text-transform: uppercase; }
  .tipo { font-size: 17px; font-weight: bold; }
  .detalle { white-space: pre-wrap; font-size: 14px; margin-top: 4px; }
  .entrega { font-size: 15px; font-weight: bold; }
  .fila { display: flex; justify-content: space-between; margin: 2px 0; }
  hr { border: 0; border-top: 1px dashed #000; margin: 8px 0; }
</style></head><body>
  <h1>ORDEN DE TORTA</h1>
  <div class="num">N.º ${numeroOrden(e)}</div>
  <div class="caja"><div class="eti">Torta</div><div class="tipo">${esc(e.tipo)}</div>
    ${e.detalle ? `<div class="eti" style="margin-top:6px">Cómo la quiere</div><div class="detalle">${esc(e.detalle)}</div>` : ''}</div>
  <div class="caja"><div class="eti">Entrega</div><div class="entrega">${esc(fechaLarga(e.fechaEntrega))}</div><div class="entrega">${esc(hora(e.horaEntrega))}</div></div>
  <div><span class="eti">Cliente:</span> ${esc(e.clienteNombre)}${e.clienteTelefono ? ` · ${esc(e.clienteTelefono)}` : ''}</div>
  <hr>
  <div class="fila"><span>Total</span><b>${pesos(e.total)}</b></div>
  <div class="fila"><span>Abonado</span><b>${pesos(abonado(e))}</b></div>
  <div class="fila"><span>${falta > 0 ? 'Saldo por cobrar' : 'Pagada'}</span><b>${falta > 0 ? pesos(falta) : ''}</b></div>
</body></html>`;
  const marco = document.createElement('iframe');
  marco.setAttribute('aria-hidden', 'true');
  Object.assign(marco.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(marco);
  const doc = marco.contentDocument!;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => {
    try { marco.contentWindow?.focus(); marco.contentWindow?.print(); } finally { setTimeout(() => marco.remove(), 60_000); }
  }, 250);
}

/** Descarga la orden en PDF (para guardarla o mandarla como archivo). */
export async function descargarOrdenTorta(e: Encargo) {
  const { default: jsPDF } = await import('jspdf');
  const falta = saldo(e);
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const ancho = doc.internal.pageSize.getWidth();
  const m = 12;
  let y = 16;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text('ORDEN DE TORTA', ancho / 2, y, { align: 'center' }); y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`N.º ${numeroOrden(e)}`, ancho / 2, y, { align: 'center' }); y += 8;

  const caja = (titulo: string, lineas: string[], grande = false) => {
    doc.setFontSize(grande ? 13 : 11);
    const partes = lineas.flatMap((l) => doc.splitTextToSize(l, ancho - m * 2 - 8) as string[]);
    const alto = 9 + partes.length * (grande ? 6 : 5);
    doc.setDrawColor(0); doc.setLineWidth(0.5); doc.roundedRect(m, y, ancho - m * 2, alto, 2, 2);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text(titulo.toUpperCase(), m + 4, y + 5);
    doc.setFont('helvetica', grande ? 'bold' : 'normal'); doc.setFontSize(grande ? 13 : 11);
    partes.forEach((p, i) => doc.text(p, m + 4, y + 11 + i * (grande ? 6 : 5)));
    y += alto + 4;
  };
  caja('Torta', [e.tipo], true);
  if (e.detalle) caja('Cómo la quiere', e.detalle.split('\n'));
  caja('Entrega', [`${fechaLarga(e.fechaEntrega)} · ${hora(e.horaEntrega)}`], true);
  y += 3;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold'); doc.text('Cliente:', m, y);
  doc.setFont('helvetica', 'normal'); doc.text(`${e.clienteNombre}${e.clienteTelefono ? ` · ${e.clienteTelefono}` : ''}`, m + 17, y); y += 8;
  doc.setLineDashPattern([1, 1], 0); doc.line(m, y, ancho - m, y); doc.setLineDashPattern([], 0); y += 6;
  const fila = (a: string, b: string) => { doc.text(a, m, y); doc.setFont('helvetica', 'bold'); doc.text(b, ancho - m, y, { align: 'right' }); doc.setFont('helvetica', 'normal'); y += 6; };
  fila('Total', pesos(e.total));
  fila('Abonado', pesos(abonado(e)));
  fila(falta > 0 ? 'Saldo por cobrar' : 'Pagada', falta > 0 ? pesos(falta) : '');
  const nombre = `Orden torta ${numeroOrden(e)} ${e.clienteNombre}`.replace(/[\\/:*?"<>|]/g, '').trim();
  doc.save(`${nombre}.pdf`);
}
