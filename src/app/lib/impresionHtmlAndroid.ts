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

async function htmlAImagen(html: string, anchoPx: number): Promise<HTMLCanvasElement> {
  const marco = document.createElement('iframe');
  marco.style.cssText = `position:fixed;left:-10000px;top:0;width:${anchoPx}px;height:200px;border:0;background:#fff`;
  document.body.appendChild(marco);
  try {
    const doc = marco.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();
    // Sin márgenes de página: el papel térmico ya tiene su propio margen.
    const ajuste = doc.createElement('style');
    ajuste.textContent = `html,body{margin:0!important;padding:0 4px!important;background:#fff!important;width:${anchoPx}px!important;max-width:${anchoPx}px!important;color:#000}
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
      scale: 1,
      width: anchoPx,
      windowWidth: anchoPx,
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

/** Imprime un documento HTML completo en la térmica de la terminal. */
export function imprimirHtmlEnTermica(html: string): Promise<boolean> {
  const tarea = cola.then(async () => {
    const anchoPx = getConfiguredTicketWidthMm() === 58 ? 384 : 576;
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
  window.open = ((url?: string | URL, objetivo?: string, opciones?: string) => {
    const destino = url === undefined || url === null ? '' : String(url);
    if (destino === '' || destino === 'about:blank') return ventanaDeImpresion();
    return abrirOriginal(url as any, objetivo, opciones);
  }) as typeof window.open;
}
