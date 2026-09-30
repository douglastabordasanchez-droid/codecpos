/**
 * Copia el HTML de una vista previa de tirilla para imprimirlo tal cual.
 *
 * El HTML se imprime desde un archivo temporal (ver 'print:html' en
 * electron/main.js), así que las rutas relativas de las imágenes (el logo
 * empaquetado por Vite, por ejemplo) dejarían de resolverse y saldría el ícono
 * de imagen rota. Aquí se reescriben a URL absoluta y se quitan las imágenes
 * que en pantalla no se ven (logo que falló al cargar y quedó oculto).
 */
export function innerHtmlParaImpresion(elemento: HTMLElement): string {
  const clon = elemento.cloneNode(true) as HTMLElement;
  const originales = Array.from(elemento.querySelectorAll('img'));
  const copias = Array.from(clon.querySelectorAll('img'));

  copias.forEach((img, i) => {
    const original = originales[i];
    const visible = !!original && original.complete && original.naturalWidth > 0 && original.style.display !== 'none';
    if (!visible) {
      img.remove();
      return;
    }
    img.setAttribute('src', original.currentSrc || original.src);
  });

  return clon.innerHTML;
}
