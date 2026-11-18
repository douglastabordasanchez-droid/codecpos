/* Codec POS · landing principal. Las páginas de ciudades usan script.js. */
document.documentElement.classList.remove('no-js');

/* Íconos (Lucide) */
if (window.lucide) window.lucide.createIcons();

/* Año del footer */
const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();

/* ── Nav: fondo al hacer scroll + menú móvil ── */
const nav = document.getElementById('nav');
const burger = document.getElementById('navBurger');
const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 10);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });
burger?.addEventListener('click', () => {
  const open = nav.classList.toggle('menu-open');
  burger.setAttribute('aria-expanded', String(open));
});
nav.querySelectorAll('.nav-panel a').forEach((a) => a.addEventListener('click', () => {
  nav.classList.remove('menu-open');
  burger?.setAttribute('aria-expanded', 'false');
}));

/* ── Revelado al hacer scroll ── */
(function reveal() {
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  els.forEach((el) => io.observe(el));
})();

/* ── Facturación: pasos con avance automático ── */
(function pasosFactura() {
  const steps = [...document.querySelectorAll('.fe-step')];
  const imgs = [...document.querySelectorAll('#feStage img')];
  if (!steps.length || !imgs.length) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let i = 0;
  let timer = null;
  let visible = false;

  function go(n) {
    i = (n + steps.length) % steps.length;
    steps.forEach((s, k) => {
      s.classList.toggle('is-active', k === i);
      // reinicia la barra de progreso
      const bar = s.querySelector('.fe-bar i');
      if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
    });
    imgs.forEach((im, k) => im.classList.toggle('is-active', k === i));
    document.getElementById('feStage')?.classList.toggle('is-final', i === steps.length - 1);
    schedule();
  }
  function schedule() {
    clearTimeout(timer);
    if (!reduce && visible) timer = setTimeout(() => go(i + 1), 5000);
  }
  steps.forEach((s, k) => s.addEventListener('click', () => go(k)));

  const stage = document.getElementById('feStage');
  if ('IntersectionObserver' in window && stage) {
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? schedule() : clearTimeout(timer); }, { threshold: 0.3 }).observe(stage);
  }
})();

/* ── Precios: mensual / anual (valores escritos en data-attributes) ── */
(function togglePrecios() {
  const toggle = document.getElementById('pricingToggle');
  if (!toggle) return;
  const buttons = toggle.querySelectorAll('button');
  const period = { mensual: '/mes', anual: '/año' };
  buttons.forEach((btn) => btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    buttons.forEach((b) => b.classList.toggle('is-active', b === btn));
    document.querySelectorAll('[data-price]').forEach((el) => { el.textContent = '$' + el.dataset[mode]; });
    document.querySelectorAll('[data-annual-note]').forEach((el) => { el.textContent = el.dataset[mode]; });
    document.querySelectorAll('[data-period]').forEach((el) => { el.textContent = period[mode]; });
  }));
})();

/* ── Botones de prueba gratis ──
   En producción landing y PWA comparten dominio (la PWA vive en /app/).
   En local la PWA corre aparte en :5174 (npm run dev:trial-flow). */
const ES_LOCAL = ['localhost', '127.0.0.1', '::1'].includes(location.hostname) || location.protocol === 'file:';
const PWA_URL = ES_LOCAL ? 'http://localhost:5174' : '';
['trialCta', 'trialCtaFinal', 'trialCtaHero', 'trialCtaNav', 'trialCtaWeb'].forEach((id) => {
  document.getElementById(id)?.addEventListener('click', (e) => {
    e.preventDefault();
    trackEvent('click_registro');
    location.href = `${PWA_URL}/app/prueba-gratis`;
  });
});

/* ── Eventos de conversión (listos para Meta Pixel / GA4) ── */
function trackEvent(nombre, params) {
  if (typeof window.fbq === 'function') window.fbq('trackCustom', nombre, params || {});
  if (typeof window.gtag === 'function') window.gtag('event', nombre, params || {});
}
document.querySelectorAll('[data-event]').forEach((el) => {
  el.addEventListener('click', () => trackEvent(el.getAttribute('data-event'), { loc: el.getAttribute('data-event-loc') || undefined }));
});
