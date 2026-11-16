/**
 * Impresión de reportes en la terminal Android.
 *
 * Fuera de Electron, los reportes (cierre de caja, contabilidad, gastos,
 * facturas, tirilla DIAN…) abren una ventana con `window.open`, escriben su
 * HTML y llaman `print()`. El WebView de Android no abre ventanas ni tiene
 * diálogo de impresión, así que en la terminal no salía nada.
 *
 * Aquí, solo en el APK, `window.open('')` devuelve una ventana simulada que
 * guarda el HTML; al llamar `print()` el HTML se dibuja al ancho del papel,
 * se convierte en imagen en blanco y negro y se manda a la impresora térmica
 * integrada por ESC/POS. Así cualquier impresión de la app sale por la térmica.
 */
import { esAndroidNativo, imprimirBytesAndroid } from './impresoraAndroid';
import { getConfiguredTicketWidthMm } from './printerConfig';

/**
 * Ancho del área imprimible en píxeles CSS (96 por pulgada): 72 mm en papel de
 * 80 y 48 mm en papel de 58. Los reportes están diseñados para ese tamaño
 * físico; se arman a ese ancho y luego se agrandan a los puntos de la
 * impresora (8 por mm), para que el texto salga del mismo tamaño que la
 * tirilla de venta. Antes se armaban al ancho en puntos (576) sin agrandar y
 * todo salía a menos de la mitad.
 */
function anchoCssDe(anchoPx: number): number {
  const mm = anchoPx >= 576 ? 72 : 48;
  return Math.round((mm / 25.4) * 96);
}

async function htmlAImagen(html: string, anchoPx: number): Promise<HTMLCanvasElement> {
  const anchoCss = anchoCssDe(anchoPx);
  const marco = document.createElement('iframe');
  marco.style.cssText = `position:fixed;left:-10000px;top:0;width:${anchoCss}px;height:200px;border:0;background:#fff`;
  document.body.appendChild(marco);
  try {
    const doc = marco.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();
    // Sin márgenes de página (el papel térmico ya tiene su margen) y todo al ancho del papel,
    // aunque el reporte traiga un ancho fijo (80mm, 300px…).
    const ajuste = doc.createElement('style');
    ajuste.textContent = `html,body{margin:0!important;padding:0 2px!important;background:#fff!important;width:auto!important;max-width:${anchoCss}px!important;min-width:0!important;color:#000}
      body>*{max-width:100%!important;box-sizing:border-box}
      *{-webkit-print-color-adjust:exact} img{max-width:100%}`;
    doc.head?.appendChild(ajuste);

    // Espera imágenes (logo, QR) y fuentes, con tope de 3 s.
    const imagenes = Array.from(doc.images);
    await Promise.race([
      Promise.all(imagenes.map((img) => img.complete ? Promise.resolve() : new Promise<void>((r) => { img.onload = () => r(); img.onerror = () => r(); }))),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
    await new Promise((r) => setTimeout(r, 60));

    const alto = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0, 20);
    marco.style.height = `${alto}px`;
    const { default: html2canvas } = await import('html2canvas');
    return await html2canvas(doc.body, {
      backgroundColor: '#ffffff',
      scale: anchoPx / anchoCss,
      width: anchoCss,
      windowWidth: anchoCss,
      height: alto,
      logging: false,
      useCORS: true,
    });
  } finally {
    marco.remove();
  }
}

/** Imagen → comandos ESC/POS GS v 0 en franjas, con avance y corte al final. */
function imagenAEscPos(canvas: HTMLCanvasElement, anchoPx: number): Uint8Array {
  const anchoBytes = Math.ceil(anchoPx / 8);
  const anchoReal = anchoBytes * 8;
  const lienzo = document.createElement('canvas');
  const escala = Math.min(1, anchoPx / canvas.width);
  lienzo.width = anchoReal;
  lienzo.height = Math.max(1, Math.round(canvas.height * escala));
  const ctx = lienzo.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.drawImage(canvas, 0, 0, Math.round(canvas.width * escala), lienzo.height);
  const { data } = ctx.getImageData(0, 0, lienzo.width, lienzo.height);

  const salida: number[] = [0x1b, 0x40, 0x1b, 0x61, 0x00];
  const FRANJA = 240; // filas por bloque: algunas térmicas no aceptan imágenes muy altas de una vez
  for (let y0 = 0; y0 < lienzo.height; y0 += FRANJA) {
    const filas = Math.min(FRANJA, lienzo.height - y0);
    salida.push(0x1d, 0x76, 0x30, 0x00, anchoBytes & 0xff, (anchoBytes >> 8) & 0xff, filas & 0xff, (filas >> 8) & 0xff);
    for (let y = y0; y < y0 + filas; y++) {
      for (let bx = 0; bx < anchoBytes; bx++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const i = (y * lienzo.width + bx * 8 + bit) * 4;
          const lum = data[i + 3] < 128 ? 255 : 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          if (lum < 170) byte |= 0x80 >> bit;
        }
        salida.push(byte);
      }
    }
  }
  salida.push(0x0a, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00);
  return new Uint8Array(salida);
}

let cola: Promise<unknown> = Promise.resolve();

function anchoTermicaPx(): number {
  return getConfiguredTicketWidthMm() === 58 ? 384 : 576;
}

/** Imprime imágenes ya dibujadas (páginas de un PDF, una parte de la pantalla) en la térmica. */
export function imprimirCanvasesEnTermica(canvases: HTMLCanvasElement[]): Promise<boolean> {
  const tarea = cola.then(async () => {
    const anchoPx = anchoTermicaPx();
    let ok = true;
    for (const c of canvases) ok = (await imprimirBytesAndroid(imagenAEscPos(c, anchoPx))) && ok;
    return ok;
  });
  cola = tarea.catch(() => {});
  return tarea;
}

/** PDF (factura, nota, reporte) → páginas en imagen → térmica. */
export async function imprimirPdfEnTermica(pdf: Blob): Promise<boolean> {
  try {
    const { pdfAPaginas } = await import('./pdfVista');
    const paginas = await pdfAPaginas(pdf, anchoTermicaPx() / Math.min(window.devicePixelRatio || 1, 2.5));
    return await imprimirCanvasesEnTermica(paginas);
  } catch (e) {
    console.error('PDF en térmica:', e);
    return false;
  }
}

/** Un elemento de la pantalla (la hoja de una factura) → imagen → térmica. */
async function imprimirElementoEnTermica(el: HTMLElement): Promise<boolean> {
  try {
    const { default: html2canvas } = await import('html2canvas');
    const ancho = Math.max(1, el.scrollWidth || el.offsetWidth);
    const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: anchoTermicaPx() / ancho, logging: false, useCORS: true });
    return await imprimirCanvasesEnTermica([canvas]);
  } catch (e) {
    console.error('Elemento en térmica:', e);
    return false;
  }
}

/** Imprime un documento HTML completo en la térmica de la terminal. */
export function imprimirHtmlEnTermica(html: string): Promise<boolean> {
  const tarea = cola.then(async () => {
    const anchoPx = anchoTermicaPx();
    try {
      const canvas = await htmlAImagen(html, anchoPx);
      return await imprimirBytesAndroid(imagenAEscPos(canvas, anchoPx));
    } catch (e) {
      console.error('Impresión HTML en térmica:', e);
      return false;
    }
  });
  cola = tarea.catch(() => {});
  return tarea;
}

/** Ventana simulada que junta el HTML y lo imprime en la térmica al llamar print(). */
function ventanaDeImpresion(): Window {
  let html = '';
  let impreso = false;
  let alCargar: ((this: any, ev: Event) => any) | null = null;
  const imprimir = () => {
    if (impreso || !html.trim()) return;
    impreso = true;
    void imprimirHtmlEnTermica(html).then((ok) => {
      if (!ok) void import('sonner').then(({ toast }) => toast.error('No se pudo imprimir en la impresora de la terminal'));
    });
  };
  const documento: any = {
    open: () => { html = ''; },
    write: (...partes: string[]) => { html += partes.join(''); },
    writeln: (...partes: string[]) => { html += partes.join('') + '\n'; },
    close: () => { setTimeout(() => { try { alCargar?.call(ventana, new Event('load')); } catch { /* ignorar */ } }, 30); },
    title: '',
  };
  const ventana: any = {
    document: documento,
    focus: () => {},
    blur: () => {},
    close: () => {},
    print: imprimir,
    closed: false,
    addEventListener: (tipo: string, fn: any) => { if (tipo === 'load') alCargar = fn; if (tipo === 'afterprint') { /* sin diálogo */ } },
    removeEventListener: () => {},
    set onload(fn: any) { alCargar = fn; },
    get onload() { return alCargar; },
    onafterprint: null,
  };
  return ventana as Window;
}

let instalado = false;

/** Solo en el APK: las ventanas de impresión van a la térmica. */
export function instalarImpresionAndroid(): void {
  if (instalado || !esAndroidNativo()) return;
  instalado = true;
  const abrirOriginal = window.open.bind(window);
  // window.print() directo (vista de la factura electrónica): se imprime la hoja
  // marcada como imprimible en vez de toda la pantalla.
  window.print = () => {
    const hoja = document.querySelector<HTMLElement>('[id$="-imprimible"], [data-imprimible]');
    if (!hoja) {
      void import('sonner').then(({ toast }) => toast.info('Esta pantalla no tiene nada para imprimir en la terminal'));
      return;
    }
    void imprimirElementoEnTermica(hoja).then((ok) => {
      if (!ok) void import('sonner').then(({ toast }) => toast.error('No se pudo imprimir en la impresora de la terminal'));
    });
  };
  window.open = ((url?: string | URL, objetivo?: string, opciones?: string) => {
    const destino = url === undefined || url === null ? '' : String(url);
    if (destino === '' || destino === 'about:blank') return ventanaDeImpresion();
    return abrirOriginal(url as any, objetivo, opciones);
  }) as typeof window.open;
}
