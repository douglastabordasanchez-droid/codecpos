/**
 * Dibuja un PDF en imágenes (canvas) con pdf.js para mostrarlo dentro de la
 * app. Así la vista previa es exactamente el mismo PDF que se imprime o se
 * comparte, y se ve igual en Electron, en el navegador y en la app Android
 * (el WebView de Android no trae visor de PDF).
 *
 * pdf.js se carga solo la primera vez que se abre una factura, para no
 * hacer más pesado el arranque.
 */
type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let pdfjsPromesa: Promise<PdfJs> | null = null;

function cargarPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromesa) {
    pdfjsPromesa = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    }).catch((e) => {
      pdfjsPromesa = null; // reintentar la próxima vez
      throw e;
    });
  }
  return pdfjsPromesa;
}

/** Empieza a descargar pdf.js sin esperar (por ejemplo al pasar el mouse por el ojo). */
export function precargarVisorPdf(): void {
  cargarPdfJs().catch(() => { /* se reintenta al abrir */ });
}

/**
 * Convierte cada página del PDF en un canvas del ancho indicado (en píxeles
 * CSS). Devuelve los canvas listos para insertar en la página.
 */
export async function pdfAPaginas(pdf: Blob, anchoCss: number): Promise<HTMLCanvasElement[]> {
  const pdfjs = await cargarPdfJs();
  const datos = new Uint8Array(await pdf.arrayBuffer());
  const documento = await pdfjs.getDocument({ data: datos, isEvalSupported: false }).promise;
  const densidad = Math.min(window.devicePixelRatio || 1, 2.5);
  const paginas: HTMLCanvasElement[] = [];
  try {
    for (let n = 1; n <= documento.numPages; n++) {
      const pagina = await documento.getPage(n);
      const base = pagina.getViewport({ scale: 1 });
      const vista = pagina.getViewport({ scale: (anchoCss / base.width) * densidad });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(vista.width);
      canvas.height = Math.floor(vista.height);
      canvas.style.width = '100%';
      canvas.style.height = 'auto';
      canvas.style.display = 'block';
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('El dispositivo no permite dibujar la factura');
      // intent 'print': dibuja de una vez, sin esperar el refresco de pantalla (requestAnimationFrame),
      // que no llega si la app queda en segundo plano y dejaba la factura cargando sin fin.
      await pagina.render({ canvasContext: ctx, viewport: vista, intent: 'print' }).promise;
      paginas.push(canvas);
    }
  } finally {
    documento.destroy();
  }
  return paginas;
}
