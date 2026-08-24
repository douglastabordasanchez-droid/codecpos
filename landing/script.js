// Codec POS — landing comercial (Fase 4.2). Vanilla JS, sin dependencias.

document.getElementById('year').textContent = new Date().getFullYear();

/* ── Nav: fondo al hacer scroll + menú móvil ── */
const nav = document.getElementById('nav');
const navBurger = document.getElementById('navBurger');
const onScrollNav = () => nav.classList.toggle('is-scrolled', window.scrollY > 12);
onScrollNav();
window.addEventListener('scroll', onScrollNav, { passive: true });

navBurger?.addEventListener('click', () => {
  const abierto = nav.classList.toggle('menu-open');
  navBurger.setAttribute('aria-expanded', String(abierto));
});
document.querySelectorAll('.nav-links a, .nav-cta a').forEach((a) => {
  a.addEventListener('click', () => nav.classList.remove('menu-open'));
});

/* ── FAQ acordeón ── */
document.querySelectorAll('.faq-item .faq-q').forEach((btn) => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const yaAbierto = item.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach((el) => el.classList.remove('open'));
    if (!yaAbierto) item.classList.add('open');
  });
});

/* ── Reveal al hacer scroll ──
   IntersectionObserver normal + una red de seguridad: en un salto de scroll
   muy grande o brusco (rueda del mouse a máxima velocidad, o un scrollTo
   programático), un elemento puede pasar de "debajo del viewport" a "encima
   del viewport" en un solo frame sin que el observer llegue a reportarlo
   como intersectando -- queda invisible (opacity:0) para siempre. La red de
   seguridad revisa en cada scroll si algún .reveal pendiente ya quedó por
   encima del viewport (se lo saltamos) y lo revela igual. */
const revealItems = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );
  revealItems.forEach((el) => observer.observe(el));

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      document.querySelectorAll('.reveal:not(.in)').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top < window.innerHeight) {
          el.classList.add('in');
          observer.unobserve(el);
        }
      });
      ticking = false;
    });
  }, { passive: true });
} else {
  revealItems.forEach((el) => el.classList.add('in'));
}

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── Pausar animaciones CSS decorativas fuera de pantalla ──
   Con varias animaciones "infinite" corriendo TODO el tiempo (marco
   flotante del hero, anillos girando, franja de módulos, etc.), el
   navegador puede quedarse sin capas de composición al hacer scroll y dejar
   de pintar secciones enteras -- se ve como contenido "desaparecido" aunque
   el HTML/CSS estén perfectamente bien. Pausar lo que no se ve reduce la
   carga y evita el problema, además de ser mejor para el rendimiento. */
(function pausarAnimacionesFueraDeVista() {
  const elementos = document.querySelectorAll('.device-frame, .hero-badge-verify, .hero-badge-offline, .offline-orbit, .modules-track, .gradient-text');
  if (!elementos.length || !('IntersectionObserver' in window)) return;

  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        entry.target.style.animationPlayState = entry.isIntersecting ? 'running' : 'paused';
      });
    },
    { rootMargin: '200px 0px' }
  );
  elementos.forEach((el) => obs.observe(el));
})();

/* ── Codec Verify: ciclo esperando -> verificando -> confirmado ──
   Solo anima estados reales del flujo (detección, verificación,
   confirmación en pantalla) -- no inventa pasos que Codec Verify no hace.
   Todo vive en un solo cuadro (mini-stepper + mockup + texto), no en
   columnas separadas. */
(function cicloVerify() {
  const items = document.querySelectorAll('#verifyGrid .verify-title-item');
  const circle = document.getElementById('verifyCircle');
  const amount = document.getElementById('verifyAmount');
  const idleIcon = document.getElementById('verifyIconIdle');
  const spin = document.getElementById('verifySpin');
  const check = document.getElementById('verifyCheck');
  const caption = document.getElementById('verifyCaption');
  if (!items.length) return;

  const states = {
    waiting:   { activeStep: 0, caption: 'El cliente paga por Nequi, Daviplata o Bancolombia — Codec Verify detecta la transferencia por notificación push del celular del negocio.' },
    verifying: { activeStep: 1, caption: 'Sin cuenta de comercio, sin comisión por transacción. El sistema confirma el pago solo, dentro de Codec POS.' },
    confirmed: { activeStep: 2, caption: 'La confirmación aparece en pantalla en la caja al instante -- y, si lo activas, Codec Verify también la anuncia en voz.' },
  };

  function setState(state) {
    const { activeStep } = states[state];
    items.forEach((it, i) => {
      it.classList.remove('is-active', 'is-done');
      if (i < activeStep) it.classList.add('is-done');
      else if (i === activeStep) it.classList.add('is-active');
    });
    if (caption) caption.textContent = states[state].caption;

    amount.style.color = state === 'confirmed' ? '#10B981' : state === 'verifying' ? '#FB923C' : '#475569';
    if (state === 'waiting') {
      circle.style.background = 'rgba(255,255,255,.06)';
      idleIcon.style.display = ''; spin.style.display = 'none'; check.style.display = 'none';
    } else if (state === 'verifying') {
      circle.style.background = 'rgba(234,88,12,.15)';
      idleIcon.style.display = 'none'; spin.style.display = ''; check.style.display = 'none';
    } else {
      circle.style.background = '#059669';
      idleIcon.style.display = 'none'; spin.style.display = 'none'; check.style.display = '';
    }
  }

  if (prefersReducedMotion) { setState('confirmed'); return; }

  function cycle() {
    setState('waiting');
    setTimeout(() => setState('verifying'), 1400);
    setTimeout(() => setState('confirmed'), 3200);
  }
  cycle();
  setInterval(cycle, 6200);
})();

/* ── Codec Verify: botón "Escuchar confirmación" ──
   Esto SÍ es una función real del producto (no una demo inventada): Codec
   Verify anuncia por voz "Pago recibido por [entidad]. [monto] pesos."
   cuando confirma un pago (motor Piper embebido en Electron, con Web
   Speech API como respaldo -- ver src/app/lib/voz.ts). Aquí, en la web,
   usamos directamente Web Speech API -- el mismo motor de respaldo que ya
   usa el producto real en la PWA. Nunca se reproduce sola: solo cuando el
   visitante hace clic, a propósito. */
(function botonVoz() {
  const btn = document.getElementById('verifySoundBtn');
  if (!btn) return;

  const disponible = 'speechSynthesis' in window;
  if (!disponible) {
    btn.setAttribute('disabled', 'true');
    btn.setAttribute('title', 'Tu navegador no soporta lectura por voz');
    return;
  }

  btn.addEventListener('click', () => {
    trackEvent('click_codec_verify', { accion: 'escuchar_confirmacion' });
    window.speechSynthesis.cancel();
    const frase = new SpeechSynthesisUtterance('Pago recibido por Nequi. Cuarenta y cinco mil pesos.');
    frase.lang = 'es-CO';
    frase.rate = 0.98;

    const voces = window.speechSynthesis.getVoices();
    const vozEspanol = voces.find((v) => v.lang && v.lang.toLowerCase().startsWith('es'));
    if (vozEspanol) frase.voice = vozEspanol;

    btn.classList.add('is-speaking');
    frase.onend = () => btn.classList.remove('is-speaking');
    frase.onerror = () => btn.classList.remove('is-speaking');
    window.speechSynthesis.speak(frase);
  });
})();

/* ── Online/Offline: ciclo de pasos + ícono central ── */
(function cicloOffline() {
  const stepButtons = document.querySelectorAll('.offline-step');
  const orbitIcon = document.getElementById('orbitIcon');
  const orbitCenter = document.getElementById('orbitCenter');
  if (!stepButtons.length) return;

  const icons = [
    { color: '#10B981', svg: `<path d="M2 9C5.31 5.69 9.43 4 11 4C12.57 4 16.69 5.69 20 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M5 12C7.24 9.76 9.26 9 11 9C12.74 9 14.76 9.76 17 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="11" cy="18" r="1.2" fill="currentColor"/>` },
    { color: '#EA580C', svg: `<path d="M8 15C9.1 13.9 10.1 13.5 11 13.5C11.9 13.5 12.9 13.9 14 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="11" cy="18" r="1.2" fill="currentColor"/><path d="M3 3L19 19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>` },
    { color: '#3B82F6', svg: `<path d="M16 15H6a4 4 0 01-.5-7.9A5.5 5.5 0 0116.5 9H17a3 3 0 010 6H16z" stroke="currentColor" stroke-width="1.7"/>` },
  ];

  function setStep(i) {
    stepButtons.forEach((b, idx) => b.classList.toggle('is-active', idx === i));
    orbitIcon.innerHTML = icons[i].svg;
    orbitCenter.style.color = icons[i].color;
  }

  stepButtons.forEach((btn, i) => btn.addEventListener('click', () => setStep(i)));

  if (prefersReducedMotion) { setStep(0); return; }

  let current = 0;
  setStep(0);
  setInterval(() => { current = (current + 1) % 3; setStep(current); }, 3200);
})();

/* ── Precios: toggle mensual / trimestral / anual ──
   Los valores ya vienen calculados por el motor comercial (Fase 3) y solo
   se leen de data-attributes -- este script no recalcula ningún precio. */
(function togglePrecios() {
  const toggle = document.getElementById('pricingToggle');
  if (!toggle) return;
  const buttons = toggle.querySelectorAll('button');
  const periodLabel = { mensual: '/mes', trimestral: '/trimestre', anual: '/año' };

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      buttons.forEach((b) => b.classList.toggle('is-active', b === btn));

      document.querySelectorAll('[data-price-basico]').forEach((el) => { el.textContent = '$' + el.dataset[mode]; });
      document.querySelectorAll('[data-price-premium]').forEach((el) => { el.textContent = '$' + el.dataset[mode]; });
      document.querySelectorAll('[data-price-old]').forEach((el) => { el.textContent = el.dataset[mode]; });
      document.querySelectorAll('[data-period]').forEach((el) => { el.textContent = periodLabel[mode]; });
    });
  });
})();

/* ── Botones de prueba gratis ──
   Llevan al registro público real (Fase 5, migración 0052: crea cuenta +
   empresa + administrador + licencia TRIAL de 14 días en una transacción).
   En producción, landing y PWA se sirven desde el mismo dominio
   (vercel.json copia esta landing en la raíz y la PWA bajo /app/ -- ver
   vite.config.pwa.ts), así que basta una ruta relativa a /app/. En local,
   la PWA corre aparte con `npm run dev:pwa` (puerto 5174, también bajo
   /app/ por el mismo cambio de base).

   Detección de entorno local ampliada a propósito: antes solo reconocía
   'localhost'/'127.0.0.1' exactos -- si esta página se abre como archivo
   (file://, hostname vacío) o se sirve por otra IP local (ej. 0.0.0.0,
   192.168.x.x en pruebas de red), caía al modo "producción" (ruta
   relativa '/app/prueba-gratis'), que en la landing sola no lleva a ningún
   lado -- eso es lo que se sentía como "el botón no hace nada / no
   muestra el formulario". Para probar el flujo completo en local, correr
   `npm run dev:trial-flow` (levanta landing en :4174 y la PWA en :5174 a
   la vez) y abrir la landing SIEMPRE por http://localhost:4174, nunca
   como archivo. */
const ES_ENTORNO_LOCAL = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
  || window.location.protocol === 'file:';
const PWA_URL = ES_ENTORNO_LOCAL ? 'http://localhost:5174' : '';
['trialCta', 'trialCtaFinal'].forEach((id) => {
  document.getElementById(id)?.addEventListener('click', (e) => {
    e.preventDefault();
    trackEvent('click_registro');
    if (window.location.protocol === 'file:') {
      console.warn('[Codec POS] Esta landing se abrió como archivo local (file://). Para probar el botón de prueba gratis, sírvela con "npm run dev:trial-flow" y ábrela en http://localhost:4174.');
    }
    window.location.href = `${PWA_URL}/app/prueba-gratis`;
  });
});

/* ── Capa de eventos de conversión, preparada para Meta Pixel / GA4 ──
   Hoy solo registra en consola -- cuando se instalen los scripts de
   seguimiento (ver comentario TODO en index.html), esta misma función
   dispara fbq()/gtag() sin tocar el resto del HTML. */
function trackEvent(nombre, params) {
  console.log('[track]', nombre, params || {});
  if (typeof window.fbq === 'function') window.fbq('trackCustom', nombre, params || {});
  if (typeof window.gtag === 'function') window.gtag('event', nombre, params || {});
}

document.querySelectorAll('[data-event]').forEach((el) => {
  el.addEventListener('click', () => trackEvent(el.getAttribute('data-event'), { loc: el.getAttribute('data-event-loc') || undefined }));
});

/* ── Carrusel de pantallas reales (solo escritorio, ver CSS @960px) ── */
(function carruselPantallas() {
  const track = document.getElementById('screensTrack');
  const dotsWrap = document.getElementById('screensDots');
  const label = document.getElementById('screensLabel');
  const btnPrev = document.getElementById('screensPrev');
  const btnNext = document.getElementById('screensNext');
  if (!track || !dotsWrap || !btnPrev || !btnNext) return;

  const etiquetas = ['Punto de venta', 'Cuentas por mesa', 'Contabilidad', 'Reportes', 'Importar productos', 'Configuración', 'Factura de venta'];
  const slides = track.children;
  let indice = 0;
  let temporizador = null;

  etiquetas.forEach((_, i) => {
    const punto = document.createElement('button');
    punto.type = 'button';
    punto.setAttribute('aria-label', 'Ir a ' + etiquetas[i]);
    punto.addEventListener('click', () => ir(i));
    dotsWrap.appendChild(punto);
  });
  const puntos = dotsWrap.querySelectorAll('button');

  function ir(i) {
    indice = (i + slides.length) % slides.length;
    track.style.transform = `translateX(-${indice * 100}%)`;
    puntos.forEach((p, j) => p.classList.toggle('is-active', j === indice));
    if (label) label.textContent = etiquetas[indice];
  }

  function reiniciarAutoavance() {
    if (temporizador) clearInterval(temporizador);
    if (prefersReducedMotion) return;
    temporizador = setInterval(() => ir(indice + 1), 4500);
  }

  btnPrev.addEventListener('click', () => { ir(indice - 1); reiniciarAutoavance(); });
  btnNext.addEventListener('click', () => { ir(indice + 1); reiniciarAutoavance(); });

  ir(0);
  reiniciarAutoavance();

  if ('IntersectionObserver' in window) {
    const carrusel = document.getElementById('screensCarousel');
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) reiniciarAutoavance();
        else if (temporizador) { clearInterval(temporizador); temporizador = null; }
      });
    }, { threshold: 0.3 }).observe(carrusel);
  }
})();

trackEvent('page_view');
