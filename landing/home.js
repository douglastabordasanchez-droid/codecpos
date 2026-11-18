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

/* ── Codec Verify: esperando → verificando → confirmado, con sonido ──
   El sonido imita lo que hace el producto real: un aviso y la voz
   "Pago recibido por [entidad]. [monto] pesos.". Nunca suena solo:
   el visitante lo activa con el botón (los navegadores bloquean el audio
   automático). Con el sonido activado, cada confirmación suena. */
(function demoVerify() {
  const demo = document.getElementById('vDemo');
  if (!demo) return;
  const steps = [...document.querySelectorAll('#vSteps li')];
  const apps = [...document.querySelectorAll('#vApps span')];
  const amountEl = document.getElementById('vAmount');
  const sourceEl = document.getElementById('vSource');
  const statusEl = document.getElementById('vStatus');
  const btn = document.getElementById('vSound');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const pagos = [
    { app: 0, nombre: 'Nequi', monto: '45.000', voz: 'Cuarenta y cinco mil pesos' },
    { app: 1, nombre: 'Daviplata', monto: '28.500', voz: 'Veintiocho mil quinientos pesos' },
    { app: 2, nombre: 'Bancolombia', monto: '120.000', voz: 'Ciento veinte mil pesos' },
    { app: 3, nombre: 'Bre-B', monto: '62.000', voz: 'Sesenta y dos mil pesos' },
  ];
  const textos = {
    waiting: 'Esperando el pago…',
    verifying: 'Verificando en la cuenta del negocio…',
    confirmed: '¡Pago recibido! Venta cerrada.',
  };
  let n = 0, timers = [], visible = false, sonido = false, audioCtx = null;

  function setState(state, pago) {
    demo.dataset.state = state;
    const paso = { waiting: 0, verifying: 1, confirmed: 2 }[state];
    steps.forEach((li, k) => {
      li.classList.toggle('is-active', k === paso);
      li.classList.toggle('is-done', k < paso || (state === 'confirmed' && k === 2));
    });
    apps.forEach((a, k) => a.classList.toggle('is-active', k === pago.app));
    amountEl.textContent = '+$' + pago.monto;
    sourceEl.textContent = 'Transferencia ' + pago.nombre;
    statusEl.textContent = textos[state];
    if (state === 'confirmed' && sonido) sonar(pago);
  }

  function ciclo() {
    timers.forEach(clearTimeout); timers = [];
    const pago = pagos[n % pagos.length]; n++;
    setState('waiting', pago);
    timers.push(setTimeout(() => setState('verifying', pago), 1500));
    timers.push(setTimeout(() => setState('confirmed', pago), 3300));
    timers.push(setTimeout(() => { if (visible) ciclo(); }, sonido ? 8000 : 6500));
  }

  /* Aviso de dos tonos con Web Audio (sin archivos externos) */
  function campana() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime;
      [[880, 0], [1318.5, 0.14]].forEach(([f, d]) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.exponentialRampToValueAtTime(0.25, t + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.55);
        o.connect(g).connect(audioCtx.destination);
        o.start(t + d); o.stop(t + d + 0.6);
      });
    } catch (_) { /* sin audio */ }
  }
  function sonar(pago) {
    campana();
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const frase = new SpeechSynthesisUtterance(`Pago recibido por ${pago.nombre}. ${pago.voz}.`);
    frase.lang = 'es-CO'; frase.rate = 1;
    const voz = window.speechSynthesis.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith('es'));
    if (voz) frase.voice = voz;
    setTimeout(() => window.speechSynthesis.speak(frase), 650);
  }

  btn?.addEventListener('click', () => {
    sonido = !sonido;
    btn.setAttribute('aria-pressed', String(sonido));
    btn.querySelector('span').textContent = sonido ? 'Sonido activado' : 'Escuchar cómo suena';
    if (sonido) {
      trackEvent('click_codec_verify', { accion: 'escuchar_confirmacion' });
      campana(); // desbloquea el audio con el clic
      if (reduce) sonar(pagos[0]); else ciclo();
    } else if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  });

  if (reduce) { setState('confirmed', pagos[0]); return; }
  setState('waiting', pagos[0]);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      const antes = visible; visible = e.isIntersecting;
      if (visible && !antes) ciclo();
      if (!visible) { timers.forEach(clearTimeout); timers = []; }
    }, { threshold: 0.35 }).observe(demo);
  } else { visible = true; ciclo(); }
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
