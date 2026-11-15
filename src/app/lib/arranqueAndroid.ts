/**
 * Pantalla de arranque de la terminal Android: el logo de Codec POS entra con
 * un destello, un anillo de luz y el nombre, acompañado de un sonido corto.
 * Se dibuja con HTML y CSS puros encima de todo, antes de que cargue React, y
 * se desvanece sola a los ~2,6 s. En web y Electron no hace nada.
 */
import { Capacitor } from '@capacitor/core';

const CSS = `
#codec-arranque{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;
  background:radial-gradient(circle at 50% 45%,#1e293b 0%,#0b1120 60%,#020617 100%);transition:opacity .6s ease;overflow:hidden}
#codec-arranque.salir{opacity:0}
#codec-arranque .halo{position:absolute;width:340px;height:340px;border-radius:50%;
  background:radial-gradient(circle,rgba(251,191,36,.35) 0%,rgba(251,191,36,0) 70%);opacity:0;animation:ca-halo 2.2s ease-out .35s forwards}
#codec-arranque .anillo{position:absolute;width:190px;height:190px;border-radius:50%;border:3px solid rgba(251,191,36,.9);
  opacity:0;animation:ca-anillo 1.1s ease-out .55s forwards}
#codec-arranque img{width:150px;height:auto;opacity:0;transform:scale(.4) rotate(-12deg);
  animation:ca-logo .9s cubic-bezier(.2,1.4,.4,1) .15s forwards;filter:drop-shadow(0 0 0 rgba(251,191,36,0))}
#codec-arranque .nombre{margin-top:26px;font:900 34px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;letter-spacing:.32em;color:#f8fafc;
  opacity:0;transform:translateY(14px);animation:ca-texto .7s ease-out .9s forwards}
#codec-arranque .nombre b{color:#fbbf24}
#codec-arranque .sub{margin-top:12px;font:600 14px/1 system-ui,sans-serif;letter-spacing:.2em;color:#94a3b8;opacity:0;animation:ca-texto .7s ease-out 1.2s forwards}
#codec-arranque .barra{margin-top:28px;width:180px;height:4px;border-radius:4px;background:rgba(148,163,184,.2);overflow:hidden;opacity:0;animation:ca-texto .4s ease-out 1.3s forwards}
#codec-arranque .barra i{display:block;height:100%;width:0;border-radius:4px;background:linear-gradient(90deg,#f59e0b,#fde047);animation:ca-carga 1.2s ease-in-out 1.4s forwards}
@keyframes ca-logo{60%{opacity:1;transform:scale(1.12) rotate(3deg)}100%{opacity:1;transform:scale(1) rotate(0);filter:drop-shadow(0 0 24px rgba(251,191,36,.55))}}
@keyframes ca-anillo{0%{opacity:.9;transform:scale(.6)}100%{opacity:0;transform:scale(2.2)}}
@keyframes ca-halo{0%{opacity:0;transform:scale(.5)}40%{opacity:1}100%{opacity:.7;transform:scale(1.1)}}
@keyframes ca-texto{to{opacity:1;transform:translateY(0)}}
@keyframes ca-carga{to{width:100%}}
`;

export function mostrarArranqueAndroid(): void {
  try {
    if (!(Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android')) return;
  } catch { return; }
  if (document.getElementById('codec-arranque')) return;

  const estilo = document.createElement('style');
  estilo.textContent = CSS;
  document.head.appendChild(estilo);

  const capa = document.createElement('div');
  capa.id = 'codec-arranque';
  capa.innerHTML = `
    <div class="halo"></div><div class="anillo"></div>
    <img src="/logo.png" alt="Codec POS" />
    <div class="nombre">CODEC <b>POS</b></div>
    <div class="sub">Sistema de caja</div>
    <div class="barra"><i></i></div>`;
  document.body.appendChild(capa);

  // El WebView de Capacitor permite sonido sin toque previo.
  try {
    const sonido = new Audio('/sonidos/arranque.wav');
    sonido.volume = 0.8;
    setTimeout(() => { void sonido.play().catch(() => {}); }, 250);
  } catch { /* sin audio: solo la animación */ }

  setTimeout(() => {
    capa.classList.add('salir');
    setTimeout(() => { capa.remove(); estilo.remove(); }, 700);
  }, 2700);
}
