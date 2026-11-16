/**
 * Teclado de la terminal Android: al tocar un campo, la pantalla (o la ventana
 * abierta) se desplaza sola para que ese campo quede a la vista encima del
 * teclado. Sin esto el campo quedaba tapado y había que adivinar qué se
 * escribía. Solo en el APK.
 */
import { esAndroidNativo } from './impresoraAndroid';

let instalado = false;

export function instalarTecladoAndroid(): void {
  if (instalado || !esAndroidNativo()) return;
  instalado = true;
  const esCampo = (el: EventTarget | null): el is HTMLElement =>
    el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

  const llevarALaVista = (el: HTMLElement) => {
    // Se espera a que el teclado termine de abrir y la app se acomode a su alto.
    for (const ms of [250, 550]) {
      window.setTimeout(() => {
        if (document.activeElement !== el) return;
        const r = el.getBoundingClientRect();
        const alto = window.visualViewport?.height ?? window.innerHeight;
        if (r.top < 60 || r.bottom > alto - 20) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, ms);
    }
  };

  document.addEventListener('focusin', (e) => { if (esCampo(e.target)) llevarALaVista(e.target); });
  // Si el campo ya tenía el foco y solo se vuelve a tocar (el teclado se había escondido).
  document.addEventListener('click', (e) => { if (esCampo(e.target) && document.activeElement === e.target) llevarALaVista(e.target); });
  window.visualViewport?.addEventListener('resize', () => {
    const el = document.activeElement;
    if (esCampo(el)) llevarALaVista(el);
  });
}
