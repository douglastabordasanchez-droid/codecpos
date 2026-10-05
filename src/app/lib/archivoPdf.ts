/**
 * Imprimir, compartir y descargar un PDF (la factura) en cualquier parte del
 * ecosistema: dentro de la app Android se usa lo nativo (su WebView no
 * descarga, no comparte ni imprime PDF), en el celular la hoja de compartir
 * del sistema, y en el computador el diálogo de impresión del navegador.
 */

interface PuenteArchivos {
  compartirArchivo?(base64: string, nombre: string, mime: string, texto: string): boolean;
  imprimirPdf?(base64: string, nombre: string): boolean;
}

function puenteAndroid(): PuenteArchivos | null {
  if (typeof window === 'undefined') return null;
  return ((window as unknown as { AndroidCodecVerify?: PuenteArchivos }).AndroidCodecVerify) || null;
}

const esCelular = () => typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

async function aBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binario = '';
  const trozo = 0x8000;
  for (let i = 0; i < bytes.length; i += trozo) binario += String.fromCharCode(...bytes.subarray(i, i + trozo));
  return btoa(binario);
}

export function descargarPdf(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** ¿Este equipo puede compartir el PDF como archivo (WhatsApp, correo...)? */
export function puedeCompartirPdf(): boolean {
  const android = puenteAndroid();
  if (android?.compartirArchivo) return true;
  try {
    const prueba = new File([new Blob()], 'f.pdf', { type: 'application/pdf' });
    return !!navigator.canShare?.({ files: [prueba] });
  } catch {
    return false;
  }
}

/** Comparte el PDF. Devuelve false si el equipo no sabe compartir archivos (quien llama puede descargarlo). */
export async function compartirPdf(blob: Blob, nombre: string, titulo: string, texto: string): Promise<boolean> {
  const android = puenteAndroid();
  if (android?.compartirArchivo) {
    return android.compartirArchivo(await aBase64(blob), nombre, 'application/pdf', texto);
  }
  const archivo = new File([blob], nombre, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: titulo, text: texto });
    } catch (e) {
      // Cerrar la hoja de compartir no es un error.
      if ((e as Error)?.name !== 'AbortError') throw e;
    }
    return true;
  }
  return false;
}

/**
 * Imprime el PDF tal cual. En la app Android abre el diálogo de impresión del
 * sistema; en un celular sin la app lo comparte (desde ahí se puede imprimir);
 * en el computador usa el diálogo de impresión del navegador.
 */
export async function imprimirPdf(blob: Blob, nombre: string): Promise<void> {
  const android = puenteAndroid();
  if (android?.imprimirPdf && android.imprimirPdf(await aBase64(blob), nombre)) return;
  if (esCelular()) {
    if (!(await compartirPdf(blob, nombre, nombre, ''))) descargarPdf(blob, nombre);
    return;
  }
  const url = URL.createObjectURL(blob);
  const marco = document.createElement('iframe');
  marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  marco.src = url;
  marco.onload = () => {
    setTimeout(() => {
      try {
        marco.contentWindow?.focus();
        marco.contentWindow?.print();
      } catch {
        window.open(url, '_blank'); // si el navegador bloquea imprimir el marco, se abre en otra pestaña
      }
    }, 150);
  };
  document.body.appendChild(marco);
  setTimeout(() => { marco.remove(); URL.revokeObjectURL(url); }, 5 * 60_000);
}
